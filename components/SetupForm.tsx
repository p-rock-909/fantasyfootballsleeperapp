"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { parseSleeperId, type SleeperDraft, type SleeperLeague } from "@/lib/sleeper";
import { useSettings } from "@/lib/storage";

export default function SetupForm() {
  const router = useRouter();
  const [settings, updateSettings] = useSettings();
  const [usernameInput, setUsernameInput] = useState<string | null>(null);
  const username = usernameInput ?? settings?.username ?? "";
  const [leagues, setLeagues] = useState<SleeperLeague[]>([]);
  const [drafts, setDrafts] = useState<SleeperDraft[]>([]);
  const [season, setSeason] = useState("");
  const [direct, setDirect] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function lookup() {
    setBusy(true); setErr(null); setLeagues([]); setDrafts([]);
    try {
      const [user, state] = await Promise.all([api.user(username.trim()), api.state()]);
      const yr = state.league_season ?? state.season;
      setSeason(yr);
      const ls = await api.leagues(user.user_id, yr);
      updateSettings({ userId: user.user_id, username: user.username });
      setLeagues(ls);
      if (!ls.length) setErr(`No ${yr} leagues found for ${user.display_name}. You can still paste a draft ID below.`);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  async function chooseLeague(league: SleeperLeague) {
    setBusy(true); setErr(null);
    try {
      const ds = await api.leagueDrafts(league.league_id);
      setDrafts(ds);
      if (ds.length === 1) go(ds[0].draft_id, league.league_id);
      else if (!ds.length) setErr("This league has no draft yet.");
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  function go(draftId: string, leagueId: string | null) {
    updateSettings({ draftId, leagueId, mySlotOverride: null });
    router.push(`/draft/${draftId}`);
  }

  async function goDirect() {
    setErr(null);
    const { kind, id } = parseSleeperId(direct);
    if (!id) { setErr("Paste a Sleeper draft URL, league URL, or numeric ID."); return; }
    setBusy(true);
    try {
      if (kind === "league") {
        const ds = await api.leagueDrafts(id);
        if (!ds.length) throw new Error("No drafts found for that league.");
        go(ds[0].draft_id, id);
        return;
      }
      // draft id (or unknown numeric: try draft first, then league)
      try {
        const d = await api.draft(id);
        go(d.draft_id, d.league_id);
      } catch {
        const ds = await api.leagueDrafts(id);
        if (!ds.length) throw new Error("Not a draft or league ID.");
        go(ds[0].draft_id, id);
      }
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <div className="mt-8 space-y-6">
      {settings?.draftId && (
        <div className="card flex items-center justify-between">
          <div className="text-sm">Last draft: <span className="font-mono">{settings.draftId}</span></div>
          <button className="btn btn-primary" onClick={() => router.push(`/draft/${settings.draftId}`)}>Resume</button>
        </div>
      )}

      <section className="card space-y-3">
        <h2 className="font-semibold">1. Find your draft by Sleeper username</h2>
        <div className="flex gap-2">
          <input className="input" placeholder="Sleeper username" value={username} onChange={(e) => setUsernameInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && lookup()} />
          <button className="btn btn-primary" disabled={busy || !username.trim()} onClick={lookup}>Look up</button>
        </div>
        {leagues.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs uppercase tracking-wide text-zinc-500">{season} leagues</div>
            {leagues.map((l) => (
              // A row of two buttons, not a button inside a button — the latter is invalid HTML.
              <div key={l.league_id} className="flex w-full items-center gap-2 rounded-md border border-zinc-800 px-3 py-2 hover:border-emerald-600">
                <button className="min-w-0 flex-1 text-left" onClick={() => chooseLeague(l)}>
                  <span className="block truncate">{l.name}</span>
                  <span className="text-xs text-zinc-500">{l.total_rosters} teams · {l.status}</span>
                </button>
                <button className="btn btn-ghost shrink-0" onClick={() => chooseLeague(l)}>Draft</button>
                <button
                  className="btn btn-ghost shrink-0"
                  title="Compare this week's matchups and get a start/sit recommendation"
                  onClick={() => { updateSettings({ leagueId: l.league_id }); router.push(`/league/${l.league_id}/matchups`); }}
                >
                  Matchups
                </button>
              </div>
            ))}
          </div>
        )}
        {drafts.length > 1 && (
          <div className="space-y-2">
            <div className="text-xs uppercase tracking-wide text-zinc-500">Drafts</div>
            {drafts.map((d) => (
              <button key={d.draft_id} className="flex w-full items-center justify-between rounded-md border border-zinc-800 px-3 py-2 text-left hover:border-emerald-600" onClick={() => go(d.draft_id, d.league_id)}>
                <span>{d.metadata?.name || d.draft_id}</span>
                <span className="text-xs text-zinc-500">{d.type} · {d.status}</span>
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="card space-y-3">
        <h2 className="font-semibold">Or paste a draft / league link or ID</h2>
        <p className="text-xs text-zinc-500">Works for mock drafts too (you&apos;ll pick your slot on the board).</p>
        <div className="flex gap-2">
          <input className="input" placeholder="https://sleeper.com/draft/nfl/123456789 or 123456789" value={direct} onChange={(e) => setDirect(e.target.value)} onKeyDown={(e) => e.key === "Enter" && goDirect()} />
          <button className="btn btn-ghost" disabled={busy || !direct.trim()} onClick={goDirect}>Open</button>
        </div>
      </section>

      {err && <div className="rounded-md border border-red-900 bg-red-950/50 px-3 py-2 text-sm text-red-200">{err}</div>}
    </div>
  );
}
