import type OpenAI from "openai";
import { resolveContext, shouldSkip, submit, toRawError, type LLMLensConfig } from "./core.js";

export type { LLMLensConfig } from "./core.js";

/**
 * Patches client.chat.completions.create in place so every non-streaming call is sent
 * to llm-lens - successful ones with the response, failed ones (rate limits, 4xx/5xx,
 * timeouts) with the error.
 *
 * The SDK's own promise is returned untouched, so `.withResponse()` / `.asResponse()`
 * keep working, nothing is awaited on the app's side and llm-lens being down never
 * affects the call. Streaming calls are passed through untouched.
 */
export function instrumentOpenAI<T extends OpenAI>(client: T, config: LLMLensConfig): T {
  const completions = client.chat.completions;
  const original = completions.create.bind(completions) as (params: unknown, options?: unknown) => Promise<unknown>;
  const path = config.provider ?? "openai";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (completions as any).create = function (params: any, options?: any) {
    if (shouldSkip(config, params)) return original(params, options);

    const metadata = resolveContext(config);
    const timestamp = Date.now();
    const t0 = performance.now();
    const promise = original(params, options);

    try {
      promise.then(
        (response) => {
          const durationMs = Math.round(performance.now() - t0);
          submit(config, path, { request: params, response, timestamp, durationMs, metadata });
        },
        (err: unknown) => {
          const durationMs = Math.round(performance.now() - t0);
          submit(config, path, { request: params, error: toRawError(err), timestamp, durationMs, metadata });
        }
      );
    } catch (err) {
      config.onError?.(err);
    }

    return promise;
  };

  return client;
}
