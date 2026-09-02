import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { MatchupRecommendRequest, MatchupRecommendation, type MatchupMeta } from "@/lib/schema";
import { activeProvider, LlmError } from "@/lib/llm";
import {
  formatFromLeague,
  sleeperFetch,
  type SleeperLeague,
  type SleeperMatchup,
  type SleeperRoster,
  type SleeperState,
  type SleeperUser,
} from "@/lib/sleeper";
import { byeForTeam } from "@/lib/players";
import { getPlayerPool } from "@/lib/playerPool";
import { mergeRankings, type RankedPlayer } from "@/lib/rankings";
import { resolveRankingRows } from "@/lib/defaultRankings";
import {
  buildTeam,
  checkLineup,
  isEligible,
  matchupPhase,
  orderedSlots,
  pairMatchups,
  type StartingSlot,
  type TeamRow,
} from "@/lib/lineup";
import { fetchLiveContext } from "@/lib/liveContext";
import { buildMatchupSystemPrompt, buildMatchupUserMessage } from "@/lib/matchupPrompt";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // a grounded news lookup plus a deep run; Vercel Pro allows up to 300s

/** Thrown so a missing ruleset is distinguishable from a Sleeper failure in the Promise.all below. */
class MissingRulesError extends Error {}

async function getRules(): Promise<string> {
  try {
    return await readFile(path.join(process.cwd(), "content", "start-sit-rules.md"), "utf8");
  } catch {
    throw new MissingRulesError("content/start-sit-rules.md is missing from the deployment; the start/sit rules cannot be loaded.");
  }
}

