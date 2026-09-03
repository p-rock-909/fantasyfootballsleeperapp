/**
 * Find out which JSON Schema construct Gemini rejects, by asking it.
 *
 * The waiver run fails with a bare `400 INVALID_ARGUMENT` that names no field, and three
 * attempts to identify the cause by reading the emitted schema were all wrong. This sends
 * a series of tiny schemas, each isolating ONE construct, and reports which are accepted.
 * The first failure is the answer.
 *
 *   GEMINI_API_KEY=... npm run probe-schema
 *
 * Every call is a few tokens against a one-word prompt, so the whole run is negligible.
 */

import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { geminiJsonSchema } from "../lib/llm/gemini";
import { MatchupRecommendation, RecommendationResponse, TradeEvaluation, WaiverRecommendation } from "../lib/schema";
import { LiveContext } from "../lib/liveContext";

const KEY = process.env.GEMINI_API_KEY;
if (!KEY) {
  console.error("Set GEMINI_API_KEY. In Vercel: Settings -> Environment Variables.");
  process.exit(1);
}
const MODEL = process.env.GEMINI_MODEL || "gemini-pro-latest";
const client = new GoogleGenAI({ apiKey: KEY });

/** One construct, isolated. `expect` records what the codebase currently assumes. */
interface Probe {
  name: string;
  schema: z.ZodType;
  expect: "pass" | "fail" | "unknown";
}

const str = z.string();
const many = (n: number) => z.object(Object.fromEntries(Array.from({ length: n }, (_, i) => [`f${i}`, str])));

const probes: Probe[] = [
  // Controls. If either of these fails, the problem is not the schema at all.
  { name: "CONTROL a single string field", schema: z.object({ a: str }), expect: "pass" },
  { name: "CONTROL RecommendationResponse (draft, works in prod)", schema: RecommendationResponse, expect: "pass" },
  { name: "CONTROL MatchupRecommendation (start/sit, works in prod)", schema: MatchupRecommendation, expect: "pass" },

  // The constructs the waiver schema is the first to use.
  { name: "integer type", schema: z.object({ a: z.number().int() }), expect: "unknown" },
  { name: "enum, single word (proven elsewhere)", schema: z.object({ a: z.enum(["alpha", "beta"]) }), expect: "pass" },
  { name: "enum, value with a SPACE", schema: z.object({ a: z.enum(["one week", "two weeks"]) }), expect: "unknown" },
  { name: "enum, value with a HYPHEN", schema: z.object({ a: z.enum(["one-week", "two-week"]) }), expect: "unknown" },
  { name: "enum, value with SPACE AND HYPHEN (as shipped)", schema: z.object({ a: z.enum(["multi-week replacement", "one-week stream"]) }), expect: "unknown" },
  { name: "number with minimum/maximum", schema: z.object({ a: z.number().min(0).max(100) }), expect: "pass" },
  { name: "array with maxItems only", schema: z.object({ a: z.array(str).max(6) }), expect: "unknown" },
  { name: "array with minItems and maxItems", schema: z.object({ a: z.array(str).min(1).max(5) }), expect: "pass" },
  { name: "array of objects (depth 3)", schema: z.object({ a: z.array(z.object({ b: str })) }), expect: "pass" },
  { name: "array of objects containing an array of objects (depth 5)", schema: z.object({ a: z.array(z.object({ b: z.array(z.object({ c: str })) })) }), expect: "unknown" },
  { name: "object with 24 properties", schema: z.object({ a: many(24) }), expect: "unknown" },
  { name: "object with 40 properties", schema: z.object({ a: many(40) }), expect: "unknown" },

  // The real ones.
  { name: "LiveContext (news lookup — non-fatal, so failure is invisible in the app)", schema: LiveContext, expect: "unknown" },
  { name: "TradeEvaluation", schema: TradeEvaluation, expect: "unknown" },
  { name: "WaiverRecommendation (the one that 400s)", schema: WaiverRecommendation, expect: "fail" },
];

const check = async (schema: z.ZodType): Promise<string | null> => {
  try {
    await client.models.generateContent({
      model: MODEL,
      contents: "Return an example.",
      config: { maxOutputTokens: 200, responseMimeType: "application/json", responseJsonSchema: geminiJsonSchema(schema) },
    });
    return null;
  } catch (e) {
    const m = (e as Error).message ?? String(e);
    // A token/finish-reason complaint means the schema was accepted and only the answer
    // was cut off, which is a pass for our purposes.
    return /INVALID_ARGUMENT|invalid argument|400/i.test(m) ? m.replace(/\s+/g, " ").slice(0, 160) : null;
  }
};

console.log(`model: ${MODEL}\n`);
const failures: string[] = [];
for (const p of probes) {
  const err = await check(p.schema);
  const state = err ? "REJECTED" : "accepted";
  const surprise = (p.expect === "pass" && err) || (p.expect === "fail" && !err) ? "   <-- NOT WHAT THE CODE ASSUMES" : "";
  console.log(`${state.padEnd(9)} ${p.name}${surprise}`);
  if (err) failures.push(`${p.name}: ${err}`);
}

console.log(
  failures.length
    ? `\nRejected ${failures.length}. The smallest one that failed is the culprit:\n` + failures.map((f) => `  - ${f}`).join("\n")
    : "\nEverything was accepted — the 400 is not the response schema. Look at the request instead.",
);
