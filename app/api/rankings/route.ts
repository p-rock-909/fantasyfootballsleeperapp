import { NextResponse } from "next/server";
import { DEFAULT_RANKINGS_PATH, defaultRankingsCsv } from "@/lib/defaultRankings";

export const dynamic = "force-dynamic";

/**
 * The rankings template bundled with the app, as raw CSV. The browser parses it with
 * its own player pool (same path as an imported file) when nothing has been imported.
 * CDN-cached for 24h — it only changes on deploy.
 */
export async function GET() {
  const csv = await defaultRankingsCsv();
  if (!csv) return NextResponse.json({ csv: null, source: DEFAULT_RANKINGS_PATH });
  return NextResponse.json(
    { csv, source: DEFAULT_RANKINGS_PATH },
    { headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=3600" } },
  );
}
