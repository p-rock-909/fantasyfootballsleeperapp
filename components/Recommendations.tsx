"use client";

import { useState } from "react";
import type { RankedPlayer } from "@/lib/rankings";
import type { RecommendationResponse } from "@/lib/schema";
import type { SleeperPick } from "@/lib/sleeper";
import type { RecState } from "./DraftBoard";
import type { RecLogEntry, Settings } from "@/lib/storage";

interface Props {
  rec: RecState;
  history: RecLogEntry[];
  pickAt: Map<number, SleeperPick>;
  draftId: string;
  onClearHistory: () => void;
  stale: boolean;
  onRecommend: () => void;
  question: string;
  setQuestion: (q: string) => void;
  byId: Map<string, RankedPlayer>;
  canRun: boolean;
  effort: Settings["effort"];
  setEffort: (e: Settings["effort"]) => void;
}

const EFFORT_LABEL: Record<Settings["effort"], string> = { low: "fast", medium: "balanced", high: "deep" };
const time = (at: number) => new Date(at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

export default function Recommendations({ rec, history, pickAt, draftId, onClearHistory, stale, onRecommend, question, setQuestion, byId, canRun, effort, setEffort }: Props) {
  const d = rec.data;
  const [showHistory, setShowHistory] = useState(false);
  // The newest entry is what the live card is already showing; everything else is history.
  const prior = history.filter((e) => e.id !== rec.id);

  const downloadLog = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(history, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `recommendations-${draftId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="card flex max-h-[calc(100vh-7rem)] flex-col">
      <div className="mb-2 flex items-center gap-2">
        <h2 className="font-semibold">Recommendation</h2>
        {rec.forPick && d && <span className="text-xs text-zinc-500">for pick #{rec.forPick}</span>}
        {stale && <span className="pill bg-amber-900 text-amber-200">board changed — refresh</span>}
        <div className="ml-auto flex items-center gap-2">
          <select className="input !w-auto !py-1 text-xs" value={effort} onChange={(e) => setEffort(e.target.value as Settings["effort"])} title="Thinking effort: lower = faster">
            <option value="low">fast</option>
            <option value="medium">balanced</option>
            <option value="high">deep</option>
          </select>
          <button className="btn btn-primary" disabled={rec.loading || !canRun} onClick={onRecommend}>{rec.loading ? "Thinking…" : "Recommend"}</button>
        </div>
      </div>
      <input className="input mb-3" placeholder="Optional note for this pick (e.g. 'I want a WR', 'compare X vs Y')…" value={question} onChange={(e) => setQuestion(e.target.value)} onKeyDown={(e) => e.key === "Enter" && !rec.loading && onRecommend()} />

      <div className="min-h-0 flex-1 space-y-3 overflow-auto">
        {rec.error && <div className="rounded-md border border-red-900 bg-red-950/50 px-3 py-2 text-sm text-red-200">{rec.error}</div>}
        {rec.loading && <div className="animate-pulse text-sm text-zinc-400">Reading your preferences, the board, and the picks between you and your next turn…</div>}
        {!rec.loading && !d && !rec.error && <div className="text-sm text-zinc-500">Press <b>Recommend</b> (or wait — it auto-runs when your pick is close).</div>}

        {d && (
          <>
            <RecBody d={d} byId={byId} />
            {rec.meta && <div className="text-[10px] text-zinc-600">{rec.meta.model}</div>}
            <Raw value={{ recommendation: d, meta: rec.meta ?? null }} />
          </>
        )}

        {history.length > 0 && (
          <div className="border-t border-zinc-800 pt-2">
            <div className="flex items-center gap-2">
              <button className="text-xs text-zinc-400 hover:text-zinc-200" onClick={() => setShowHistory((v) => !v)}>
                {showHistory ? "▾" : "▸"} History ({prior.length})
              </button>
              {showHistory && (
                <div className="ml-auto flex gap-3">
                  <button className="text-xs text-zinc-500 hover:text-zinc-300" onClick={downloadLog}>Download log</button>
                  <button className="text-xs text-zinc-500 hover:text-red-300" onClick={onClearHistory}>Clear</button>
                </div>
              )}
            </div>
            {showHistory && (
              prior.length === 0
                ? <p className="mt-2 text-xs text-zinc-600">No earlier recommendations for this draft yet.</p>
                : <ul className="mt-2 space-y-1">{prior.map((e) => <HistoryEntry key={e.id} entry={e} byId={byId} actual={pickAt.get(e.forPick)} />)}</ul>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

/** The recommendation itself — same markup for the live card and for a historic entry. */
function RecBody({ d, byId }: { d: RecommendationResponse; byId: Map<string, RankedPlayer> }) {
  return (
    <div className="space-y-3">
      <ol className="space-y-2">
        {d.picks.map((p, i) => {
          const rp = byId.get(p.player_id);
          return (
            <li key={p.player_id} className={`rounded-md border p-3 ${i === 0 ? "border-emerald-600 bg-emerald-950/30" : "border-zinc-800"}`}>
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold">{i + 1}.</span>
                <span className="text-base font-semibold">{p.name}</span>
                <span className={`pill pos-${p.position}`}>{p.position}{rp?.posRank ?? ""}</span>
                {rp && <span className="text-xs text-zinc-500">{rp.team}{rp.adp ? ` · ADP ${rp.adp}` : ""}{rp.tier ? ` · T${rp.tier}` : ""}{rp.bye ? ` · bye ${rp.bye}` : ""}</span>}
                <span className="ml-auto text-xs text-zinc-400">{Math.round(p.confidence)}%</span>
              </div>
              <p className="mt-1 text-sm text-zinc-300">{p.reasoning}</p>
            </li>
          );
        })}
      </ol>
      {d.rosterNotes && <p className="text-sm text-zinc-300"><b className="text-zinc-100">Roster plan: </b>{d.rosterNotes}</p>}
      {d.likelyGoneBeforeNextPick.length > 0 && (
        <p className="text-sm"><b className="text-red-300">Won&apos;t survive to your next pick: </b><span className="text-zinc-300">{d.likelyGoneBeforeNextPick.join(", ")}</span></p>
      )}
      {d.targetsNextRound.length > 0 && (
        <p className="text-sm"><b className="text-sky-300">Targets for your following pick: </b><span className="text-zinc-300">{d.targetsNextRound.join(", ")}</span></p>
      )}
      {d.warnings.length > 0 && (
        <ul className="list-disc space-y-1 pl-5 text-sm text-amber-200">{d.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
      )}
    </div>
  );
}

/** One past run: collapsed to a single line, expandable to the full answer. */
function HistoryEntry({ entry, byId, actual }: { entry: RecLogEntry; byId: Map<string, RankedPlayer>; actual?: SleeperPick }) {
  const [open, setOpen] = useState(false);
  const top = entry.data?.picks[0];
  const actualName = actual ? `${actual.metadata.first_name ?? ""} ${actual.metadata.last_name ?? ""}`.trim() : null;
  const matched = !!top && !!actual && top.player_id === actual.player_id;

  return (
    <li className="rounded-md border border-zinc-800">
      <button className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs hover:bg-zinc-900" onClick={() => setOpen((v) => !v)}>
        <span className="text-zinc-500">{open ? "▾" : "▸"}</span>
        <span className="font-semibold text-zinc-300">#{entry.forPick}</span>
        <span className="text-zinc-600">Rd {entry.round}</span>
        {entry.error
          ? <span className="truncate text-red-300">failed — {entry.error}</span>
          : <span className="truncate text-zinc-300">{top ? `${top.name} (${top.position})` : "no pick returned"}</span>}
        {actualName && <span className={`ml-auto shrink-0 ${matched ? "text-emerald-400" : "text-zinc-500"}`}>took {actualName}</span>}
        <span className={`shrink-0 text-zinc-600 ${actualName ? "" : "ml-auto"}`}>{EFFORT_LABEL[entry.effort]} · {time(entry.at)}</span>
      </button>
      {open && (
        <div className="space-y-3 border-t border-zinc-800 p-3">
          {entry.question && <p className="text-xs text-zinc-400">Note: {entry.question}</p>}
          {actualName && (
            <p className="text-xs text-zinc-400">
              Actually drafted at #{entry.forPick}: <b className="text-zinc-200">{actualName}</b>
              {actual?.metadata.position ? ` (${actual.metadata.position})` : ""}
              {matched ? " — matched the top pick" : ""}
            </p>
          )}
          {entry.error && <div className="rounded-md border border-red-900 bg-red-950/50 px-3 py-2 text-sm text-red-200">{entry.error}</div>}
          {entry.data && <RecBody d={entry.data} byId={byId} />}
          {entry.meta?.model && <div className="text-[10px] text-zinc-600">{entry.meta.model}</div>}
          <Raw value={{ recommendation: entry.data, error: entry.error, meta: entry.meta }} />
        </div>
      )}
    </li>
  );
}

/** Raw JSON of a response, for debugging what the model actually returned. */
function Raw({ value }: { value: unknown }) {
  const [open, setOpen] = useState(false);
  const json = JSON.stringify(value, null, 2);
  return (
    <div>
      <div className="flex items-center gap-3">
        <button className="text-[10px] text-zinc-600 hover:text-zinc-400" onClick={() => setOpen((v) => !v)}>{open ? "▾" : "▸"} Raw</button>
        {open && <button className="text-[10px] text-zinc-600 hover:text-zinc-400" onClick={() => navigator.clipboard?.writeText(json)}>Copy</button>}
      </div>
      {open && <pre className="mt-1 max-h-64 overflow-auto rounded bg-zinc-900 p-2 text-[10px] leading-tight text-zinc-400">{json}</pre>}
    </div>
  );
}
