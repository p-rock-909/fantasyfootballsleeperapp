import assert from "node:assert/strict";
import { test } from "node:test";
import { dropCandidates, freeAgents, shortlist } from "./freeAgents";
import type { RankedPlayer } from "./rankings";
import type { RosterAnalysis } from "./rosterNeeds";
import type { Position, SleeperRoster } from "./sleeper";

const fa = (id: string, pos: Position, order: number, extra: Partial<RankedPlayer> = {}): RankedPlayer => ({
  id, name: `Player ${id}`, pos, team: "SF", age: 25, exp: 3, inj: null, depth: 1, srank: order,
  rank: null, adp: null, tier: null, bye: 9, proj: null, posRank: null, order, ...extra,
});

const roster = (over: Partial<SleeperRoster> = {}): SleeperRoster => ({
  roster_id: 1, owner_id: "u1", co_owners: null, players: null, starters: null,
  reserve: null, taxi: null, settings: {}, ...over,
});

const needs = (over: Partial<RosterAnalysis> = {}): RosterAnalysis => ({
  counts: { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DEF: 0 },
  starters: { QB: 1, RB: 2, WR: 2, TE: 1, K: 1, DEF: 1 },
  starterGaps: { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DEF: 0 },
  flexOpen: 0, superflexOpen: 0, benchOpen: 3, totalOpen: 3,
  byeClashes: [], starterGapsLine: "none", summary: "", inSeasonSummary: "", ...over,
});

// ---- freeAgents ----

test("freeAgents excludes everyone on a roster in the league", () => {
  const pool = [fa("a", "RB", 1), fa("b", "WR", 2), fa("c", "TE", 3)];
  const out = freeAgents(pool, [roster({ players: ["a"] }), roster({ roster_id: 2, players: ["b"] })]);
  assert.deepEqual(out.map((p) => p.id), ["c"]);
});

// Defensive: `reserve` and `taxi` are subsets of `players` in every shape Sleeper
// produces, so this case should not arise. It is covered because the cost of being wrong
// is recommending someone's IR stash as a free agent.
test("freeAgents also excludes reserve and taxi players listed outside `players`", () => {
  const pool = [fa("a", "RB", 1), fa("b", "WR", 2), fa("c", "TE", 3)];
  const out = freeAgents(pool, [roster({ players: [], reserve: ["a"], taxi: ["b"] })]);
  assert.deepEqual(out.map((p) => p.id), ["c"]);
});

test("freeAgents survives Sleeper's nulls and its \"0\" empty-slot placeholder", () => {
  const pool = [fa("a", "RB", 1)];
  assert.deepEqual(freeAgents(pool, [roster()]).map((p) => p.id), ["a"]);
  assert.deepEqual(freeAgents(pool, [roster({ players: ["0", "a"] })]).map((p) => p.id), []);
});

// ---- shortlist ----

test("shortlist puts the most-added players first, ahead of a better search rank", () => {
  const pool = [fa("cold", "RB", 1), fa("hot", "RB", 900)];
  const out = shortlist(pool, { needs: needs(), trending: new Map([["hot", 5000]]) });
  assert.deepEqual(out.entries.map((e) => e.player.id), ["hot", "cold"]);
  assert.equal(out.entries[0].reason, "trending");
  assert.equal(out.entries[0].adds, 5000);
});

test("shortlist falls back to ranking order for players outside the trending cutoff", () => {
  const pool = [fa("b", "RB", 20), fa("a", "RB", 10)];
  const out = shortlist(pool, { needs: needs() });
  assert.deepEqual(out.entries.map((e) => e.player.id), ["a", "b"]);
});

test("shortlist caps each position so trending kickers cannot crowd out the backs", () => {
  const kickers = Array.from({ length: 30 }, (_, i) => fa(`k${i}`, "K", i));
  const backs = Array.from({ length: 30 }, (_, i) => fa(`rb${i}`, "RB", 100 + i));
  // Every kicker is hotter than every back, which without caps would fill the whole list.
  const trending = new Map(kickers.map((k, i) => [k.id, 1000 - i]));
  const out = shortlist([...kickers, ...backs], { needs: needs(), trending });
  const byPos = out.entries.reduce<Record<string, number>>((acc, e) => ({ ...acc, [e.player.pos]: (acc[e.player.pos] ?? 0) + 1 }), {});
  assert.equal(byPos.K, 2);
  assert.equal(byPos.RB, 8);
});

