import type { SleeperDraft, SleeperPick } from "./sleeper";

/** Which draft slot (1-based) picks at overall pick number `pickNo`. */
export function slotForPick(draft: SleeperDraft, pickNo: number): number {
  const teams = draft.settings.teams;
  const round = Math.ceil(pickNo / teams);
  const idx = (pickNo - 1) % teams; // 0-based position within round
  if (draft.type === "linear") return idx + 1;
  // snake; Sleeper "3rd round reversal" flips direction starting at reversal_round
  const rev = draft.settings.reversal_round ?? 0;
  let forward = round % 2 === 1;
  if (rev && round >= rev) forward = !forward;
  return forward ? idx + 1 : teams - idx;
}

/** All overall pick numbers owned by a slot, in order. Ignores traded picks (Sleeper API exposes them separately). */
export function picksForSlot(draft: SleeperDraft, slot: number): number[] {
  const total = draft.settings.teams * draft.settings.rounds;
  const out: number[] = [];
  for (let p = 1; p <= total; p++) if (slotForPick(draft, p) === slot) out.push(p);
  return out;
}

export interface TurnInfo {
  currentPick: number; // next pick to be made (picks.length + 1)
  totalPicks: number;
  round: number;
  slotOnClock: number;
  onTheClock: boolean;
  myNextPicks: number[]; // my upcoming overall pick numbers (first is next turn)
  picksUntilMyTurn: number; // 0 = on the clock
  picksBetweenNextTwo: number; // how many others pick between my next and the one after
  slotsBeforeMyTurn: number[]; // slots picking between now and my next pick
  isComplete: boolean;
}

export function turnInfo(draft: SleeperDraft, picks: SleeperPick[], mySlot: number | null): TurnInfo {
  const totalPicks = draft.settings.teams * draft.settings.rounds;
  const currentPick = picks.length + 1;
  const isComplete = draft.status === "complete" || currentPick > totalPicks;
  const slotOnClock = isComplete ? 0 : slotForPick(draft, currentPick);
  const mine = mySlot ? picksForSlot(draft, mySlot).filter((p) => p >= currentPick) : [];
  const next = mine[0] ?? Infinity;
  const after = mine[1] ?? Infinity;
  const slotsBefore: number[] = [];
  if (Number.isFinite(next)) for (let p = currentPick; p < next; p++) slotsBefore.push(slotForPick(draft, p));
  return {
    currentPick,
    totalPicks,
    round: Math.ceil(Math.min(currentPick, totalPicks) / draft.settings.teams),
    slotOnClock,
    onTheClock: !isComplete && mySlot !== null && slotOnClock === mySlot,
    myNextPicks: mine.slice(0, 4),
    picksUntilMyTurn: Number.isFinite(next) ? next - currentPick : Infinity,
    picksBetweenNextTwo: Number.isFinite(after) ? after - next - 1 : Infinity,
    slotsBeforeMyTurn: slotsBefore,
    isComplete,
  };
}

/** Seconds left on the pick clock, or null if unknown / not drafting. */
export function secondsLeft(draft: SleeperDraft, now = Date.now()): number | null {
  if (draft.status !== "drafting" || !draft.last_picked || !draft.settings.pick_timer) return null;
  const end = draft.last_picked + draft.settings.pick_timer * 1000;
  return Math.max(0, Math.round((end - now) / 1000));
}

/** Resolve which slot belongs to the user: via draft_order[user_id], or an explicit override (mock drafts). */
export function resolveMySlot(draft: SleeperDraft, userId: string | null, override: number | null): number | null {
  if (override) return override;
  if (userId && draft.draft_order && draft.draft_order[userId]) return draft.draft_order[userId];
  return null;
}
