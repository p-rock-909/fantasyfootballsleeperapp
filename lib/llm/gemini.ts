import { ApiError, GoogleGenAI, ThinkingLevel, type FinishReason } from "@google/genai";
import { z } from "zod";
import { LlmError, type Effort, type LlmProvider, type LlmRequest, type LlmResult } from "./types";

const MODEL = process.env.GEMINI_MODEL || "gemini-pro-latest";

/**
 * Everything zod emits (types, required, min/max, minItems/maxItems, descriptions) is
 * inside the dialect Gemini accepts — except the `$schema` key, which it rejects.
 * Cheap enough to do per call: microseconds against a request that takes a minute.
 */
export function geminiJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const json = z.toJSONSchema(schema) as Record<string, unknown>;
  delete json.$schema;
  return json;
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
