import assert from "node:assert/strict";
import { test } from "node:test";
import { z } from "zod";
import { LiveContext } from "./liveContext";
import { MatchupRecommendation, RecommendationResponse, TradeEvaluation, TradeProposals, WaiverRecommendation } from "./schema";

/**
 * The JSON Schema keywords Gemini's `responseJsonSchema` documents as supported,
 * copied from node_modules/@google/genai/dist/genai.d.ts (the `responseJsonSchema`
 * doc comment on GenerationConfig). Anything else is silently ignored at best and
 * a 400 at worst.
 */
const SUPPORTED = new Set([
  "$id", "$defs", "$ref", "$anchor",
  "type", "format", "title", "description", "enum",
  "items", "prefixItems", "minItems", "maxItems",
  "minimum", "maximum",
  "anyOf", "oneOf",
  "properties", "additionalProperties", "required",
  "propertyOrdering",
]);

/** Every keyword used anywhere in the emitted schema, ignoring property *names*. */
function keywordsIn(node: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(node)) {
    for (const child of node) keywordsIn(child, out);
    return out;
  }
  if (!node || typeof node !== "object") return out;
  for (const [key, value] of Object.entries(node)) {
    out.add(key);
    // Under `properties`, the keys are the caller's field names, not keywords.
    if (key === "properties" && value && typeof value === "object") {
      for (const child of Object.values(value)) keywordsIn(child, out);
    } else {
      keywordsIn(value, out);
    }
  }
  return out;
}

const SCHEMAS: [string, z.ZodType][] = [
  ["RecommendationResponse", RecommendationResponse],
  ["MatchupRecommendation", MatchupRecommendation],
  ["LiveContext", LiveContext],
  ["WaiverRecommendation", WaiverRecommendation],
  ["TradeEvaluation", TradeEvaluation],
  ["TradeProposals", TradeProposals],
];

for (const [name, schema] of SCHEMAS) {
  test(`${name} converts to JSON Schema without throwing`, () => {
    assert.doesNotThrow(() => z.toJSONSchema(schema));
  });

  test(`${name} uses only JSON Schema keywords Gemini supports`, () => {
    const json = z.toJSONSchema(schema) as Record<string, unknown>;
    delete json.$schema; // stripped before the call by geminiJsonSchema()
    const unsupported = [...keywordsIn(json)].filter((k) => !SUPPORTED.has(k)).sort();
    assert.deepEqual(
      unsupported,
      [],
      `${name} emits unsupported keyword(s): ${unsupported.join(", ")}. ` +
        `z.record() emits "propertyNames" and z.tuple() emits "items: false" — use an array of ` +
        `{key, value} objects or z.array().min().max() instead.`,
    );
  });
}

// Guards the two constructs that are easy to reach for and silently break the Gemini path.
test("the keyword check actually catches z.record and z.tuple", () => {
  const withRecord = z.object({ totals: z.record(z.string(), z.number()) });
  const withTuple = z.object({ pair: z.tuple([z.string(), z.string()]) });
  assert.ok(keywordsIn(z.toJSONSchema(withRecord)).has("propertyNames"));
  assert.ok([...keywordsIn(z.toJSONSchema(withTuple))].includes("prefixItems"));
  assert.equal((z.toJSONSchema(withTuple).properties?.pair as { items?: unknown })?.items, false);
});

/**
 * Every array in a response schema needs an upper bound.
 *
 * `MAX_OUTPUT_TOKENS` in lib/llm/gemini.ts is shared with the thinking budget, so an
 * unbounded list of richly-described objects is the likeliest way one of these calls ends
 * as truncated JSON — which reaches the user as "the answer was cut off" after a long
 * wait. Only the newer schemas are checked: the two original ones predate this rule and
 * bounding them is a behaviour change, not a test fix.
 */
function unboundedArrays(node: unknown, path = "$", out: string[] = []): string[] {
  if (Array.isArray(node)) {
    node.forEach((child, i) => unboundedArrays(child, `${path}[${i}]`, out));
    return out;
  }
  if (!node || typeof node !== "object") return out;
  const obj = node as Record<string, unknown>;
  if (obj.type === "array" && obj.maxItems === undefined) out.push(path);
  for (const [key, value] of Object.entries(obj)) {
    if (key === "properties" && value && typeof value === "object") {
      for (const [name, child] of Object.entries(value)) unboundedArrays(child, `${path}.${name}`, out);
    } else {
      unboundedArrays(value, `${path}.${key}`, out);
    }
  }
  return out;
}

for (const [name, schema] of [
  ["WaiverRecommendation", WaiverRecommendation],
  ["TradeEvaluation", TradeEvaluation],
  ["TradeProposals", TradeProposals],
] as [string, z.ZodType][]) {
  test(`${name} bounds every array it can return`, () => {
    const unbounded = unboundedArrays(z.toJSONSchema(schema));
    assert.deepEqual(unbounded, [], `${name} has unbounded array(s) at: ${unbounded.join(", ")}. Add .max(n).`);
  });
}

test("the unbounded-array check actually catches a missing .max()", () => {
  assert.deepEqual(unboundedArrays(z.toJSONSchema(z.object({ xs: z.array(z.string()) }))), ["$.xs"]);
  assert.deepEqual(unboundedArrays(z.toJSONSchema(z.object({ xs: z.array(z.string()).max(3) }))), []);
});
