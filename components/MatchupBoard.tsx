"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { api, getPlayers } from "@/lib/client";
import { byeForTeam } from "@/lib/players";
import { mergeRankings, type RankedPlayer, type RankingRow } from "@/lib/rankings";
import { buildTeam, matchupPhase, orderedSlots, pairMatchups, rosterOwnerIds, teamName } from "@/lib/lineup";
import {
  formatFromLeague,
  type Player,
  type SleeperLeague,
  type SleeperMatchup,
  type SleeperRoster,
  type SleeperState,
  type SleeperUser,
} from "@/lib/sleeper";
import { appendMatchupLog, clearMatchupLog, loadRankings, newRecId, updateSettings, useMatchupLog, useSettings, type Settings } from "@/lib/storage";
import MatchupCompare from "./MatchupCompare";
import MatchupRecommendationPanel, { type MatchupRecState } from "./MatchupRecommendationPanel";

const WEEKS = Array.from({ length: 18 }, (_, i) => i + 1);
const IDLE: MatchupRecState = { loading: false, stage: null, data: null, liveContext: null, validation: null, error: null, meta: null, id: null };

export default function MatchupBoard({ leagueId }: { leagueId: string }) {
  const [settings] = useSettings();
  const [league, setLeague] = useState<SleeperLeague | null>(null);
  const [users, setUsers] = useState<SleeperUser[]>([]);
  const [rosters, setRosters] = useState<SleeperRoster[]>([]);
  const [state, setState] = useState<SleeperState | null>(null);
  const [players, setPlayers] = useState<Player[] | null>(null);
  const [rankings, setRankings] = useState<RankingRow[] | null>(null);
  const [week, setWeek] = useState<number | null>(null);
  // Stamped with the week it belongs to, so a stale response can't be read as the new week's.
  const [fetched, setFetched] = useState<{ week: number; rows: SleeperMatchup[] } | null>(null);
  // Null means "no explicit choice yet" — the defaults below fill in.
  const [pickedKey, setPickedKey] = useState<string | null>(null);
  const [pickedRosterId, setPickedRosterId] = useState<number | null>(null);
  const [rec, setRec] = useState<MatchupRecState>(IDLE);
  const [question, setQuestion] = useState("");
  const [refreshNews, setRefreshNews] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const history = useMatchupLog(leagueId, week ?? 0);

  // League-level data, once.
  useEffect(() => {
    (async () => {
      try {
        const [l, u, r, s, pl] = await Promise.all([
          api.league(leagueId), api.leagueUsers(leagueId), api.rosters(leagueId), api.state(), getPlayers(),
        ]);
        setLeague(l); setUsers(u); setRosters(r); setState(s); setPlayers(pl);
        setRankings(loadRankings());
        updateSettings({ leagueId });
        // `display_week` is what Sleeper's own UI shows; it lags `week` for a day after a week ends.
        setWeek(Math.min(18, Math.max(1, s.display_week ?? s.week ?? 1)));
      } catch (e) { setErr((e as Error).message); }
    })();
  }, [leagueId]);

  // Matchups for the selected week. State is only ever set from the promise callback, so
  // switching weeks doesn't cascade a render before the fetch resolves.
  useEffect(() => {
    if (week == null) return;
    let cancelled = false;
    api.matchups(leagueId, week)
      .then((rows) => { if (!cancelled) setFetched({ week, rows }); })
      .catch(() => { if (!cancelled) setFetched({ week, rows: [] }); });
    return () => { cancelled = true; };
  }, [leagueId, week]);

  // Anything stamped with a different week is the previous week's answer, i.e. still loading.
  const matchups = fetched && fetched.week === week ? fetched.rows : null;
  const loadingWeek = matchups === null;

  const fmt = useMemo(() => (league ? formatFromLeague(league) : null), [league]);
  const { slots, unsupported } = useMemo(() => orderedSlots(league?.roster_positions), [league]);
  const ranked = useMemo(() => (players ? mergeRankings(players, rankings, byeForTeam) : []), [players, rankings]);
  const byId = useMemo(() => new Map<string, RankedPlayer>(ranked.map((p) => [p.id, p])), [ranked]);
  const userById = useMemo(() => new Map(users.map((u) => [u.user_id, u])), [users]);
  const rosterById = useMemo(() => new Map(rosters.map((r) => [r.roster_id, r])), [rosters]);
  const pairs = useMemo(() => pairMatchups(matchups), [matchups]);

  // Every roster this user can act for, co-owned ones included.
  const userId = settings?.userId ?? null;
  const myRosterIds = useMemo(
    () => new Set(userId ? rosters.filter((r) => rosterOwnerIds(r).includes(userId)).map((r) => r.roster_id) : []),
    [rosters, userId],
  );

  // Selection is derived, not synced through an effect: the user's own matchup is the
  // default, an explicit pick overrides it, and changing week clears the pick.
  const ownPair = useMemo(() => pairs.find((p) => p.rosterIds.some((id) => myRosterIds.has(id))) ?? null, [pairs, myRosterIds]);
  const matchupKey = (pickedKey && pairs.some((p) => p.key === pickedKey) ? pickedKey : null) ?? ownPair?.key ?? pairs[0]?.key ?? null;
  const pair = pairs.find((p) => p.key === matchupKey) ?? null;
  // Only default a side when the user actually owns one — never optimize a stranger's roster.
  const defaultRosterId = pair?.rosterIds.find((id) => myRosterIds.has(id)) ?? null;
  const myRosterId = (pickedRosterId != null && pair?.rosterIds.includes(pickedRosterId) ? pickedRosterId : null) ?? defaultRosterId;
  const matchupByRoster = useMemo(() => new Map((matchups ?? []).map((m) => [m.roster_id, m])), [matchups]);

  const teams = useMemo(() => {
    if (!pair || week == null) return [];
    return pair.rosterIds
      .map((id) => {
        const roster = rosterById.get(id);
        if (!roster) return null;
        return buildTeam(roster, matchupByRoster.get(id), userById, byId, slots, unsupported, week);
      })
      .filter((t): t is NonNullable<typeof t> => !!t);
  }, [pair, rosterById, matchupByRoster, userById, byId, slots, unsupported, week]);

  // The selected side first, so "optimize this one" reads left to right.
  const me = teams.find((t) => t.rosterId === myRosterId) ?? teams[0] ?? null;
  const opponent = teams.find((t) => t.rosterId !== me?.rosterId) ?? null;

  const phase = useMemo(
    () => (league && state && week != null ? matchupPhase({ week, leagueSeason: league.season, stateSeason: state.season, stateWeek: state.week, matchups }) : "pre"),
    [league, state, week, matchups],
  );

  async function evaluate() {
    if (!settings || !league || week == null || !matchupKey || myRosterId == null || !me) return;
    const id = newRecId();
    setRec({ ...IDLE, loading: true, stage: "news", id });
    // The news lookup runs first server-side; this is a rough hand-off for the label.
    const toLineup = setTimeout(() => setRec((r) => (r.id === id && r.loading ? { ...r, stage: "lineup" } : r)), 20000);
    const base = {
      id, at: Date.now(), week, matchupKey, myRosterId,
      myTeam: me.name, opponentTeam: opponent?.name ?? null,
      effort: settings.effort, question: question.trim() || null,
    };
    try {
      const res = await fetch("/api/matchup/recommend", {
        method: "POST",
        headers: { "content-type": "application/json", ...(settings.appPassword ? { "x-app-password": settings.appPassword } : {}) },
        body: JSON.stringify({
          leagueId, week, matchupKey, myRosterId,
          effort: settings.effort,
          rankings: rankings?.filter((r) => r.playerId).map((r) => ({ playerId: r.playerId, rank: r.rank, adp: r.adp, tier: r.tier, bye: r.bye, proj: r.proj, posRank: r.posRank })) ?? null,
          question: question.trim() || undefined,
          refreshNews,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      appendMatchupLog(leagueId, week, { ...base, data: body.recommendation, liveContext: body.liveContext, validation: body.validation, error: null, meta: body.meta });
      setRec({ loading: false, stage: null, data: body.recommendation, liveContext: body.liveContext, validation: body.validation, error: null, meta: body.meta, id });
      setRefreshNews(false);
    } catch (e) {
      const message = (e as Error).message;
      appendMatchupLog(leagueId, week, { ...base, data: null, liveContext: null, validation: null, error: message, meta: null });
      setRec({ ...IDLE, error: message, id });
    } finally {
      clearTimeout(toLineup);
    }
  }

  if (err) return <div className="p-6 text-red-300">{err} — <Link className="underline" href="/">back to setup</Link></div>;
  if (!league || !fmt || !players || !settings || week == null) return <div className="p-6 text-zinc-400">Loading league…</div>;

  const label = (rosterId: number) => {
    const r = rosterById.get(rosterId);
    return r ? teamName(r, userById) : `Team ${rosterId}`;
  };

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-10 border-b border-zinc-800 bg-zinc-950/95 px-4 py-2 backdrop-blur">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <Link href="/" className="text-zinc-400 hover:text-zinc-200">← Setup</Link>
          <span className="font-semibold">{league.name}</span>
          <span className="text-zinc-500">{fmt.teams} tm · {fmt.scoring}{fmt.superflex ? " · SF" : ""}{fmt.tePremium ? " · TEP" : ""} · {league.season}</span>
          <span className={`pill ${phase === "live" ? "bg-emerald-900 text-emerald-200" : phase === "final" ? "bg-zinc-800 text-zinc-300" : "bg-sky-900 text-sky-200"}`}>
            {phase === "live" ? "in progress" : phase === "final" ? "final" : "not started"}
          </span>

          <label className="flex items-center gap-1">
            <span className="text-zinc-400">Week</span>
            <select className="input !w-auto !py-1" value={week} onChange={(e) => { setWeek(Number(e.target.value)); setPickedKey(null); setPickedRosterId(null); setRec(IDLE); }}>
              {WEEKS.map((w) => (
                <option key={w} value={w}>
                  {w}{league.settings?.playoff_week_start && w >= league.settings.playoff_week_start ? " (playoffs)" : ""}
                </option>
              ))}
            </select>
          </label>

          <label className="flex min-w-0 items-center gap-1">
            <span className="text-zinc-400">Matchup</span>
            <select
              className="input !w-auto !py-1"
              value={matchupKey ?? ""}
              disabled={!pairs.length}
              onChange={(e) => { setPickedKey(e.target.value); setPickedRosterId(null); setRec(IDLE); }}
            >
              {pairs.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.isBye ? `${label(p.rosterIds[0])} (bye)` : p.rosterIds.map(label).join(" vs ")}
                  {p.rosterIds.some((id) => myRosterIds.has(id)) ? " ★" : ""}
                </option>
              ))}
            </select>
          </label>

          {settings.draftId && (
            <Link href={`/draft/${settings.draftId}`} className="ml-auto text-zinc-400 hover:text-zinc-200">Draft board →</Link>
          )}
        </div>
      </header>

      <main className="grid flex-1 gap-4 p-4 xl:grid-cols-[1.3fr_1fr]">
        <div className="min-w-0 space-y-3">
          {loadingWeek && <div className="card text-sm text-zinc-400">Loading week {week}…</div>}
          {!loadingWeek && !pairs.length && (
            <div className="card text-sm text-zinc-400">
              No week {week} schedule in this league yet. Sleeper publishes matchups once the season schedule is set — try another week.
            </div>
          )}
          {!loadingWeek && me && (
            <>
              {myRosterId == null && (
                <p className="rounded-md border border-amber-900 bg-amber-950/40 px-3 py-2 text-sm text-amber-200">
                  {myRosterIds.size === 0
                    ? "You don't own a team in this league, so nothing is preselected. Choose which side to optimize."
                    : "Choose which side of this matchup to optimize."}
                </p>
              )}
              <MatchupCompare me={me} opponent={opponent} live={rec.liveContext} myRosterId={myRosterId} onSelectSide={(id) => { setPickedRosterId(id); setRec(IDLE); }} />
            </>
          )}
        </div>

        <MatchupRecommendationPanel
          rec={rec}
          history={history}
          onEvaluate={evaluate}
          onClearHistory={() => clearMatchupLog(leagueId, week)}
          canRun={!!me && myRosterId != null && !!matchupKey}
          question={question}
          setQuestion={setQuestion}
          effort={settings.effort}
          setEffort={(effort: Settings["effort"]) => updateSettings({ effort })}
          refreshNews={refreshNews}
          setRefreshNews={setRefreshNews}
        />
      </main>
    </div>
  );
}
