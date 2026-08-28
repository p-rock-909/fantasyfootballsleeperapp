"use client";

import { useMemo, useState } from "react";
import type { Player } from "@/lib/sleeper";
import { parseRankings, type ParsedRankings, type RankingRow } from "@/lib/rankings";
import { loadRankingsCsv, saveRankings, saveRankingsCsv } from "@/lib/storage";
import type { Template } from "./DraftBoard";

export default function RankingsImport({ players, template, onChange, onClose }: { players: Player[]; template: Template | null; onChange: (rows: RankingRow[] | null) => void; onClose: () => void }) {
  const [csv, setCsv] = useState(() => loadRankingsCsv());
  const [result, setResult] = useState<ParsedRankings | null>(null);
  const [err, setErr] = useState<string | null>(null);
  // Looking at the template never touches the active rankings — it only opens a viewer.
  const [view, setView] = useState<"none" | "table" | "raw">("none");
  const [filter, setFilter] = useState("");

  const shown = useMemo(() => {
    const rows = template?.rows ?? [];
    const q = filter.trim().toLowerCase();
    return q ? rows.filter((r) => r.name.toLowerCase().includes(q) || (r.team ?? "").toLowerCase() === q || (r.pos ?? "").toLowerCase() === q) : rows;
  }, [template, filter]);

  function run() {
    setErr(null);
    try {
      const r = parseRankings(csv, players);
      setResult(r);
      saveRankings(r.rows); saveRankingsCsv(csv);
      onChange(r.rows);
    } catch (e) { setErr((e as Error).message); }
  }
  function clear() {
    setCsv(""); setResult(null); saveRankings(null); saveRankingsCsv(""); onChange(null);
  }
  async function onFile(f: File | undefined) {
    if (!f) return;
    setCsv(await f.text());
  }
  /** Copy the template into the editor so it can be tweaked and imported as your own. */
  function loadIntoEditor() {
    if (!template) return;
    if (csv.trim() && !confirm("Replace what's in the editor with the template?")) return;
    setCsv(template.csv);
    setView("none");
  }

  return (
    <div className="border-b border-zinc-800 bg-zinc-900 px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-semibold">Import rankings / ADP (CSV)</h2>
        <span className="text-xs text-zinc-500">The bundled <code className="rounded bg-zinc-800 px-1">content/rankings-template.csv</code> is loaded by default — import to replace it, Clear to go back to it. Export from FantasyPros, ESPN, or Sleeper ADP; needs a name column, rank, ADP, tier, bye, projections and position are auto-detected.</span>
        <div className="ml-auto flex items-center gap-2">
          <button
            className="btn btn-ghost"
            disabled={!template}
            title={template ? "Show the rankings that ship with the app" : "No template deployed with this build"}
            onClick={() => setView(view === "none" ? "table" : "none")}
          >
            {view === "none" ? "View template" : "Hide template"}
          </button>
          <button className="btn btn-ghost" onClick={onClose}>Close</button>
        </div>
      </div>

      {view !== "none" && template && (
        <div className="mt-3 rounded-md border border-sky-900 bg-sky-950/30 p-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-sky-200">
              Bundled default · <code className="rounded bg-zinc-800 px-1">{template.source}</code> · {template.rows.length} players
            </span>
            <input
              className="input !w-auto !py-1 text-xs"
              placeholder="Filter by player, team or position…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
            <div className="ml-auto flex gap-2">
              <button className="btn btn-ghost !py-1 text-xs" onClick={() => setView(view === "table" ? "raw" : "table")}>{view === "table" ? "Raw CSV" : "Table"}</button>
              <button className="btn btn-ghost !py-1 text-xs" onClick={loadIntoEditor}>Load into editor</button>
            </div>
          </div>

          {view === "table" ? (
            <div className="mt-2 max-h-72 overflow-auto rounded border border-zinc-800">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-zinc-900 text-zinc-400">
                  <tr>
                    <th className="px-2 py-1">RK</th>
                    <th className="px-2 py-1">Tier</th>
                    <th className="px-2 py-1">Player</th>
                    <th className="px-2 py-1">Pos</th>
                    <th className="px-2 py-1">Team</th>
                    <th className="px-2 py-1">Bye</th>
                    <th className="px-2 py-1">ADP</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r) => (
                    <tr key={r.playerId ?? r.name} className="border-t border-zinc-800/70">
                      <td className="px-2 py-1 text-zinc-400">{r.rank ?? ""}</td>
                      <td className="px-2 py-1 text-zinc-400">{r.tier ?? ""}</td>
                      <td className="px-2 py-1 text-zinc-200">{r.name}</td>
                      <td className="px-2 py-1"><span className={`pill pos-${r.pos}`}>{r.pos}{r.posRank ?? ""}</span></td>
                      <td className="px-2 py-1 text-zinc-400">{r.team ?? ""}</td>
                      <td className="px-2 py-1 text-zinc-400">{r.bye ?? ""}</td>
                      <td className="px-2 py-1 text-zinc-400">{r.adp ?? "—"}</td>
                    </tr>
                  ))}
                  {shown.length === 0 && (
                    <tr><td className="px-2 py-2 text-zinc-500" colSpan={7}>No player matches “{filter}”.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            <pre className="mt-2 max-h-72 overflow-auto rounded border border-zinc-800 bg-zinc-950 p-2 font-mono text-[10px] leading-tight text-zinc-400">{template.csv}</pre>
          )}
        </div>
      )}

      <div className="mt-2 grid gap-2 md:grid-cols-[1fr_auto]">
        <textarea className="input h-32 font-mono text-xs" placeholder={"RK,Player,Pos,Team,ADP,Tier,Bye\n1,Bijan Robinson,RB1,ATL,1.2,1,5\n..."} value={csv} onChange={(e) => setCsv(e.target.value)} />
        <div className="flex flex-col gap-2">
          <label className="btn btn-ghost cursor-pointer">Choose file<input type="file" accept=".csv,.tsv,.txt" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} /></label>
          <button className="btn btn-primary" disabled={!csv.trim()} onClick={run}>Import</button>
          <button className="btn btn-ghost" onClick={clear}>Clear</button>
        </div>
      </div>
      {err && <div className="mt-2 text-sm text-red-300">{err}</div>}
      {result && (
        <div className="mt-2 text-xs text-zinc-300">
          Matched <b className="text-emerald-300">{result.matched}</b> of {result.rows.length} rows to Sleeper players.
          {" "}Columns: {Object.entries(result.columns).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join(", ")}
          {result.unmatched.length > 0 && (
            <details className="mt-1">
              <summary className="cursor-pointer text-amber-300">{result.unmatched.length} unmatched (usually retired/free agents — harmless)</summary>
              <div className="mt-1 max-h-24 overflow-auto text-zinc-500">{result.unmatched.map((r) => `${r.name}${r.pos ? ` (${r.pos})` : ""}`).join(", ")}</div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
