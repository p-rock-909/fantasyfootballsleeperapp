// Run with `npm test` (tsx --test). Relative imports on purpose: the `@/*` tsconfig
// alias is a Next.js build concern and these run outside it.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  bestLineup,
  buildTeam,
  checkLineup,
  isEligible,
  matchupPhase,
  orderedSlots,
  pairMatchups,
  rosterOwnerIds,
  startability,
  teamName,
  type LineupPlayer,
  type StartingSlot,
} from "./lineup";
import { ids, type SleeperMatchup, type SleeperRoster, type SleeperUser } from "./sleeper";

const p = (id: string, pos: LineupPlayer["pos"], extra: Partial<LineupPlayer> = {}): LineupPlayer => ({
  id,
  name: `Player ${id}`,
  pos,
  team: "SF",
  inj: null,
  bye: null,
  ...extra,
});

const roster = (extra: Partial<SleeperRoster> = {}): SleeperRoster => ({
  roster_id: 1,
  owner_id: "u1",
  co_owners: null,
  players: null,
  starters: null,
  reserve: null,
  taxi: null,
  settings: {},
  ...extra,
});

const matchup = (extra: Partial<SleeperMatchup> = {}): SleeperMatchup => ({
  roster_id: 1,
  matchup_id: 1,
  starters: null,
  players: null,
  points: null,
  starters_points: null,
  players_points: null,
  ...extra,
});

// ---- ids() ----

test("ids drops the '0' empty-slot placeholder and tolerates null", () => {
  assert.deepEqual(ids(null), []);
  assert.deepEqual(ids(undefined), []);
  assert.deepEqual(ids(["a", "0", "b"]), ["a", "b"]);
  assert.deepEqual(ids(["0", "0"]), []);
});

// ---- orderedSlots ----

test("orderedSlots strips bench slots and preserves duplicates in order", () => {
  const { slots, unsupported } = orderedSlots(["QB", "RB", "RB", "WR", "WR", "TE", "FLEX", "K", "DEF", "BN", "BN", "BN"]);
  assert.deepEqual(slots, ["QB", "RB", "RB", "WR", "WR", "TE", "FLEX", "K", "DEF"]);
  assert.deepEqual(unsupported, []);
});

test("orderedSlots segregates IDP and unknown tokens instead of treating them as startable", () => {
  const { slots, unsupported } = orderedSlots(["QB", "DL", "LB", "DB", "IDP_FLEX", "P", "BN"]);
  assert.deepEqual(slots, ["QB"]);
  assert.deepEqual(unsupported, ["DL", "LB", "DB", "IDP_FLEX", "P"]);
});

test("orderedSlots treats IR and TAXI as non-starting, not unsupported", () => {
  const { slots, unsupported } = orderedSlots(["QB", "IR", "TAXI", "BN"]);
  assert.deepEqual(slots, ["QB"]);
  assert.deepEqual(unsupported, []);
});

test("orderedSlots handles a null roster_positions", () => {
  assert.deepEqual(orderedSlots(null), { slots: [], starterIndex: [], unsupported: [] });
});

test("orderedSlots maps each slot to its real position in Sleeper's starters array", () => {
  // An IDP slot still occupies an entry in `starters`, so the RB here is starters[2],
  // not starters[1] — indexing by position in `slots` would shift it into the QB's place.
  const { slots, starterIndex, unsupported } = orderedSlots(["QB", "DL", "RB", "BN"]);
  assert.deepEqual(slots, ["QB", "RB"]);
  assert.deepEqual(starterIndex, [0, 2]);
  assert.deepEqual(unsupported, ["DL"]);
});

test("orderedSlots does not let bench slots consume a starters index", () => {
  // BN/IR/TAXI are absent from `starters` entirely, so they must not advance the counter.
  const { starterIndex } = orderedSlots(["QB", "BN", "RB", "IR", "WR"]);
  assert.deepEqual(starterIndex, [0, 1, 2]);
});

// ---- startability ----

