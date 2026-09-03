"use client";

import { useEffect, useMemo, useState } from "react";
import { api, getPlayers } from "@/lib/client";
import { byeForTeam } from "@/lib/players";
import { mergeRankings, serializeRankings, type RankingRow } from "@/lib/rankings";
import { orderedSlots, rosterOwnerIds } from "@/lib/lineup";
import { buildLeagueState } from "@/lib/leagueState";
import { shortlist, type ShortlistEntry, type TrendingAdds } from "@/lib/freeAgents";
import {
  formatFromLeague,
  type Player,
  type SleeperLeague,
  type SleeperRoster,
  type SleeperState,
  type SleeperUser,
} from "@/lib/sleeper";
import {
  appendWaiverLog,
  clearWaiverLog,
  loadRankings,
  newRecId,
  updateSettings,
  useSettings,
  useWaiverLog,
  type Settings,
} from "@/lib/storage";
import AppNav from "./AppNav";
import WaiverRecommendationPanel, { type WaiverRecState } from "./WaiverRecommendationPanel";

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

const IDLE: WaiverRecState = {
  loading: false, stage: null, data: null, liveContext: null, shortlist: null,
  validation: null, error: null, errorDetail: null, meta: null, id: null,
};

export default function WaiverBoard({ leagueId }: { leagueId: string }) {
  const [settings] = useSettings();
  const [data, setData] = useState<LeagueData | null>(null);
  const [rankings, setRankings] = useState<RankingRow[] | null>(null);
  const [week, setWeek] = useState<number | null>(null);
  const [pickedRosterId, setPickedRosterId] = useState<number | null>(null);
  const [trending, setTrending] = useState<TrendingAdds>(new Map());
  const [rec, setRec] = useState<WaiverRecState>(IDLE);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [l, u, r, s, pl, tr] = await Promise.all([
          api.league(leagueId), api.leagueUsers(leagueId), api.rosters(leagueId), api.state(), getPlayers(), api.trendingAdds(),
        ]);
        setTrending(new Map(tr.map((t) => [t.player_id, t.count])));
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

  // The same assembly the route runs server-side, for display only. It is passed no
  // matchups, so starter/bench labels here reflect the lineup as it stands now rather
  // than a past week's — which is what an add/drop decision wants anyway. The
  // authoritative candidate set comes back in the response and is what gets rendered
  // after a run, so the two can never disagree about what the model actually saw.
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

  // Any team is selectable — scouting another roster's needs is the point of this page —
  // but a team the user owns is the sensible default. Resolving straight to the team makes
  // "the picked team is no longer in this league" just a `find` that misses.
  const teams = state?.teams ?? [];
  const me =
    teams.find((t) => t.team.rosterId === pickedRosterId) ??
    teams.find((t) => myRosterIds.has(t.team.rosterId)) ??
    teams[0] ?? null;
  const rosterId = me?.team.rosterId ?? null;

  const history = useWaiverLog(leagueId, week ?? 0, rosterId ?? 0);

  // What a run would consider, shown before pressing the button so the cut is visible up
  // front rather than only in hindsight. It uses the same `shortlist()` the route does,
  // but it is an estimate, not the record: the server re-derives it against its own
  // trending snapshot and, when no sheet has been imported, the bundled rankings sheet the
  // browser does not have — so the ordering can differ slightly. The UI says so. It is
  // dropped once a run lands, because the panel then shows the set the server really used
  // and two candidate lists on screen is exactly the confusion this was meant to avoid.
  const preview = useMemo(
    () => (me && !rec.data ? shortlist(state?.available ?? [], { needs: me.needs, trending }) : null),
    [me, state, trending, rec.data],
  );

  async function run(question: string, refreshNews: boolean) {
    if (!settings || !league || week == null || rosterId == null || !me) return;
    const id = newRecId();
    setRec({ ...IDLE, loading: true, stage: "news", id });
    const toRank = setTimeout(() => setRec((r) => (r.id === id && r.loading ? { ...r, stage: "ranking" } : r)), 20000);
    const base = {
      id, at: Date.now(), week, rosterId, teamName: me.team.name,
      effort: settings.effort, question: question.trim() || null,
    };
    try {
      const res = await fetch("/api/waivers/recommend", {
        method: "POST",
        headers: { "content-type": "application/json", ...(settings.appPassword ? { "x-app-password": settings.appPassword } : {}) },
        body: JSON.stringify({
          leagueId, week, rosterId,
          effort: settings.effort,
          rankings: serializeRankings(rankings),
          question: question.trim() || undefined,
          refreshNews,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new RunFailed(body.error ?? `HTTP ${res.status}`, body.detail ?? null);
      appendWaiverLog(leagueId, week, rosterId, { ...base, data: body.recommendation, validation: body.validation, error: null, meta: body.meta });
      setRec({
        loading: false, stage: null, data: body.recommendation, liveContext: body.liveContext,
        shortlist: body.shortlist, validation: body.validation, error: null, errorDetail: null, meta: body.meta, id,
      });
    } catch (e) {
      const message = (e as Error).message;
      const detail = e instanceof RunFailed ? e.detail : null;
      appendWaiverLog(leagueId, week, rosterId, { ...base, data: null, validation: null, error: message, errorDetail: detail, meta: null });
      setRec({ ...IDLE, error: message, errorDetail: detail, id });
    } finally {
      clearTimeout(toRank);
    }
  }

  // The nav belongs on the loading and error states too — those are exactly when someone
  // wants to leave the page.
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
          <span className="text-zinc-500">
            {fmt.teams} tm · {fmt.scoring}{fmt.superflex ? " · SF" : ""} · {state.rules.faab ? "FAAB" : "waiver priority"}
          </span>

          <label className="flex items-center gap-1">
            <span className="text-zinc-400">Week</span>
            <select className="input !w-auto !py-1" value={week} onChange={(e) => { setWeek(Number(e.target.value)); setRec(IDLE); }}>
              {WEEKS.map((w) => (
                <option key={w} value={w}>
                  {w}{state.rules.playoffWeekStart && w >= state.rules.playoffWeekStart ? " (playoffs)" : ""}
                </option>
              ))}
            </select>
          </label>

          <label className="flex min-w-0 items-center gap-1">
            <span className="text-zinc-400">Team</span>
            <select
              className="input !w-auto !py-1"
              value={rosterId ?? ""}
              onChange={(e) => { setPickedRosterId(Number(e.target.value)); setRec(IDLE); }}
            >
              {teams.map((t) => (
                <option key={t.team.rosterId} value={t.team.rosterId}>
                  {t.team.name}{myRosterIds.has(t.team.rosterId) ? " ★" : ""}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>

      <main className="grid flex-1 gap-4 p-4 xl:grid-cols-[1fr_1.3fr]">
        <div className="min-w-0 space-y-3">
          {me && (
            <TeamNeeds
              me={me}
              faab={state.rules.faab}
              budget={state.rules.waiverBudget}
              available={state.available.length}
              preview={preview?.entries ?? []}
            />
          )}
        </div>

        <WaiverRecommendationPanel
          rec={rec}
          history={history}
          onRun={run}
          onClearHistory={() => rosterId != null && clearWaiverLog(leagueId, week, rosterId)}
          canRun={!!me}
          teamName={me?.team.name ?? ""}
          faabLeague={state.rules.faab}
          effort={settings.effort}
          setEffort={(effort: Settings["effort"]) => updateSettings({ effort })}
        />
      </main>
    </div>
  );
}

function TeamNeeds({
  me,
  faab,
  budget,
  available,
  preview,
}: {
  me: NonNullable<ReturnType<typeof buildLeagueState>["teams"][number]>;
  faab: boolean;
  budget: number | null;
  available: number;
  preview: ShortlistEntry[];
}) {
  const gaps = (Object.entries(me.needs.starterGaps) as [string, number][]).filter(([, n]) => n > 0);
  const startingIds = new Set(me.team.starters.map((r) => r.player.id));

  return (
    <section className="card space-y-3">
      <div className="flex flex-wrap items-baseline gap-2">
        <h2 className="font-semibold">{me.team.name}</h2>
        {me.team.record && <span className="text-xs text-zinc-500">{me.team.record}</span>}
      </div>

      <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
        <Stat label={faab ? "FAAB left" : "Waiver priority"} value={faab ? `${me.faabRemaining ?? "?"}${budget != null ? ` / ${budget}` : ""}` : `${me.waiverPosition ?? "?"}`} />
        <Stat label="Roster spots open" value={String(me.openSpots)} />
        <Stat label="Unfilled starters" value={gaps.length ? gaps.map(([p, n]) => `${p}×${n}`).join(" ") : "none"} />
        <Stat label="Unrostered players" value={String(available)} />
      </dl>

      {me.openSpots === 0 && (
        <p className="rounded-md border border-amber-900 bg-amber-950/40 px-2 py-1 text-xs text-amber-200">
          This roster is full, so every add has to name a drop.
        </p>
      )}

      {me.needs.byeClashes.length > 0 && (
        <p className="rounded-md border border-amber-900 bg-amber-950/40 px-2 py-1 text-xs text-amber-200">
          Bye clashes — {me.needs.byeClashes.map((b) => `week ${b.bye}: ${b.players.join(", ")}`).join(" · ")}
        </p>
      )}

      {preview.length > 0 && (
        <details>
          <summary className="cursor-pointer text-[10px] uppercase tracking-wide text-zinc-500 hover:text-zinc-300">
            Would consider about {preview.length} of {available} unrostered players
          </summary>
          <p className="mt-1 text-xs text-zinc-500">
            An estimate of the candidate set, capped per position by this team&apos;s needs and led by league-wide add counts. The server builds its own
            from the bundled rankings sheet, so the order can differ slightly — the list it actually used is shown with the answer.
          </p>
          <ul className="mt-1 grid gap-x-4 text-xs sm:grid-cols-2">
            {preview.map((e) => (
              <li key={e.player.id} className="flex items-center gap-1.5 py-0.5">
                <span className={`pill pos-${e.player.pos}`}>{e.player.pos}</span>
                <span className="truncate text-zinc-300">{e.player.name}</span>
                {e.adds != null && <span className="shrink-0 text-zinc-500" title="Added by this many managers league-wide in 24h">+{e.adds}</span>}
              </li>
            ))}
          </ul>
        </details>
      )}

      <div>
        <div className="text-[10px] uppercase tracking-wide text-zinc-500">Roster</div>
        <ul>
          {me.players.map((p) => (
            <li key={p.id} className="flex items-center gap-2 border-b border-zinc-800/60 px-1 py-1 text-sm last:border-0">
              <span className={`pill pos-${p.pos}`}>{p.pos}</span>
              <span className="truncate">{p.name}</span>
              <span className="shrink-0 text-xs text-zinc-500">{p.team}</span>
              {p.inj && <span className="pill shrink-0 bg-amber-900/60 text-amber-200">{p.inj}</span>}
              <span className="ml-auto shrink-0 text-[10px] uppercase tracking-wide text-zinc-600">
                {startingIds.has(p.id) ? "starter" : "bench"}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

const Stat = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-md border border-zinc-800 px-2 py-1">
    <dt className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</dt>
    <dd className="truncate font-semibold">{value}</dd>
  </div>
);
