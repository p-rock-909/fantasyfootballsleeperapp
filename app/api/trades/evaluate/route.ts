import { NextResponse } from "next/server";
import { loadRules, MissingRulesError } from "@/lib/rules";
import { TradeEvaluateRequest, TradeEvaluation, TradeProposals, type TradeMeta } from "@/lib/schema";
import { activeProvider, LlmError } from "@/lib/llm";
import {
  formatFromLeague,
  sleeperFetch,
  type SleeperLeague,
  type SleeperMatchup,
  type SleeperRoster,
  type SleeperUser,
} from "@/lib/sleeper";
import { byeForTeam } from "@/lib/players";
import { getPlayerPool } from "@/lib/playerPool";
import { mergeRankings, type RankedPlayer } from "@/lib/rankings";
import { resolveRankingRows } from "@/lib/defaultRankings";
import { orderedSlots } from "@/lib/lineup";
import { buildLeagueState, rosterLineup, type LeagueTeam } from "@/lib/leagueState";
import { checkTradeEvaluation, checkTradeProposals } from "@/lib/checkAnswer";
import { fetchLiveContext } from "@/lib/liveContext";
import { buildTradeSystemPrompt, buildTradeUserMessage, type TradeLineupChange } from "@/lib/tradePrompt";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Cap on how many players the news lookup covers when proposing against the whole league. */
const PROPOSE_RESEARCH_LIMIT = 30;