const ctx = (extra: Partial<{ reserve: string[]; taxi: string[]; week: number }> = {}) => ({
  reserve: new Set(extra.reserve ?? []),
  taxi: new Set(extra.taxi ?? []),
  week: extra.week ?? 5,
});

test("startability: questionable players stay startable, definite outs do not", () => {
  assert.equal(startability(p("a", "RB", { inj: "Questionable" }), ctx()), "startable");
  assert.equal(startability(p("a", "RB", { inj: null }), ctx()), "startable");
  for (const inj of ["Out", "Doubtful", "IR", "Sus", "NA", "PUP"]) {
    assert.equal(startability(p("a", "RB", { inj }), ctx()), "out", `${inj} should be out`);
  }
});

test("startability: injury designation matching is case- and space-insensitive", () => {
  assert.equal(startability(p("a", "RB", { inj: " out " }), ctx()), "out");
  assert.equal(startability(p("a", "RB", { inj: "DOUBTFUL" }), ctx()), "out");
});

test("startability: a bye in the selected week blocks the player", () => {
  assert.equal(startability(p("a", "RB", { bye: 5 }), ctx({ week: 5 })), "bye");
  assert.equal(startability(p("a", "RB", { bye: 6 }), ctx({ week: 5 })), "startable");
  assert.equal(startability(p("a", "RB", { bye: null }), ctx({ week: 5 })), "startable");
});

test("startability precedence: reserve beats taxi beats bye beats injury", () => {
  const player = p("a", "RB", { inj: "Out", bye: 5 });
  assert.equal(startability(player, ctx({ reserve: ["a"], taxi: ["a"], week: 5 })), "ir");
  assert.equal(startability(player, ctx({ taxi: ["a"], week: 5 })), "taxi");
  assert.equal(startability(player, ctx({ week: 5 })), "bye");
  assert.equal(startability(p("a", "RB", { inj: "Out" }), ctx({ week: 5 })), "out");
});

// ---- isEligible ----

test("isEligible enforces each slot's eligibility", () => {
  const roster = [p("qb", "QB"), p("rb", "RB"), p("wr", "WR"), p("te", "TE"), p("k", "K"), p("def", "DEF")];
  const idsFor = (slot: StartingSlot) => roster.filter((x) => isEligible(slot, x.pos)).map((x) => x.id);

  assert.deepEqual(idsFor("SUPER_FLEX"), ["qb", "rb", "wr", "te"]);
  assert.deepEqual(idsFor("FLEX"), ["rb", "wr", "te"]);
  assert.deepEqual(idsFor("REC_FLEX"), ["wr", "te"]);
  assert.deepEqual(idsFor("WRRB_FLEX"), ["rb", "wr"]);
  assert.deepEqual(idsFor("TE"), ["te"]);
  assert.deepEqual(idsFor("QB"), ["qb"]);
  assert.deepEqual(idsFor("K"), ["k"]);
});

// ---- buildTeam ----

const users = new Map<string, SleeperUser>([
  ["u1", { user_id: "u1", username: "pat", display_name: "Pat", avatar: null, metadata: { team_name: "Bench Mob" } }],
  ["u2", { user_id: "u2", username: "sam", display_name: "Sam", avatar: null, metadata: null }],
]);

test("teamName prefers the team name, then display name, then a fallback", () => {
  assert.equal(teamName(roster({ owner_id: "u1" }), users), "Bench Mob");
  assert.equal(teamName(roster({ owner_id: "u2" }), users), "Sam");
  assert.equal(teamName(roster({ owner_id: null, roster_id: 7 }), users), "Team 7");
});

test("rosterOwnerIds includes co-owners", () => {
  assert.deepEqual(rosterOwnerIds(roster({ owner_id: "u1", co_owners: ["u2"] })), ["u1", "u2"]);
  assert.deepEqual(rosterOwnerIds(roster({ owner_id: null, co_owners: null })), []);
});

const pool = new Map<string, LineupPlayer>(
  [p("qb1", "QB"), p("rb1", "RB"), p("rb2", "RB"), p("wr1", "WR"), p("wr2", "WR")].map((x) => [x.id, x]),
);

