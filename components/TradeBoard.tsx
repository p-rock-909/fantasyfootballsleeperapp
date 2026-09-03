"use client";

import { useEffect, useMemo, useState } from "react";
import { api, getPlayers } from "@/lib/client";
import { byeForTeam } from "@/lib/players";
import { mergeRankings, serializeRankings, type RankedPlayer, type RankingRow } from "@/lib/rankings";
import { orderedSlots, rosterOwnerIds } from "@/lib/lineup";
import { buildLeagueState, type LeagueTeam } from "@/lib/leagueState";
import {
  formatFromLeague,
  type Player,
  type SleeperLeague,
  type SleeperRoster,
  type SleeperState,
  type SleeperUser,
} from "@/lib/sleeper";
import {
  appendTradeLog,
  clearTradeLog,
  loadRankings,
  newRecId,
  updateSettings,
  useSettings,
  useTradeLog,
  type Settings,
} from "@/lib/storage";
import AppNav from "./AppNav";
import TradeEvaluationPanel, { type TradeRecState } from "./TradeEvaluationPanel";
import type { TradeMode } from "@/lib/schema";

const WEEKS = Array.from({ length: 18 }, (_, i) => i + 1);

/**
 * A failed run, carrying whatever the route put in `detail`.
 *
 * A Gemini 400 names no field, so the route attaches the schema it sent — useless if the
 * board throws a bare Error and drops it, which is what happened the first time this
 * failed in production.
 */
class RunFailed extends Error {
  constructor(message: string, readonly detail: unknown) {
    super(message);
  }
}

interface LeagueData {
  league: SleeperLeague;
  users: SleeperUser[];
  rosters: SleeperRoster[];
  state: SleeperState;
  players: Player[];
}

const IDLE: TradeRecState = {
  loading: false, stage: null, evaluation: null, proposals: null, lineups: null,
  liveContext: null, validation: null, error: null, errorDetail: null, meta: null, id: null,
};

