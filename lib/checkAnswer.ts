// Checking the model's answer against the facts the app already knows.
//
// The same discipline as `checkLineup` in lineup.ts, applied to the waiver and trade
// answers: the ids being well-formed is not the same as the advice being actionable. A
// claim on a player another team already rosters, a drop of someone who isn't on the
// roster, or a bid larger than the budget are all things the app can rule out without
// asking anyone.
//
// These live here rather than inline in the route handlers so they can be tested without
// standing up a request, Sleeper and an LLM — there are enough rules, with enough
// correlated multi-field edits, that "it looked right when I wrote it" is not good enough.
//
// ON REPORTING VS REPAIRING. `checkLineup` deletes an illegal starter, because a lineup
// with an ineligible player in it is not a lineup. These repair instead, and that is a
// deliberate difference: a bid over budget is still a good claim at a capped bid, and a
// bad drop suggestion should not throw away the analysis of the player being added. What
// is never silent is the repair itself — every change lands in `alerts`, which the routes
// put on the envelope, apart from anything the model said.

import type { TradeAsset, TradeEvaluation, TradeProposal, WaiverCandidate } from "./schema";

export interface AnswerCheck<T> {
  kept: T[];
  alerts: string[];
}

export interface WaiverCheckContext {
  /** The shortlist that was actually sent. Nothing outside it can be claimed. */
  offeredIds: Set<string>;
  /** Everyone on the team being advised, so a drop can be verified. */
  rosterIds: Set<string>;
  /** Whether the league bids at all. */
  faab: boolean;
  /** What this team has left to bid, when it bids. */
  faabRemaining: number | null;
}

/**
 * Waiver claims, checked against the candidate set and this team's roster and budget.
 *
 * Returns new objects; the input is not mutated, so a caller can log what the model
 * originally said alongside what was served.
 */
export function checkWaiverCandidates(
  candidates: WaiverCandidate[],
  ctx: WaiverCheckContext,
): AnswerCheck<WaiverCandidate> {
  const alerts: string[] = [];
  const kept: WaiverCandidate[] = [];
  const seen = new Set<string>();

  for (const raw of candidates) {
    if (!ctx.offeredIds.has(raw.player_id)) {
      alerts.push(`Dropped ${raw.name}: not one of the ${ctx.offeredIds.size} available players this run considered.`);
      continue;
    }
    if (seen.has(raw.player_id)) {
      alerts.push(`Dropped a second entry for ${raw.name}: the same player was ranked twice.`);
      continue;
    }
    seen.add(raw.player_id);

    const c = { ...raw };

    if (c.dropPlayerId && !ctx.rosterIds.has(c.dropPlayerId)) {
      alerts.push(`Cleared the suggested drop for ${c.name}: ${c.dropName ?? c.dropPlayerId} is not on this roster.`);
      c.dropPlayerId = null;
      c.dropName = null;
      c.dropWhy = null;
    }
    // Never drop the player you are adding.
    if (c.dropPlayerId && c.dropPlayerId === c.player_id) {
      alerts.push(`Cleared the suggested drop for ${c.name}: it named the player being added.`);
      c.dropPlayerId = null;
      c.dropName = null;
      c.dropWhy = null;
    }

    if (!ctx.faab) {
      // A bid in a league with no budget is a category error, not a number to adjust.
      if (c.faabPctLow != null || c.faabPctHigh != null) {
        alerts.push(`Cleared the FAAB bid for ${c.name}: this league uses waiver priority, not a budget.`);
        c.faabPctLow = null;
        c.faabPctHigh = null;
      }
    } else if (ctx.faabRemaining != null) {
      if (c.faabPctHigh != null && c.faabPctHigh > ctx.faabRemaining) {
        alerts.push(`Capped the bid on ${c.name} at ${ctx.faabRemaining}: the suggested ${c.faabPctHigh} is more than this team has left.`);
        c.faabPctHigh = ctx.faabRemaining;
      }
      if (c.faabPctLow != null && c.faabPctLow > ctx.faabRemaining) c.faabPctLow = ctx.faabRemaining;
      // Capping the top can invert the range.
      if (c.faabPctLow != null && c.faabPctHigh != null && c.faabPctLow > c.faabPctHigh) c.faabPctLow = c.faabPctHigh;
    }

    kept.push(c);
  }

  if (candidates.length && !kept.length) alerts.push("No usable candidates survived validation.");
  return { kept, alerts };
}

export interface TradeEvaluationCheckContext {
  /** The two rosters actually in the deal. */
  rosterIds: [number, number];
  teamName: (rosterId: number) => string;
  /** Every player moving in either direction. */
  movingIds: Set<string>;
}

/** A trade scorecard, checked for covering both sides and only the players in the deal. */
export function checkTradeEvaluation(
  evaluation: TradeEvaluation,
  ctx: TradeEvaluationCheckContext,
): { assets: TradeAsset[]; alerts: string[] } {
  const alerts: string[] = [];
  const expected = new Set(ctx.rosterIds);

  for (const t of evaluation.teamImpact) {
    if (!expected.has(t.rosterId)) alerts.push(`Scored a team that is not in this trade: ${t.team} (roster ${t.rosterId}).`);
  }
  for (const id of expected) {
    if (!evaluation.teamImpact.some((t) => t.rosterId === id)) {
      alerts.push(`No scorecard was returned for ${ctx.teamName(id)}.`);
    }
  }

  const assets = evaluation.assets.filter((a) => {
    if (!ctx.movingIds.has(a.player_id)) {
      alerts.push(`Dropped ${a.name} from the asset list: not one of the players moving in this trade.`);
      return false;
    }
    return true;
  });

  return { assets, alerts };
}

export interface TradeProposalCheckContext {
  initiatorRosterId: number;
  /** Set when the user picked one partner; null when any team is fair game. */
  requiredPartnerId: number | null;
  /** Who is on each roster, so both sides of an offer can be verified. */
  playersByRoster: Map<number, Set<string>>;
  teamName: (rosterId: number) => string;
}

/** Generated offers, checked so every player named is on the roster said to be sending them. */
export function checkTradeProposals(
  proposals: TradeProposal[],
  ctx: TradeProposalCheckContext,
): AnswerCheck<TradeProposal> {
  const alerts: string[] = [];
  const mine = ctx.playersByRoster.get(ctx.initiatorRosterId) ?? new Set<string>();

  const kept = proposals.filter((p) => {
    const partner = ctx.playersByRoster.get(p.partnerRosterId);
    if (!partner || p.partnerRosterId === ctx.initiatorRosterId) {
      alerts.push(`Dropped a proposal with ${p.partnerTeam}: not another team in this league.`);
      return false;
    }
    if (ctx.requiredPartnerId != null && p.partnerRosterId !== ctx.requiredPartnerId) {
      alerts.push(`Dropped a proposal with ${p.partnerTeam}: ${ctx.teamName(ctx.requiredPartnerId)} was the chosen partner.`);
      return false;
    }
    const stray = [
      ...p.youSend.filter((x) => !mine.has(x.player_id)).map((x) => x.name),
      ...p.youGet.filter((x) => !partner.has(x.player_id)).map((x) => x.name),
    ];
    if (stray.length) {
      alerts.push(`Dropped a proposal with ${p.partnerTeam}: ${stray.join(", ")} not on the roster said to be sending them.`);
      return false;
    }
    return true;
  });

  if (proposals.length && !kept.length) alerts.push("No usable proposals survived validation.");
  return { kept, alerts };
}
