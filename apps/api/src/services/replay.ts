import { PROVIDERS, isTraceProvider, providerLabel } from "@llm-lens/types";
import type { UnifiedTrace, TraceMessage, OpenAICompatibleProvider } from "@llm-lens/types";

export type ReplayResult =
  | { success: true; trace: UnifiedTrace }
  | { success: false; error: string };

function textOf(content: TraceMessage["content"]): string {
  if (typeof content === "string") return content;
  return content
    .filter((b): b is { type: "text"; text: string } => b.type === "text")
    .map((b) => b.text)
    .join("\n");
}

const REPLAY_TIMEOUT_MS = 120_000;

export async function replayTrace(original: UnifiedTrace): Promise<ReplayResult> {
  try {
    return await replayTraceUnsafe(original);
  } catch (err) {
    const timedOut = (err as { name?: string })?.name === "TimeoutError";
    return { success: false, error: timedOut ? "The provider did not answer within 2 minutes" : `Replay failed: ${(err as Error)?.message ?? err}` };
  }
}

async function replayTraceUnsafe(original: UnifiedTrace): Promise<ReplayResult> {
  const promptMessages = original.messages.filter((m) => m.role !== "assistant");
  if (promptMessages.length === 0) {
    return { success: false, error: "Trace has no prompt messages to replay" };
  }

  const provider = original.metadata.provider;
  if (provider === "anthropic") return replayAnthropic(original, promptMessages);
  // Vercel AI SDK traces are replayed against OpenAI (the SDK's most common backend)
  const targetId = provider === "vercel-ai" ? "openai" : provider;
  if (!isTraceProvider(targetId) || !PROVIDERS[targetId].openaiCompatible) {
    return { success: false, error: `Replay not supported for provider "${provider}"` };
  }
  const target = replayTarget(targetId as OpenAICompatibleProvider);
  if (!target) return { success: false, error: `Replay is not configured for ${providerLabel(targetId)}` };
  return replayOpenAI(original, promptMessages, target);
}

interface OpenAICompatibleTarget {
  provider: OpenAICompatibleProvider;
  label: string;
  keyEnv?: string;
  apiKey?: string;
  url: string;
}

/**
 * Where to replay a provider's traces: its public base URL (overridable with
 * <PROVIDER>_BASE_URL, e.g. OLLAMA_BASE_URL or AZURE_OPENAI_BASE_URL) and its API key env var.
 */
/** base + "/chat/completions", keeping a query string such as Azure's ?api-version=... at the end */
function chatCompletionsUrl(baseUrl: string): string {
  const [path, query] = baseUrl.split("?", 2);
  return `${path!.replace(/\/$/, "")}/chat/completions${query ? `?${query}` : ""}`;
}

function replayTarget(provider: OpenAICompatibleProvider): OpenAICompatibleTarget | null {
  const info = PROVIDERS[provider];
  const envPrefix = provider.toUpperCase().replace(/-/g, "_");
  const baseUrl = process.env[`${envPrefix}_BASE_URL`] || info.baseUrl;
  if (!baseUrl) return null;
  return {
    provider,
    label: info.label,
    keyEnv: info.keyEnv,
    apiKey: info.keyEnv ? process.env[info.keyEnv] : undefined,
    url: chatCompletionsUrl(baseUrl),
  };
}

async function replayOpenAI(
  original: UnifiedTrace,
  promptMessages: TraceMessage[],
  target: OpenAICompatibleTarget
): Promise<ReplayResult> {
  const apiKey = target.apiKey;
  if (target.keyEnv && !apiKey) return { success: false, error: `${target.keyEnv} is not configured on the server` };

  const messages = [
    ...(original.metadata.systemPrompt ? [{ role: "system", content: original.metadata.systemPrompt }] : []),
    ...promptMessages.map((m) => ({ role: m.role, content: textOf(m.content) })),
  ];

  const start = Date.now();
  const res = await fetch(target.url, {
    method: "POST",
    headers: {
      // Azure reads "api-key", everyone else the Bearer token
      ...(apiKey ? { Authorization: `Bearer ${apiKey}`, "api-key": apiKey } : {}),
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(REPLAY_TIMEOUT_MS),
    body: JSON.stringify({
      model: original.metadata.model,
      messages,
      temperature: original.metadata.temperature,
      max_tokens: original.metadata.maxTokens,
    }),
  });
  const durationMs = Date.now() - start;
  const body = await res.json().catch(() => null);
  if (!res.ok || !body) {
    return { success: false, error: body?.error?.message ?? `${target.label} API error (${res.status})` };
  }

  const choice = body.choices?.[0];
  if (!choice) return { success: false, error: `${target.label} response had no choices` };

  return {
    success: true,
    trace: {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      messages: [...promptMessages, { role: "assistant", content: choice.message.content ?? "" }],
      usage: {
        inputTokens: body.usage?.prompt_tokens ?? 0,
        outputTokens: body.usage?.completion_tokens ?? 0,
      },
      metadata: {
        model: body.model ?? original.metadata.model,
        provider: target.provider,
        name: original.metadata.name,
        durationMs,
        stopReason: choice.finish_reason,
        temperature: original.metadata.temperature,
        maxTokens: original.metadata.maxTokens,
        systemPrompt: original.metadata.systemPrompt,
      },
    },
  };
}

async function replayAnthropic(original: UnifiedTrace, promptMessages: TraceMessage[]): Promise<ReplayResult> {
  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return { success: false, error: "ANTHROPIC_API_KEY is not configured on the server" };

  const messages = promptMessages.map((m) => ({ role: m.role, content: textOf(m.content) }));

  const start = Date.now();
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(REPLAY_TIMEOUT_MS),
    body: JSON.stringify({
      model: original.metadata.model,
      system: original.metadata.systemPrompt,
      messages,
      max_tokens: original.metadata.maxTokens ?? 1024,
      temperature: original.metadata.temperature,
    }),
  });
  const durationMs = Date.now() - start;
  const body = await res.json().catch(() => null);
  if (!res.ok || !body) {
    return { success: false, error: body?.error?.message ?? `Anthropic API error (${res.status})` };
  }

  const text = (body.content ?? [])
    .filter((b: { type: string }) => b.type === "text")
    .map((b: { text: string }) => b.text)
    .join("\n");

  return {
    success: true,
    trace: {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      messages: [...promptMessages, { role: "assistant", content: text }],
      usage: {
        inputTokens: body.usage?.input_tokens ?? 0,
        outputTokens: body.usage?.output_tokens ?? 0,
      },
      metadata: {
        model: body.model ?? original.metadata.model,
        provider: "anthropic",
        durationMs,
        stopReason: body.stop_reason,
        temperature: original.metadata.temperature,
        maxTokens: original.metadata.maxTokens,
        systemPrompt: original.metadata.systemPrompt,
      },
    },
  };
}
