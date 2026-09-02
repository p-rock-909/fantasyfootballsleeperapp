import { NextResponse, type NextRequest } from "next/server";

/**
 * Optional cost guard: if APP_PASSWORD is set in the environment, the routes that spend
 * model tokens require a matching `x-app-password` header (the UI sends the value saved
 * in Settings). Every new model-calling route belongs in the matcher below.
 */
export function proxy(request: NextRequest) {
  const required = process.env.APP_PASSWORD;
  if (!required) return NextResponse.next();
  if (request.headers.get("x-app-password") === required) return NextResponse.next();
  return NextResponse.json({ error: "Password required. Set it in Settings (gear icon)." }, { status: 401 });
}

export const config = { matcher: ["/api/recommend", "/api/matchup/recommend"] };
