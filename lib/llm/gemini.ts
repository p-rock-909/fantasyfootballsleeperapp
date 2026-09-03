import { ApiError, GoogleGenAI, ThinkingLevel, type FinishReason } from "@google/genai";
import { z } from "zod";
import { LlmError, type Effort, type LlmProvider, type LlmRequest, type LlmResult } from "./types";

const MODEL = process.env.GEMINI_MODEL || "gemini-pro-latest";

// `z.number().int()` emits JavaScript's safe-integer range as `minimum`/`maximum`. It is
// valid JSON Schema and useless to a model, and it is one of the two constructs that
// separated the schemas Gemini accepted from the ones it rejected with a bare
// `400 INVALID_ARGUMENT`. Stripped rather than avoided in the schema, so `.int()` keeps
// doing its job when the answer is parsed.
const SAFE_INT_MAX = Number.MAX_SAFE_INTEGER;

/**
 * Rewrite the parts of zod's JSON Schema that Gemini will not take.
 *
 * Two rewrites, both narrow:
 *  - Drop the safe-integer bounds described above.
 *  - Collapse `anyOf: [X, {type: "null"}]` — what zod emits for a *constrained* nullable
 *    like `z.number().min(0).max(100).nullable()` — into `type: [..., "null"]`, which is
 *    what it emits for a plain `.nullable()` and what the start/sit feature has been
 *    sending successfully all along.
 *
 * Both are shape-preserving: the same documents validate before and after.
 */
function forGemini(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(forGemini);
  if (!node || typeof node !== "object") return node;

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (key === "properties" && value && typeof value === "object") {
      out.properties = Object.fromEntries(Object.entries(value).map(([n, child]) => [n, forGemini(child)]));
    } else {
      out[key] = forGemini(value);
    }
  }

  if (out.type === "integer" && out.minimum === -SAFE_INT_MAX && out.maximum === SAFE_INT_MAX) {
    delete out.minimum;
    delete out.maximum;
  }

  const branches = out.anyOf;
  if (Array.isArray(branches) && branches.length === 2) {
    const nullAt = branches.findIndex((b) => (b as Record<string, unknown>)?.type === "null");
    const other = branches[1 - nullAt] as Record<string, unknown> | undefined;
    if (nullAt !== -1 && other && typeof other.type === "string") {
      delete out.anyOf;
      Object.assign(out, other, { type: [other.type, "null"] });
    }
  }

  return out;
}

/**
 * The schema as Gemini's `responseJsonSchema` wants it: zod's output minus the `$schema`
 * key it rejects, and minus the two constructs in `forGemini` above.
 *
 * Cheap enough to do per call: microseconds against a request that takes a minute.
 */
export function geminiJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const json = z.toJSONSchema(schema) as Record<string, unknown>;
  delete json.$schema;
  return forGemini(json) as Record<string, unknown>;
}

// Claude takes the effort level directly; Gemini's nearest equivalent is a thinking level.
// This mapping assumes a Gemini 3+ model — older models want `thinkingBudget` instead.
const THINKING_LEVEL: Record<Effort, ThinkingLevel> = {
  low: ThinkingLevel.LOW,
  medium: ThinkingLevel.MEDIUM,
  high: ThinkingLevel.HIGH,
};

// Unlike Anthropic's max_tokens, this budget is shared with the thinking tokens, so it has to
// clear both the reasoning and an 8k answer or a deep run ends as MAX_TOKENS mid-JSON.
const MAX_OUTPUT_TOKENS = 32000;

const REFUSAL_REASONS = new Set<string>(["SAFETY", "RECITATION", "BLOCKLIST", "PROHIBITED_CONTENT", "SPII", "IMAGE_SAFETY"]);

export const geminiProvider: LlmProvider = {
  name: "gemini",

  configError() {
    return process.env.GEMINI_API_KEY ? null : "GEMINI_API_KEY is not set on the server.";
  },

  async recommend<T>({ system, user, effort, schema }: LlmRequest<T>): Promise<LlmResult<T>> {
    const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    try {
      const response = await client.models.generateContent({
        model: MODEL,
        contents: user,
        config: {
          systemInstruction: system,
          maxOutputTokens: MAX_OUTPUT_TOKENS,
          responseMimeType: "application/json",
          responseJsonSchema: geminiJsonSchema(schema),
          thinkingConfig: { thinkingLevel: THINKING_LEVEL[effort] },
        },
      });

      const finish = response.candidates?.[0]?.finishReason as FinishReason | undefined;
      if (finish && REFUSAL_REASONS.has(finish)) {
        throw new LlmError("Gemini declined this request.", 502, { finishReason: finish, promptFeedback: response.promptFeedback });
      }
      const text = response.text;
      // MAX_TOKENS, an empty candidate, or JSON that misses the schema all land the user in the
      // same place: no usable answer, worth retrying at lower effort.
      const parsed = finish === "MAX_TOKENS" || !text ? null : schema.safeParse(safeJson(text));
      if (!parsed?.success) {
        throw new LlmError("Gemini's answer was cut off or unparseable; try again (or lower effort).", 502, {
          finishReason: finish,
          issues: parsed?.error.issues,
        });
      }

      const usage = response.usageMetadata;
      return {
        parsed: parsed.data,
        model: response.modelVersion || MODEL,
        usage: {
          inputTokens: usage?.promptTokenCount ?? 0,
          outputTokens: usage?.candidatesTokenCount ?? 0,
          thinkingTokens: usage?.thoughtsTokenCount,
          cachedInputTokens: usage?.cachedContentTokenCount,
        },
      };
    } catch (e) {
      if (e instanceof LlmError) throw e;
      if (e instanceof ApiError) {
        if (e.status === 401 || e.status === 403) throw new LlmError("Gemini API key rejected.", 500);
        if (e.status === 429) throw new LlmError("Gemini rate limit hit; retry in a few seconds.", 429);
        // A 400 here is almost always the response schema, and Gemini's message names no
        // field — so the schema goes in `detail`, where the panel's Raw view shows it.
        // Diagnosing this without that meant guessing which construct it disliked.
        if (e.status === 400) {
          throw new LlmError(
            "Gemini rejected the request, usually the response schema rather than anything you did.",
            502,
            { geminiMessage: e.message, sentSchema: geminiJsonSchema(schema) },
          );
        }
        throw new LlmError(`Gemini API error ${e.status}: ${e.message}`, 502);
      }
      throw new LlmError((e as Error).message, 500);
    }
  },
};

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
