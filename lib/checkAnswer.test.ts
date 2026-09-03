import assert from "node:assert/strict";
import { test } from "node:test";
import { checkTradeEvaluation, checkTradeProposals, checkWaiverCandidates } from "./checkAnswer";
import type { TradeEvaluation, TradeProposal, WaiverCandidate } from "./schema";

const candidate = (over: Partial<WaiverCandidate> = {}): WaiverCandidate => ({
  rank: 1, player_id: "fa1",
  addType: "starter", score: 70,
  confidence: "probable", evidence: "", outlook: "", mainRisk: "",
  faabPctLow: 0, faabPctHigh: 0,
  dropPlayerId: "", dropWhy: "", decision: "add", ...over,
});

const ctx = (over: Partial<Parameters<typeof checkWaiverCandidates>[1]> = {}) => ({
  offeredIds: new Set(["fa1", "fa2"]),
  rosterIds: new Set(["mine1", "mine2"]),
  faab: true,
  faabRemaining: 40,
  nameOf: (id: string) => ({ fa1: "Free Agent", mine1: "Mine", "someone-else": "Not Mine" })[id] ?? id,
  ...over,
});

// ---- waiver claims ----

test("a claim on someone outside the candidate set is dropped and reported", () => {
  const { kept, alerts } = checkWaiverCandidates([candidate({ player_id: "nope" })], ctx());
  assert.deepEqual(kept, []);
  assert.match(alerts[0], /Dropped nope: not one of the 2 available players/);
});

test("the same player ranked twice keeps only the first entry", () => {
  const { kept, alerts } = checkWaiverCandidates([candidate(), candidate({ rank: 2 })], ctx());
  assert.equal(kept.length, 1);
  assert.match(alerts[0], /ranked twice/);
});

test("a drop that is not on the roster is cleared, and the claim survives", () => {
  const { kept, alerts } = checkWaiverCandidates(
    [candidate({ dropPlayerId: "someone-else", dropWhy: "because" })],
    ctx(),
  );
  assert.equal(kept.length, 1, "the claim itself is still useful");
  assert.deepEqual([kept[0].dropPlayerId, kept[0].dropWhy], ["", ""], "both drop fields clear together");
  assert.match(alerts[0], /Not Mine is not on this roster/);
});

test("a drop naming the player being added is cleared", () => {
  const { kept, alerts } = checkWaiverCandidates(
    [candidate({ dropPlayerId: "fa1" })],
    ctx({ rosterIds: new Set(["fa1"]) }),
  );
  assert.equal(kept[0].dropPlayerId, "");
  assert.match(alerts[0], /named the player being added/);
});

test("a valid drop is left alone", () => {
  const { kept, alerts } = checkWaiverCandidates(
    [candidate({ dropPlayerId: "mine1", dropWhy: "declining role" })],
    ctx(),
  );
  assert.equal(kept[0].dropPlayerId, "mine1");
  assert.deepEqual(alerts, []);
});

// ---- FAAB ----

test("a bid over the remaining budget is capped, not dropped", () => {
  const { kept, alerts } = checkWaiverCandidates([candidate({ faabPctLow: 20, faabPctHigh: 80 })], ctx({ faabRemaining: 40 }));
  assert.equal(kept[0].faabPctHigh, 40);
  assert.equal(kept[0].faabPctLow, 20);
  assert.match(alerts[0], /Capped the bid on Free Agent at 40/);
});

test("capping the top of a range never leaves it inverted", () => {
  const { kept } = checkWaiverCandidates([candidate({ faabPctLow: 60, faabPctHigh: 80 })], ctx({ faabRemaining: 40 }));
  assert.equal(kept[0].faabPctHigh, 40);
  assert.equal(kept[0].faabPctLow, 40);
  assert.ok(kept[0].faabPctLow! <= kept[0].faabPctHigh!);
});

test("a bid inside the budget is untouched", () => {
  const { kept, alerts } = checkWaiverCandidates([candidate({ faabPctLow: 5, faabPctHigh: 12 })], ctx({ faabRemaining: 40 }));
  assert.deepEqual([kept[0].faabPctLow, kept[0].faabPctHigh], [5, 12]);
  assert.deepEqual(alerts, []);
});

test("a bid in a league that does not use FAAB is cleared as a category error", () => {
  const { kept, alerts } = checkWaiverCandidates(
    [candidate({ faabPctLow: 5, faabPctHigh: 12 })],
    ctx({ faab: false, faabRemaining: null }),
  );
  assert.deepEqual([kept[0].faabPctLow, kept[0].faabPctHigh], [0, 0]);
  assert.match(alerts[0], /waiver priority, not a budget/);
});

test("a league with an unknown remaining budget leaves bids alone", () => {
  const { kept, alerts } = checkWaiverCandidates([candidate({ faabPctHigh: 80 })], ctx({ faabRemaining: null }));
  assert.equal(kept[0].faabPctHigh, 80);
  assert.deepEqual(alerts, []);
});

test("checkWaiverCandidates does not mutate what the model returned", () => {
  const original = candidate({ faabPctHigh: 80, dropPlayerId: "stray" });
  checkWaiverCandidates([original], ctx({ faabRemaining: 10 }));
  assert.equal(original.faabPctHigh, 80, "the logged answer must still say what the model said");
  assert.equal(original.dropPlayerId, "stray");
});

// ---- trade evaluation ----