export default function TradeBoard({ leagueId }: { leagueId: string }) {
  const [settings] = useSettings();
  const [data, setData] = useState<LeagueData | null>(null);
  const [rankings, setRankings] = useState<RankingRow[] | null>(null);
  const [week, setWeek] = useState<number | null>(null);
  const [mode, setMode] = useState<TradeMode>("evaluate");
  const [pickedA, setPickedA] = useState<number | null>(null);
  // Null in propose mode means "any team in the league".
  const [pickedB, setPickedB] = useState<number | null>(null);
  const [sendsA, setSendsA] = useState<string[]>([]);
  const [sendsB, setSendsB] = useState<string[]>([]);
  const [rec, setRec] = useState<TradeRecState>(IDLE);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [l, u, r, s, pl] = await Promise.all([
          api.league(leagueId), api.leagueUsers(leagueId), api.rosters(leagueId), api.state(), getPlayers(),
        ]);
        setData({ league: l, users: u, rosters: r, state: s, players: pl });
        setRankings(loadRankings());
        updateSettings({ leagueId });
        setWeek(Math.min(18, Math.max(1, s.display_week ?? s.week ?? 1)));
      } catch (e) { setErr((e as Error).message); }
    })();
  }, [leagueId]);

  const league = data?.league ?? null;
  const fmt = useMemo(() => (league ? formatFromLeague(league) : null), [league]);
  const lineup = useMemo(() => orderedSlots(league?.roster_positions), [league]);
  const ranked = useMemo(() => (data ? mergeRankings(data.players, rankings, byeForTeam) : []), [data, rankings]);

  const state = useMemo(() => {
    if (!data || !league || week == null) return null;
    return buildLeagueState({
      league, users: data.users, rosters: data.rosters, matchups: [],
      pool: ranked, lineup, week, byeOf: (p) => p.bye,
    });
  }, [data, league, ranked, lineup, week]);

  const userId = settings?.userId ?? null;
  const myRosterIds = useMemo(
    () => new Set(userId && data ? data.rosters.filter((r) => rosterOwnerIds(r).includes(userId)).map((r) => r.roster_id) : []),
    [data, userId],
  );

  // Resolve straight to the team objects: a picked id that is no longer in the league is
  // then just a `find` that misses, rather than a separate validity check.
  const teams = state?.teams ?? [];
  const teamA =
    teams.find((t) => t.team.rosterId === pickedA) ??
    teams.find((t) => myRosterIds.has(t.team.rosterId)) ??
    teams[0] ?? null;
  const rosterA = teamA?.team.rosterId ?? null;
  const teamB = teams.find((t) => t.team.rosterId === pickedB && t.team.rosterId !== rosterA) ?? null;
  const rosterB = teamB?.team.rosterId ?? null;

  const history = useTradeLog(leagueId);
  const pastDeadline = state?.rules.tradeDeadline != null && week != null && week > state.rules.tradeDeadline;

  // Changing either side invalidates the players already chosen from it.
  // Team A is never "any" — the picker only offers that for the partner side.
  const chooseA = (id: number | null) => { if (id == null) return; setPickedA(id); setSendsA([]); setRec(IDLE); };
  const chooseB = (id: number | null) => { setPickedB(id); setSendsB([]); setRec(IDLE); };

  const toggle = (list: string[], set: (v: string[]) => void, id: string) =>
    set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  /** Load a generated proposal into the evaluate form, so it can be scored properly. */
  function evaluateProposal(partnerRosterId: number, youSend: string[], youGet: string[]) {
    setMode("evaluate");
    setPickedB(partnerRosterId);
    setSendsA(youSend);
    setSendsB(youGet);
    setRec(IDLE);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const canRun = mode === "evaluate"
    ? !!teamA && !!teamB && (sendsA.length > 0 || sendsB.length > 0)
    : !!teamA;

  async function run(question: string, refreshNews: boolean) {
    if (!settings || !league || week == null || !teamA || !canRun) return;
    const id = newRecId();
    setRec({ ...IDLE, loading: true, stage: "news", id });
    const toThink = setTimeout(() => setRec((r) => (r.id === id && r.loading ? { ...r, stage: "thinking" } : r)), 20000);
    const base = {
      id, at: Date.now(), week, mode,
      teamAName: teamA.team.name, teamBName: teamB?.team.name ?? null,
      effort: settings.effort, question: question.trim() || null,
    };
    try {
      const res = await fetch("/api/trades/evaluate", {
        method: "POST",
        headers: { "content-type": "application/json", ...(settings.appPassword ? { "x-app-password": settings.appPassword } : {}) },
        body: JSON.stringify({
          leagueId, week, mode,
          teamA: { rosterId: teamA.team.rosterId, sends: sendsA },
          teamB: teamB ? { rosterId: teamB.team.rosterId, sends: mode === "evaluate" ? sendsB : [] } : null,
          effort: settings.effort,
          rankings: serializeRankings(rankings),
          question: question.trim() || undefined,
          refreshNews,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new RunFailed(body.error ?? `HTTP ${res.status}`, body.detail ?? null);
      const evaluation = mode === "evaluate" ? body.recommendation : null;
      const proposals = mode === "propose" ? body.recommendation : null;
      appendTradeLog(leagueId, { ...base, evaluation, proposals, validation: body.validation, error: null, meta: body.meta });
      setRec({
        loading: false, stage: null, evaluation, proposals, lineups: body.lineups ?? null,
        liveContext: body.liveContext, validation: body.validation, error: null, errorDetail: null, meta: body.meta, id,
      });
    } catch (e) {
      const message = (e as Error).message;
      appendTradeLog(leagueId, { ...base, evaluation: null, proposals: null, validation: null, error: message, meta: null });
      setRec({ ...IDLE, error: message, errorDetail: e instanceof RunFailed ? e.detail : null, id });
    } finally {
      clearTimeout(toThink);
    }
  }

  if (err || !data || !league || !fmt || !settings || week == null || !state) {
    return (
      <div className="flex min-h-screen flex-col">
        <header className="sticky top-0 z-10 border-b border-zinc-800 bg-zinc-950/95 px-4 py-2 backdrop-blur">
          <AppNav leagueId={leagueId} />
        </header>
        {err ? <div className="p-6 text-red-300">{err}</div> : <div className="p-6 text-zinc-400">Loading league…</div>}
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-10 border-b border-zinc-800 bg-zinc-950/95 px-4 py-2 backdrop-blur">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <AppNav leagueId={leagueId} />
          <span className="font-semibold">{league.name}</span>
          <span className="text-zinc-500">{fmt.teams} tm · {fmt.scoring}{fmt.superflex ? " · SF" : ""}</span>

          <div className="flex rounded-md border border-zinc-800 p-0.5">
            {(["evaluate", "propose"] as TradeMode[]).map((m) => (
              <button
                key={m}
                className={`rounded px-2.5 py-1 text-sm transition ${mode === m ? "bg-zinc-800 font-medium text-zinc-100" : "text-zinc-400 hover:text-zinc-100"}`}
                aria-pressed={mode === m}
                onClick={() => { setMode(m); setRec(IDLE); }}
              >
                {m === "evaluate" ? "Evaluate a trade" : "Find trades"}
              </button>
            ))}
          </div>

          <label className="flex items-center gap-1">
            <span className="text-zinc-400">Week</span>
            <select className="input !w-auto !py-1" value={week} onChange={(e) => { setWeek(Number(e.target.value)); setRec(IDLE); }}>
              {WEEKS.map((w) => <option key={w} value={w}>{w}</option>)}
            </select>
          </label>

          {pastDeadline && (
            <span className="pill bg-amber-900 text-amber-200" title={`The deadline was week ${state.rules.tradeDeadline}`}>
              past the deadline
            </span>
          )}
        </div>
      </header>

      <main className="grid flex-1 gap-4 p-4 xl:grid-cols-[1fr_1.1fr]">
        <div className="min-w-0 space-y-3">
          <TeamPicker
            label={mode === "evaluate" ? "Team A" : "Trade for"}
            teams={teams}
            value={rosterA}
            mine={myRosterIds}
            onChange={chooseA}
          />
          {teamA && (
            <RosterPicker
              team={teamA}
              selected={sendsA}
              onToggle={(id) => toggle(sendsA, setSendsA, id)}
              caption={mode === "evaluate" ? "Choose who leaves this roster" : "Selecting players here is optional — it hints at who you're willing to move"}
            />
          )}

          <TeamPicker
            label={mode === "evaluate" ? "Team B" : "Partner"}
            teams={teams.filter((t) => t.team.rosterId !== rosterA)}
            value={rosterB}
            mine={myRosterIds}
            onChange={chooseB}
            allowAny={mode === "propose"}
          />
          {teamB && mode === "evaluate" && (
            <RosterPicker
              team={teamB}
              selected={sendsB}
              onToggle={(id) => toggle(sendsB, setSendsB, id)}
              caption="Choose who leaves this roster"
            />
          )}
          {mode === "propose" && !teamB && (
            <p className="card text-sm text-zinc-400">
              No partner chosen, so every other team in the league is fair game. Their full rosters go to the model.
            </p>
          )}
        </div>

        <TradeEvaluationPanel
          rec={rec}
          history={history}
          mode={mode}
          onRun={run}
          onClearHistory={() => clearTradeLog(leagueId)}
          onEvaluateProposal={evaluateProposal}
          canRun={canRun}
          effort={settings.effort}
          setEffort={(effort: Settings["effort"]) => updateSettings({ effort })}
        />
      </main>
    </div>
  );
}

function TeamPicker({
  label,
  teams,
  value,
  mine,
  onChange,
  allowAny,
}: {
  label: string;
  teams: LeagueTeam[];
  value: number | null;
  mine: Set<number>;
  onChange: (id: number | null) => void;
  allowAny?: boolean;
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="w-16 shrink-0 text-zinc-400">{label}</span>
      <select
        className="input"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
      >
        {allowAny && <option value="">Any team</option>}
        {!allowAny && value == null && <option value="">Choose a team…</option>}
        {teams.map((t) => (
          <option key={t.team.rosterId} value={t.team.rosterId}>
            {t.team.name}{t.team.record ? ` (${t.team.record})` : ""}{mine.has(t.team.rosterId) ? " ★" : ""}
          </option>
        ))}
      </select>
    </label>
  );
}

function RosterPicker({
  team,
  selected,
  onToggle,
  caption,
}: {
  team: LeagueTeam;
  selected: string[];
  onToggle: (id: string) => void;
  caption: string;
}) {
  const startingIds = new Set(team.team.starters.map((r) => r.player.id));
  const chosen = new Set(selected);
  return (
    <section className="card">
      <div className="mb-1 flex flex-wrap items-baseline gap-2">
        <h3 className="font-semibold">{team.team.name}</h3>
        <span className="text-xs text-zinc-500">{team.needs.inSeasonSummary}</span>
      </div>
      <p className="mb-2 text-xs text-zinc-500">{caption}</p>
      <ul className="max-h-72 overflow-y-auto">
        {team.players.map((p: RankedPlayer) => (
          <li key={p.id}>
            <label className="flex cursor-pointer items-center gap-2 border-b border-zinc-800/60 px-1 py-1 text-sm last:border-0 hover:bg-zinc-900">
              <input type="checkbox" checked={chosen.has(p.id)} onChange={() => onToggle(p.id)} />
              <span className={`pill pos-${p.pos}`}>{p.pos}</span>
              <span className="truncate">{p.name}</span>
              <span className="shrink-0 text-xs text-zinc-500">{p.team}</span>
              {p.inj && <span className="pill shrink-0 bg-amber-900/60 text-amber-200">{p.inj}</span>}
              <span className="ml-auto shrink-0 text-[10px] uppercase tracking-wide text-zinc-600">
                {startingIds.has(p.id) ? "starter" : "bench"}
              </span>
            </label>
          </li>
        ))}
      </ul>
    </section>
  );
}
