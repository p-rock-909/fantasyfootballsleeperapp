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
  summary: string; // one-line human summary for prompts/UI
}

const FLEX_ELIGIBLE: Position[] = ["RB", "WR", "TE"];
const REC_FLEX_ELIGIBLE: Position[] = ["WR", "TE"];
const WRRB_FLEX_ELIGIBLE: Position[] = ["RB", "WR"];
const SF_ELIGIBLE: Position[] = ["QB", "RB", "WR", "TE"];

export function analyzeRoster(
  roster: Player[],
  slots: SlotCounts,
  byeOf: (p: Player) => number | null,
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
  const fill = (n: number, elig: Position[]) => {
    let open = n;
    for (const pos of elig) {
      while (open > 0 && leftover[pos] > 0) { leftover[pos]--; open--; }
    }
    return open;
  };
  const flexOpen = fill(slots.FLEX, FLEX_ELIGIBLE) + fill(slots.REC_FLEX, REC_FLEX_ELIGIBLE) + fill(slots.WRRB_FLEX, WRRB_FLEX_ELIGIBLE);
  const superflexOpen = fill(slots.SUPER_FLEX, SF_ELIGIBLE);
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
  const summary =
    `Roster: ${(Object.entries(counts) as [Position, number][]).map(([p, n]) => `${p}${n}`).join(" ")} | ` +
    `unfilled starters: ${gaps.length ? gaps.join(", ") : "none"}` +
    (flexOpen ? `, FLEX x${flexOpen}` : "") +
    (superflexOpen ? `, SUPERFLEX x${superflexOpen}` : "") +
    ` | bench open: ${benchOpen} | picks remaining: ${totalOpen}`;

  return { counts, starters, starterGaps, flexOpen, superflexOpen, benchOpen, totalOpen, byeClashes, summary };
}
