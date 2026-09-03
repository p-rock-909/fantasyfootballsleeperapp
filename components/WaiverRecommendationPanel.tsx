"use client";

import { useState } from "react";
import type { LiveContextResult } from "@/lib/liveContext";
import type { ValidationResult, WaiverMeta, WaiverRecommendation } from "@/lib/schema";
import type { Settings, WaiverLogEntry } from "@/lib/storage";
import { Contingencies, Line, ScoreBreakdown, timeLabel, Unknowns, ValidationNotice } from "./AnswerParts";
import Grounding from "./Grounding";
import RawJson from "./RawJson";

/** One row of the candidate set the server actually sent, echoed back for display. */
export interface ShortlistRow {
  player_id: string;
  name: string;
  position: string;
  team: string;
  reason: "trending" | "ranked" | "pool";
  adds: number | null;
  researched: boolean;
}

export interface WaiverRecState {
  loading: boolean;
  stage: "news" | "ranking" | null;
  data: WaiverRecommendation | null;
  liveContext: LiveContextResult | null;
  shortlist: ShortlistRow[] | null;
  validation: ValidationResult | null;
  error: string | null;
  meta: WaiverMeta | null;
  id: string | null;
}

const ADD_TYPE_STYLE: Record<WaiverRecommendation["candidates"][number]["addType"], string> = {
  starter: "bg-emerald-900 text-emerald-200",
  "multi-week replacement": "bg-sky-900 text-sky-200",
  "one-week stream": "bg-zinc-700 text-zinc-200",
  stash: "bg-purple-900 text-purple-200",
  avoid: "bg-red-900 text-red-200",
};

const CONFIDENCE_STYLE: Record<WaiverRecommendation["candidates"][number]["confidence"], string> = {
  confirmed: "bg-emerald-900 text-emerald-200",
  probable: "bg-sky-900 text-sky-200",
  uncertain: "bg-amber-900 text-amber-200",
  speculative: "bg-red-900 text-red-200",
};

const UNGROUNDED_NOTE =
  "This matters more here than anywhere else in the app. The waiver ruleset ranks players on snap share, route participation, target share and depth-chart moves, and Sleeper exposes none of that — so without the news lookup the model is working from stored injury designations, depth-chart order and league-wide add counts alone. Treat every role claim below as unverified.";

