import type { z } from "zod";

export type ProviderName = "gemini" | "anthropic";
export type Effort = "low" | "medium" | "high";

export interface LlmRequest<T> {
  system: string;
  user: string;
  effort: Effort;
  /** The shape the answer must take. Whatever comes back is validated against it. */
  schema: z.ZodType<T>;
}

/**
 * Token counts normalized across providers — the raw shapes disagree
 * (`input_tokens` vs `promptTokenCount`), and this is what the history panel renders.
 */
export interface LlmUsage {
  inputTokens: number;
  outputTokens: number;
  thinkingTokens?: number;
  cachedInputTokens?: number;
}

export interface LlmResult<T> {
  /** Already validated against the request's schema, whoever produced it. */
  parsed: T;
  /** The model id the provider actually served, not the one we asked for. */
  model: string;
  usage: LlmUsage;
}

export interface LlmProvider {
  readonly name: ProviderName;
  /** Human-readable reason this provider can't run (missing key, etc.), or null when it's ready. */
  configError(): string | null;
  recommend<T>(req: LlmRequest<T>): Promise<LlmResult<T>>;
}

/** A provider failure already translated into what the route should return. */
export class LlmError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly detail?: unknown,
  ) {
    super(message);
    this.name = "LlmError";
  }
}
