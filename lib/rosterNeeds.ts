import { SLOT_ELIGIBILITY } from "./lineup";
import type { Player, Position, SlotCounts } from "./sleeper";

export interface RosterAnalysis {
  counts: Record<Position, number>;
  starters: Record<Position, number>; // dedicated starter slots (not flex)
  starterGaps: Record<Position, number>; // dedicated slots still unfilled
  flexOpen: number; // FLEX/REC_FLEX slots still unfilled after dedicated slots
  superflexOpen: number;
  benchOpen: number;
  totalOpen: number;
  byeClashes: { bye: number; players: string[] }[]; // 3+ likely starters sharing a bye
  /** Unfilled dedicated starter slots as "RBx1, WRx2", or "none". */
  starterGapsLine: string;
  summary: string; // one-line human summary for the draft board and its prompt
  /** The same line for in-season use, where "picks remaining" would be meaningless. */
  inSeasonSummary: string;
}

// Which positions fill which slot is one league rule with one owner: SLOT_ELIGIBILITY.

// Generic over the player type so a caller holding `RankedPlayer`s — which already carry a
// resolved `bye` — can supply a `byeOf` that reads it, instead of casting back down.
export function analyzeRoster<T extends Player>(
  roster: T[],
  slots: SlotCounts,
  byeOf: (p: T) => number | null,
): RosterAnalysis {
  const counts: Record<Position, number> = { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DEF: 0 };
  for (const p of roster) counts[p.pos]++;
  const starters: Record<Position, number> = { QB: slots.QB, RB: slots.RB, WR: slots.WR, TE: slots.TE, K: slots.K, DEF: slots.DEF };
  const starterGaps = { ...starters };
  const leftover: Record<Position, number> = { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DEF: 0 };
  for (const pos of Object.keys(counts) as Position[]) {
    const used = Math.min(counts[pos], starters[pos]);
    starterGaps[pos] = starters[pos] - used;
    leftover[pos] = counts[pos] - used;
  }
  // Fill flex-type slots greedily with leftover players.
  const fill = (n: number, elig: readonly Position[]) => {
    let open = n;
    for (const pos of elig) {
      while (open > 0 && leftover[pos] > 0) { leftover[pos]--; open--; }
    }
    return open;
  };
  const flexOpen =
    fill(slots.FLEX, SLOT_ELIGIBILITY.FLEX) +
    fill(slots.REC_FLEX, SLOT_ELIGIBILITY.REC_FLEX) +
    fill(slots.WRRB_FLEX, SLOT_ELIGIBILITY.WRRB_FLEX);
  const superflexOpen = fill(slots.SUPER_FLEX, SLOT_ELIGIBILITY.SUPER_FLEX);
  const totalSlots = slots.QB + slots.RB + slots.WR + slots.TE + slots.K + slots.DEF + slots.FLEX + slots.REC_FLEX + slots.WRRB_FLEX + slots.SUPER_FLEX + slots.BN;
  const totalOpen = Math.max(0, totalSlots - roster.length);
  const benchUsed = (Object.values(leftover) as number[]).reduce((a, b) => a + b, 0);
  const benchOpen = Math.max(0, slots.BN - benchUsed);

  // Bye clashes among the top players (approximate "starters" = everything not K/DEF)
  const byBye = new Map<number, string[]>();
  for (const p of roster) {
    if (p.pos === "K" || p.pos === "DEF") continue;
    const b = byeOf(p);
    if (!b) continue;
    byBye.set(b, [...(byBye.get(b) ?? []), `${p.name} (${p.pos})`]);
  }
  const byeClashes = [...byBye.entries()].filter(([, ps]) => ps.length >= 3).map(([bye, players]) => ({ bye, players }));

  const gaps = (Object.entries(starterGaps) as [Position, number][]).filter(([, n]) => n > 0).map(([p, n]) => `${p}x${n}`);
  const starterGapsLine = gaps.length ? gaps.join(", ") : "none";
  const shape =
    `Roster: ${(Object.entries(counts) as [Position, number][]).map(([p, n]) => `${p}${n}`).join(" ")} | ` +
    `unfilled starters: ${starterGapsLine}` +
    (flexOpen ? `, FLEX x${flexOpen}` : "") +
    (superflexOpen ? `, SUPERFLEX x${superflexOpen}` : "");

  // Two renderings of the same numbers. "Picks remaining" is draft language and is
  // nonsense in a week-9 waiver prompt; "roster spots open" is the same count read the
  // way an in-season add/drop decision needs it.
  const summary = `${shape} | bench open: ${benchOpen} | picks remaining: ${totalOpen}`;
  const inSeasonSummary = `${shape} | bench open: ${benchOpen} | roster spots open: ${totalOpen}`;

  return { counts, starters, starterGaps, flexOpen, superflexOpen, benchOpen, totalOpen, byeClashes, starterGapsLine, summary, inSeasonSummary };
}
