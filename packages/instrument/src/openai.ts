import type OpenAI from "openai";

export interface LLMLensConfig {
  /** llm-lens API base URL, e.g. http://localhost:3001 */
  apiUrl: string;
  /** JWT token or API key used as Bearer token */
  apiKey: string;
  /** Called when trace submission fails. Silent by default. */
  onError?: (err: unknown) => void;
}

/**
 * Patches client.chat.completions.create in-place to forward every
 * non-streaming call to llm-lens. Streaming calls are passed through
 * untouched — full response collection would require buffering the stream.
 */
export function instrumentOpenAI(client: OpenAI, config: LLMLensConfig): OpenAI {
  const completions = client.chat.completions;
  const original = completions.create.bind(completions);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (completions as any).create = async function (params: any, options?: any) {
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
    const res = await fetch(`${config.apiUrl}/api/traces/openai`, {
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
