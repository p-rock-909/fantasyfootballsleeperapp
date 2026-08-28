"use client";

import { useState } from "react";
import type { Player } from "@/lib/sleeper";
import { parseRankings, type ParsedRankings, type RankingRow } from "@/lib/rankings";
import { loadRankingsCsv, saveRankings, saveRankingsCsv } from "@/lib/storage";

export default function RankingsImport({ players, onChange, onClose }: { players: Player[]; onChange: (rows: RankingRow[] | null) => void; onClose: () => void }) {
  const [csv, setCsv] = useState(() => loadRankingsCsv());
  const [result, setResult] = useState<ParsedRankings | null>(null);
  const [err, setErr] = useState<string | null>(null);

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

  return (
    <div className="border-b border-zinc-800 bg-zinc-900 px-4 py-3">
      <div className="flex items-center gap-2">
        <h2 className="font-semibold">Import rankings / ADP (CSV)</h2>
        <span className="text-xs text-zinc-500">The bundled <code className="rounded bg-zinc-800 px-1">content/rankings-template.csv</code> is loaded by default — import to replace it, Clear to go back to it. Export from FantasyPros, ESPN, or Sleeper ADP; needs a name column, rank, ADP, tier, bye, projections and position are auto-detected.</span>
        <button className="btn btn-ghost ml-auto" onClick={onClose}>Close</button>
      </div>
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
