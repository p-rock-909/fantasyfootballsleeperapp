import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { LlmError, type LlmProvider, type LlmRequest, type LlmResult } from "./types";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5";
// Identity-linked API keys must say which workspace the request acts in; plain keys ignore it.
const WORKSPACE_ID = process.env.ANTHROPIC_WORKSPACE_ID;

export const anthropicProvider: LlmProvider = {
  name: "anthropic",

  configError() {
    return process.env.ANTHROPIC_API_KEY ? null : "ANTHROPIC_API_KEY is not set on the server.";
  },

  async recommend<T>({ system, user, effort, schema }: LlmRequest<T>): Promise<LlmResult<T>> {
    const client = new Anthropic(WORKSPACE_ID ? { defaultHeaders: { "anthropic-workspace-id": WORKSPACE_ID } } : {});
    try {
      const response = await client.beta.messages.parse({
        model: MODEL,
        max_tokens: 8000,
        thinking: { type: "adaptive" },
        output_config: { effort, format: betaZodOutputFormat(schema) },
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: user }],
      });
      if (response.stop_reason === "refusal") {
        throw new LlmError("Claude declined this request.", 502, response.stop_details);
      }
      if (response.stop_reason === "max_tokens" || !response.parsed_output) {
        throw new LlmError("Claude's answer was cut off or unparseable; try again (or lower effort).", 502);
      }
      return {
        parsed: response.parsed_output,
        model: response.model,
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
          cachedInputTokens: response.usage.cache_read_input_tokens ?? undefined,
        },
      };
    } catch (e) {
      if (e instanceof LlmError) throw e;
      if (e instanceof Anthropic.AuthenticationError) throw new LlmError("Claude API key rejected.", 500);
      if (e instanceof Anthropic.BadRequestError && e.message.includes("anthropic-workspace-id"))
        throw new LlmError(
          "This Claude key is identity-linked: set ANTHROPIC_WORKSPACE_ID on the server to the workspace id it should act in, then restart.",
          500,
        );
      if (e instanceof Anthropic.RateLimitError) throw new LlmError("Claude rate limit hit; retry in a few seconds.", 429);
      if (e instanceof Anthropic.APIError) throw new LlmError(`Claude API error ${e.status}: ${e.message}`, 502);
      throw new LlmError((e as Error).message, 500);
    }
  },
};
