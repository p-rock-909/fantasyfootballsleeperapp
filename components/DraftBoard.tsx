"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, getPlayers } from "@/lib/client";
import { leagueFormat, type Player, type SleeperDraft, type SleeperLeague, type SleeperPick } from "@/lib/sleeper";
import { resolveMySlot, secondsLeft, turnInfo } from "@/lib/draftMath";
import { mergeRankings, parseRankings, serializeRankings, type RankedPlayer, type RankingRow } from "@/lib/rankings";
import { byeForTeam } from "@/lib/players";
import { analyzeRoster } from "@/lib/rosterNeeds";
import { appendRecLog, clearRecLog, loadRankings, loadSettings, newRecId, updateSettings as persistSettings, useRecLog, useSettings, type Settings } from "@/lib/storage";
import type { RecommendationResponse } from "@/lib/schema";
import AvailablePlayers from "./AvailablePlayers";
import Recommendations from "./Recommendations";
import MyRoster from "./MyRoster";
import SettingsDrawer from "./SettingsDrawer";
import RankingsImport from "./RankingsImport";
import AppNav from "./AppNav";

const POLL_DRAFTING_MS = 5000;
const POLL_IDLE_MS = 30000;

/** The rankings template bundled with the app, as served by /api/rankings. */
export interface Template {
  csv: string;
  source: string;
  rows: RankingRow[];
}

export interface RecState {
  loading: boolean;
  forPick: number | null;
  data: RecommendationResponse | null;
  error: string | null;
  meta?: { model: string; usage?: unknown } | null;
  id?: string | null; // links the live card to its entry in the log
}

