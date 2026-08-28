import { NextResponse } from "next/server";
import { trimPlayers } from "@/lib/players";
import { SLEEPER_BASE } from "@/lib/sleeper";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Trimmed player pool. CDN-cached for 24h (Sleeper asks for at most one players call per day). */
export async function GET() {
  const res = await fetch(`${SLEEPER_BASE}/players/nfl`, { cache: "no-store" });
  if (!res.ok) return NextResponse.json({ error: `Sleeper players -> ${res.status}` }, { status: 502 });
  const raw = await res.json();
  const players = trimPlayers(raw);
  return NextResponse.json(
    { at: Date.now(), players },
    { headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=3600" } },
  );
}