test("shortlist widens the position the team actually needs", () => {
  const backs = Array.from({ length: 30 }, (_, i) => fa(`rb${i}`, "RB", i));
  const withGap = shortlist(backs, { needs: needs({ starterGaps: { QB: 0, RB: 1, WR: 0, TE: 0, K: 0, DEF: 0 } }) });
  const without = shortlist(backs, { needs: needs() });
  assert.equal(without.entries.length, 8);
  assert.equal(withGap.entries.length, 12);
});

test("shortlist widens flex-eligible positions when a flex slot is open", () => {
  const pool = [
    ...Array.from({ length: 30 }, (_, i) => fa(`rb${i}`, "RB", i)),
    ...Array.from({ length: 30 }, (_, i) => fa(`qb${i}`, "QB", 100 + i)),
  ];
  const out = shortlist(pool, { needs: needs({ flexOpen: 1 }) });
  const byPos = out.entries.reduce<Record<string, number>>((acc, e) => ({ ...acc, [e.player.pos]: (acc[e.player.pos] ?? 0) + 1 }), {});
  assert.equal(byPos.RB, 12); // 8 + the flex bonus
  assert.equal(byPos.QB, 3); // a QB cannot fill a FLEX, so no bonus
});

// The whole point of the caps: the input is ~700 players in a 12-team league and the
// prompt has to stay bounded no matter what the trending endpoint returns.
test("shortlist never exceeds its limit and reports what it considered", () => {
  const pool = Array.from({ length: 400 }, (_, i) => fa(`p${i}`, (["QB", "RB", "WR", "TE", "K", "DEF"] as Position[])[i % 6], i));
  const out = shortlist(pool, { needs: needs(), limit: 10 });
  assert.equal(out.entries.length, 10);
  assert.equal(out.considered, 400);
});

test("shortlist is deterministic for a fixed input", () => {
  const pool = Array.from({ length: 50 }, (_, i) => fa(`p${i}`, "WR", i % 7));
  const trending = new Map([["p3", 10], ["p9", 8]]);
  const a = shortlist(pool, { needs: needs(), trending });
  const b = shortlist(pool, { needs: needs(), trending });
  assert.deepEqual(a.entries.map((e) => e.player.id), b.entries.map((e) => e.player.id));
});

test("shortlist labels why each player made the list", () => {
  const out = shortlist(
    [fa("hot", "WR", 500), fa("sheet", "WR", 5, { rank: 5 }), fa("neither", "WR", 900)],
    { needs: needs(), trending: new Map([["hot", 100]]) },
  );
  assert.deepEqual(
    Object.fromEntries(out.entries.map((e) => [e.player.id, e.reason])),
    { hot: "trending", sheet: "ranked", neither: "pool" },
  );
});

// ---- dropCandidates ----

test("dropCandidates offers streamable kickers and defenses before real players", () => {
  const out = dropCandidates(
    [fa("wr1", "WR", 10), fa("k1", "K", 300), fa("def1", "DEF", 250), fa("rb1", "RB", 400)],
    new Set(["wr1"]),
    3,
  );
  assert.deepEqual(out.map((p) => p.id).slice(0, 2).sort(), ["def1", "k1"]);
  assert.equal(out.length, 3);
});

test("dropCandidates never offers a starter", () => {
  const out = dropCandidates([fa("wr1", "WR", 10), fa("wr2", "WR", 500)], new Set(["wr1", "wr2"]), 5);
  assert.deepEqual(out, []);
});

test("dropCandidates ranks the least valuable bench player first", () => {
  const out = dropCandidates([fa("good", "WR", 10), fa("bad", "WR", 800)], new Set(), 1);
  assert.deepEqual(out.map((p) => p.id), ["bad"]);
});
