import { NextResponse } from "next/server";
import { loadRules, MissingRulesError } from "@/lib/rules";
import { WaiverRecommendRequest, WaiverRecommendation, type WaiverMeta } from "@/lib/schema";
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
import { mergeRankings } from "@/lib/rankings";
import { resolveRankingRows } from "@/lib/defaultRankings";
import { orderedSlots } from "@/lib/lineup";
import { buildLeagueState } from "@/lib/leagueState";
import { dropCandidates, shortlist, type TrendingAdds } from "@/lib/freeAgents";
import { checkWaiverCandidates } from "@/lib/checkAnswer";
import { fetchLiveContext } from "@/lib/liveContext";
import { buildWaiverSystemPrompt, buildWaiverUserMessage } from "@/lib/waiverPrompt";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // a grounded news lookup plus the run; Vercel Pro allows up to 300s

/** How many candidates the news lookup covers. The rest are sent marked NOT RESEARCHED. */
const RESEARCH_LIMIT = 25;
/** How many roster players are offered to the model as drops, and researched alongside. */
const DROP_LIMIT = 5;

/** Sleeper's league-wide 24h add counts. Optional context — a failure here is not fatal. */
async function getTrending(): Promise<TrendingAdds> {
  try {
    const rows = await sleeperFetch<{ player_id: string; count: number }[]>(
      "/players/nfl/trending/add?lookback_hours=24&limit=50",
    );
    return new Map(rows.map((r) => [r.player_id, r.count]));
  } catch {
    return new Map();
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

  const parsed = WaiverRecommendRequest.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bad request", issues: parsed.error.issues }, { status: 400 });
  const req = parsed.data;

  // 1. League state from Sleeper, server-side so the answer reflects the real rosters.
  //
  // Deliberately no "this week has no schedule" guard: unlike a start/sit call, a waiver
  // run needs no matchups at all. Requiring them would break the page in the preseason and
  // in any league whose week isn't scheduled yet. Matchups are fetched only for live points.
  let league: SleeperLeague, users: SleeperUser[], rosters: SleeperRoster[], matchups: SleeperMatchup[];
  let pool: Awaited<ReturnType<typeof getPlayerPool>>, rules: string, trending: TrendingAdds;
  try {
    [league, users, rosters, matchups, pool, rules, trending] = await Promise.all([
      sleeperFetch<SleeperLeague>(`/league/${req.leagueId}`),
      sleeperFetch<SleeperUser[]>(`/league/${req.leagueId}/users`),
      sleeperFetch<SleeperRoster[]>(`/league/${req.leagueId}/rosters`),
      sleeperFetch<SleeperMatchup[]>(`/league/${req.leagueId}/matchups/${req.week}`).catch(() => [] as SleeperMatchup[]),
      getPlayerPool(),
      loadRules("waiver-rules.md", "the waiver rules"),
      getTrending(),
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
  const me = state.byRosterId.get(req.rosterId);
  if (!me) return NextResponse.json({ error: "That team is not in this league." }, { status: 400 });

  // 2. Deterministic candidate set. Nothing outside this can be recommended, so it is
  // returned in the envelope and rendered — the UI must show what was actually sent.
  const picked = shortlist(state.available, { needs: me.needs, trending });
  if (!picked.entries.length) {
    return NextResponse.json({ error: "Every player in the pool is rostered in this league; there is nothing to claim." }, { status: 400 });
  }
  const startingIds = new Set(me.team.starters.map((r) => r.player.id));
  const drops = dropCandidates(me.players, startingIds, DROP_LIMIT);

  // 3. Live news. Never fatal, but far more load-bearing here than in a start/sit call:
  // the ruleset reasons from snaps, routes and target share, none of which Sleeper has.
  const researched = [...picked.entries.slice(0, RESEARCH_LIMIT).map((e) => e.player), ...drops];
  const news = await fetchLiveContext({
    leagueId: req.leagueId,
    week: req.week,
    scope: `waivers:${req.rosterId}`,
    season: league.season,
    players: researched,
    focus: "waivers",
    refresh: req.refreshNews,
  });
  const live = news.value;
  const researchedIds = new Set(researched.map((p) => p.id));
  // Counted over the shortlist alone. `researched` also covers the drop candidates, who
  // are roster players and never on the shortlist — including them would let the panel
  // report "15 of 10 candidates researched".
  const researchedCandidates = picked.entries.filter((e) => researchedIds.has(e.player.id)).length;

  // 4. The model.
  const system = buildWaiverSystemPrompt(rules, fmt, state);
  const user = buildWaiverUserMessage({
    state,
    me,
    week: req.week,
    fmt,
    shortlist: picked.entries,
    dropCandidates: drops,
    live,
    researchedIds,
    poolAgeMinutes: pool.ageMinutes,
    rankingsLoaded: !!rankingRows?.length,
    question: req.question,
  });

  try {
    const result = await provider.recommend({ system, user, effort: req.effort, schema: WaiverRecommendation });
    const out = result.parsed;

    // 5. Validate against the deterministic facts. Findings go on the envelope, never into
    // the model's own arrays — the saved log has to stay able to tell what the model said
    // from what this check said. The rules themselves live in lib/checkAnswer.ts so they
    // can be tested without a request, Sleeper and a model call.
    const { kept, alerts: issues } = checkWaiverCandidates(out.candidates, {
      offeredIds: new Set(picked.entries.map((e) => e.player.id)),
      rosterIds: new Set(me.players.map((p) => p.id)),
      faab: state.rules.faab,
      faabRemaining: me.faabRemaining,
      nameOf: (id) => state.byId.get(id)?.name ?? id,
    });
    out.candidates = kept;

    return NextResponse.json({
      recommendation: out,
      liveContext: live,
      // The set that was actually sent, so the panel cannot show a different one.
      shortlist: picked.entries.map((e) => ({
        player_id: e.player.id,
        name: e.player.name,
        position: e.player.pos,
        team: e.player.team,
        reason: e.reason,
        adds: e.adds,
        researched: researchedIds.has(e.player.id),
      })),
      validation: { ok: issues.length === 0, issues },
      meta: {
        provider: provider.name,
        model: result.model,
        usage: result.usage,
        week: req.week,
        grounded: !!live,
        newsModel: live?.model ?? null,
        newsUnavailable: news.unavailable,
        retrievedAt: live?.retrievedAt ?? null,
        poolAgeMinutes: pool.ageMinutes,
        rosterId: req.rosterId,
        teamName: me.team.name,
        faabRemaining: me.faabRemaining,
        waiverPosition: me.waiverPosition,
        faabLeague: state.rules.faab,
        openSpots: me.openSpots,
        considered: picked.considered,
        shortlisted: picked.entries.length,
        researched: researchedCandidates,
      } satisfies WaiverMeta,
    });
  } catch (e) {
    if (e instanceof LlmError) return NextResponse.json({ error: e.message, detail: e.detail }, { status: e.status });
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
