import assert from "node:assert/strict";
import { test } from "node:test";
import { buildLeagueState, rosterLineup } from "./leagueState";
import { orderedSlots } from "./lineup";
import type { RankedPlayer } from "./rankings";
import type { Position, SleeperLeague, SleeperRoster, SleeperUser } from "./sleeper";

const p = (id: string, pos: Position, order: number): RankedPlayer => ({
  id, name: `Player ${id}`, pos, team: "SF", age: 25, exp: 3, inj: null, depth: 1, srank: order,
  rank: null, adp: null, tier: null, bye: 9, proj: null, posRank: null, order,
});

const POOL = [
  p("qb1", "QB", 1), p("rb1", "RB", 2), p("rb2", "RB", 3), p("wr1", "WR", 4),
  p("wr2", "WR", 5), p("te1", "TE", 6), p("k1", "K", 7), p("def1", "DEF", 8),
  p("fa1", "RB", 20), p("fa2", "WR", 21),
];

const POSITIONS = ["QB", "RB", "RB", "WR", "WR", "TE", "FLEX", "K", "DEF", "BN", "BN", "BN", "IR"];

const league = (over: Partial<SleeperLeague> = {}): SleeperLeague => ({
  league_id: "L1", name: "Test", season: "2026", status: "in_season", total_rosters: 2,
  draft_id: null, roster_positions: POSITIONS, scoring_settings: { rec: 1 },
  settings: { waiver_type: 2, waiver_budget: 100, trade_deadline: 12, playoff_week_start: 15 },
  ...over,
});

const roster = (over: Partial<SleeperRoster> = {}): SleeperRoster => ({
  roster_id: 1, owner_id: "u1", co_owners: null,
  players: ["qb1", "rb1", "rb2", "wr1", "wr2", "te1", "k1", "def1"],
  starters: ["qb1", "rb1", "rb2", "wr1", "wr2", "te1", null as unknown as string, "k1", "def1"].filter(Boolean) as string[],
  reserve: null, taxi: null, settings: { wins: 3, losses: 1, waiver_budget_used: 25, waiver_position: 4 },
  ...over,
});

const users: SleeperUser[] = [
  { user_id: "u1", username: "one", display_name: "One", avatar: null, metadata: { team_name: "Team One" } },
  { user_id: "u2", username: "two", display_name: "Two", avatar: null, metadata: null },
];

const build = (rosters: SleeperRoster[], l: SleeperLeague = league()) =>
  buildLeagueState({
    league: l, users, rosters, matchups: [], pool: POOL,
    lineup: orderedSlots(l.roster_positions), week: 5, byeOf: (pl) => pl.bye,
  });

// ---- rules ----

test("buildLeagueState reads the league's waiver and trade rules", () => {
  const state = build([roster()]);
  assert.deepEqual(state.rules, { faab: true, waiverBudget: 100, tradeDeadline: 12, playoffWeekStart: 15 });
});

test("buildLeagueState treats a non-FAAB league as priority-based", () => {
  const state = build([roster()], league({ settings: { waiver_type: 0, waiver_budget: 100 } }));
  assert.equal(state.rules.faab, false);
  assert.equal(state.teams[0].faabRemaining, null, "a priority league has no budget to report");
  assert.equal(state.teams[0].waiverPosition, 4);
});

test("buildLeagueState survives a league that sets no waiver or trade settings at all", () => {
  const state = build([roster({ settings: {} })], league({ settings: {} }));
  assert.deepEqual(state.rules, { faab: false, waiverBudget: null, tradeDeadline: null, playoffWeekStart: null });
  assert.equal(state.teams[0].faabRemaining, null);
  assert.equal(state.teams[0].waiverPosition, null);
});

// ---- FAAB ----

test("faabRemaining subtracts what the team has already spent", () => {
  assert.equal(build([roster()]).teams[0].faabRemaining, 75);
});

test("faabRemaining treats a roster with no recorded spend as having spent nothing", () => {
  const state = build([roster({ settings: { waiver_position: 1 } })]);
  assert.equal(state.teams[0].faabRemaining, 100);
});