test("buildTeam aligns starters to slots and puts the rest on the bench", () => {
  const slots: StartingSlot[] = ["QB", "RB", "WR"];
  const team = buildTeam({
    roster: roster({ players: ["qb1", "rb1", "wr1", "rb2"] }),
    matchup: matchup({ starters: ["qb1", "rb1", "wr1"], players: ["qb1", "rb1", "wr1", "rb2"], points: 88.5, players_points: { rb1: 12.4 } }),
    users,
    byId: pool,
    lineup: { slots, starterIndex: slots.map((_, i) => i), unsupported: [] },
    week: 5,
  });
  assert.deepEqual(team.starters.map((r) => [r.slot, r.player.id]), [["QB", "qb1"], ["RB", "rb1"], ["WR", "wr1"]]);
  assert.deepEqual(team.bench.map((r) => r.player.id), ["rb2"]);
  assert.equal(team.points, 88.5);
  assert.equal(team.starters[1].points, 12.4);
});

test("buildTeam keeps slot alignment when an unsupported slot sits between supported ones", () => {
  // An IDP league: roster_positions ["QB","DL","RB","BN"], so Sleeper's starters array is
  // [qb, dl, rb]. Indexing it by position in `slots` would put the DL's id in the RB slot
  // and strand the real RB on the bench.
  const lineup = orderedSlots(["QB", "DL", "RB", "BN"]);
  const team = buildTeam({
    roster: roster({ players: ["qb1", "rb1", "rb2"] }),
    matchup: matchup({ starters: ["qb1", "dl1", "rb1"], players: ["qb1", "rb1", "rb2"] }),
    users,
    byId: pool,
    lineup,
    week: 5,
  });
  assert.deepEqual(team.starters.map((r) => [r.slot, r.player.id]), [["QB", "qb1"], ["RB", "rb1"]]);
  // The IDP starter isn't in our pool at all, and the real RB must not be double-counted.
  assert.deepEqual(team.bench.map((r) => r.player.id), ["rb2"]);
  assert.deepEqual(team.unsupportedSlots, ["DL"]);
});

test("buildTeam keeps slot alignment when an empty slot is sent as '0'", () => {
  const slots: StartingSlot[] = ["QB", "RB", "WR"];
  const team = buildTeam({
    roster: roster({ players: ["qb1", "wr1"] }),
    matchup: matchup({ starters: ["qb1", "0", "wr1"], players: ["qb1", "wr1"] }),
    users,
    byId: pool,
    lineup: { slots, starterIndex: slots.map((_, i) => i), unsupported: [] },
    week: 5,
  });
  // The WR must still land in the WR slot, not slide up into RB.
  assert.deepEqual(team.starters.map((r) => [r.slot, r.player.id]), [["QB", "qb1"], ["WR", "wr1"]]);
  assert.deepEqual(team.bench, []);
});

test("buildTeam survives null player arrays and a starter missing from the pool", () => {
  const team = buildTeam({ roster: roster({ players: null, starters: ["qb1", "ghost"], reserve: null, taxi: null }), matchup: undefined, users, byId: pool, lineup: { slots: ["QB", "RB"], starterIndex: ["QB", "RB"].map((_, i) => i), unsupported: [] }, week: 5 });
  assert.deepEqual(team.starters.map((r) => r.player.id), ["qb1"]);
  assert.deepEqual(team.bench, []);
  assert.equal(team.points, null);
});

test("buildTeam marks IR and taxi players from the roster's own lists", () => {
  const team = buildTeam({ roster: roster({ players: ["qb1", "rb1", "rb2"], reserve: ["rb1"], taxi: ["rb2"] }), matchup: matchup({ starters: ["qb1"], players: ["qb1", "rb1", "rb2"] }), users, byId: pool, lineup: { slots: ["QB"], starterIndex: ["QB"].map((_, i) => i), unsupported: [] }, week: 5 });
  const status = Object.fromEntries(team.bench.map((r) => [r.player.id, r.status]));
  assert.deepEqual(status, { rb1: "ir", rb2: "taxi" });
});

