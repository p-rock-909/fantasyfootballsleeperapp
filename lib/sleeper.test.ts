// Golden tests for the format extraction. `slotCounts`/`leagueFormat` were refactored to
// delegate to `slotCountsFromPositions`/`formatFromLeague` so the in-season path can work
// from a league alone; these pin the draft path's output so that stays a no-op refactor.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  formatFromLeague,
  leagueFormat,
  slotCounts,
  slotCountsFromPositions,
  type SleeperDraft,
  type SleeperLeague,
} from "./sleeper";

const draft = (extra: Partial<SleeperDraft> = {}): SleeperDraft => ({
  draft_id: "1",
  league_id: "2",
  season: "2026",
  status: "pre_draft",
  type: "snake",
  start_time: null,
  last_picked: null,
  draft_order: null,
  slot_to_roster_id: null,
  metadata: { scoring_type: "half_ppr" },
  settings: { teams: 12, rounds: 15, pick_timer: 60 },
  ...extra,
});

const league = (extra: Partial<SleeperLeague> = {}): SleeperLeague => ({
  league_id: "2",
  name: "Test",
  season: "2026",
  status: "in_season",
  total_rosters: 12,
  draft_id: "1",
  roster_positions: ["QB", "RB", "RB", "WR", "WR", "TE", "FLEX", "K", "DEF", "BN", "BN", "BN", "BN", "BN", "BN"],
  scoring_settings: { rec: 0.5, pass_td: 4 },
  settings: {},
  ...extra,
});

test("slotCountsFromPositions counts a standard lineup", () => {
  assert.deepEqual(slotCountsFromPositions(league().roster_positions), {
    QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, SUPER_FLEX: 0, REC_FLEX: 0, WRRB_FLEX: 0, K: 1, DEF: 1, BN: 6,
  });
});

test("slotCountsFromPositions counts WRRB_FLEX as its own slot, not bench", () => {
  const counts = slotCountsFromPositions(["QB", "WRRB_FLEX", "BN"]);
  assert.equal(counts.WRRB_FLEX, 1);
  assert.equal(counts.BN, 1);
});

test("slotCountsFromPositions skips IDP slots and buckets unknown tokens as bench", () => {
  const counts = slotCountsFromPositions(["QB", "DL", "LB", "DB", "IDP_FLEX", "MYSTERY", "BN"]);
  assert.equal(counts.QB, 1);
  assert.equal(counts.BN, 2); // MYSTERY + BN; the four IDP tokens are skipped entirely
});

test("slotCounts prefers the league's roster_positions over the draft's slot_ settings", () => {
  const d = draft({ settings: { teams: 12, rounds: 15, pick_timer: 60, slots_qb: 2, slots_rb: 9 } });
  assert.equal(slotCounts(d, league()).QB, 1);
  assert.equal(slotCounts(d, league()).RB, 2);
});

test("slotCounts falls back to draft slot_ settings with no league", () => {
  const d = draft({ settings: { teams: 12, rounds: 15, pick_timer: 60, slots_qb: 1, slots_rb: 2, slots_wr: 3, slots_te: 1, slots_flex: 1, slots_k: 1, slots_def: 1, slots_bn: 6 } });
  assert.deepEqual(slotCounts(d, null), {
    QB: 1, RB: 2, WR: 3, TE: 1, FLEX: 1, SUPER_FLEX: 0, REC_FLEX: 0, WRRB_FLEX: 0, K: 1, DEF: 1, BN: 6,
  });
});

test("slotCounts defaults every slot when the draft carries no slot_ settings", () => {
  assert.deepEqual(slotCounts(draft(), null), {
    QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, SUPER_FLEX: 0, REC_FLEX: 0, WRRB_FLEX: 0, K: 1, DEF: 1, BN: 6,
  });
});

