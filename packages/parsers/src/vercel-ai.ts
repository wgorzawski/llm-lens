import type {
  VercelAIRawLog,
  VercelAIMessage,
  VercelAIContentPart,
  UnifiedTrace,
  TraceMessage,
  TraceContentBlock,
  ToolCall,
} from "@llm-lens/types";
import type { ParseResult } from "./types.js";
import { computeCost } from "./pricing.js";

export function parseVercelAILog(raw: VercelAIRawLog): ParseResult {
  try {
    const { input, output, timestamp, durationMs } = raw;

    const systemPrompt = input.system ?? extractSystemFromMessages(input.messages);
    const inputMessages = (input.messages ?? (input.prompt ? [asUserMessage(input.prompt)] : []))
      .filter((m) => m.role !== "system")
      .map(normalizeMessage);

    const assistantMessage = buildAssistantMessage(output);
    const messages = [...inputMessages, assistantMessage];

    const usage = raw.usage ?? { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

    const trace: UnifiedTrace = {
      id: raw.operationId ?? `vercel-${Date.now()}`,
      timestamp: timestamp ? new Date(timestamp).toISOString() : new Date().toISOString(),
      messages,
      usage: {
        inputTokens: usage.promptTokens,
        outputTokens: usage.completionTokens,
      },
      metadata: {
        model: raw.model ?? "unknown",
        provider: "vercel-ai",
        durationMs,
        costUsd: computeCost(raw.model ?? "", usage.promptTokens, usage.completionTokens),
        stopReason: normalizeFinishReason(output.finishReason),
        temperature: input.temperature,
        maxTokens: input.maxTokens,
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

function extractSystemFromMessages(messages?: VercelAIMessage[]): string | undefined {
  if (!messages) return undefined;
  const parts = messages
    .filter((m): m is VercelAIMessage & { role: "system" } => m.role === "system")
    .map((m) => (typeof m.content === "string" ? m.content : ""));
  return parts.length > 0 ? parts.join("\n") : undefined;
}

function asUserMessage(prompt: string): VercelAIMessage {
  return { role: "user", content: prompt };
}

function normalizeMessage(msg: VercelAIMessage): TraceMessage {
  if (typeof msg.content === "string") {
    return { role: msg.role, content: msg.content };
  }
  const blocks = msg.content.map(normalizeContentPart);
  const toolCalls: ToolCall[] = msg.content
    .filter((p): p is Extract<VercelAIContentPart, { type: "tool-call" }> => p.type === "tool-call")
    .map((p) => ({ id: p.toolCallId, name: p.toolName, input: p.args }));

  const message: TraceMessage = { role: msg.role, content: blocks };
  if (toolCalls.length > 0) message.toolCalls = toolCalls;
  return message;
}

function buildAssistantMessage(output: VercelAIRawLog["output"]): TraceMessage {
  const blocks: TraceContentBlock[] = [];
  const toolCalls: ToolCall[] = [];

  if (output.text) {
    blocks.push({ type: "text", text: output.text });
  }

  for (const tc of output.toolCalls ?? []) {
    const call: ToolCall = { id: tc.toolCallId, name: tc.toolName, input: tc.args };
    toolCalls.push(call);
    blocks.push({ type: "tool_use", toolCall: call });
  }

  const message: TraceMessage = { role: "assistant", content: blocks };
  if (toolCalls.length > 0) message.toolCalls = toolCalls;
  return message;
}

function normalizeContentPart(part: VercelAIContentPart): TraceContentBlock {
  switch (part.type) {
    case "text":
      return { type: "text", text: part.text };

    case "image":
      return {
        type: "image",
        mimeType: part.mimeType ?? "image/unknown",
        data: part.image instanceof URL ? part.image.href : part.image,
      };

    case "tool-call":
      return {
        type: "tool_use",
        toolCall: { id: part.toolCallId, name: part.toolName, input: part.args },
      };

    case "tool-result":
      return {
        type: "tool_result",
        toolResult: {
          toolCallId: part.toolCallId,
          content: typeof part.result === "string" ? part.result : JSON.stringify(part.result),
          isError: part.isError,
        },
      };
  }
}

function normalizeFinishReason(
  reason: VercelAIRawLog["output"]["finishReason"]
): string | undefined {
  if (!reason) return undefined;
  const map: Record<string, string> = {
    stop: "end_turn",
    length: "max_tokens",
    "tool-calls": "tool_use",
    "content-filter": "content_filter",
    error: "error",
    other: "other",
    unknown: "unknown",
  };
  return map[reason] ?? reason;
}