// ---- pairMatchups ----

test("pairMatchups groups by matchup_id", () => {
  const pairs = pairMatchups([
    matchup({ roster_id: 1, matchup_id: 1 }),
    matchup({ roster_id: 2, matchup_id: 1 }),
    matchup({ roster_id: 3, matchup_id: 2 }),
    matchup({ roster_id: 4, matchup_id: 2 }),
  ]);
  assert.equal(pairs.length, 2);
  assert.deepEqual(pairs[0].rosterIds, [1, 2]);
  assert.equal(pairs[0].isBye, false);
});

test("pairMatchups turns a null matchup_id into a bye", () => {
  const pairs = pairMatchups([matchup({ roster_id: 9, matchup_id: null })]);
  assert.deepEqual(pairs, [{ key: "bye-9", matchupId: null, rosterIds: [9], isBye: true }]);
});

test("pairMatchups flags an odd roster left alone in its matchup", () => {
  const pairs = pairMatchups([matchup({ roster_id: 1, matchup_id: 1 }), matchup({ roster_id: 2, matchup_id: 2 }), matchup({ roster_id: 3, matchup_id: 2 })]);
  assert.equal(pairs.find((x) => x.key === "1")?.isBye, true);
  assert.equal(pairs.find((x) => x.key === "2")?.rosterIds.length, 2);
});

test("pairMatchups keeps a 3-way group whole rather than truncating it", () => {
  const pairs = pairMatchups([1, 2, 3].map((r) => matchup({ roster_id: r, matchup_id: 1 })));
  assert.deepEqual(pairs[0].rosterIds, [1, 2, 3]);
  assert.equal(pairs[0].isBye, false);
});

test("pairMatchups on an empty or null week returns nothing", () => {
  assert.deepEqual(pairMatchups([]), []);
  assert.deepEqual(pairMatchups(null), []);
});

// ---- matchupPhase ----

const phase = (week: number, stateWeek: number, matchups: SleeperMatchup[], seasons = { leagueSeason: "2026", stateSeason: "2026" }) =>
  matchupPhase({ week, stateWeek, matchups, ...seasons });

test("matchupPhase: a future week is always pre-game", () => {
  assert.equal(phase(9, 5, [matchup({ points: 0 })]), "pre");
});

test("matchupPhase: the current week with no points anywhere is pre-game, not live", () => {
  assert.equal(phase(5, 5, [matchup({ points: 0 }), matchup({ points: null })]), "pre");
  assert.equal(phase(5, 5, [matchup({ points: 12.2 })]), "live");
});

test("matchupPhase: a past week that was played is final", () => {
  assert.equal(phase(3, 5, [matchup({ points: 101.4 })]), "final");
  assert.equal(phase(3, 5, []), "pre");
});

test("matchupPhase: a negative-scoring starter does not make the week look unplayed", () => {
  assert.equal(phase(5, 5, [matchup({ points: -2, starters_points: [-2] })]), "live");
});

test("matchupPhase: a prior-season league is final, not pre-game", () => {
  // Week 14 of 2025 opened in September 2026, when state.week is 1.
  assert.equal(phase(14, 1, [matchup({ points: 118.2 })], { leagueSeason: "2025", stateSeason: "2026" }), "final");
  assert.equal(phase(14, 1, [], { leagueSeason: "2025", stateSeason: "2026" }), "final");
});

test("matchupPhase: a league for a season that hasn't started is pre-game", () => {
  assert.equal(phase(1, 17, [], { leagueSeason: "2027", stateSeason: "2026" }), "pre");
});

test("matchupPhase: Monday night — points are in but state.week hasn't rolled over", () => {
  // The points check is dominant, so a finished week never reads as "pre".
  assert.equal(phase(5, 5, [matchup({ points: 143.8 })]), "live");
});

// ---- checkLineup ----

const legalAlways = () => true;

