import type Anthropic from "@anthropic-ai/sdk";
import { resolveContext, shouldSkip, submit, toRawError, type LLMLensConfig } from "./core.js";

/**
 * Patches client.messages.create in place so every non-streaming call is sent to
 * llm-lens. Returns the SDK's own promise untouched (see instrumentOpenAI).
 */
export function instrumentAnthropic<T extends Anthropic>(client: T, config: LLMLensConfig): T {
  const messages = client.messages;
  const original = messages.create.bind(messages) as (params: unknown, options?: unknown) => Promise<unknown>;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (messages as any).create = function (params: any, options?: any) {
    if (shouldSkip(config, params)) return original(params, options);

    const metadata = resolveContext(config);
    const timestamp = Date.now();
    const t0 = performance.now();
    const promise = original(params, options);

    try {
      promise.then(
        (response) => {
          const durationMs = Math.round(performance.now() - t0);
          submit(config, "anthropic", { request: params, response, timestamp, durationMs, metadata });
        },
        (err: unknown) => {
          const durationMs = Math.round(performance.now() - t0);
          submit(config, "anthropic", { request: params, error: toRawError(err), timestamp, durationMs, metadata });
        }
      );
    } catch (err) {
      config.onError?.(err);
    }

    return promise;
  };

  return client;
}
