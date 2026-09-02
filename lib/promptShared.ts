// The league's own rules, rendered once for every prompt that needs them.
//
// Three rulesets now key their advice off scoring and lineup requirements — PPR changes
// what a receiving back is worth, superflex changes what a QB is worth, TE premium
// changes both — so the block describing them belongs in one place rather than being
// retyped per feature and drifting.

import type { ScoringFormat } from "./sleeper";

/** The starting lineup as a single readable line, e.g. "QB 1, RB 2, WR 2, ... BENCH 6". */
function startingLineupLine(fmt: ScoringFormat): string {
  const s = fmt.slots;
  return [
    `QB ${s.QB}`, `RB ${s.RB}`, `WR ${s.WR}`, `TE ${s.TE}`,
    s.FLEX ? `FLEX ${s.FLEX}` : "", s.REC_FLEX ? `REC_FLEX ${s.REC_FLEX}` : "",
    s.WRRB_FLEX ? `WRRB_FLEX ${s.WRRB_FLEX}` : "", s.SUPER_FLEX ? `SUPERFLEX ${s.SUPER_FLEX}` : "",
    `K ${s.K}`, `DEF ${s.DEF}`, `BENCH ${s.BN}`,
  ].filter(Boolean).join(", ");
}

/**
 * The LEAGUE FORMAT block. Byte-identical to what the start/sit prompt built inline
 * before this was extracted — that prompt is in production and its wording is not the
 * thing being changed here.
 */
export function leagueFormatBlock(fmt: ScoringFormat, playoffWeekStart: number | null = null): string {
  return `LEAGUE FORMAT
- Teams: ${fmt.teams}
- Scoring: ${fmt.scoring} (${fmt.ppr} pts/reception${fmt.tePremium ? `, TE premium +${fmt.tePremium}/rec` : ""}), passing TD = ${fmt.passTdPts} pts
- Superflex: ${fmt.superflex ? "YES (QBs are premium)" : "no"}
- Starting lineup: ${startingLineupLine(fmt)}
${playoffWeekStart ? `- Playoffs start week ${playoffWeekStart}` : "- Playoff schedule unknown"}`;
}