export async function POST(request: Request) {
  let provider;
  try {
    provider = activeProvider();
  } catch (e) {
    return NextResponse.json({ error: (e as LlmError).message }, { status: 500 });
  }
  const configError = provider.configError();
  if (configError) return NextResponse.json({ error: configError }, { status: 500 });

  const parsed = MatchupRecommendRequest.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bad request", issues: parsed.error.issues }, { status: 400 });
  const req = parsed.data;

  // 1. League state from Sleeper, server-side so the answer reflects the real rosters.
  let league: SleeperLeague, users: SleeperUser[], rosters: SleeperRoster[], matchups: SleeperMatchup[], state: SleeperState;
  let pool: Awaited<ReturnType<typeof getPlayerPool>>, rules: string;
  try {
    [league, users, rosters, matchups, state, pool, rules] = await Promise.all([
      sleeperFetch<SleeperLeague>(`/league/${req.leagueId}`),
      sleeperFetch<SleeperUser[]>(`/league/${req.leagueId}/users`),
      sleeperFetch<SleeperRoster[]>(`/league/${req.leagueId}/rosters`),
      sleeperFetch<SleeperMatchup[]>(`/league/${req.leagueId}/matchups/${req.week}`).catch(() => [] as SleeperMatchup[]),
      sleeperFetch<SleeperState>("/state/nfl"),
      getPlayerPool(),
      getRules(),
    ]);
  } catch (e) {
    if (e instanceof MissingRulesError) return NextResponse.json({ error: e.message }, { status: 500 });
    return NextResponse.json({ error: `Sleeper fetch failed: ${(e as Error).message}` }, { status: 502 });
  }
  if (!matchups.length) {
    return NextResponse.json({ error: `This league has no week ${req.week} schedule yet.` }, { status: 400 });
  }

  // 2. Resolve the matchup and the side being optimized.
  const pair = pairMatchups(matchups).find((p) => p.key === req.matchupKey);
  if (!pair) return NextResponse.json({ error: "That matchup is not in this week." }, { status: 400 });
  if (!pair.rosterIds.includes(req.myRosterId)) {
    return NextResponse.json({ error: "That team is not in the selected matchup." }, { status: 400 });
  }

  const fmt = formatFromLeague(league);
  const lineup = orderedSlots(league.roster_positions);
  const { slots, unsupported } = lineup;
  if (!slots.length) return NextResponse.json({ error: "This league has no supported starting slots." }, { status: 400 });

  const rankingRows = await resolveRankingRows(pool.players, req.rankings);
  const ranked = mergeRankings(pool.players, rankingRows, byeForTeam);
  const byId = new Map<string, RankedPlayer>(ranked.map((p) => [p.id, p]));
  const userById = new Map(users.map((u) => [u.user_id, u]));
  const rosterById = new Map(rosters.map((r) => [r.roster_id, r]));
  const matchupByRoster = new Map(matchups.map((m) => [m.roster_id, m]));

  const team = (rosterId: number) => {
    const roster = rosterById.get(rosterId);
    if (!roster) return null;
    return buildTeam({ roster, matchup: matchupByRoster.get(rosterId), users: userById, byId, lineup, week: req.week });
  };
  const me = team(req.myRosterId);
  if (!me) return NextResponse.json({ error: "That roster is not in this league." }, { status: 400 });
  const opponentId = pair.rosterIds.find((id) => id !== req.myRosterId) ?? null;
  const opponent = opponentId != null ? team(opponentId) : null;

  // 3. Deterministic lineup math: who is legally startable, and where.
  const startable = [...me.starters, ...me.bench].filter((r) => r.status === "startable");
  const legalBySlot = new Map<StartingSlot, TeamRow[]>();
  for (const slot of new Set(slots)) legalBySlot.set(slot, startable.filter((r) => isEligible(slot, r.player.pos)));

  const phase = matchupPhase({
    week: req.week,
    leagueSeason: league.season,
    stateSeason: state.season,
    stateWeek: state.week,
    matchups,
  });

  // 4. Live news. Never fatal — a null here means an un-grounded answer, and the prompt says so.
  const newsPlayers = [...me.starters, ...me.bench, ...(opponent?.starters ?? [])]
    .filter((r) => r.status === "startable")
    .map((r) => r.player);
  const news = await fetchLiveContext({
    leagueId: req.leagueId,
    week: req.week,
    matchupKey: req.matchupKey,
    season: league.season,
    players: newsPlayers,
    refresh: req.refreshNews,
  });
  const live = news.value;

  // 5. The model.
  const system = buildMatchupSystemPrompt(rules, fmt, league.settings?.playoff_week_start ?? null);
  const user = buildMatchupUserMessage({
    fmt,
    week: req.week,
    playoffWeekStart: league.settings?.playoff_week_start ?? null,
    phase,
    me,
    opponent,
    slots,
    unsupportedSlots: unsupported,
    legalBySlot,
    live,
    poolAgeMinutes: pool.ageMinutes,
    rankingsLoaded: !!rankingRows?.length,
    question: req.question,
  });

  try {
    const result = await provider.recommend({ system, user, effort: req.effort, schema: MatchupRecommendation });
    const out = result.parsed;

    // 6. Validate the lineup itself, not just that the ids exist. Findings go on the
    // envelope, never into `alerts` — that field is the model's, and the saved log has
    // to stay able to tell what the model said from what this check said.
    const legalIds = new Map([...legalBySlot].map(([slot, rows]) => [slot, new Set(rows.map((r) => r.player.id))]));
    const { kept, alerts: issues } = checkLineup(
      out.recommendedLineup,
      slots,
      (slot, playerId) => legalIds.get(slot)?.has(playerId) ?? false,
    );
    out.recommendedLineup = kept;

    const rosterIds = new Set([...me.starters, ...me.bench].map((r) => r.player.id));
    out.benchOrder = out.benchOrder.filter((b) => rosterIds.has(b.player_id));

    return NextResponse.json({
      recommendation: out,
      liveContext: live,
      validation: { ok: issues.length === 0, issues },
      meta: {
        provider: provider.name,
        model: result.model,
        usage: result.usage,
        week: req.week,
        phase,
        grounded: !!live,
        newsModel: live?.model ?? null,
        newsUnavailable: news.unavailable,
        retrievedAt: live?.retrievedAt ?? null,
        poolAgeMinutes: pool.ageMinutes,
        myTeam: me.name,
        opponentTeam: opponent?.name ?? null,
      } satisfies MatchupMeta,
    });
  } catch (e) {
    if (e instanceof LlmError) return NextResponse.json({ error: e.message, detail: e.detail }, { status: e.status });
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