export async function POST(request: Request) {
  let provider;
  try {
    provider = activeProvider();
  } catch (e) {
    return NextResponse.json({ error: (e as LlmError).message }, { status: 500 });
  }
  const configError = provider.configError();
  if (configError) return NextResponse.json({ error: configError }, { status: 500 });

  const parsed = TradeEvaluateRequest.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bad request", issues: parsed.error.issues }, { status: 400 });
  const req = parsed.data;

  // Shape checks zod cannot express.
  if (req.teamB && req.teamA.rosterId === req.teamB.rosterId) {
    return NextResponse.json({ error: "A team cannot trade with itself." }, { status: 400 });
  }
  if (req.mode === "evaluate") {
    if (!req.teamB) return NextResponse.json({ error: "Pick both teams before evaluating a trade." }, { status: 400 });
    if (!req.teamA.sends.length && !req.teamB.sends.length) {
      return NextResponse.json({ error: "Choose the players moving in at least one direction." }, { status: 400 });
    }
  }

  let league: SleeperLeague, users: SleeperUser[], rosters: SleeperRoster[], matchups: SleeperMatchup[];
  let pool: Awaited<ReturnType<typeof getPlayerPool>>, rules: string;
  try {
    [league, users, rosters, matchups, pool, rules] = await Promise.all([
      sleeperFetch<SleeperLeague>(`/league/${req.leagueId}`),
      sleeperFetch<SleeperUser[]>(`/league/${req.leagueId}/users`),
      sleeperFetch<SleeperRoster[]>(`/league/${req.leagueId}/rosters`),
      sleeperFetch<SleeperMatchup[]>(`/league/${req.leagueId}/matchups/${req.week}`).catch(() => [] as SleeperMatchup[]),
      getPlayerPool(),
      loadRules("trade-rules.md", "the trade rules"),
    ]);
  } catch (e) {
    if (e instanceof MissingRulesError) return NextResponse.json({ error: e.message }, { status: 500 });
    return NextResponse.json({ error: `Sleeper fetch failed: ${(e as Error).message}` }, { status: 502 });
  }

  const fmt = formatFromLeague(league);
  const lineup = orderedSlots(league.roster_positions);
  if (!lineup.slots.length) return NextResponse.json({ error: "This league has no supported starting slots." }, { status: 400 });

  const rankingRows = await resolveRankingRows(pool.players, req.rankings);
  const ranked = mergeRankings(pool.players, rankingRows, byeForTeam);
  const state = buildLeagueState({
    league, users, rosters, matchups, pool: ranked, lineup, week: req.week, byeOf: (p) => p.bye,
  });

  const teamA = state.byRosterId.get(req.teamA.rosterId);
  if (!teamA) return NextResponse.json({ error: "That team is not in this league." }, { status: 400 });
  const teamB = req.teamB ? state.byRosterId.get(req.teamB.rosterId) ?? null : null;
  if (req.teamB && !teamB) return NextResponse.json({ error: "The trade partner is not in this league." }, { status: 400 });

  // Assets have to be on the roster that is sending them — the whole evaluation is
  // meaningless otherwise, so this is a hard error rather than an envelope warning.
  const onRoster = (team: LeagueTeam, ids: string[]) => {
    const have = new Set(team.players.map((p) => p.id));
    return ids.filter((id) => !have.has(id));
  };
  const strayA = onRoster(teamA, req.teamA.sends);
  const strayB = teamB && req.teamB ? onRoster(teamB, req.teamB.sends) : [];
  if (strayA.length || strayB.length) {
    return NextResponse.json(
      { error: `Some players are not on the roster sending them: ${[...strayA, ...strayB].join(", ")}.` },
      { status: 400 },
    );
  }

  const pick = (ids: string[]): RankedPlayer[] => ids.map((id) => state.byId.get(id)).filter((p): p is RankedPlayer => !!p);
  const aSends = pick(req.teamA.sends);
  const bSends = teamB && req.teamB ? pick(req.teamB.sends) : [];

  // The before/after startable lineups, solved in code. This is the comparison
  // content/trade-rules.md is built around, and it is arithmetic — not a judgement call.
  const lineups = new Map<number, TradeLineupChange>();
  if (req.mode === "evaluate" && teamB) {
    const sides: [LeagueTeam, RankedPlayer[], RankedPlayer[]][] = [
      [teamA, aSends, bSends],
      [teamB, bSends, aSends],
    ];
    for (const [team, out, incoming] of sides) {
      const goneIds = new Set(out.map((p) => p.id));
      // IR and taxi players are excluded from both sides: they are on the roster but
      // cannot be started, so counting them would inflate the before and after lineups
      // equally and hide a hole the trade might be meant to fill.
      lineups.set(team.team.rosterId, {
        before: rosterLineup(team.players, lineup.slots, team.reservedIds),
        after: rosterLineup([...team.players.filter((p) => !goneIds.has(p.id)), ...incoming], lineup.slots, team.reservedIds),
      });
    }
  }

  const pastDeadline = state.rules.tradeDeadline != null && req.week > state.rules.tradeDeadline;

  // Live news. Only the assets in play for an evaluation; the tradeable core of both
  // rosters when proposing, since the model is choosing who moves.
  const newsPlayers = req.mode === "evaluate"
    ? [...aSends, ...bSends]
    : [...teamA.players, ...(teamB?.players ?? [])].slice(0, PROPOSE_RESEARCH_LIMIT);
  const news = newsPlayers.length
    ? await fetchLiveContext({
        leagueId: req.leagueId,
        week: req.week,
        scope: `trade:${req.teamA.rosterId}-${req.teamB?.rosterId ?? "any"}:${req.mode}`,
        season: league.season,
        players: newsPlayers,
        focus: "trade",
        refresh: req.refreshNews,
      })
    : { value: null, unavailable: "No players to look up." as string | null };
  const live = news.value;

  const system = buildTradeSystemPrompt(rules, fmt, state, req.mode);
  const user = buildTradeUserMessage({
    state, mode: req.mode, fmt, week: req.week, teamA, teamB, aSends, bSends,
    lineups, live, pastDeadline, poolAgeMinutes: pool.ageMinutes,
    rankingsLoaded: !!rankingRows?.length, question: req.question,
  });

  try {
    const issues: string[] = [];
    if (pastDeadline) {
      issues.push(`The trade deadline was week ${state.rules.tradeDeadline}; this deal can no longer be made in Sleeper.`);
    }

    // The two modes answer with different schemas, so they are two calls rather than one
    // parameterised over a union — which erases the result type at every use below.
    let parsedOut: TradeEvaluation | TradeProposals;
    let model: string;
    let usage: Awaited<ReturnType<typeof provider.recommend>>["usage"];

    const teamNameOf = (rosterId: number) => state.byRosterId.get(rosterId)?.team.name ?? `roster ${rosterId}`;

    if (req.mode === "evaluate") {
      const result = await provider.recommend({ system, user, effort: req.effort, schema: TradeEvaluation });
      const out = result.parsed;
      ({ model, usage } = result);
      parsedOut = out;
      const { assets, alerts } = checkTradeEvaluation(out, {
        rosterIds: [teamA.team.rosterId, teamB!.team.rosterId],
        teamName: teamNameOf,
        movingIds: new Set([...aSends, ...bSends].map((p) => p.id)),
      });
      out.assets = assets;
      issues.push(...alerts);
    } else {
      const result = await provider.recommend({ system, user, effort: req.effort, schema: TradeProposals });
      const out = result.parsed;
      ({ model, usage } = result);
      parsedOut = out;
      const { kept, alerts } = checkTradeProposals(out.proposals, {
        initiatorRosterId: teamA.team.rosterId,
        requiredPartnerId: teamB?.team.rosterId ?? null,
        playersByRoster: new Map(state.teams.map((t) => [t.team.rosterId, new Set(t.players.map((p) => p.id))])),
        teamName: teamNameOf,
      });
      out.proposals = kept;
      issues.push(...alerts);
    }

    return NextResponse.json({
      recommendation: parsedOut,
      liveContext: live,
      // The lineups this app solved, not the model's prose about them. Returned so the
      // panel can show the arithmetic the ruleset's central comparison rests on.
      //
      // Emitted slot-by-slot from `bySlot`, which keeps a null where nothing could fill a
      // slot. Zipping the two `filled` lists instead would shift every row after a hole and
      // mark the wrong players as changed.
      lineups: [...lineups].map(([rosterId, change]) => ({
        rosterId,
        team: teamNameOf(rosterId),
        rows: lineup.slots.map((slot, i) => ({
          slot,
          before: change.before.bySlot[i]?.name ?? null,
          after: change.after.bySlot[i]?.name ?? null,
        })),
      })),
      validation: { ok: issues.length === 0, issues },
      meta: {
        provider: provider.name,
        model,
        usage,
        week: req.week,
        grounded: !!live,
        newsModel: live?.model ?? null,
        newsUnavailable: news.unavailable,
        retrievedAt: live?.retrievedAt ?? null,
        poolAgeMinutes: pool.ageMinutes,
        mode: req.mode,
        teamAName: teamA.team.name,
        teamBName: teamB?.team.name ?? null,
        pastDeadline,
        tradeDeadline: state.rules.tradeDeadline,
      } satisfies TradeMeta,
    });
  } catch (e) {
    if (e instanceof LlmError) return NextResponse.json({ error: e.message, detail: e.detail }, { status: e.status });
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
