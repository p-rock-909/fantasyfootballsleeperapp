"use client";

import { useState } from "react";
import type { LiveContextResult } from "@/lib/liveContext";
import type { TradeEvaluation, TradeMeta, TradeProposals, ValidationResult } from "@/lib/schema";
import type { Settings, TradeLogEntry } from "@/lib/storage";
import { Contingencies, CONFIDENCE_PILL, Line, ScoreBreakdown, timeLabel, Unknowns, ValidationNotice } from "./AnswerParts";
import Grounding from "./Grounding";
import RawJson from "./RawJson";

/**
 * The before/after lineups the app solved in code, echoed back for display. One row per
 * lineup slot, with a null where nothing could fill it — so before and after line up
 * slot-for-slot even when one side has a hole the other doesn't.
 */
export interface SolvedLineups {
  rosterId: number;
  team: string;
  rows: { slot: string; before: string | null; after: string | null }[];
}

export interface TradeRecState {
  loading: boolean;
  stage: "news" | "thinking" | null;
  evaluation: TradeEvaluation | null;
  proposals: TradeProposals | null;
  lineups: SolvedLineups[] | null;
  liveContext: LiveContextResult | null;
  validation: ValidationResult | null;
  error: string | null;
  /** Whatever the route attached to a failure — for a Gemini 400, the schema it sent. */
  errorDetail: unknown;
  meta: TradeMeta | null;
  id: string | null;
}

const VERDICT_STYLE: Record<TradeEvaluation["verdict"], string> = {
  accept: "bg-emerald-900 text-emerald-200",
  "accept if adjusted": "bg-sky-900 text-sky-200",
  "close - preference": "bg-zinc-700 text-zinc-200",
  decline: "bg-red-900 text-red-200",
  "needs commissioner review": "bg-amber-900 text-amber-200",
};

const UNGROUNDED_NOTE =
  "A trade is a rest-of-season decision, and this app has no rest-of-season projections of its own — the news lookup is where they come from. Without it, treat what follows as a structural read of both rosters (who starts, where the holes are) rather than a valuation of the players.";

/** Positive is good for that team; the scale is the ruleset's own. */
const scoreStyle = (n: number) =>
  n >= 8 ? "text-emerald-300" : n <= -8 ? "text-red-300" : "text-zinc-300";

export default function TradeEvaluationPanel({
  rec,
  history,
  mode,
  onRun,
  onClearHistory,
  onEvaluateProposal,
  canRun,
  effort,
  setEffort,
}: {
  rec: TradeRecState;
  history: TradeLogEntry[];
  mode: "evaluate" | "propose";
  onRun: (question: string, refreshNews: boolean) => Promise<void> | void;
  onClearHistory: () => void;
  onEvaluateProposal: (partnerRosterId: number, youSend: string[], youGet: string[]) => void;
  canRun: boolean;
  effort: Settings["effort"];
  setEffort: (e: Settings["effort"]) => void;
}) {
  const [showHistory, setShowHistory] = useState(false);
  const [question, setQuestion] = useState("");
  const [refreshNews, setRefreshNews] = useState(false);
  const submit = async () => {
    await onRun(question, refreshNews);
    setRefreshNews(false);
  };
  const prior = history.filter((e) => e.id !== rec.id);
  const ev = rec.evaluation;
  const pr = rec.proposals;

  return (
    <section className="card">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h2 className="font-semibold">{mode === "evaluate" ? "Trade evaluation" : "Trade ideas"}</h2>
        <span className="text-xs text-zinc-500">rules: content/trade-rules.md</span>
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
            {rec.loading ? "Working…" : mode === "evaluate" ? "Evaluate trade" : "Find trades"}
          </button>
        </div>
      </div>

      <input
        className="input mb-3"
        placeholder={mode === "evaluate" ? "Optional note (e.g. 'I'm 2-6, I should probably be selling')…" : "Optional note (e.g. 'I need a TE and I can spare a RB')…"}
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && !rec.loading && canRun && submit()}
      />

      {rec.loading && (
        <div className="animate-pulse text-sm text-zinc-400">
          {rec.stage === "news" ? "Searching for roles, injury timelines and rest-of-season outlook…" : "Weighing both rosters against the rules…"}
        </div>
      )}
      {rec.error && (
        <div className="rounded-md border border-red-900 bg-red-950/50 px-3 py-2 text-sm text-red-200">
          {rec.error}
          {rec.errorDetail != null && <RawJson value={rec.errorDetail} />}
        </div>
      )}
      {!rec.loading && !ev && !pr && !rec.error && (
        <p className="text-sm text-zinc-500">
          {mode === "evaluate"
            ? <>Pick both teams and the players moving each way, then press <b>Evaluate trade</b>.</>
            : <>Pick your team — and a partner, or leave it on <i>Any team</i> — then press <b>Find trades</b>.</>}
        </p>
      )}

      {(ev || pr) && (
        <div className="space-y-4">
          <ValidationNotice validation={rec.validation} />

          <Grounding live={rec.liveContext} meta={rec.meta} ungroundedNote={UNGROUNDED_NOTE} />

          {ev && <Evaluation ev={ev} />}
          {ev && rec.lineups && rec.lineups.length > 0 && <SolvedLineupsBlock lineups={rec.lineups} />}
          {pr && <Proposals pr={pr} onEvaluate={onEvaluateProposal} />}

          <RawJson value={{ recommendation: ev ?? pr, liveContext: rec.liveContext, validation: rec.validation, meta: rec.meta }} />
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
              ? <p className="mt-2 text-xs text-zinc-600">No earlier runs in this league.</p>
              : <ul className="mt-2 space-y-1">{prior.map((e) => <HistoryEntry key={e.id} entry={e} />)}</ul>
          )}
        </div>
      )}
    </section>
  );
}

