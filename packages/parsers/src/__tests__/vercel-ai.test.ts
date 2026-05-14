import { describe, it, expect } from "vitest";
import { parseVercelAILog } from "../vercel-ai.js";
import type { VercelAIRawLog } from "@llm-lens/types";

const baseLog: VercelAIRawLog = {
  type: "ai.generateText",
  operationId: "op-abc123",
  model: "gpt-4o",
  provider: "openai",
  timestamp: 1715700000000,
  durationMs: 380,
  input: {
    messages: [{ role: "user", content: "What is 2+2?" }],
    temperature: 0.7,
    maxTokens: 512,
  },
  output: {
    text: "2 + 2 = 4.",
    finishReason: "stop",
  },
  usage: { promptTokens: 12, completionTokens: 8, totalTokens: 20 },
};

describe("parseVercelAILog", () => {
  it("returns success for a minimal valid log", () => {
    expect(parseVercelAILog(baseLog).success).toBe(true);
  });

  it("maps provider to vercel-ai", () => {
    const result = parseVercelAILog(baseLog);
    if (!result.success) throw new Error(result.error);
    expect(result.trace.metadata.provider).toBe("vercel-ai");
  });

  it("maps model from raw log", () => {
    const result = parseVercelAILog(baseLog);
    if (!result.success) throw new Error(result.error);
    expect(result.trace.metadata.model).toBe("gpt-4o");
  });

  it("uses 'unknown' when model is absent", () => {
    const { model: _, ...log } = baseLog;
    const result = parseVercelAILog(log);
    if (!result.success) throw new Error(result.error);
    expect(result.trace.metadata.model).toBe("unknown");
  });

  it("maps usage tokens", () => {
    const result = parseVercelAILog(baseLog);
    if (!result.success) throw new Error(result.error);
    expect(result.trace.usage.inputTokens).toBe(12);
    expect(result.trace.usage.outputTokens).toBe(8);
  });

  it("defaults usage to 0 when absent", () => {
    const { usage: _, ...log } = baseLog;
    const result = parseVercelAILog(log);
    if (!result.success) throw new Error(result.error);
    expect(result.trace.usage.inputTokens).toBe(0);
    expect(result.trace.usage.outputTokens).toBe(0);
  });

  it("uses operationId as trace id", () => {
    const result = parseVercelAILog(baseLog);
    if (!result.success) throw new Error(result.error);
    expect(result.trace.id).toBe("op-abc123");
  });

  it("generates fallback id when operationId absent", () => {
    const { operationId: _, ...log } = baseLog;
    const result = parseVercelAILog(log);
    if (!result.success) throw new Error(result.error);
    expect(result.trace.id).toMatch(/^vercel-\d+$/);
  });

  it("converts timestamp to ISO string", () => {
    const result = parseVercelAILog(baseLog);
    if (!result.success) throw new Error(result.error);
    expect(result.trace.timestamp).toBe(new Date(1715700000000).toISOString());
  });

  it("carries durationMs and temperature and maxTokens", () => {
    const result = parseVercelAILog(baseLog);
    if (!result.success) throw new Error(result.error);
    expect(result.trace.metadata.durationMs).toBe(380);
    expect(result.trace.metadata.temperature).toBe(0.7);
    expect(result.trace.metadata.maxTokens).toBe(512);
  });

  it("preserves raw log", () => {
    const result = parseVercelAILog(baseLog);
    if (!result.success) throw new Error(result.error);
    expect(result.trace.raw).toBe(baseLog);
  });

  it("maps finishReason stop → end_turn", () => {
    const result = parseVercelAILog(baseLog);
    if (!result.success) throw new Error(result.error);
    expect(result.trace.metadata.stopReason).toBe("end_turn");
  });

  it("maps finishReason length → max_tokens", () => {
    const log: VercelAIRawLog = { ...baseLog, output: { ...baseLog.output, finishReason: "length" } };
    const result = parseVercelAILog(log);
    if (!result.success) throw new Error(result.error);
    expect(result.trace.metadata.stopReason).toBe("max_tokens");
  });

  it("maps finishReason tool-calls → tool_use", () => {
    const log: VercelAIRawLog = { ...baseLog, output: { ...baseLog.output, finishReason: "tool-calls" } };
    const result = parseVercelAILog(log);
    if (!result.success) throw new Error(result.error);
    expect(result.trace.metadata.stopReason).toBe("tool_use");
  });

  it("produces user + assistant messages in order", () => {
    const result = parseVercelAILog(baseLog);
    if (!result.success) throw new Error(result.error);
    expect(result.trace.messages.map((m) => m.role)).toEqual(["user", "assistant"]);
  });

  it("normalizes string user content", () => {
    const result = parseVercelAILog(baseLog);
    if (!result.success) throw new Error(result.error);
    expect(result.trace.messages[0]!.content).toBe("What is 2+2?");
  });

  it("normalizes assistant text as blocks", () => {
    const result = parseVercelAILog(baseLog);
    if (!result.success) throw new Error(result.error);
    const content = result.trace.messages[1]!.content;
    expect(Array.isArray(content)).toBe(true);
    if (Array.isArray(content)) {
      expect(content[0]).toEqual({ type: "text", text: "2 + 2 = 4." });
    }
  });

  it("extracts system prompt from input.system", () => {
    const log: VercelAIRawLog = { ...baseLog, input: { ...baseLog.input, system: "Be concise." } };
    const result = parseVercelAILog(log);
    if (!result.success) throw new Error(result.error);
    expect(result.trace.metadata.systemPrompt).toBe("Be concise.");
  });

  it("extracts system prompt from messages array and filters it out", () => {
    const log: VercelAIRawLog = {
      ...baseLog,
      input: {
        ...baseLog.input,
        messages: [
          { role: "system", content: "You are helpful." },
          { role: "user", content: "Hi" },
        ],
      },
    };
    const result = parseVercelAILog(log);
    if (!result.success) throw new Error(result.error);
    expect(result.trace.metadata.systemPrompt).toBe("You are helpful.");
    expect(result.trace.messages.every((m) => m.role !== "system")).toBe(true);
  });

  it("handles prompt string as user message when no messages array", () => {
    const log: VercelAIRawLog = {
      ...baseLog,
      input: { prompt: "Translate: hello" },
      output: { text: "cześć", finishReason: "stop" },
    };
    const result = parseVercelAILog(log);
    if (!result.success) throw new Error(result.error);
    expect(result.trace.messages[0]!.content).toBe("Translate: hello");
  });

  it("normalizes tool-call content parts in user message", () => {
    const log: VercelAIRawLog = {
      ...baseLog,
      input: {
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "Use the tool." },
              { type: "tool-call", toolCallId: "tc1", toolName: "search", args: { q: "Warsaw" } },
            ],
          },
        ],
      },
    };
    const result = parseVercelAILog(log);
    if (!result.success) throw new Error(result.error);
    const content = result.trace.messages[0]!.content;
    expect(Array.isArray(content)).toBe(true);
    if (Array.isArray(content)) {
      expect(content[1]).toEqual({
        type: "tool_use",
        toolCall: { id: "tc1", name: "search", input: { q: "Warsaw" } },
      });
    }
    expect(result.trace.messages[0]!.toolCalls).toHaveLength(1);
  });

  it("normalizes tool-result content parts", () => {
    const log: VercelAIRawLog = {
      ...baseLog,
      input: {
        messages: [
          {
            role: "tool",
            content: [
              { type: "tool-result", toolCallId: "tc1", toolName: "search", result: { answer: "42" } },
            ],
          },
        ],
      },
    };
    const result = parseVercelAILog(log);
    if (!result.success) throw new Error(result.error);
    const content = result.trace.messages[0]!.content;
    expect(Array.isArray(content)).toBe(true);
    if (!Array.isArray(content)) return;
    const block = content[0]!;
    expect(block.type).toBe("tool_result");
    if (block.type === "tool_result") {
      expect(block.toolResult.toolCallId).toBe("tc1");
      expect(block.toolResult.content).toBe('{"answer":"42"}');
    }
  });

  it("normalizes image content parts with URL object", () => {
    const log: VercelAIRawLog = {
      ...baseLog,
      input: {
        messages: [
          {
            role: "user",
            content: [
              { type: "image", image: new URL("https://example.com/img.png"), mimeType: "image/png" },
            ],
          },
        ],
      },
    };
    const result = parseVercelAILog(log);
    if (!result.success) throw new Error(result.error);
    const content = result.trace.messages[0]!.content;
    if (Array.isArray(content)) {
      expect(content[0]).toEqual({ type: "image", mimeType: "image/png", data: "https://example.com/img.png" });
    }
  });

  it("builds assistant message with tool_calls from output", () => {
    const log: VercelAIRawLog = {
      ...baseLog,
      output: {
        toolCalls: [
          { type: "tool-call", toolCallId: "tc1", toolName: "get_weather", args: { city: "Warsaw" } },
        ],
        finishReason: "tool-calls",
      },
    };
    const result = parseVercelAILog(log);
    if (!result.success) throw new Error(result.error);
    const assistant = result.trace.messages.at(-1)!;
    expect(assistant.toolCalls).toHaveLength(1);
    expect(assistant.toolCalls![0]).toEqual({ id: "tc1", name: "get_weather", input: { city: "Warsaw" } });
    const content = assistant.content;
    expect(Array.isArray(content)).toBe(true);
    if (Array.isArray(content)) {
      expect(content[0]).toEqual({
        type: "tool_use",
        toolCall: { id: "tc1", name: "get_weather", input: { city: "Warsaw" } },
      });
    }
  });

  it("returns failure for malformed input", () => {
    const result = parseVercelAILog(null as unknown as VercelAIRawLog);
    expect(result.success).toBe(false);
  });
});
