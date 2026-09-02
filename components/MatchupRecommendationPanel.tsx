"use client";

import { useState } from "react";
import type { LiveContextResult } from "@/lib/liveContext";
import type { MatchupMeta, MatchupRecommendation, ValidationResult } from "@/lib/schema";
import type { MatchupLogEntry, Settings } from "@/lib/storage";
import Grounding from "./Grounding";
import RawJson from "./RawJson";

export interface MatchupRecState {
  loading: boolean;
  stage: "news" | "lineup" | null;
  data: MatchupRecommendation | null;
  liveContext: LiveContextResult | null;
  validation: ValidationResult | null;
  error: string | null;
  meta: MatchupMeta | null;
  id: string | null;
}

const POSTURE_COPY: Record<MatchupRecommendation["strategy"]["posture"], string> = {
  floor: "Play it safe — protect a lead with stable volume.",
  ceiling: "Chase upside — you need differentiated outcomes.",
  balanced: "Balanced — the matchup is close or uncertain.",
};

const time = (at: number) => new Date(at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export default function MatchupRecommendationPanel({
  rec,
  history,
  onEvaluate,
  onClearHistory,
  canRun,
  effort,
  setEffort,
}: {
  rec: MatchupRecState;
  history: MatchupLogEntry[];
  onEvaluate: (question: string, refreshNews: boolean) => Promise<void> | void;
  onClearHistory: () => void;
  canRun: boolean;
  effort: Settings["effort"];
  setEffort: (e: Settings["effort"]) => void;
}) {
  const [showHistory, setShowHistory] = useState(false);
  // Plain form fields for one submit action — nothing outside this panel reads them.
  const [question, setQuestion] = useState("");
  const [refreshNews, setRefreshNews] = useState(false);
  const submit = async () => {
    await onEvaluate(question, refreshNews);
    setRefreshNews(false);
  };
  const prior = history.filter((e) => e.id !== rec.id);
  const d = rec.data;

  return (
    <section className="card">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h2 className="font-semibold">Start/sit recommendation</h2>
        <span className="text-xs text-zinc-500">rules: content/start-sit-rules.md</span>
        <div className="ml-auto flex items-center gap-2">
          <label className="flex items-center gap-1 text-xs text-zinc-400" title="Ignore cached news and search again">
            <input type="checkbox" checked={refreshNews} onChange={(e) => setRefreshNews(e.target.checked)} />
            Refresh news
          </label>
          <select className="input !w-auto !py-1 text-xs" value={effort} onChange={(e) => setEffort(e.target.value as Settings["effort"])} title="Thinking effort: lower = faster">
            <option value="low">fast</option>
            <option value="medium">balanced</option>
            <option value="high">deep</option>
          </select>
          <button className="btn btn-primary" disabled={rec.loading || !canRun} onClick={submit}>
            {rec.loading ? "Working…" : "Evaluate matchup"}
          </button>
        </div>
      </div>

      <input
        className="input mb-3"
        placeholder="Optional note (e.g. 'I'm down 20, I need a ceiling week', or paste breaking news)…"
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && !rec.loading && canRun && submit()}
      />

      {rec.loading && (
        <div className="animate-pulse text-sm text-zinc-400">
          {rec.stage === "news" ? "Searching for injury, weather and betting news…" : "Weighing both lineups against the rules…"}
        </div>
      )}
      {rec.error && <div className="rounded-md border border-red-900 bg-red-950/50 px-3 py-2 text-sm text-red-200">{rec.error}</div>}
      {!rec.loading && !d && !rec.error && (
        <p className="text-sm text-zinc-500">Pick a week, a matchup and which side is yours, then press <b>Evaluate matchup</b>.</p>
      )}

      {d && (
        <div className="space-y-4">
          {rec.validation && !rec.validation.ok && (
            <div className="rounded-md border border-amber-800 bg-amber-950/40 px-3 py-2 text-sm text-amber-100">
              <b>Incomplete lineup.</b> The answer had problems this app caught and corrected:
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-amber-200">{rec.validation.issues.map((i, n) => <li key={n}>{i}</li>)}</ul>
            </div>
          )}

          <Grounding live={rec.liveContext} meta={rec.meta} />

          <div>
            <h3 className="mb-1 text-xs uppercase tracking-wide text-zinc-500">Recommended lineup</h3>
            <ol className="space-y-1">
              {d.recommendedLineup.map((p) => (
                <li key={`${p.slot}-${p.player_id}`} className="rounded-md border border-zinc-800 p-2">
                  <div className="flex items-center gap-2">
                    <span className="w-20 shrink-0 text-[10px] uppercase tracking-wide text-zinc-500">{p.slot}</span>
                    <span className={`pill pos-${p.position}`}>{p.position}</span>
                    <span className="font-semibold">{p.name}</span>
                    <span className="ml-auto text-xs text-zinc-400">{Math.round(p.confidence)}%</span>
                  </div>
                  <p className="mt-1 pl-20 text-sm text-zinc-300">{p.reasoning}</p>
                </li>
              ))}
            </ol>
          </div>

          <p className="text-sm">
            <b className="text-zinc-100">Posture: </b>
            <span className="pill bg-sky-900 text-sky-200">{d.strategy.posture}</span>{" "}
            <span className="text-zinc-400">{POSTURE_COPY[d.strategy.posture]}</span>{" "}
            <span className="text-zinc-300">{d.strategy.reasoning}</span>
          </p>

          {d.startSitCalls.length > 0 && (
            <div>
              <h3 className="mb-1 text-xs uppercase tracking-wide text-zinc-500">Close calls</h3>
              <ul className="space-y-2">
                {d.startSitCalls.map((c, i) => (
                  <li key={i} className="rounded-md border border-zinc-800 p-2 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-emerald-300">{c.recommended}</span>
                      <span className="text-zinc-500">over</span>
                      <span className="text-zinc-300">{c.alternative}</span>
                      <span className={`pill ml-auto ${c.confidence === "high" ? "bg-emerald-900 text-emerald-200" : c.confidence === "medium" ? "bg-sky-900 text-sky-200" : "bg-amber-900 text-amber-200"}`}>
                        {c.confidence}
                      </span>
                    </div>
                    <p className="mt-1 text-zinc-300">{c.reasons}</p>
                    <p className="mt-1 text-xs text-amber-200"><b>Changes if:</b> {c.changesIf}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {d.benchOrder.length > 0 && (
            <div>
              <h3 className="mb-1 text-xs uppercase tracking-wide text-zinc-500">Bench order — who comes in on late news</h3>
              <ol className="list-decimal space-y-0.5 pl-5 text-sm text-zinc-300">
                {d.benchOrder.map((b) => <li key={b.player_id}><b className="text-zinc-100">{b.name}</b> — {b.reasoning}</li>)}
              </ol>
            </div>
          )}

          {d.alerts.length > 0 && (
            <div>
              <h3 className="mb-1 text-xs uppercase tracking-wide text-zinc-500">Alerts</h3>
              <ul className="list-disc space-y-1 pl-5 text-sm text-amber-200">{d.alerts.map((a, i) => <li key={i}>{a}</li>)}</ul>
            </div>
          )}

          <RawJson value={{ recommendation: d, liveContext: rec.liveContext, validation: rec.validation, meta: rec.meta }} />
        </div>
      )}

      {history.length > 0 && (
        <div className="mt-4 border-t border-zinc-800 pt-2">
          <div className="flex items-center gap-2">
            <button className="text-xs text-zinc-400 hover:text-zinc-200" onClick={() => setShowHistory((v) => !v)}>
              {showHistory ? "▾" : "▸"} Past evaluations ({prior.length})
            </button>
            {showHistory && <button className="ml-auto text-xs text-zinc-500 hover:text-red-300" onClick={onClearHistory}>Clear</button>}
          </div>
          {showHistory && (
            prior.length === 0
              ? <p className="mt-2 text-xs text-zinc-600">No earlier evaluations for this week.</p>
              : <ul className="mt-2 space-y-1">{prior.map((e) => <HistoryEntry key={e.id} entry={e} />)}</ul>
          )}
        </div>
      )}
    </section>
  );
}

function HistoryEntry({ entry }: { entry: MatchupLogEntry }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="rounded-md border border-zinc-800">
      <button className="flex w-full flex-wrap items-center gap-2 px-2 py-1.5 text-left text-xs hover:bg-zinc-900" onClick={() => setOpen((v) => !v)}>
        <span className="text-zinc-500">{open ? "▾" : "▸"}</span>
        <span className="font-semibold text-zinc-300">{entry.myTeam}</span>
        <span className="text-zinc-600">vs {entry.opponentTeam ?? "bye"}</span>
        {entry.error
          ? <span className="truncate text-red-300">failed — {entry.error}</span>
          : <span className="text-zinc-400">{entry.data?.strategy.posture ?? "—"}{entry.liveContext ? " · grounded" : " · un-grounded"}</span>}
        <span className="ml-auto shrink-0 text-zinc-600">{time(entry.at)}</span>
      </button>
      {open && (
        <div className="space-y-2 border-t border-zinc-800 p-3 text-sm">
          {entry.question && <p className="text-xs text-zinc-400">Note: {entry.question}</p>}
          {entry.error && <div className="rounded-md border border-red-900 bg-red-950/50 px-3 py-2 text-red-200">{entry.error}</div>}
          {entry.data && (
            <ol className="space-y-0.5">
              {entry.data.recommendedLineup.map((p) => (
                <li key={`${p.slot}-${p.player_id}`}><span className="text-zinc-500">{p.slot}</span> <b>{p.name}</b></li>
              ))}
            </ol>
          )}
          <RawJson value={{ recommendation: entry.data, liveContext: entry.liveContext, validation: entry.validation, error: entry.error, meta: entry.meta }} />
        </div>
      )}
    </li>
  );
}
