"use client";

import { clearAll, type Settings } from "@/lib/storage";
import { getPlayers } from "@/lib/client";
import { useRouter } from "next/navigation";

export default function SettingsDrawer({ settings, onChange, onClose }: { settings: Settings; onChange: (p: Partial<Settings>) => void; onClose: () => void }) {
  const router = useRouter();
  return (
    <div className="border-b border-zinc-800 bg-zinc-900 px-4 py-3">
      <div className="flex items-center gap-2">
        <h2 className="font-semibold">Settings</h2>
        <button className="btn btn-ghost ml-auto" onClick={onClose}>Close</button>
      </div>
      <div className="mt-2 grid gap-4 text-sm md:grid-cols-3">
        <label className="flex flex-col gap-1">
          <span className="text-zinc-400">Auto-recommend when my pick is within</span>
          <div className="flex items-center gap-2">
            <input type="checkbox" checked={settings.autoRecommend} onChange={(e) => onChange({ autoRecommend: e.target.checked })} />
            <input type="number" min={0} max={12} className="input !w-20" value={settings.autoWithinPicks} onChange={(e) => onChange({ autoWithinPicks: Math.max(0, Number(e.target.value) || 0) })} />
            <span className="text-zinc-500">picks</span>
          </div>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-zinc-400">App password (only if APP_PASSWORD is set on the server)</span>
          <input type="password" className="input" value={settings.appPassword} onChange={(e) => onChange({ appPassword: e.target.value })} />
        </label>
        <div className="flex flex-col gap-1">
          <span className="text-zinc-400">Data</span>
          <div className="flex gap-2">
            <button className="btn btn-ghost" onClick={() => getPlayers(true).then(() => location.reload())}>Refresh player pool</button>
            <button className="btn btn-ghost" onClick={() => { clearAll(); router.push("/"); }}>Reset everything</button>
          </div>
        </div>
      </div>
      <p className="mt-2 text-xs text-zinc-500">Signed in as Sleeper user {settings.username ?? "(none)"} · Preferences are read from <code>content/preferences.md</code> in the repo.</p>
    </div>
  );
}