test("faabRemaining never goes negative", () => {
  const state = build([roster({ settings: { waiver_budget_used: 150 } })]);
  assert.equal(state.teams[0].faabRemaining, 0);
});

// ---- roster space ----

// This is what decides whether a waiver add forces a drop, so it has to be exact.
test("openSpots counts real bench space, and IR does not create any", () => {
  // 9 starting slots + 3 bench = 12 usable; 8 players rostered.
  assert.equal(build([roster()]).teams[0].openSpots, 4);
});

test("a player parked on IR frees the bench spot he would otherwise occupy", () => {
  const full = ["qb1", "rb1", "rb2", "wr1", "wr2", "te1", "k1", "def1", "fa1", "fa2"];
  const noIr = build([roster({ players: full })]).teams[0];
  const withIr = build([roster({ players: full, reserve: ["fa1"] })]).teams[0];
  assert.equal(noIr.openSpots, 2);
  assert.equal(withIr.openSpots, 3);
});

// ---- availability ----

test("available lists the pool minus everyone rostered anywhere in the league", () => {
  const state = build([roster(), roster({ roster_id: 2, owner_id: "u2", players: ["fa1"] })]);
  assert.deepEqual(state.available.map((x) => x.id), ["fa2"]);
});

test("teams are addressable by roster id", () => {
  const state = build([roster(), roster({ roster_id: 2, owner_id: "u2", players: [] })]);
  assert.equal(state.byRosterId.get(1)?.team.name, "Team One");
  assert.equal(state.byRosterId.get(2)?.team.name, "Two", "falls back to the display name");
});

// ---- rosterLineup ----

const NONE = new Set<string>();

test("rosterLineup starts the best players, negating the lower-is-better ranking order", () => {
  const slots = orderedSlots(POSITIONS).slots;
  const out = rosterLineup([p("rb1", "RB", 1), p("rb2", "RB", 2), p("rb3", "RB", 300)], slots, NONE);
  assert.ok(!out.filled.some((f) => f.player.id === "rb3" && f.slot === "RB"), "the worst back should not hold a dedicated RB slot");
});

test("rosterLineup excludes the players the caller rules out", () => {
  const slots = orderedSlots(["QB", "BN"]).slots;
  const players = [p("qb1", "QB", 1), p("qb2", "QB", 2)];
  assert.equal(rosterLineup(players, slots, NONE).filled[0].player.id, "qb1");
  assert.equal(rosterLineup(players, slots, new Set(["qb1"])).filled[0].player.id, "qb2");
});

// Regression: a star on IR was being started in both the before and after lineup of a
// trade, which inflated both sides equally and hid the hole the trade might have filled.
test("rosterLineup leaves a team's IR and taxi players out of the lineup", () => {
  const state = build([roster({ players: ["qb1", "rb1", "rb2"], reserve: ["rb1"] })]);
  const me = state.byRosterId.get(1)!;
  const slots = orderedSlots(["RB", "BN"]).slots;

  const withReserve = rosterLineup(me.players, slots, me.reservedIds);
  assert.deepEqual(withReserve.filled.map((f) => f.player.id), ["rb2"], "the best back is on IR and cannot start");

  // Guard the hazard directly: forgetting the reserved set silently starts him.
  const forgotten = rosterLineup(me.players, slots, NONE);
  assert.deepEqual(forgotten.filled.map((f) => f.player.id), ["rb1"]);
});

test("bye-week players are deliberately still eligible — a trade is a season decision", () => {
  const state = build([roster({ players: ["qb1", "rb1"] })]);
  const me = state.byRosterId.get(1)!;
  // POOL gives every player bye 9; week 9 must not remove them from a trade comparison.
  const out = rosterLineup(me.players, orderedSlots(["RB", "BN"]).slots, me.reservedIds);
  assert.deepEqual(out.filled.map((f) => f.player.id), ["rb1"]);
});
