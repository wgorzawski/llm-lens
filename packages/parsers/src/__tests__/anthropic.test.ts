import { describe, it, expect } from "vitest";
import { parseAnthropicLog } from "../anthropic.js";
import type { AnthropicRawLog } from "@llm-lens/types";

const baseLog: AnthropicRawLog = {
  request: {
    model: "claude-sonnet-4-6",
    messages: [{ role: "user", content: "Hello, what is 2+2?" }],
    max_tokens: 1024,
    temperature: 0.7,
  },
  response: {
    id: "msg_01XFDUDYJgAACzvnptvVoYEL",
    type: "message",
    role: "assistant",
    content: [{ type: "text", text: "2 + 2 = 4." }],
    model: "claude-sonnet-4-6",
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: { input_tokens: 14, output_tokens: 9 },
  },
  timestamp: 1715700000000,
  durationMs: 320,
};

describe("parseAnthropicLog", () => {
  it("returns success for a minimal valid log", () => {
    const result = parseAnthropicLog(baseLog);
    expect(result.success).toBe(true);
  });

  it("maps provider and model correctly", () => {
    const result = parseAnthropicLog(baseLog);
    if (!result.success) throw new Error(result.error);
    expect(result.trace.metadata.provider).toBe("anthropic");
    expect(result.trace.metadata.model).toBe("claude-sonnet-4-6");
  });

  it("maps usage tokens", () => {
    const result = parseAnthropicLog(baseLog);
    if (!result.success) throw new Error(result.error);
    expect(result.trace.usage.inputTokens).toBe(14);
    expect(result.trace.usage.outputTokens).toBe(9);
  });

  it("maps cache tokens when present", () => {
    const log: AnthropicRawLog = {
      ...baseLog,
      response: {
        ...baseLog.response,
        usage: {
          input_tokens: 100,
          output_tokens: 50,
          cache_creation_input_tokens: 80,
          cache_read_input_tokens: 20,
        },
      },
    };
    const result = parseAnthropicLog(log);
    if (!result.success) throw new Error(result.error);
    expect(result.trace.usage.cacheCreationTokens).toBe(80);
    expect(result.trace.usage.cacheReadTokens).toBe(20);
  });

  it("converts timestamp to ISO string", () => {
    const result = parseAnthropicLog(baseLog);
    if (!result.success) throw new Error(result.error);
    expect(result.trace.timestamp).toBe(new Date(1715700000000).toISOString());
  });

  it("carries through durationMs", () => {
    const result = parseAnthropicLog(baseLog);
    if (!result.success) throw new Error(result.error);
    expect(result.trace.metadata.durationMs).toBe(320);
  });

  it("preserves the raw log", () => {
    const result = parseAnthropicLog(baseLog);
    if (!result.success) throw new Error(result.error);
    expect(result.trace.raw).toBe(baseLog);
  });

  it("extracts string system prompt", () => {
    const log: AnthropicRawLog = {
      ...baseLog,
      request: { ...baseLog.request, system: "You are helpful." },
    };
    const result = parseAnthropicLog(log);
    if (!result.success) throw new Error(result.error);
    expect(result.trace.metadata.systemPrompt).toBe("You are helpful.");
  });

  it("extracts block-array system prompt", () => {
    const log: AnthropicRawLog = {
      ...baseLog,
      request: {
        ...baseLog.request,
        system: [
          { type: "text", text: "Block one." },
          { type: "text", text: "Block two." },
        ],
      },
    };
    const result = parseAnthropicLog(log);
    if (!result.success) throw new Error(result.error);
    expect(result.trace.metadata.systemPrompt).toBe("Block one.\nBlock two.");
  });

  it("includes user and assistant messages in order", () => {
    const result = parseAnthropicLog(baseLog);
    if (!result.success) throw new Error(result.error);
    const { messages } = result.trace;
    expect(messages).toHaveLength(2);
    expect(messages[0]!.role).toBe("user");
    expect(messages[1]!.role).toBe("assistant");
  });

  it("handles string content on user message", () => {
    const result = parseAnthropicLog(baseLog);
    if (!result.success) throw new Error(result.error);
    expect(result.trace.messages[0]!.content).toBe("Hello, what is 2+2?");
  });

  it("normalizes assistant text blocks", () => {
    const result = parseAnthropicLog(baseLog);
    if (!result.success) throw new Error(result.error);
    const assistantContent = result.trace.messages[1]!.content;
    expect(Array.isArray(assistantContent)).toBe(true);
    if (Array.isArray(assistantContent)) {
      expect(assistantContent[0]).toEqual({ type: "text", text: "2 + 2 = 4." });
    }
  });

  it("normalizes tool_use blocks and adds toolCalls", () => {
    const log: AnthropicRawLog = {
      ...baseLog,
      response: {
        ...baseLog.response,
        content: [
          {
            type: "tool_use",
            id: "toolu_01",
            name: "get_weather",
            input: { location: "Warsaw" },
          },
        ],
        stop_reason: "tool_use",
      },
    };
    const result = parseAnthropicLog(log);
    if (!result.success) throw new Error(result.error);
    const assistant = result.trace.messages[1]!;
    expect(assistant.toolCalls).toHaveLength(1);
    expect(assistant.toolCalls![0]).toEqual({
      id: "toolu_01",
      name: "get_weather",
      input: { location: "Warsaw" },
    });
    expect(result.trace.metadata.stopReason).toBe("tool_use");
  });

  it("normalizes tool_result blocks in user message", () => {
    const log: AnthropicRawLog = {
      ...baseLog,
      request: {
        ...baseLog.request,
        messages: [
          { role: "user", content: "Hello" },
          {
            role: "assistant",
            content: [
              { type: "tool_use", id: "toolu_01", name: "get_weather", input: { location: "Warsaw" } },
            ],
          },
          {
            role: "user",
            content: [
              {
                type: "tool_result",
                tool_use_id: "toolu_01",
                content: "20°C, sunny",
              },
            ],
          },
        ],
      },
    };
    const result = parseAnthropicLog(log);
    if (!result.success) throw new Error(result.error);
    const toolResultMsg = result.trace.messages[2]!;
    expect(Array.isArray(toolResultMsg.content)).toBe(true);
    if (Array.isArray(toolResultMsg.content)) {
      const block = toolResultMsg.content[0]!;
      expect(block.type).toBe("tool_result");
      if (block.type === "tool_result") {
        expect(block.toolResult.toolCallId).toBe("toolu_01");
        expect(block.toolResult.content).toBe("20°C, sunny");
      }
    }
  });

  it("returns failure for malformed input", () => {
    const result = parseAnthropicLog(null as unknown as AnthropicRawLog);
    expect(result.success).toBe(false);
  });
});
