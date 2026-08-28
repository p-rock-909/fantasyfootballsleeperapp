"use client";

import type { RankedPlayer } from "@/lib/rankings";
import type { RecState } from "./DraftBoard";
import type { Settings } from "@/lib/storage";

interface Props {
  rec: RecState;
  stale: boolean;
  onRecommend: () => void;
  question: string;
  setQuestion: (q: string) => void;
  byId: Map<string, RankedPlayer>;
  canRun: boolean;
  effort: Settings["effort"];
  setEffort: (e: Settings["effort"]) => void;
}

export default function Recommendations({ rec, stale, onRecommend, question, setQuestion, byId, canRun, effort, setEffort }: Props) {
  const d = rec.data;
  return (
    <section className="card flex max-h-[calc(100vh-7rem)] flex-col">
      <div className="mb-2 flex items-center gap-2">
        <h2 className="font-semibold">Claude&apos;s recommendation</h2>
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
            {rec.meta && <div className="text-[10px] text-zinc-600">{rec.meta.model}</div>}
          </>
        )}
      </div>
    </section>
  );
}
