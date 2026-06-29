import type {
  AnthropicRawLog,
  AnthropicContentBlock,
  AnthropicSystemBlock,
  UnifiedTrace,
  TraceMessage,
  TraceContentBlock,
  ToolCall,
  ToolResult,
} from "@llm-lens/types";
import type { ParseResult } from "./types.js";
import { computeCost } from "./pricing.js";

export function parseAnthropicLog(raw: AnthropicRawLog): ParseResult {
  try {
    const { request, response, timestamp, durationMs } = raw;

    const systemPrompt = extractSystemPrompt(request.system);

    const messages: TraceMessage[] = request.messages.map((msg) =>
      normalizeMessage(msg.role, msg.content)
    );

    const assistantMessage = normalizeAssistantResponse(response.content);
    messages.push(assistantMessage);

    const stopReason = response.stop_reason ?? undefined;

    const trace: UnifiedTrace = {
      id: response.id,
      timestamp: timestamp
        ? new Date(timestamp).toISOString()
        : new Date().toISOString(),
      messages,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        cacheCreationTokens: response.usage.cache_creation_input_tokens,
        cacheReadTokens: response.usage.cache_read_input_tokens,
      },
      metadata: {
        model: response.model,
        provider: "anthropic",
        durationMs,
        costUsd: computeCost(response.model, response.usage.input_tokens, response.usage.output_tokens),
        stopReason,
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

function extractSystemPrompt(
  system: AnthropicRawLog["request"]["system"]
): string | undefined {
  if (!system) return undefined;
  if (typeof system === "string") return system;
  return system
    .filter((b): b is AnthropicSystemBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");
}

function normalizeMessage(
  role: "user" | "assistant",
  content: string | AnthropicContentBlock[]
): TraceMessage {
  if (typeof content === "string") {
    return { role, content };
  }
  return { role, content: content.map(normalizeContentBlock) };
}

function normalizeAssistantResponse(
  blocks: AnthropicContentBlock[]
): TraceMessage {
  const contentBlocks = blocks.map(normalizeContentBlock);
  const toolCalls: ToolCall[] = [];

  for (const block of blocks) {
    if (block.type === "tool_use") {
      toolCalls.push({ id: block.id, name: block.name, input: block.input });
    }
  }

  const message: TraceMessage = {
    role: "assistant",
    content: contentBlocks,
  };
  if (toolCalls.length > 0) {
    message.toolCalls = toolCalls;
  }
  return message;
}

function normalizeContentBlock(block: AnthropicContentBlock): TraceContentBlock {
  switch (block.type) {
    case "text":
      return { type: "text", text: block.text };

    case "tool_use":
      return {
        type: "tool_use",
        toolCall: { id: block.id, name: block.name, input: block.input },
      };

    case "tool_result": {
      const toolResult: ToolResult = {
        toolCallId: block.tool_use_id,
        content:
          typeof block.content === "string"
            ? block.content
            : JSON.stringify(block.content),
        isError: block.is_error,
      };
      return { type: "tool_result", toolResult };
    }

    case "image":
      return {
        type: "image",
        mimeType: block.source.media_type,
        data: block.source.data ?? block.source.url ?? "",
      };

    default:
      // Unknown future block type — degrade gracefully
      return { type: "text", text: JSON.stringify(block) };
  }
}