test("checkLineup accepts a complete, legal lineup", () => {
  const slots: StartingSlot[] = ["QB", "RB", "FLEX"];
  const { kept, alerts } = checkLineup(
    [
      { slot: "QB", player_id: "qb1", name: "QB One" },
      { slot: "RB", player_id: "rb1", name: "RB One" },
      { slot: "FLEX", player_id: "wr1", name: "WR One" },
    ],
    slots,
    legalAlways,
  );
  assert.equal(kept.length, 3);
  assert.deepEqual(alerts, []);
});

test("checkLineup rejects the same player started twice", () => {
  const { kept, alerts } = checkLineup(
    [
      { slot: "RB", player_id: "rb1", name: "RB One" },
      { slot: "FLEX", player_id: "rb1", name: "RB One" },
    ],
    ["RB", "FLEX"],
    legalAlways,
  );
  assert.equal(kept.length, 1);
  assert.match(alerts[0], /already started at RB/);
  assert.match(alerts[1], /No recommendation returned for: FLEX/);
});

test("checkLineup reports a slot the model never filled", () => {
  const { alerts } = checkLineup([{ slot: "QB", player_id: "qb1", name: "QB One" }], ["QB", "RB", "DEF"], legalAlways);
  assert.match(alerts[0], /No recommendation returned for: RB, DEF/);
});

test("checkLineup drops a player the legality check rejects", () => {
  const { kept, alerts } = checkLineup(
    [{ slot: "QB", player_id: "ghost", name: "Not On Roster" }],
    ["QB"],
    (_slot, id) => id !== "ghost",
  );
  assert.deepEqual(kept, []);
  assert.match(alerts[0], /not an eligible, startable player/);
});

test("checkLineup drops extra rows for a slot the league does not have", () => {
  const { kept, alerts } = checkLineup(
    [
      { slot: "QB", player_id: "qb1", name: "QB One" },
      { slot: "QB", player_id: "qb2", name: "QB Two" },
    ],
    ["QB"],
    legalAlways,
  );
  assert.equal(kept.length, 1);
  assert.match(alerts[0], /no unfilled QB slot/);
});

// ---- bestLineup ----

// Value is carried on the player so the tests read as "who is better", and so the
// higher-is-better contract is visible at every call site.
const v = (id: string, pos: LineupPlayer["pos"], value: number) => ({ ...p(id, pos), value });
const byValue = (x: { value: number }) => x.value;
// The score of a solved lineup. Computed here rather than returned by `bestLineup`,
// which production code never needs it from.
const scoreOf = (l: { filled: { player: { value: number } }[] }) => l.filled.reduce((s, f) => s + f.player.value, 0);

test("bestLineup fills every dedicated slot with the best eligible player", () => {
  const out = bestLineup(
    [v("qb1", "QB", 10), v("qb2", "QB", 4), v("rb1", "RB", 9), v("rb2", "RB", 8)],
    ["QB", "RB", "RB"],
    byValue,
  );
  assert.deepEqual(out.filled.map((f) => `${f.slot}:${f.player.id}`), ["QB:qb1", "RB:rb1", "RB:rb2"]);
  assert.deepEqual(out.empty, []);
  assert.equal(scoreOf(out), 27);
});

test("bestLineup never starts the same player twice", () => {
  const out = bestLineup([v("rb1", "RB", 9)], ["RB", "FLEX"], byValue);
  assert.deepEqual(out.filled.map((f) => f.player.id), ["rb1"]);
  assert.deepEqual(out.empty, ["FLEX"]);
});

test("bestLineup reports slots nothing eligible was left for", () => {
  const out = bestLineup([v("wr1", "WR", 9)], ["QB", "WR", "K"], byValue);
  assert.deepEqual(out.filled.map((f) => f.slot), ["WR"]);
  assert.deepEqual(out.empty, ["QB", "K"]);
});

test("bestLineup puts a QB in a superflex only when that beats the alternative", () => {
  // The QB is the best player available, so superflex takes him over the spare WR.
  const out = bestLineup(
    [v("qb1", "QB", 10), v("qb2", "QB", 9), v("wr1", "WR", 8), v("wr2", "WR", 3)],
    ["QB", "WR", "SUPER_FLEX"],
    byValue,
  );
  const bySlot = Object.fromEntries(out.filled.map((f) => [f.slot, f.player.id]));
  assert.deepEqual(bySlot, { QB: "qb1", WR: "wr1", SUPER_FLEX: "qb2" });
});

