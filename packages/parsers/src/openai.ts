import type {
  OpenAIRawLog,
  OpenAIMessage,
  OpenAIToolCall,
  UnifiedTrace,
  TraceMessage,
  TraceContentBlock,
  ToolCall,
  TraceContext,
  TraceMetadata,
  OpenAICompatibleProvider,
} from "@llm-lens/types";
import type { ParseResult } from "./types.js";
import { computeCostDetailed } from "./pricing.js";

export interface ParseOpenAIOptions {
  /** Provider to record - "groq" and other OpenAI-compatible APIs share this parser */
  provider?: OpenAICompatibleProvider;
}

export function parseOpenAILog(raw: OpenAIRawLog, options: ParseOpenAIOptions = {}): ParseResult {
  try {
    const { request, response, error, timestamp, durationMs } = raw;
    const provider = options.provider ?? "openai";

    if (!request || !Array.isArray(request.messages)) {
      return { success: false, error: "Log has no request messages" };
    }
    if (!response && !error) {
      return { success: false, error: "Log needs either a response or an error" };
    }

    const systemPrompt = extractSystemPrompt(request.messages);
    const messages = request.messages
      .filter((m) => m.role !== "system" && m.role !== "developer")
      .map(normalizeMessage);
    const context = contextMetadata(raw.metadata);

    if (!response) {
      const err = error!;
      const time = timestamp ? new Date(timestamp) : new Date();
      const trace: UnifiedTrace = {
        id: `err_${crypto.randomUUID()}`,
        timestamp: time.toISOString(),
        messages,
        usage: { inputTokens: 0, outputTokens: 0 },
        metadata: {
          model: request.model,
          provider,
          durationMs,
          costUsd: 0,
          temperature: request.temperature,
          maxTokens: request.max_tokens ?? request.max_completion_tokens,
          systemPrompt,
          // network errors and timeouts have no HTTP status - record them as 599
          statusCode: err.status ?? 599,
          error: err.message || "Request failed",
          errorCode: err.code ?? err.type,
          ...context,
        },
        raw,
      };
      return { success: true, trace };
    }

    const choice = response.choices?.[0];
    if (!choice) {
      return { success: false, error: "Response has no choices" };
    }

    const assistantMessage = normalizeAssistantMessage(choice.message);
    messages.push(assistantMessage);

    const usage = response.usage ?? { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
    const model = response.model ?? request.model;
    const reasoning = choice.message.reasoning ?? choice.message.reasoning_content;

    const trace: UnifiedTrace = {
      id: response.id || `${provider}_${crypto.randomUUID()}`,
      timestamp: timestamp
        ? new Date(timestamp).toISOString()
        : new Date(response.created * 1000).toISOString(),
      messages,
      usage: {
        inputTokens: usage.prompt_tokens,
        outputTokens: usage.completion_tokens,
        cacheReadTokens: usage.prompt_tokens_details?.cached_tokens,
      },
      metadata: {
        model,
        provider,
        durationMs,
        costUsd: computeCostDetailed(
          model,
          {
            // prompt_tokens includes the cached ones, which are billed at the cache rate
            inputTokens: usage.prompt_tokens - (usage.prompt_tokens_details?.cached_tokens ?? 0),
            cacheReadTokens: usage.prompt_tokens_details?.cached_tokens ?? 0,
            outputTokens: usage.completion_tokens,
          },
          provider
        ),
        stopReason: normalizeFinishReason(choice.finish_reason),
        temperature: request.temperature,
        maxTokens: request.max_tokens ?? request.max_completion_tokens,
        systemPrompt,
        ...(reasoning ? { reasoning } : {}),
        ...(usage.completion_tokens_details?.reasoning_tokens
          ? { reasoningTokens: usage.completion_tokens_details.reasoning_tokens }
          : {}),
        ...context,
      },
      raw,
    };

    return { success: true, trace };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Copies the caller context (label, env, session...) onto trace metadata, ignoring bad values */
export function contextMetadata(ctx: TraceContext | undefined): Partial<TraceMetadata> {
  if (!ctx || typeof ctx !== "object") return {};
  const str = (v: unknown, max = 200) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined);
  const out: Partial<TraceMetadata> = {};
  const name = str(ctx.name);
  const env = str(ctx.env, 50);
  const sessionId = str(ctx.sessionId);
  const endUserId = str(ctx.userId);
  if (name) out.name = name;
  if (env) out.env = env;
  if (sessionId) out.sessionId = sessionId;
  if (endUserId) out.endUserId = endUserId;
  if (Array.isArray(ctx.tags)) {
    const tags = ctx.tags.map((t) => str(t, 50)).filter((t): t is string => !!t).slice(0, 20);
    if (tags.length) out.tags = tags;
  }
  return out;
}

function extractSystemPrompt(messages: OpenAIMessage[]): string | undefined {
  const parts = messages
    .filter((m): m is { role: "system" | "developer"; content: string } => m.role === "system" || m.role === "developer")
    .map((m) => (typeof m.content === "string" ? m.content : JSON.stringify(m.content)));
  return parts.length > 0 ? parts.join("\n") : undefined;
}

function normalizeMessage(msg: OpenAIMessage): TraceMessage {
  switch (msg.role) {
    case "user": {
      if (typeof msg.content === "string") {
        return { role: "user", content: msg.content };
      }
      if (!Array.isArray(msg.content)) return { role: "user", content: JSON.stringify(msg.content ?? "") };
      const blocks: TraceContentBlock[] = msg.content.map((part): TraceContentBlock => {
        if (part.type === "text") return { type: "text", text: part.text };
        if (part.type === "image_url" && part.image_url?.url) {
          return { type: "image", mimeType: "image/unknown", data: part.image_url.url };
        }
        return { type: "text", text: JSON.stringify(part) };
      });
      return { role: "user", content: blocks };
    }

    case "assistant": {
      const toolCalls = (msg.tool_calls ?? []).map(normalizeToolCall);
      const blocks: TraceContentBlock[] = [];
      const text = contentText(msg.content);
      if (text) blocks.push({ type: "text", text });
      for (const tc of toolCalls) blocks.push({ type: "tool_use", toolCall: tc });

      const message: TraceMessage = { role: "assistant", content: blocks };
      if (toolCalls.length > 0) message.toolCalls = toolCalls;
      return message;
    }

    case "tool": {
      return {
        role: "tool",
        content: [
          {
            type: "tool_result",
            toolResult: { toolCallId: msg.tool_call_id, content: contentText(msg.content) },
          },
        ],
      };
    }

    default:
      return { role: "user", content: JSON.stringify(msg) };
  }
}

/** Message content can be a string or (in newer SDKs) an array of text parts */
function contentText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((p: unknown) => (p && typeof p === "object" && "text" in p ? String((p as { text: unknown }).text) : JSON.stringify(p)))
      .join("\n");
  }
  return content == null ? "" : JSON.stringify(content);
}

