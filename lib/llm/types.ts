import type { RecommendationResponse } from "@/lib/schema";

export type ProviderName = "gemini" | "anthropic";
export type Effort = "low" | "medium" | "high";

export interface LlmRequest {
  system: string;
  user: string;
  effort: Effort;
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

export interface LlmResult {
  /** Already validated against RecommendationResponse, whoever produced it. */
  parsed: RecommendationResponse;
  /** The model id the provider actually served, not the one we asked for. */
  model: string;
  usage: LlmUsage;
}

export interface LlmProvider {
  readonly name: ProviderName;
  /** Human-readable reason this provider can't run (missing key, etc.), or null when it's ready. */
  configError(): string | null;
  recommend(req: LlmRequest): Promise<LlmResult>;
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
