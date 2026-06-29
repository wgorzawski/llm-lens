import type {
  OpenAIRawLog,
  OpenAIMessage,
  OpenAIToolCall,
  UnifiedTrace,
  TraceMessage,
  TraceContentBlock,
  ToolCall,
} from "@llm-lens/types";
import type { ParseResult } from "./types.js";
import { computeCost } from "./pricing.js";

export function parseOpenAILog(raw: OpenAIRawLog): ParseResult {
  try {
    const { request, response, timestamp, durationMs } = raw;

    const choice = response.choices[0];
    if (!choice) {
      return { success: false, error: "Response has no choices" };
    }

    const systemPrompt = extractSystemPrompt(request.messages);
    const messages = request.messages
      .filter((m) => m.role !== "system")
      .map(normalizeMessage);

    const assistantMessage = normalizeAssistantMessage(choice.message);
    messages.push(assistantMessage);

    const trace: UnifiedTrace = {
      id: response.id,
      timestamp: timestamp
        ? new Date(timestamp).toISOString()
        : new Date(response.created * 1000).toISOString(),
      messages,
      usage: {
        inputTokens: response.usage.prompt_tokens,
        outputTokens: response.usage.completion_tokens,
        cacheReadTokens: response.usage.prompt_tokens_details?.cached_tokens,
      },
      metadata: {
        model: response.model,
        provider: "openai",
        durationMs,
        costUsd: computeCost(response.model, response.usage.prompt_tokens, response.usage.completion_tokens),
        stopReason: normalizeFinishReason(choice.finish_reason),
        temperature: request.temperature,
        maxTokens: request.max_tokens,
        systemPrompt,
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

function extractSystemPrompt(messages: OpenAIMessage[]): string | undefined {
  const parts = messages
    .filter((m): m is { role: "system"; content: string } => m.role === "system")
    .map((m) => m.content);
  return parts.length > 0 ? parts.join("\n") : undefined;
}

function normalizeMessage(msg: OpenAIMessage): TraceMessage {
  switch (msg.role) {
    case "user": {
      if (typeof msg.content === "string") {
        return { role: "user", content: msg.content };
      }
      const blocks: TraceContentBlock[] = msg.content.map((part): TraceContentBlock => {
        if (part.type === "text") return { type: "text", text: part.text };
        return {
          type: "image",
          mimeType: "image/unknown",
          data: part.image_url.url,
        };
      });
      return { role: "user", content: blocks };
    }

    case "assistant": {
      const toolCalls = (msg.tool_calls ?? []).map(normalizeToolCall);
      const blocks: TraceContentBlock[] = [];
      if (msg.content) blocks.push({ type: "text", text: msg.content });
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
            toolResult: { toolCallId: msg.tool_call_id, content: msg.content },
          },
        ],
      };
    }

    default:
      return { role: "user", content: JSON.stringify(msg) };
  }
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
