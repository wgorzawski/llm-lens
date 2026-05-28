import type Anthropic from "@anthropic-ai/sdk";
import type { LLMLensConfig } from "./openai.js";

/**
 * Patches client.messages.create in-place to forward every
 * non-streaming call to llm-lens. Streaming calls are passed through
 * untouched.
 */
export function instrumentAnthropic(client: Anthropic, config: LLMLensConfig): Anthropic {
  const messages = client.messages;
  const original = messages.create.bind(messages);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (messages as any).create = async function (params: any, options?: any) {
    if (params.stream) {
      return original(params, options);
    }

    const timestamp = Date.now();
    const t0 = performance.now();
    const response = await original(params, options);
    const durationMs = Math.round(performance.now() - t0);

    void submitTrace(config, { request: params, response, timestamp, durationMs });

    return response;
  };

  return client;
}

async function submitTrace(config: LLMLensConfig, log: unknown): Promise<void> {
  try {
    const res = await fetch(`${config.apiUrl}/api/traces/anthropic`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(log),
    });
    if (!res.ok) {
      config.onError?.(new Error(`llm-lens submission failed: HTTP ${res.status}`));
    }
  } catch (err) {
    config.onError?.(err);
  }
}
