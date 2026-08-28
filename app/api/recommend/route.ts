import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { RecommendRequest, RecommendationResponse } from "@/lib/schema";
import { leagueFormat, sleeperFetch, type Player, type SleeperDraft, type SleeperLeague, type SleeperPick } from "@/lib/sleeper";
import { trimPlayers } from "@/lib/players";
import { byeForTeam } from "@/lib/players";
import { mergeRankings, type RankedPlayer, type RankingRow } from "@/lib/rankings";
import { turnInfo } from "@/lib/draftMath";
import { analyzeRoster } from "@/lib/rosterNeeds";
import { probGone, tierSummary } from "@/lib/availability";
import { buildSystemPrompt, buildUserMessage, needsSummary } from "@/lib/prompt";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // Opus at high effort can take a while; Vercel Pro allows up to 300s

const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5";
const AVAILABLE_LIMIT = 80;

// Warm-lambda cache of the trimmed player pool (Sleeper asks for <=1 players call/day).
let playerCache: { at: number; players: Player[] } | null = null;
async function getPlayers(): Promise<Player[]> {
  if (playerCache && Date.now() - playerCache.at < 6 * 3600 * 1000) return playerCache.players;
  const raw = await sleeperFetch<Record<string, never>>("/players/nfl");
  playerCache = { at: Date.now(), players: trimPlayers(raw) };
  return playerCache.players;
}

async function getPreferences(): Promise<string> {
  try {
    return await readFile(path.join(process.cwd(), "content", "preferences.md"), "utf8");
  } catch {
    return "(No preferences file found — use sound best-player-available strategy.)";
  }
}

export async function POST(request: Request) {
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: "ANTHROPIC_API_KEY is not set on the server." }, { status: 500 });
  const parsed = RecommendRequest.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bad request", issues: parsed.error.issues }, { status: 400 });
  const req = parsed.data;

  // 1. Live draft state from Sleeper (server-side so the recommendation always reflects the real board).
  let draft: SleeperDraft, picks: SleeperPick[], league: SleeperLeague | null = null, players: Player[], preferences: string;
  try {
    [draft, picks, players, preferences] = await Promise.all([
      sleeperFetch<SleeperDraft>(`/draft/${req.draftId}`),
      sleeperFetch<SleeperPick[]>(`/draft/${req.draftId}/picks`),
      getPlayers(),
      getPreferences(),
    ]);
    if (draft.league_id) league = await sleeperFetch<SleeperLeague>(`/league/${draft.league_id}`).catch(() => null);
  } catch (e) {
    return NextResponse.json({ error: `Sleeper fetch failed: ${(e as Error).message}` }, { status: 502 });
  }

  // 2. Deterministic draft math.
  const fmt = leagueFormat(draft, league);
  const rankingRows: RankingRow[] | null = req.rankings
    ? req.rankings.map((r) => ({ name: "", pos: null, team: null, ...r }))
    : null;
  const ranked = mergeRankings(players, rankingRows, byeForTeam);
  const byId = new Map(ranked.map((p) => [p.id, p]));
  const takenIds = new Set(picks.map((p) => p.player_id));
  const turn = turnInfo(draft, picks, req.mySlot);
  if (turn.isComplete) return NextResponse.json({ error: "This draft is complete." }, { status: 400 });

  const rosterBySlot = new Map<number, RankedPlayer[]>();
  for (const p of picks) {
    const rp = byId.get(p.player_id);
    if (!rp) continue;
    rosterBySlot.set(p.draft_slot, [...(rosterBySlot.get(p.draft_slot) ?? []), rp]);
  }
  const myRoster = req.mySlot ? rosterBySlot.get(req.mySlot) ?? [] : [];
  const analysis = analyzeRoster(myRoster, fmt.slots, (p) => (p as RankedPlayer).bye ?? null);

  const available = ranked.filter((p) => !takenIds.has(p.id));
  // Keep K/DEF out of the list until the final rounds so they don't crowd out real candidates.
  const lateRounds = turn.round >= fmt.rounds - 2;
  const candidates = available.filter((p) => lateRounds || (p.pos !== "K" && p.pos !== "DEF")).slice(0, AVAILABLE_LIMIT);
  if (lateRounds) {
    for (const pos of ["K", "DEF"] as const) {
      const top = available.filter((p) => p.pos === pos).slice(0, 3);
      for (const p of top) if (!candidates.includes(p)) candidates.push(p);
    }
  }
  const [nextPick, afterPick] = [turn.myNextPicks[0] ?? Infinity, turn.myNextPicks[1] ?? Infinity];
  const pGone = new Map<string, { next: number; after: number }>();
  candidates.forEach((p, i) => pGone.set(p.id, {
    next: probGone(p, turn.currentPick, turn.onTheClock ? turn.myNextPicks[1] ?? Infinity : nextPick, i),
    after: probGone(p, turn.currentPick, turn.onTheClock ? turn.myNextPicks[2] ?? Infinity : afterPick, i),
  }));

  const otherSlots = [...new Set(turn.slotsBeforeMyTurn)].filter((s) => s !== req.mySlot);
  const otherTeams = otherSlots.map((slot) => {
    const r = rosterBySlot.get(slot) ?? [];
    const counts = { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DEF: 0 };
    for (const p of r) counts[p.pos]++;
    return { slot, picksBeforeMe: true, needs: needsSummary(counts, fmt.slots) };
  });
  const recentPicks = picks.slice(-8).map((p) => `#${p.pick_no} ${p.metadata.first_name ?? ""} ${p.metadata.last_name ?? ""} (${p.metadata.position ?? "?"})`.trim());

  const system = buildSystemPrompt(preferences, fmt);
  const user = buildUserMessage({
    turn, myRoster, analysis, available: candidates, pGone, tiers: tierSummary(available), otherTeams, recentPicks,
    question: req.question, rankingsLoaded: !!rankingRows?.length,
  });

  // 3. Claude.
  const client = new Anthropic();
  try {
    const response = await client.beta.messages.parse({
      model: MODEL,
      max_tokens: 8000,
      thinking: { type: "adaptive" },
      output_config: { effort: req.effort, format: betaZodOutputFormat(RecommendationResponse) },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: user }],
    });
    if (response.stop_reason === "refusal") {
      return NextResponse.json({ error: "Claude declined this request.", detail: response.stop_details }, { status: 502 });
    }
    if (response.stop_reason === "max_tokens" || !response.parsed_output) {
      return NextResponse.json({ error: "Claude's answer was cut off or unparseable; try again (or lower effort)." }, { status: 502 });
    }
    const out = response.parsed_output;
    // Only trust ids that are actually on the board.
    const validIds = new Set(candidates.map((p) => p.id));
    out.picks = out.picks.filter((p) => validIds.has(p.player_id));
    return NextResponse.json({
      recommendation: out,
      meta: {
        model: response.model,
        pick: turn.currentPick,
        usage: response.usage,
        candidates: candidates.length,
      },
    });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return NextResponse.json({ error: "Claude API key rejected." }, { status: 500 });
    if (e instanceof Anthropic.RateLimitError) return NextResponse.json({ error: "Claude rate limit hit; retry in a few seconds." }, { status: 429 });
    if (e instanceof Anthropic.APIError) return NextResponse.json({ error: `Claude API error ${e.status}: ${e.message}` }, { status: 502 });
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