function Evaluation({ ev }: { ev: TradeEvaluation }) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <span className={`pill ${VERDICT_STYLE[ev.verdict]}`}>{ev.verdict}</span>
        <span className="text-xs text-zinc-500">{ev.assumptions.timeline}</span>
      </div>

      <p className="text-sm text-zinc-300">{ev.rationale}</p>

      <div className="grid gap-2 sm:grid-cols-2">
        {ev.teamImpact.map((t) => (
          <div key={t.rosterId} className="rounded-md border border-zinc-800 p-2">
            <div className="flex items-center gap-2">
              <b className="truncate">{t.team}</b>
              <span className={`ml-auto text-lg font-bold tabular-nums ${scoreStyle(t.score)}`}>
                {t.score > 0 ? "+" : ""}{t.score}
              </span>
            </div>
            <dl className="mt-1 space-y-1 text-xs">
              <Line term="Before" text={t.before} />
              <Line term="After" text={t.after} />
              <Line term="Change" text={t.mainLineupChange} />
              <Line term="Depth" text={t.depthChange} />
              <Line term="Fit" text={t.strategicEffect} />
            </dl>
            <ScoreBreakdown lines={t.scoreBreakdown} />
          </div>
        ))}
      </div>

      {ev.assets.length > 0 && (
        <div>
          <h3 className="mb-1 text-xs uppercase tracking-wide text-zinc-500">Assets</h3>
          <ul className="space-y-1">
            {ev.assets.map((a) => (
              <li key={a.player_id} className="rounded-md border border-zinc-800 p-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <b>{a.name}</b>
                  <span className="pill bg-zinc-800 text-zinc-300">{a.floorCeiling} floor</span>
                </div>
                <dl className="mt-1 space-y-1 text-xs">
                  <Line term="Role" text={a.roleUsage} />
                  <Line term="ROS" text={a.rosOutlook} />
                  <Line term="Risk" text={a.mainRisk} className="text-amber-200" />
                  <Line term="Format" text={a.formatNote} />
                </dl>
              </li>
            ))}
          </ul>
        </div>
      )}

      {ev.adjustments.length > 0 && (
        <div>
          <h3 className="mb-1 text-xs uppercase tracking-wide text-zinc-500">How to balance it</h3>
          <ul className="space-y-1 text-sm">
            {ev.adjustments.map((a, i) => (
              <li key={i} className="rounded-md border border-zinc-800 px-2 py-1">
                <b className="text-zinc-100">{a.side}:</b> <span className="text-zinc-300">{a.change}</span>{" "}
                <span className="text-zinc-500">— {a.why}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Contingencies items={ev.contingencies} />

      <div className={`rounded-md border px-3 py-2 text-sm ${ev.fairness.flagged ? "border-amber-800 bg-amber-950/40 text-amber-100" : "border-zinc-800 text-zinc-400"}`}>
        <b className={ev.fairness.flagged ? "text-amber-200" : "text-zinc-300"}>
          {ev.fairness.flagged ? "Flagged for review" : "No fairness concern"}
        </b>{" "}
        {ev.fairness.reasoning}
      </div>

      {ev.assumptions.unknowns.length > 0 && (
        <div className="rounded-md border border-zinc-800 px-3 py-2 text-xs text-zinc-400">
          <b className="text-zinc-300">Assumed:</b> {ev.assumptions.format} · {ev.assumptions.newsCutoff}
          <Unknowns unknowns={ev.assumptions.unknowns} />
        </div>
      )}
    </>
  );
}

/**
 * The lineups this app solved, not the model's description of them.
 *
 * content/trade-rules.md turns on "the difference between the lineups each manager can
 * start before and after", and that part is arithmetic — so it is worth showing as
 * arithmetic, next to the model's judgement rather than inside it.
 */
function SolvedLineupsBlock({ lineups }: { lineups: SolvedLineups[] }) {
  return (
    <details>
      <summary className="cursor-pointer text-xs uppercase tracking-wide text-zinc-500 hover:text-zinc-300">
        Before / after starting lineups (computed, not the model&apos;s)
      </summary>
      <p className="mt-1 text-xs text-zinc-500">
        Solved from this league&apos;s actual slots. IR and taxi players are excluded; bye weeks are not, because this is a rest-of-season decision.
        The lineup shape is reliable; the ordering behind it is a rough prior — see the note on value in the answer above.
      </p>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {lineups.map((l) => (
          <div key={l.rosterId} className="rounded-md border border-zinc-800 p-2 text-xs">
            <b className="text-zinc-200">{l.team}</b>
            <ul className="mt-1 space-y-0.5">
              {l.rows.map((r, i) => {
                const changed = r.before !== r.after;
                return (
                  <li key={`${r.slot}-${i}`} className={changed ? "text-emerald-300" : "text-zinc-400"}>
                    <span className="text-zinc-600">{r.slot}</span>{" "}
                    {r.after ?? <span className="text-amber-200">(nobody eligible)</span>}
                    {changed && <span className="text-zinc-600"> — was {r.before ?? "nobody"}</span>}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </details>
  );
}

function Proposals({ pr, onEvaluate }: { pr: TradeProposals; onEvaluate: (partnerRosterId: number, youSend: string[], youGet: string[]) => void }) {
  return (
    <>
      <p className="text-sm text-zinc-300">{pr.notes}</p>
      <ul className="space-y-2">
        {pr.proposals.map((p, i) => (
          <li key={i} className="rounded-md border border-zinc-800 p-2">
            <div className="flex flex-wrap items-center gap-2">
              <b className="truncate">{p.partnerTeam}</b>
              <span className={`pill ${CONFIDENCE_PILL[p.confidence]}`}>
                {p.confidence}
              </span>
              <button
                className="btn btn-ghost ml-auto !py-0.5 !text-xs"
                title="Load this into the evaluate form and score it properly"
                onClick={() => onEvaluate(p.partnerRosterId, p.youSend.map((x) => x.player_id), p.youGet.map((x) => x.player_id))}
              >
                Evaluate this
              </button>
            </div>

            <div className="mt-1 grid gap-1 text-sm sm:grid-cols-2">
              <div>
                <div className="text-[10px] uppercase tracking-wide text-zinc-500">You send</div>
                <ul className="text-zinc-300">{p.youSend.map((x) => <li key={x.player_id}>{x.name}</li>)}</ul>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wide text-zinc-500">You get</div>
                <ul className="text-emerald-300">{p.youGet.map((x) => <li key={x.player_id}>{x.name}</li>)}</ul>
              </div>
            </div>

            <dl className="mt-2 space-y-1 text-xs">
              <Line term="Pitch" text={p.pitch} />
              <Line term="They win" text={p.whyTheyAccept} />
              <Line term="You win" text={p.whyYouWin} />
              <Line term="Risk" text={p.mainRisk} className="text-amber-200" />
            </dl>
          </li>
        ))}
      </ul>
      {pr.assumptions.unknowns.length > 0 && (
        <div className="rounded-md border border-zinc-800 px-3 py-2 text-xs text-zinc-400">
          <b className="text-zinc-300">Assumed:</b> {pr.assumptions.format} · {pr.assumptions.timeline}
          <Unknowns unknowns={pr.assumptions.unknowns} />
        </div>
      )}
    </>
  );
}

function HistoryEntry({ entry }: { entry: TradeLogEntry }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="rounded-md border border-zinc-800">
      <button className="flex w-full flex-wrap items-center gap-2 px-2 py-1.5 text-left text-xs hover:bg-zinc-900" onClick={() => setOpen((v) => !v)}>
        <span className="text-zinc-500">{open ? "▾" : "▸"}</span>
        <span className="font-semibold text-zinc-300">{entry.teamAName}</span>
        <span className="text-zinc-600">{entry.mode === "evaluate" ? `vs ${entry.teamBName ?? "?"}` : "· ideas"}</span>
        {entry.error
          ? <span className="truncate text-red-300">failed — {entry.error}</span>
          : <span className="text-zinc-400">
              {entry.evaluation?.verdict ?? `${entry.proposals?.proposals.length ?? 0} proposals`}
              {entry.meta?.grounded ? " · grounded" : " · un-grounded"}
            </span>}
        <span className="ml-auto shrink-0 text-zinc-600">{timeLabel(entry.at)}</span>
      </button>
      {open && (
        <div className="space-y-2 border-t border-zinc-800 p-3 text-sm">
          {entry.question && <p className="text-xs text-zinc-400">Note: {entry.question}</p>}
          {entry.error && <div className="rounded-md border border-red-900 bg-red-950/50 px-3 py-2 text-red-200">{entry.error}</div>}
          {entry.evaluation && <p className="text-zinc-300">{entry.evaluation.rationale}</p>}
          {entry.proposals && (
            <ul className="space-y-0.5">
              {entry.proposals.proposals.map((p, i) => (
                <li key={i}><b>{p.partnerTeam}</b> — {p.youSend.map((x) => x.name).join(", ")} for {p.youGet.map((x) => x.name).join(", ")}</li>
              ))}
            </ul>
          )}
          <RawJson value={{ evaluation: entry.evaluation, proposals: entry.proposals, validation: entry.validation, error: entry.error, errorDetail: entry.errorDetail, meta: entry.meta }} />
        </div>
      )}
    </li>
  );
}
