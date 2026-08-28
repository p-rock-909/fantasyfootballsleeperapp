"use client";

import { useMemo, useState } from "react";
import type { RankedPlayer } from "@/lib/rankings";
import type { TurnInfo } from "@/lib/draftMath";
import { probGone } from "@/lib/availability";

const POS = ["ALL", "QB", "RB", "WR", "TE", "K", "DEF"] as const;

export default function AvailablePlayers({ players, turn }: { players: RankedPlayer[]; turn: TurnInfo }) {
  const [pos, setPos] = useState<(typeof POS)[number]>("ALL");
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(60);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return players.filter((p) => (pos === "ALL" || p.pos === pos) && (!needle || p.name.toLowerCase().includes(needle) || p.team.toLowerCase() === needle));
  }, [players, pos, q]);
  const nextPick = turn.onTheClock ? turn.myNextPicks[1] ?? Infinity : turn.myNextPicks[0] ?? Infinity;

  return (
    <section className="card flex max-h-[calc(100vh-7rem)] flex-col">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h2 className="font-semibold">Available <span className="text-zinc-500">({players.length})</span></h2>
        <div className="ml-auto flex gap-1">
          {POS.map((p) => (
            <button key={p} onClick={() => setPos(p)} className={`rounded px-2 py-0.5 text-xs ${pos === p ? "bg-emerald-700 text-white" : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"}`}>{p}</button>
          ))}
        </div>
      </div>
      <input className="input mb-2" placeholder="Search name or team…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-zinc-900 text-zinc-400">
            <tr>
              <th className="py-1 text-left">#</th>
              <th className="text-left">Player</th>
              <th className="text-left">Pos</th>
              <th className="text-right">ADP</th>
              <th className="text-right">Tier</th>
              <th className="text-right">Bye</th>
              <th className="text-right" title="Probability gone before your next pick">Gone</th>
            </tr>
          </thead>
          <tbody>
            {list.slice(0, limit).map((p, i) => {
              const gone = probGone(p, turn.currentPick, nextPick, i);
              return (
                <tr key={p.id} className="border-t border-zinc-800/60 hover:bg-zinc-800/40">
                  <td className="py-1 text-zinc-500">{p.rank ?? "-"}</td>
                  <td>
                    <span className="font-medium">{p.name}</span> <span className="text-zinc-500">{p.team}</span>
                    {p.inj && <span className="ml-1 text-[10px] text-red-300">{p.inj}</span>}
                  </td>
                  <td><span className={`pill pos-${p.pos}`}>{p.pos}{p.posRank ?? ""}</span></td>
                  <td className="text-right">{p.adp ?? "-"}</td>
                  <td className="text-right">{p.tier ?? "-"}</td>
                  <td className="text-right">{p.bye ?? "-"}</td>
                  <td className={`text-right ${gone > 0.7 ? "text-red-300" : gone > 0.4 ? "text-amber-300" : "text-zinc-400"}`}>{Number.isFinite(nextPick) ? `${Math.round(gone * 100)}%` : "-"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {list.length > limit && <button className="btn btn-ghost mt-2 w-full" onClick={() => setLimit(limit + 60)}>Show more</button>}
      </div>
    </section>
  );
}
