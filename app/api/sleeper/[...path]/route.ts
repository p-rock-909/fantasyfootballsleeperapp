import { NextResponse } from "next/server";
import { SLEEPER_BASE } from "@/lib/sleeper";

export const dynamic = "force-dynamic";

// Read-only allowlist of Sleeper paths we proxy (keeps this from becoming an open proxy).
const ALLOWED = [
  /^user\/[^/]+$/,
  /^user\/\d+\/leagues\/nfl\/\d{4}$/,
  /^user\/\d+\/drafts\/nfl\/\d{4}$/,
  /^league\/\d+$/,
  /^league\/\d+\/drafts$/,
  /^league\/\d+\/rosters$/,
  /^league\/\d+\/users$/,
  /^draft\/\d+$/,
  /^draft\/\d+\/picks$/,
  /^draft\/\d+\/traded_picks$/,
  /^state\/nfl$/,
  /^players\/nfl\/trending\/(add|drop)$/,
];

export async function GET(request: Request, ctx: RouteContext<"/api/sleeper/[...path]">) {
  const { path } = await ctx.params;
  const joined = path.join("/");
  if (!ALLOWED.some((re) => re.test(joined))) return NextResponse.json({ error: "path not allowed" }, { status: 400 });
  const qs = new URL(request.url).search;
  const res = await fetch(`${SLEEPER_BASE}/${joined}${qs}`, { cache: "no-store", headers: { accept: "application/json" } });
  if (!res.ok) return NextResponse.json({ error: `Sleeper -> ${res.status}` }, { status: res.status });
  const data = await res.json();
  if (data === null) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
}
