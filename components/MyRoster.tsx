"use client";

import type { RankedPlayer } from "@/lib/rankings";
import type { RosterAnalysis } from "@/lib/rosterNeeds";
import type { LeagueFormat, Position, SleeperPick } from "@/lib/sleeper";

interface Props {
  roster: RankedPlayer[];
  analysis: RosterAnalysis | null;
  fmt: LeagueFormat;
  picks: SleeperPick[];
  mySlot: number | null;
  byId: Map<string, RankedPlayer>;
}

const ORDER: Position[] = ["QB", "RB", "WR", "TE", "K", "DEF"];

export default function MyRoster({ roster, analysis, fmt, picks, mySlot, byId }: Props) {
  const s = fmt.slots;
  const recent = picks.slice(-10).reverse();
  return (
    <section className="card flex max-h-[calc(100vh-7rem)] flex-col gap-3 overflow-auto">
      <div>
        <h2 className="font-semibold">My roster {mySlot ? <span className="text-zinc-500">(slot {mySlot})</span> : null}</h2>
        {!mySlot && <p className="text-xs text-amber-300">Choose your slot in the header to enable roster tracking.</p>}
        {analysis && (
          <div className="mt-2 grid grid-cols-6 gap-1 text-center text-xs">
            {ORDER.map((pos) => {
              const need = analysis.starters[pos];
              const have = analysis.counts[pos];
              return (
                <div key={pos} className={`rounded p-1 ${have < need ? "bg-amber-950/60 text-amber-200" : "bg-zinc-800 text-zinc-300"}`}>
                  <div className="font-semibold">{pos}</div>
                  <div>{have}/{need}</div>
                </div>
              );
            })}
          </div>
        )}
        {analysis && (
          <div className="mt-1 text-xs text-zinc-500">
            FLEX {s.FLEX}{s.SUPER_FLEX ? ` · SF ${s.SUPER_FLEX}` : ""} · bench open {analysis.benchOpen} · picks left {analysis.totalOpen}
          </div>
        )}
        {analysis?.byeClashes.map((c) => (
          <div key={c.bye} className="mt-1 text-xs text-amber-300">Bye {c.bye}: {c.players.join(", ")}</div>
        ))}
        <ul className="mt-2 space-y-1 text-sm">
          {ORDER.flatMap((pos) => roster.filter((p) => p.pos === pos)).map((p) => (
            <li key={p.id} className="flex items-center gap-2">
              <span className={`pill pos-${p.pos}`}>{p.pos}</span>
              <span>{p.name}</span>
              <span className="text-xs text-zinc-500">{p.team}{p.bye ? ` · bye ${p.bye}` : ""}</span>
            </li>
          ))}
          {roster.length === 0 && mySlot && <li className="text-zinc-500">No picks yet.</li>}
        </ul>
      </div>
      <div>
        <h3 className="text-sm font-semibold text-zinc-300">Recent picks</h3>
        <ul className="mt-1 space-y-0.5 text-xs">
          {recent.map((p) => {
            const rp = byId.get(p.player_id);
            const name = rp?.name ?? `${p.metadata.first_name ?? ""} ${p.metadata.last_name ?? ""}`;
            return (
              <li key={p.pick_no} className={`flex gap-2 ${p.draft_slot === mySlot ? "text-emerald-300" : "text-zinc-400"}`}>
                <span className="w-10 text-zinc-600">{p.round}.{String(p.pick_no - (p.round - 1) * fmt.teams).padStart(2, "0")}</span>
                <span className={`pill pos-${p.metadata.position ?? "K"}`}>{p.metadata.position}</span>
                <span>{name}</span>
                <span className="ml-auto text-zinc-600">slot {p.draft_slot}</span>
              </li>
            );
          })}
          {recent.length === 0 && <li className="text-zinc-500">Draft hasn&apos;t started.</li>}
        </ul>
      </div>
    </section>
  );
}
