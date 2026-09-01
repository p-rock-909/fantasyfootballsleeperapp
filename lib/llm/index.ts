import { anthropicProvider } from "./anthropic";
import { geminiProvider } from "./gemini";
import { LlmError, type LlmProvider, type ProviderName } from "./types";

export * from "./types";

const PROVIDERS: Record<ProviderName, LlmProvider> = {
  gemini: geminiProvider,
  anthropic: anthropicProvider,
};

/**
 * The evaluation backend for this deployment. Gemini is the default; set
 * LLM_PROVIDER=anthropic to go back to Claude. An unknown value fails loudly
 * rather than silently falling back to something the operator didn't ask for.
 */
export function activeProvider(): LlmProvider {
  const name = (process.env.LLM_PROVIDER || "gemini").trim().toLowerCase();
  const provider = PROVIDERS[name as ProviderName];
  if (!provider) {
    throw new LlmError(
      `LLM_PROVIDER is "${name}"; expected one of ${Object.keys(PROVIDERS).join(", ")}.`,
      500,
    );
  }
  return provider;
}