const impact = (rosterId: number, team: string) => ({
  rosterId, team, before: "", after: "", mainLineupChange: "", depthChange: "unchanged" as const,
  strategicEffect: "", score: 0, scoreBreakdown: [],
});

const asset = (player_id: string, name: string) => ({
  player_id, name, roleUsage: "", rosOutlook: "", floorCeiling: "medium" as const, mainRisk: "", formatNote: "",
});

const evaluation = (over: Partial<TradeEvaluation> = {}): TradeEvaluation => ({
  verdict: "accept",
  assumptions: { format: "", timeline: "", newsCutoff: "", unknowns: [] },
  teamImpact: [impact(1, "One"), impact(2, "Two")],
  assets: [asset("a1", "Asset One")],
  rationale: "", adjustments: [], contingencies: [],
  fairness: { flagged: false, reasoning: "" },
  ...over,
});

const tradeCtx = {
  rosterIds: [1, 2] as [number, number],
  teamName: (id: number) => ({ 1: "One", 2: "Two" })[id] ?? `Team ${id}`,
  movingIds: new Set(["a1", "b1"]),
};

test("a scorecard covering both sides passes clean", () => {
  const { assets, alerts } = checkTradeEvaluation(evaluation(), tradeCtx);
  assert.equal(assets.length, 1);
  assert.deepEqual(alerts, []);
});

test("a missing scorecard for one side is reported by name", () => {
  const { alerts } = checkTradeEvaluation(evaluation({ teamImpact: [impact(1, "One")] }), tradeCtx);
  assert.match(alerts[0], /No scorecard was returned for Two\./);
});

test("scoring a team that is not in the trade is reported", () => {
  const { alerts } = checkTradeEvaluation(
    evaluation({ teamImpact: [impact(1, "One"), impact(9, "Nine")] }),
    tradeCtx,
  );
  assert.ok(alerts.some((a) => /not in this trade: Nine \(roster 9\)/.test(a)));
  assert.ok(alerts.some((a) => /No scorecard was returned for Two/.test(a)));
});

test("an asset that is not moving in the trade is dropped", () => {
  const { assets, alerts } = checkTradeEvaluation(
    evaluation({ assets: [asset("a1", "Asset One"), asset("zz", "Bystander")] }),
    tradeCtx,
  );
  assert.deepEqual(assets.map((a) => a.player_id), ["a1"]);
  assert.match(alerts[0], /Dropped Bystander from the asset list/);
});

// ---- trade proposals ----

const proposal = (over: Partial<TradeProposal> = {}): TradeProposal => ({
  partnerRosterId: 2, partnerTeam: "Two",
  youSend: [{ player_id: "mine1", name: "Mine One" }],
  youGet: [{ player_id: "theirs1", name: "Theirs One" }],
  pitch: "", whyTheyAccept: "", whyYouWin: "", mainRisk: "", confidence: "medium", ...over,
});

const proposalCtx = (over: Partial<Parameters<typeof checkTradeProposals>[1]> = {}) => ({
  initiatorRosterId: 1,
  requiredPartnerId: null,
  playersByRoster: new Map([
    [1, new Set(["mine1", "mine2"])],
    [2, new Set(["theirs1"])],
    [3, new Set(["other1"])],
  ]),
  teamName: (id: number) => `Team ${id}`,
  ...over,
});

test("a well-formed proposal survives", () => {
  const { kept, alerts } = checkTradeProposals([proposal()], proposalCtx());
  assert.equal(kept.length, 1);
  assert.deepEqual(alerts, []);
});

test("a proposal sending a player the initiator does not have is dropped", () => {
  const { kept, alerts } = checkTradeProposals(
    [proposal({ youSend: [{ player_id: "nope", name: "Phantom" }] })],
    proposalCtx(),
  );
  assert.deepEqual(kept, []);
  assert.match(alerts[0], /Phantom not on the roster said to be sending them/);
});

test("a proposal receiving a player the partner does not have is dropped", () => {
  const { alerts } = checkTradeProposals(
    [proposal({ youGet: [{ player_id: "other1", name: "Wrong Team" }] })],
    proposalCtx(),
  );
  assert.match(alerts[0], /Wrong Team not on the roster/);
});

test("a proposal with the initiator's own team is dropped", () => {
  const { alerts } = checkTradeProposals([proposal({ partnerRosterId: 1 })], proposalCtx());
  assert.match(alerts[0], /not another team in this league/);
});

test("a proposal with a team outside the league is dropped", () => {
  const { alerts } = checkTradeProposals([proposal({ partnerRosterId: 99, partnerTeam: "Nowhere" })], proposalCtx());
  assert.match(alerts[0], /Nowhere: not another team in this league/);
});

test("when one partner was chosen, proposals with anyone else are dropped", () => {
  const { kept, alerts } = checkTradeProposals(
    [proposal(), proposal({ partnerRosterId: 3, partnerTeam: "Three", youGet: [{ player_id: "other1", name: "Other" }] })],
    proposalCtx({ requiredPartnerId: 2 }),
  );
  assert.equal(kept.length, 1);
  assert.match(alerts[0], /Team 2 was the chosen partner/);
});

test("losing every proposal is reported rather than returning a silent empty list", () => {
  const { alerts } = checkTradeProposals([proposal({ partnerRosterId: 99 })], proposalCtx());
  assert.ok(alerts.some((a) => /No usable proposals survived validation/.test(a)));
});