export default function WaiverRecommendationPanel({
  rec,
  history,
  onRun,
  onClearHistory,
  canRun,
  teamName,
  faabLeague,
  effort,
  setEffort,
}: {
  rec: WaiverRecState;
  history: WaiverLogEntry[];
  onRun: (question: string, refreshNews: boolean) => Promise<void> | void;
  onClearHistory: () => void;
  canRun: boolean;
  teamName: string;
  faabLeague: boolean;
  effort: Settings["effort"];
  setEffort: (e: Settings["effort"]) => void;
}) {
  const [showHistory, setShowHistory] = useState(false);
  const [showPool, setShowPool] = useState(false);
  const [question, setQuestion] = useState("");
  const [refreshNews, setRefreshNews] = useState(false);
  const submit = async () => {
    await onRun(question, refreshNews);
    setRefreshNews(false);
  };
  const prior = history.filter((e) => e.id !== rec.id);
  const d = rec.data;

  return (
    <section className="card">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h2 className="font-semibold">Waiver pickups</h2>
        <span className="text-xs text-zinc-500">rules: content/waiver-rules.md</span>
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
            {rec.loading ? "Working…" : "Find pickups"}
          </button>
        </div>
      </div>

      <input
        className="input mb-3"
        placeholder="Optional note (e.g. 'I need a RB for the playoff run, my WRs are fine')…"
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && !rec.loading && canRun && submit()}
      />

      {rec.loading && (
        <div className="animate-pulse text-sm text-zinc-400">
          {rec.stage === "news" ? "Searching for snap shares, depth-chart moves and injury news…" : "Ranking the waiver wire against the rules…"}
        </div>
      )}
      {rec.error && <div className="rounded-md border border-red-900 bg-red-950/50 px-3 py-2 text-sm text-red-200">{rec.error}</div>}
      {!rec.loading && !d && !rec.error && (
        <p className="text-sm text-zinc-500">
          Pick a week and a team, then press <b>Find pickups</b> to rank the unrostered players {teamName ? `available to ${teamName}` : "in this league"}.
        </p>
      )}

      {d && (
        <div className="space-y-4">
          <ValidationNotice validation={rec.validation} />

          <Grounding live={rec.liveContext} meta={rec.meta} ungroundedNote={UNGROUNDED_NOTE} />

          <Assumptions a={d.assumptions} meta={rec.meta} />

          <div>
            <h3 className="mb-1 text-xs uppercase tracking-wide text-zinc-500">Ranked claims</h3>
            <ol className="space-y-2">
              {d.candidates.map((c) => <Candidate key={c.player_id} c={c} faabLeague={faabLeague} />)}
            </ol>
          </div>

          <Contingencies items={d.contingencies} />

          {d.watchList.length > 0 && (
            <div>
              <h3 className="mb-1 text-xs uppercase tracking-wide text-zinc-500">Watch list</h3>
              <ul className="list-disc space-y-0.5 pl-5 text-sm text-zinc-300">{d.watchList.map((w, i) => <li key={i}>{w}</li>)}</ul>
            </div>
          )}

          {rec.shortlist && (
            <div>
              <button className="text-xs text-zinc-400 hover:text-zinc-200" onClick={() => setShowPool((v) => !v)}>
                {showPool ? "▾" : "▸"} What was considered ({rec.shortlist.length} of {rec.meta?.considered ?? "?"} unrostered players)
              </button>
              {showPool && (
                <>
                  <p className="mt-1 text-xs text-zinc-500">
                    Only these were offered to the model, so nothing outside this list could be recommended. Two boundaries worth knowing: the pool
                    holds players currently on an NFL team, so someone released in the last few days may be missing entirely; and unrostered is not the
                    same as claimable — a player dropped in this league in the last day or two is probably still on waivers.
                  </p>
                  <ul className="mt-1 grid gap-x-4 text-xs sm:grid-cols-2">
                    {rec.shortlist.map((s) => (
                      <li key={s.player_id} className="flex items-center gap-1.5 py-0.5">
                        <span className={`pill pos-${s.position}`}>{s.position}</span>
                        <span className="truncate text-zinc-300">{s.name}</span>
                        {s.adds != null && <span className="shrink-0 text-zinc-500">+{s.adds}</span>}
                        {!s.researched && <span className="shrink-0 text-zinc-600" title="Outside the news lookup's cap">unresearched</span>}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}

          <RawJson value={{ recommendation: d, liveContext: rec.liveContext, shortlist: rec.shortlist, validation: rec.validation, meta: rec.meta }} />
        </div>
      )}

      {history.length > 0 && (
        <div className="mt-4 border-t border-zinc-800 pt-2">
          <div className="flex items-center gap-2">
            <button className="text-xs text-zinc-400 hover:text-zinc-200" onClick={() => setShowHistory((v) => !v)}>
              {showHistory ? "▾" : "▸"} Past runs ({prior.length})
            </button>
            {showHistory && <button className="ml-auto text-xs text-zinc-500 hover:text-red-300" onClick={onClearHistory}>Clear</button>}
          </div>
          {showHistory && (
            prior.length === 0
              ? <p className="mt-2 text-xs text-zinc-600">No earlier runs for this team and week.</p>
              : <ul className="mt-2 space-y-1">{prior.map((e) => <HistoryEntry key={e.id} entry={e} />)}</ul>
          )}
        </div>
      )}
    </section>
  );
}

/** One ranked claim: the ruleset's whole per-player output for a single player. */
function Candidate({ c, faabLeague }: { c: WaiverRecommendation["candidates"][number]; faabLeague: boolean }) {
  return (
    <li className="rounded-md border border-zinc-800 p-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-5 shrink-0 text-sm font-bold tabular-nums text-zinc-500">{c.rank}</span>
        <span className={`pill pos-${c.position}`}>{c.position}</span>
        <span className="font-semibold">{c.name}</span>
        <span className="text-xs text-zinc-500">{c.team}</span>
        <span className={`pill ${ADD_TYPE_STYLE[c.addType]}`}>{c.addType}</span>
        <span className={`pill ${CONFIDENCE_STYLE[c.confidence]}`}>{c.confidence}</span>
        <span className="ml-auto text-sm font-semibold tabular-nums" title="The ruleset's 100-point score">{Math.round(c.score)}</span>
      </div>

      <p className="mt-1 text-sm text-zinc-300">{c.whyNow}</p>

      <dl className="mt-2 space-y-1 text-xs">
        <Line term="Role" text={c.role} />
        <Line term="News" text={c.news} />
        <Line term="Matchup" text={c.matchup} />
        <Line term="Outlook" text={c.outlook} />
        <Line term="Format" text={c.formatFit} />
        <Line term="Risk" text={c.mainRisk} className="text-amber-200" />
      </dl>

      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
        <span className="pill bg-zinc-800 text-zinc-200">{c.decision}</span>
        {faabLeague && c.faabPctLow != null && c.faabPctHigh != null ? (
          <span className="text-zinc-400">Bid <b className="text-zinc-100">{c.faabPctLow}–{c.faabPctHigh}%</b> of budget</span>
        ) : (
          <span className="text-zinc-400">{c.priorityAdvice}</span>
        )}
        {c.dropName && <span className="text-zinc-400">Drop <b className="text-zinc-100">{c.dropName}</b>{c.dropWhy ? ` — ${c.dropWhy}` : ""}</span>}
      </div>

      <ScoreBreakdown lines={c.scoreBreakdown} />
    </li>
  );
}

function Assumptions({ a, meta }: { a: WaiverRecommendation["assumptions"]; meta: WaiverMeta | null }) {
  return (
    <div className="rounded-md border border-zinc-800 px-3 py-2 text-xs text-zinc-400">
      <div><b className="text-zinc-300">Format:</b> {a.format}</div>
      <div><b className="text-zinc-300">Solving for:</b> {a.needAddressed}</div>
      <div><b className="text-zinc-300">As of:</b> {a.newsCutoff}</div>
      {meta && (
        <div className="mt-1 text-zinc-500">
          {meta.faabLeague ? `${meta.faabRemaining ?? "?"} FAAB left` : `waiver priority ${meta.waiverPosition ?? "?"}`} ·{" "}
          {meta.openSpots} roster spot{meta.openSpots === 1 ? "" : "s"} open · {meta.researched} of {meta.shortlisted} candidates researched
        </div>
      )}
      <Unknowns unknowns={a.unknowns} />
    </div>
  );
}

function HistoryEntry({ entry }: { entry: WaiverLogEntry }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="rounded-md border border-zinc-800">
      <button className="flex w-full flex-wrap items-center gap-2 px-2 py-1.5 text-left text-xs hover:bg-zinc-900" onClick={() => setOpen((v) => !v)}>
        <span className="text-zinc-500">{open ? "▾" : "▸"}</span>
        <span className="font-semibold text-zinc-300">{entry.teamName}</span>
        {entry.error
          ? <span className="truncate text-red-300">failed — {entry.error}</span>
          : <span className="text-zinc-400">{entry.data?.candidates.length ?? 0} claims{entry.meta?.grounded ? " · grounded" : " · un-grounded"}</span>}
        <span className="ml-auto shrink-0 text-zinc-600">{timeLabel(entry.at)}</span>
      </button>
      {open && (
        <div className="space-y-2 border-t border-zinc-800 p-3 text-sm">
          {entry.question && <p className="text-xs text-zinc-400">Note: {entry.question}</p>}
          {entry.error && <div className="rounded-md border border-red-900 bg-red-950/50 px-3 py-2 text-red-200">{entry.error}</div>}
          {entry.data && (
            <ol className="space-y-0.5">
              {entry.data.candidates.map((c) => (
                <li key={c.player_id}>
                  <span className="text-zinc-500">{c.rank}.</span> <b>{c.name}</b>{" "}
                  <span className="text-zinc-500">{c.addType}{c.faabPctHigh != null ? ` · up to ${c.faabPctHigh}%` : ""}</span>
                </li>
              ))}
            </ol>
          )}
          <RawJson value={{ recommendation: entry.data, validation: entry.validation, error: entry.error, meta: entry.meta }} />
        </div>
      )}
    </li>
  );
}
