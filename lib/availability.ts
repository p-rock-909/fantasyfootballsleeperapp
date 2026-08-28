import type { RankedPlayer } from "./rankings";
import type { Position } from "./sleeper";

/**
 * Probability a player is gone before pick number `targetPick`, given the draft is at `currentPick`.
 * Model: ADP is the mean of a normal distribution; spread grows with ADP (early picks are tight, late picks are noisy).
 * Falls back to the player's rank among still-available players when no ADP is known.
 */
export function probGone(p: RankedPlayer, currentPick: number, targetPick: number, availIndex: number): number {
  if (!Number.isFinite(targetPick) || targetPick <= currentPick) return 0;
  const adp = p.adp ?? (p.rank != null ? p.rank : null);
  // No ranking data: assume the player will be taken roughly at his position in the available list.
  const mean = adp ?? currentPick + availIndex;
  const sd = Math.max(2, 0.18 * mean);
  // P(pick position < targetPick) under N(mean, sd), conditioned on not yet taken (mean shift if ADP has passed).
  const effMean = Math.max(mean, currentPick + (mean < currentPick ? 3 : 0));
  const z = (targetPick - 0.5 - effMean) / sd;
  return clamp(normCdf(z), 0, 0.99);
}

function normCdf(z: number): number {
  // Abramowitz-Stegun approximation
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
}
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export interface TierSummary {
  pos: Position;
  currentTier: number | null;
  leftInTier: number;
  nextTierStartsAt: string | null; // name of best player in next tier
}

/** For each position: what tier is on the board now and how many remain in it (needs CSV tiers). */
export function tierSummary(available: RankedPlayer[]): TierSummary[] {
  const out: TierSummary[] = [];
  for (const pos of ["QB", "RB", "WR", "TE"] as Position[]) {
    const ps = available.filter((p) => p.pos === pos && p.tier != null);
    if (!ps.length) { out.push({ pos, currentTier: null, leftInTier: 0, nextTierStartsAt: null }); continue; }
    const t = ps[0].tier!;
    const left = ps.filter((p) => p.tier === t).length;
    const next = ps.find((p) => p.tier! > t);
    out.push({ pos, currentTier: t, leftInTier: left, nextTierStartsAt: next?.name ?? null });
  }
  return out;
}