function normalizeAssistantMessage(msg: {
  role: "assistant";
  content: string | null;
  tool_calls?: OpenAIToolCall[];
}): TraceMessage {
  const toolCalls = (msg.tool_calls ?? []).map(normalizeToolCall);
  const blocks: TraceContentBlock[] = [];
  if (msg.content) blocks.push({ type: "text", text: msg.content });
  for (const tc of toolCalls) blocks.push({ type: "tool_use", toolCall: tc });

  const message: TraceMessage = { role: "assistant", content: blocks };
  if (toolCalls.length > 0) message.toolCalls = toolCalls;
  return message;
}

function normalizeToolCall(tc: OpenAIToolCall): ToolCall {
  let input: Record<string, unknown>;
  try {
    input = JSON.parse(tc.function.arguments) as Record<string, unknown>;
  } catch {
    input = { _raw: tc.function.arguments };
  }
  return { id: tc.id, name: tc.function.name, input };
}

function normalizeFinishReason(
  reason: "stop" | "length" | "tool_calls" | "content_filter" | null
): string | undefined {
  if (!reason) return undefined;
  const map: Record<string, string> = {
    stop: "end_turn",
    length: "max_tokens",
    tool_calls: "tool_use",
    content_filter: "content_filter",
  };
  return map[reason] ?? reason;
}
