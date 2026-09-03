"use client";

import { useState } from "react";
import type { LiveContextResult } from "@/lib/liveContext";
import type { BaseMeta } from "@/lib/schema";

/**
 * Where the news came from, or a plain statement that there wasn't any.
 *
 * Shared by all three model-backed features. The un-grounded copy is overridable because
 * the honest severity differs: a start/sit call without news still knows both rosters,
 * while a waiver call has lost the snap, route and target-share evidence its ruleset
 * actually ranks on, and saying so in the same mild footnote would understate it.
 */
export default function Grounding({
  live,
  meta,
  ungroundedNote,
}: {
  live: LiveContextResult | null;
  meta: BaseMeta | null;
  ungroundedNote?: string;
}) {
  const [open, setOpen] = useState(false);
  const poolAge = meta?.poolAgeMinutes ?? null;

  if (!live) {
    return (
      <div className="rounded-md border border-zinc-700 bg-zinc-900/60 px-3 py-2 text-sm text-zinc-300">
        <b className="text-zinc-100">Not grounded in current news.</b>{" "}
        {meta?.newsUnavailable ? <span className="text-zinc-400">{meta.newsUnavailable}</span> : "The live lookup did not run."}{" "}
        {ungroundedNote ?? (
          <>
            This recommendation comes from roster data plus the model&apos;s own knowledge, and Sleeper&apos;s injury
            designations{poolAge != null ? ` are up to ${poolAge} minutes old` : ""}. Check every questionable player yourself before kickoff.
          </>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-md border border-emerald-900 bg-emerald-950/30 px-3 py-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <b className="text-emerald-200">News as of {new Date(live.retrievedAt).toLocaleString()}</b>
        <span className="text-xs text-zinc-400">{live.sources.length} source{live.sources.length === 1 ? "" : "s"}</span>
        {live.sources.length > 0 && (
          <button className="text-xs text-zinc-400 underline hover:text-zinc-200" onClick={() => setOpen((v) => !v)}>
            {open ? "hide" : "show"}
          </button>
        )}
      </div>
      {live.unresolved.length > 0 && (
        <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-amber-200">
          {live.unresolved.map((u, i) => <li key={i}>{u}</li>)}
        </ul>
      )}
      {open && (
        <ul className="mt-2 space-y-0.5 text-xs">
          {live.sources.map((s) => (
            <li key={s.uri} className="truncate">
              <a className="text-sky-300 hover:underline" href={s.uri} target="_blank" rel="noreferrer noopener">{s.title || s.uri}</a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
