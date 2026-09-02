import assert from "node:assert/strict";
import { test } from "node:test";
import { buildQuery, renderLiveContext, type LiveContextResult } from "./liveContext";
import type { LineupPlayer } from "./lineup";

// `buildQuery` is what makes the start/sit feature grounded — the games/weather/betting
// block is the whole reason the recommendation can follow content/start-sit-rules.md. It
// had no coverage while it was the only query shape; these tests exist so the waiver and
// trade branches cannot quietly degrade it.

const player = (over: Partial<LineupPlayer> = {}): LineupPlayer => ({
  id: "p1", name: "Some Player", pos: "RB", team: "KC", inj: null, bye: 6, ...over,
});

const req = (over: Record<string, unknown> = {}) => ({
  leagueId: "L1",
  week: 5,
  scope: "3",
  season: "2025",
  players: [player(), player({ id: "p2", name: "Other Guy", pos: "WR", team: "BUF", inj: "Questionable" })],
  ...over,
});

// ---- the matchup query, which existed first and must not drift ----

test("the matchup query still asks for games, weather, kickoff and betting lines", () => {
  const q = buildQuery(req());
  assert.match(q, /GAMES: report the week 5 game for each of these teams: BUF, KC\./);
  assert.match(q, /roof type, forecast at kickoff \(sustained wind, precipitation, temperature\)/);
  assert.match(q, /kickoff time in ISO 8601, betting spread, game total, and each team's implied total/);
  assert.match(q, /current injury designation, practice participation this week/);
});

test("the matchup query is the default when no focus is given", () => {
  assert.equal(buildQuery(req()), buildQuery(req({ focus: "matchup" })));
});

test("every query lists each player with id, name, position, team and any Sleeper designation", () => {
  for (const focus of ["matchup", "waivers", "trade"] as const) {
    const q = buildQuery(req({ focus }));
    assert.match(q, /p1 \| Some Player \| RB \| KC/, focus);
    assert.match(q, /p2 \| Other Guy \| WR \| BUF \| Sleeper lists: Questionable/, focus);
    assert.match(q, /NFL 2025 season, week 5\./, focus);
  }
});

// ---- the waiver query leads with opportunity, per content/waiver-rules.md ----

test("the waiver query leads with opportunity, not with last week's points", () => {
  const q = buildQuery(req({ focus: "waivers" }));
  assert.match(q, /UNROSTERED/);
  assert.match(q, /snap share/i);
  assert.match(q, /[Rr]oute participation/);
  assert.match(q, /inside the 10 and inside the 5/);
  assert.match(q, /not on last week's fantasy points/);
});

test("the waiver query keeps the matchup as a brief tiebreaker rather than dropping it", () => {
  const q = buildQuery(req({ focus: "waivers" }));
  assert.match(q, /implied team total, spread and expected pace/);
  assert.match(q, /tiebreaker/);
});

// ---- the trade query is rest-of-season, per content/trade-rules.md ----

test("the trade query asks for rest-of-season outlook and suppresses weather and games", () => {
  const q = buildQuery(req({ focus: "trade" }));
  assert.match(q, /REST-OF-SEASON/);
  assert.match(q, /rosOutlook/);
  assert.match(q, /return an empty games list/);
  assert.doesNotMatch(q, /forecast at kickoff/);
  assert.doesNotMatch(q, /betting spread/);
});

// ---- rendering ----

const news = (over: Record<string, unknown> = {}) => ({
  player_id: "p1", status: "questionable" as const, practice: "LP Wed", role: null,
  confirmed: true, note: "Tweaked an ankle.", rosOutlook: null, sources: [], ...over,
});

const ctx = (over: Partial<LiveContextResult> = {}): LiveContextResult => ({
  players: [news()],
  games: [],
  unresolved: [],
  retrievedAt: "2025-10-01T12:00:00.000Z",
  sources: [],
  model: "gemini-test",
  ...over,
});

test("renderLiveContext names the player and its confirmation state", () => {
  const out = renderLiveContext(ctx(), new Map([["p1", player()]]));
  assert.match(out, /Some Player \(RB\/KC\): status questionable, confirmed: yes/);
  assert.match(out, /practice: LP Wed/);
});

test("renderLiveContext includes the rest-of-season outlook only when one was retrieved", () => {
  const without = renderLiveContext(ctx(), new Map([["p1", player()]]));
  assert.doesNotMatch(without, /Rest of season/);

  const withRos = renderLiveContext(
    ctx({ players: [news({ rosOutlook: "Back-end RB2 the rest of the way." })] }),
    new Map([["p1", player()]]),
  );
  assert.match(withRos, /Rest of season: Back-end RB2 the rest of the way\./);
});

test("renderLiveContext falls back to the raw id for a player it cannot name", () => {
  const out = renderLiveContext(ctx(), new Map());
  assert.match(out, /- p1: status questionable/);
});
