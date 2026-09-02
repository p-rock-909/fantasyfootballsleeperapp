"use client";

import { useMemo } from "react";

import type { LiveContextResult, LivePlayerNews } from "@/lib/liveContext";
import type { MatchupTeam, Startability, TeamRow } from "@/lib/lineup";

const STATUS_PILL: Record<Startability, { label: string; className: string } | null> = {
  startable: null,
  bye: { label: "BYE", className: "bg-amber-900 text-amber-200" },
  ir: { label: "IR", className: "bg-red-900 text-red-200" },
  taxi: { label: "TAXI", className: "bg-zinc-700 text-zinc-300" },
  out: { label: "OUT", className: "bg-red-900 text-red-200" },
};

function Row({ row, news: newsById }: { row: TeamRow; news: Map<string, LivePlayerNews> }) {
  const p = row.player;
  const pill = STATUS_PILL[row.status];
  const news = newsById.get(p.id);
  // Only worth showing when it adds something the Sleeper designation doesn't.
  const newsFlag = news && news.status !== "active" && news.status !== "unknown";

  return (
    <li className="flex items-center gap-2 border-b border-zinc-800/60 px-2 py-1 text-sm last:border-0">
      {row.slot && <span className="w-16 shrink-0 text-[10px] uppercase tracking-wide text-zinc-500">{row.slot}</span>}
      <span className={`pill pos-${p.pos}`}>{p.pos}</span>
      <span className="truncate">{p.name}</span>
      <span className="shrink-0 text-xs text-zinc-500">{p.team}</span>
      {pill && <span className={`pill shrink-0 ${pill.className}`}>{pill.label}</span>}
      {!pill && p.inj && <span className="pill shrink-0 bg-amber-900/60 text-amber-200">{p.inj}</span>}
      {newsFlag && (
        <span
          className={`pill shrink-0 ${news.confirmed ? "bg-red-900 text-red-200" : "bg-zinc-700 text-zinc-300"}`}
          title={`${news.note}${news.practice ? ` · practice: ${news.practice}` : ""}${news.confirmed ? "" : " · unconfirmed"}`}
        >
          {news.status}{news.confirmed ? "" : "?"}
        </span>
      )}
      {row.points != null && <span className="ml-auto shrink-0 tabular-nums text-zinc-300">{row.points.toFixed(1)}</span>}
    </li>
  );
}

function TeamColumn({ team, news, selected, onSelect }: { team: MatchupTeam; news: Map<string, LivePlayerNews>; selected: boolean; onSelect: () => void }) {
  return (
    <div className={`card min-w-0 ${selected ? "border-emerald-600" : ""}`}>
      <div className="mb-2 flex items-center gap-2">
        <button
          className={`btn ${selected ? "btn-primary" : "btn-ghost"} !py-1`}
          onClick={onSelect}
          aria-pressed={selected}
          title="Optimize this team's lineup"
        >
          {selected ? "Optimizing" : "Optimize"}
        </button>
        <div className="min-w-0">
          <div className="truncate font-semibold">{team.name}</div>
          {team.record && <div className="text-xs text-zinc-500">{team.record}</div>}
        </div>
        {team.points != null && <span className="ml-auto text-lg font-bold tabular-nums">{team.points.toFixed(1)}</span>}
      </div>

      {team.unsupportedSlots.length > 0 && (
        <p className="mb-2 rounded border border-amber-900 bg-amber-950/40 px-2 py-1 text-xs text-amber-200">
          This league has {team.unsupportedSlots.length} slot{team.unsupportedSlots.length > 1 ? "s" : ""} the assistant doesn&apos;t
          support ({team.unsupportedSlots.join(", ")}). Those players aren&apos;t shown and aren&apos;t part of the recommendation.
        </p>
      )}

      <div className="text-[10px] uppercase tracking-wide text-zinc-500">Starters</div>
      <ul className="mb-3">
        {team.starters.length ? team.starters.map((r) => <Row key={`${r.slot}-${r.player.id}`} row={r} news={news} />) : <li className="px-2 py-1 text-sm text-zinc-600">No lineup set.</li>}
      </ul>

      <div className="text-[10px] uppercase tracking-wide text-zinc-500">Bench</div>
      <ul>
        {team.bench.length ? team.bench.map((r) => <Row key={r.player.id} row={r} news={news} />) : <li className="px-2 py-1 text-sm text-zinc-600">Empty.</li>}
      </ul>
    </div>
  );
}

export default function MatchupCompare({
  me,
  opponent,
  live,
  myRosterId,
  onSelectSide,
}: {
  me: MatchupTeam;
  opponent: MatchupTeam | null;
  live: LiveContextResult | null;
  myRosterId: number | null;
  onSelectSide: (rosterId: number) => void;
}) {
  // One lookup table instead of a linear scan of the news list per rendered row.
  const news = useMemo(() => new Map((live?.players ?? []).map((n) => [n.player_id, n])), [live]);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <TeamColumn team={me} news={news} selected={myRosterId === me.rosterId} onSelect={() => onSelectSide(me.rosterId)} />
      {opponent ? (
        <TeamColumn team={opponent} news={news} selected={myRosterId === opponent.rosterId} onSelect={() => onSelectSide(opponent.rosterId)} />
      ) : (
        <div className="card flex items-center justify-center text-sm text-zinc-500">
          No opponent this week — this team is on a bye.
        </div>
      )}
    </div>
  );
}
