import type { UnifiedTrace, TraceMessage } from "@llm-lens/types";

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

export async function replayTrace(original: UnifiedTrace): Promise<ReplayResult> {
  const promptMessages = original.messages.filter((m) => m.role !== "assistant");
  if (promptMessages.length === 0) {
    return { success: false, error: "Trace has no prompt messages to replay" };
  }

  switch (original.metadata.provider) {
    case "openai":
    case "vercel-ai":
      return replayOpenAI(original, promptMessages);
    case "anthropic":
      return replayAnthropic(original, promptMessages);
    default:
      return { success: false, error: `Replay not supported for provider "${original.metadata.provider}"` };
  }
}

async function replayOpenAI(original: UnifiedTrace, promptMessages: TraceMessage[]): Promise<ReplayResult> {
  const apiKey = process.env["OPENAI_API_KEY"];
  if (!apiKey) return { success: false, error: "OPENAI_API_KEY is not configured on the server" };

  const messages = [
    ...(original.metadata.systemPrompt ? [{ role: "system", content: original.metadata.systemPrompt }] : []),
    ...promptMessages.map((m) => ({ role: m.role, content: textOf(m.content) })),
  ];

  const start = Date.now();
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: original.metadata.model,
      messages,
      temperature: original.metadata.temperature,
      max_tokens: original.metadata.maxTokens,
    }),
  });
  const durationMs = Date.now() - start;
  const body = await res.json();
  if (!res.ok) {
    return { success: false, error: body?.error?.message ?? `OpenAI API error (${res.status})` };
  }

  const choice = body.choices?.[0];
  if (!choice) return { success: false, error: "OpenAI response had no choices" };

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
        provider: "openai",
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
    body: JSON.stringify({
      model: original.metadata.model,
      system: original.metadata.systemPrompt,
      messages,
      max_tokens: original.metadata.maxTokens ?? 1024,
      temperature: original.metadata.temperature,
    }),
  });
  const durationMs = Date.now() - start;
  const body = await res.json();
  if (!res.ok) {
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