test("leagueFormat output is unchanged by the extraction (golden)", () => {
  assert.deepEqual(leagueFormat(draft(), league()), {
    teams: 12,
    rounds: 15,
    scoring: "half_ppr",
    ppr: 0.5,
    tePremium: 0,
    superflex: false,
    passTdPts: 4,
    slots: { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, SUPER_FLEX: 0, REC_FLEX: 0, WRRB_FLEX: 0, K: 1, DEF: 1, BN: 6 },
    draftType: "snake",
    pickTimer: 60,
  });
});

test("leagueFormat derives ppr from the draft's scoring_type when there is no league", () => {
  assert.equal(leagueFormat(draft({ metadata: { scoring_type: "ppr" } }), null).ppr, 1);
  assert.equal(leagueFormat(draft({ metadata: { scoring_type: "half_ppr" } }), null).ppr, 0.5);
  assert.equal(leagueFormat(draft({ metadata: {} }), null).ppr, 0);
});

test("leagueFormat falls back to the draft's scoring_type when a league has no rec setting", () => {
  // A league whose scoring_settings omits `rec` shouldn't silently become standard
  // scoring when the draft itself says PPR.
  const l = league({ scoring_settings: { pass_td: 4 } });
  assert.equal(leagueFormat(draft({ metadata: { scoring_type: "ppr" } }), l).ppr, 1);
  assert.equal(leagueFormat(draft({ metadata: { scoring_type: "half_ppr" } }), l).ppr, 0.5);
  // An explicit league value always wins over the draft's label.
  assert.equal(leagueFormat(draft({ metadata: { scoring_type: "ppr" } }), league({ scoring_settings: { rec: 0 } })).ppr, 0);
});

test("leagueFormat falls back to draft slots when a league has empty roster_positions", () => {
  // Regression: delegating wholesale to formatFromLeague reported a lineup of all zeros
  // here, which blanks the roster panel and silently disables superflex detection.
  const d = draft({ settings: { teams: 12, rounds: 15, pick_timer: 60, slots_qb: 1, slots_rb: 2, slots_super_flex: 1 } });
  const fmt = leagueFormat(d, league({ roster_positions: [], scoring_settings: { rec: 1, bonus_rec_te: 0.5 } }));
  assert.equal(fmt.slots.RB, 2);
  assert.equal(fmt.superflex, true);
  // ...while still honouring the league's own scoring settings.
  assert.equal(fmt.ppr, 1);
  assert.equal(fmt.tePremium, 0.5);
});

test("leagueFormat flags superflex and TE premium", () => {
  const l = league({
    roster_positions: ["QB", "SUPER_FLEX", "TE", "BN"],
    scoring_settings: { rec: 1, pass_td: 6, bonus_rec_te: 0.5 },
  });
  const fmt = leagueFormat(draft(), l);
  assert.equal(fmt.superflex, true);
  assert.equal(fmt.tePremium, 0.5);
  assert.equal(fmt.passTdPts, 6);
});

test("formatFromLeague matches leagueFormat on everything they share", () => {
  const l = league();
  const fromLeague = formatFromLeague(l);
  const fromDraft = leagueFormat(draft(), l);
  for (const key of ["teams", "ppr", "tePremium", "superflex", "passTdPts"] as const) {
    assert.deepEqual(fromLeague[key], fromDraft[key], `${key} should agree`);
  }
  assert.deepEqual(fromLeague.slots, fromDraft.slots);
});

test("formatFromLeague names the scoring format from the reception value", () => {
  assert.equal(formatFromLeague(league({ scoring_settings: { rec: 1 } })).scoring, "ppr");
  assert.equal(formatFromLeague(league({ scoring_settings: { rec: 0.5 } })).scoring, "half_ppr");
  assert.equal(formatFromLeague(league({ scoring_settings: {} })).scoring, "standard");
});

test("formatFromLeague survives a league with no roster_positions", () => {
  const fmt = formatFromLeague(league({ roster_positions: [] }));
  assert.equal(fmt.slots.QB, 0);
  assert.equal(fmt.superflex, false);
});