export default function DraftBoard({ draftId }: { draftId: string }) {
  const [settings] = useSettings();
  const history = useRecLog(draftId);
  const [draft, setDraft] = useState<SleeperDraft | null>(null);
  const [league, setLeague] = useState<SleeperLeague | null>(null);
  const [picks, setPicks] = useState<SleeperPick[]>([]);
  const [players, setPlayers] = useState<Player[] | null>(null);
  const [rankings, setRankings] = useState<RankingRow[] | null>(null);
  // Bundled template, used until (and again after clearing) an import of your own.
  const [template, setTemplate] = useState<Template | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [rec, setRec] = useState<RecState>({ loading: false, forPick: null, data: null, error: null });
  const [panel, setPanel] = useState<"none" | "settings" | "rankings">("none");
  const [question, setQuestion] = useState("");
  const lastAutoPick = useRef<number | null>(null);

  // Initial load
  useEffect(() => {
    (async () => {
      try {
        if (loadSettings().draftId !== draftId) persistSettings({ draftId, mySlotOverride: null });
        const rk = loadRankings();
        const [d, p, pl] = await Promise.all([api.draft(draftId), api.picks(draftId), getPlayers()]);
        setRankings(rk); setDraft(d); setPicks(p); setPlayers(pl);
        api.rankingsTemplate()
          .then(({ csv, source }) => setTemplate(csv ? { csv, source, rows: parseRankings(csv, pl).rows.filter((r) => r.playerId) } : null))
          .catch(() => null);
        if (d.league_id) api.league(d.league_id).then(setLeague).catch(() => null);
      } catch (e) { setErr((e as Error).message); }
    })();
  }, [draftId]);

  // Poll picks + draft status
  useEffect(() => {
    if (!draft) return;
    const ms = draft.status === "drafting" ? POLL_DRAFTING_MS : POLL_IDLE_MS;
    const t = setInterval(async () => {
      try {
        const [p, d] = await Promise.all([api.picks(draftId), api.draft(draftId)]);
        setPicks((prev) => (p.length !== prev.length ? p : prev));
        setDraft((prev) => (prev && prev.status === d.status && prev.last_picked === d.last_picked ? prev : d));
      } catch { /* transient */ }
    }, ms);
    return () => clearInterval(t);
  }, [draft, draftId]);

  // Clock tick
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  const fmt = useMemo(() => (draft ? leagueFormat(draft, league) : null), [draft, league]);
  const mySlot = useMemo(() => (draft && settings ? resolveMySlot(draft, settings.userId, settings.mySlotOverride) : null), [draft, settings]);
  const turn = useMemo(() => (draft ? turnInfo(draft, picks, mySlot) : null), [draft, picks, mySlot]);
  // Your import wins; the template fills in until there is one.
  const activeRankings = rankings ?? template?.rows ?? null;
  const ranked = useMemo(() => (players ? mergeRankings(players, activeRankings, byeForTeam) : []), [players, activeRankings]);
  const byId = useMemo(() => new Map(ranked.map((p) => [p.id, p])), [ranked]);
  const taken = useMemo(() => new Set(picks.map((p) => p.player_id)), [picks]);
  const pickAt = useMemo(() => new Map(picks.map((p) => [p.pick_no, p])), [picks]);
  const available = useMemo(() => ranked.filter((p) => !taken.has(p.id)), [ranked, taken]);
  const myRoster = useMemo<RankedPlayer[]>(
    () => (mySlot ? picks.filter((p) => p.draft_slot === mySlot).map((p) => byId.get(p.player_id)).filter((p): p is RankedPlayer => !!p) : []),
    [picks, mySlot, byId],
  );
  const analysis = useMemo(() => (fmt ? analyzeRoster(myRoster, fmt.slots, (p) => (p as RankedPlayer).bye ?? null) : null), [fmt, myRoster]);

  const recommend = useCallback(async (q?: string) => {
    if (!settings || !turn) return;
    const id = newRecId();
    // Everything about the run that is known before the answer comes back.
    const base = { id, at: Date.now(), forPick: turn.currentPick, round: turn.round, effort: settings.effort, question: q?.trim() || null };
    setRec({ loading: true, forPick: turn.currentPick, data: null, error: null, id });
    try {
      const res = await fetch("/api/recommend", {
        method: "POST",
        headers: { "content-type": "application/json", ...(settings.appPassword ? { "x-app-password": settings.appPassword } : {}) },
        body: JSON.stringify({
          draftId, effort: settings.effort, mySlot,
          rankings: serializeRankings(activeRankings),
          question: q || undefined,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      appendRecLog(draftId, { ...base, forPick: body.meta.pick ?? base.forPick, data: body.recommendation, error: null, meta: body.meta });
      setRec({ loading: false, forPick: body.meta.pick, data: body.recommendation, error: null, meta: body.meta, id });
    } catch (e) {
      // Failed runs are logged too, so a bad answer never just disappears from the record.
      const message = (e as Error).message;
      appendRecLog(draftId, { ...base, data: null, error: message, meta: null });
      setRec((r) => ({ ...r, loading: false, error: message, id }));
    }
  }, [settings, turn, draftId, mySlot, activeRankings]);

  // Auto-recommend when a new pick lands and we're close to our turn.
  useEffect(() => {
    if (!settings?.autoRecommend || !turn || !draft || draft.status !== "drafting" || turn.isComplete) return;
    if (rec.loading) return;
    if (turn.picksUntilMyTurn > settings.autoWithinPicks) return;
    if (lastAutoPick.current === turn.currentPick) return;
    lastAutoPick.current = turn.currentPick;
    recommend();
  }, [turn, settings, draft, rec.loading, recommend]);

  const updateSettings = (patch: Partial<Settings>) => persistSettings(patch);

  // The nav belongs on the loading and error states too — those are exactly when someone
  // wants to leave the page.
  if (err || !draft || !turn || !fmt || !players || !settings) {
    return (
      <div className="flex min-h-screen flex-col">
        <header className="sticky top-0 z-10 border-b border-zinc-800 bg-zinc-950/95 px-4 py-2 backdrop-blur">
          <AppNav draftId={draftId} />
        </header>
        {err
          ? <div className="p-6 text-red-300">{err}</div>
          : <div className="p-6 text-zinc-400">Loading draft…</div>}
      </div>
    );
  }

  const clock = secondsLeft(draft, now);
  const staleRec = rec.data && rec.forPick !== turn.currentPick;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-10 border-b border-zinc-800 bg-zinc-950/95 px-4 py-2 backdrop-blur">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <AppNav draftId={draftId} leagueId={draft.league_id} />
          <span className="font-semibold">{draft.metadata?.name || league?.name || `Draft ${draftId}`}</span>
          <span className="text-zinc-500">{fmt.teams} tm · {fmt.scoring}{fmt.superflex ? " · SF" : ""}{fmt.tePremium ? " · TEP" : ""} · {draft.type}</span>
          <span className={`pill ${draft.status === "drafting" ? "bg-emerald-900 text-emerald-200" : "bg-zinc-800 text-zinc-300"}`}>{draft.status.replace("_", " ")}</span>
          <span className="text-zinc-300">Pick <b>{Math.min(turn.currentPick, turn.totalPicks)}</b>/{turn.totalPicks} · Rd {turn.round}</span>
          {mySlot ? (
            turn.onTheClock ? <span className="rounded bg-emerald-500 px-2 py-0.5 font-bold text-zinc-950">YOU&apos;RE ON THE CLOCK{clock != null ? ` · ${clock}s` : ""}</span>
              : turn.isComplete ? <span className="text-zinc-400">Draft complete</span>
              : <span className="text-zinc-300">Your pick in <b>{turn.picksUntilMyTurn}</b> (#{turn.myNextPicks[0]}){clock != null ? ` · slot ${turn.slotOnClock} has ${clock}s` : ""}</span>
          ) : (
            <span className="text-amber-300">Pick your draft slot →</span>
          )}
          <select className="input !w-auto !py-1" value={mySlot ?? ""} onChange={(e) => updateSettings({ mySlotOverride: e.target.value ? Number(e.target.value) : null })}>
            <option value="">My slot…</option>
            {Array.from({ length: fmt.teams }, (_, i) => i + 1).map((s) => <option key={s} value={s}>Slot {s}</option>)}
          </select>
          <div className="ml-auto flex gap-2">
            <button className="btn btn-ghost" onClick={() => setPanel(panel === "rankings" ? "none" : "rankings")}>
              Rankings {rankings
                ? <span className="pill bg-emerald-900 text-emerald-200">{rankings.filter((r) => r.playerId).length}</span>
                : template
                ? <span className="pill bg-sky-900 text-sky-200" title="From the template bundled with the app — import your own to replace it">template · {template.rows.length}</span>
                : <span className="pill bg-amber-900 text-amber-200">none</span>}
            </button>
            <button className="btn btn-ghost" onClick={() => setPanel(panel === "settings" ? "none" : "settings")}>⚙ Settings</button>
          </div>
        </div>
      </header>

      {panel === "rankings" && <RankingsImport players={players} template={template} onChange={(rows) => { setRankings(rows); }} onClose={() => setPanel("none")} />}
      {panel === "settings" && <SettingsDrawer settings={settings} onChange={updateSettings} onClose={() => setPanel("none")} />}

      <main className="grid flex-1 gap-4 p-4 lg:grid-cols-[1fr_1.1fr_0.8fr]">
        <AvailablePlayers players={available} turn={turn} />
        <Recommendations
          rec={rec}
          history={history}
          pickAt={pickAt}
          draftId={draftId}
          onClearHistory={() => clearRecLog(draftId)}
          stale={!!staleRec}
          onRecommend={() => recommend(question)}
          question={question}
          setQuestion={setQuestion}
          byId={byId}
          canRun={!turn.isComplete}
          effort={settings.effort}
          setEffort={(effort) => updateSettings({ effort })}
        />
        <MyRoster roster={myRoster} analysis={analysis} fmt={fmt} picks={picks} mySlot={mySlot} byId={byId} />
      </main>
    </div>
  );
}
