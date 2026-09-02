"use client";

// Small pieces every recommendation panel renders the same way.
//
// These are shared because the *data* is shared: `ScoreLine` and `IfThen` are single zod
// types in lib/schema.ts used by both the waiver and trade answers, so rendering them
// twice was a guarantee that one copy would drift.

import type { IfThen, ScoreLine, ValidationResult } from "@/lib/schema";

export const timeLabel = (at: number) =>
  new Date(at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/** Confidence, on the shared high/medium/low scale. */
export const CONFIDENCE_PILL: Record<"high" | "medium" | "low", string> = {
  high: "bg-emerald-900 text-emerald-200",
  medium: "bg-sky-900 text-sky-200",
  low: "bg-amber-900 text-amber-200",
};

/** A labelled line in a definition list, e.g. "Role — expected snaps are rising". */
export function Line({ term, text, className }: { term: string; text: string; className?: string }) {
  return (
    <div className="flex gap-2">
      <dt className="w-16 shrink-0 text-zinc-500">{term}</dt>
      <dd className={className ?? "text-zinc-400"}>{text}</dd>
    </div>
  );
}

/** The ruleset's per-category scoring, collapsed by default. */
export function ScoreBreakdown({ lines }: { lines: ScoreLine[] }) {
  if (!lines.length) return null;
  return (
    <details className="mt-2">
      <summary className="cursor-pointer text-xs text-zinc-500 hover:text-zinc-300">Score breakdown</summary>
      <ul className="mt-1 space-y-0.5 text-xs text-zinc-400">
        {lines.map((s, i) => (
          <li key={i}>
            <span className="tabular-nums text-zinc-300">{s.points > 0 ? "+" : ""}{s.points}</span> {s.category} — {s.why}
          </li>
        ))}
      </ul>
    </details>
  );
}

/** The if/then pivots both rulesets ask for. */
export function Contingencies({ items, title = "If / then" }: { items: IfThen[]; title?: string }) {
  if (!items.length) return null;
  return (
    <div>
      <h3 className="mb-1 text-xs uppercase tracking-wide text-zinc-500">{title}</h3>
      <ul className="space-y-1 text-sm">
        {items.map((c, i) => (
          <li key={i} className="rounded-md border border-zinc-800 px-2 py-1">
            <b className="text-amber-200">If</b> <span className="text-zinc-300">{c.condition}</span>{" "}
            <b className="text-emerald-300">then</b> <span className="text-zinc-300">{c.then}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** What the app itself corrected in the model's answer, kept apart from the model's own output. */
export function ValidationNotice({ validation }: { validation: ValidationResult | null }) {
  if (!validation || validation.ok) return null;
  return (
    <div className="rounded-md border border-amber-800 bg-amber-950/40 px-3 py-2 text-sm text-amber-100">
      <b>Adjusted answer.</b> Problems this app caught and corrected:
      <ul className="mt-1 list-disc space-y-0.5 pl-5 text-amber-200">
        {validation.issues.map((i, n) => <li key={n}>{i}</li>)}
      </ul>
    </div>
  );
}

/** Assumptions the model was working from, plus whatever it could not establish. */
export function Unknowns({ unknowns }: { unknowns: string[] }) {
  if (!unknowns.length) return null;
  return <ul className="mt-1 list-disc space-y-0.5 pl-4 text-amber-200/80">{unknowns.map((u, i) => <li key={i}>{u}</li>)}</ul>;
}