// The case that justifies the augmenting-path assignment. REC_FLEX {WR,TE} and
// WRRB_FLEX {RB,WR} overlap without either containing the other, so "walk the players
// best-first and drop each into the first slot he fits" strands the TE: it puts the WR in
// REC_FLEX, leaving WRRB_FLEX to the RB for 10+8=18. The optimum is 10+9=19.
test("bestLineup beats first-fit when REC_FLEX and WRRB_FLEX overlap", () => {
  const players = [v("wr1", "WR", 10), v("te1", "TE", 9), v("rb1", "RB", 8)];
  const slots: StartingSlot[] = ["REC_FLEX", "WRRB_FLEX"];

  // What a first-fit pass would have produced, computed here so the claim is not just prose.
  let firstFitTotal = 0;
  const taken = new Set<string>();
  for (const player of [...players].sort((a, b) => b.value - a.value)) {
    const slot = slots.find((s) => !taken.has(s) && isEligible(s, player.pos));
    if (slot) { taken.add(slot); firstFitTotal += player.value; }
  }
  assert.equal(firstFitTotal, 18);

  const out = bestLineup(players, slots, byValue);
  assert.equal(scoreOf(out), 19);
  assert.deepEqual(Object.fromEntries(out.filled.map((f) => [f.slot, f.player.id])), { REC_FLEX: "te1", WRRB_FLEX: "wr1" });
  // ...and the running back is the one left out.
  assert.ok(!out.filled.some((f) => f.player.id === "rb1"));
});

test("bestLineup is stable when two players are worth the same", () => {
  const players = [v("wr1", "WR", 5), v("wr2", "WR", 5), v("wr3", "WR", 5)];
  const first = bestLineup(players, ["WR"], byValue);
  const again = bestLineup(players, ["WR"], byValue);
  assert.deepEqual(first.filled.map((f) => f.player.id), again.filled.map((f) => f.player.id));
  assert.deepEqual(first.filled.map((f) => f.player.id), ["wr1"]);
});

test("bestLineup handles an empty roster and an empty lineup", () => {
  assert.deepEqual(bestLineup([], ["QB"], byValue), { filled: [], empty: ["QB"], bySlot: [null] });
  const noSlots = bestLineup([v("qb1", "QB", 1)], [], byValue);
  assert.deepEqual(noSlots.filled, []);
  assert.deepEqual(noSlots.empty, []);
  assert.deepEqual(noSlots.bySlot, []);
});

// `filled` skips unfillable slots, so two lineups over the same slots only line up
// slot-for-slot through `bySlot`. Zipping the `filled` lists would shift every row after a
// hole — which is exactly how a trade's before/after diff marks the wrong player changed.
test("bestLineup returns a slot-aligned view with nulls for the gaps", () => {
  const slots: StartingSlot[] = ["QB", "RB", "WR"];
  const before = bestLineup([v("qb1", "QB", 9), v("wr1", "WR", 8)], slots, byValue);
  const after = bestLineup([v("qb1", "QB", 9), v("rb1", "RB", 7), v("wr1", "WR", 8)], slots, byValue);

  assert.deepEqual(before.bySlot.map((p) => p?.id ?? null), ["qb1", null, "wr1"]);
  assert.deepEqual(after.bySlot.map((p) => p?.id ?? null), ["qb1", "rb1", "wr1"]);

  // The WR is unchanged; only the RB slot was filled. Comparing `filled` by index would
  // have claimed the WR changed, because `before.filled` is only two entries long.
  const diff = slots.map((_, i) => (before.bySlot[i]?.id ?? null) !== (after.bySlot[i]?.id ?? null));
  assert.deepEqual(diff, [false, true, false]);
  assert.notDeepEqual(
    before.filled.map((f) => f.player.id),
    after.filled.map((f) => f.player.id).slice(0, before.filled.length),
  );
});
