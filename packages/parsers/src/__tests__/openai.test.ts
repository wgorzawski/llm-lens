import { describe, it, expect } from "vitest";
import { parseOpenAILog } from "../openai.js";
import type { OpenAIRawLog } from "@llm-lens/types";

const baseLog: OpenAIRawLog = {
  request: {
    model: "gpt-4o",
    messages: [{ role: "user", content: "What is 2+2?" }],
    max_tokens: 256,
    temperature: 1,
  },
  response: {
    id: "chatcmpl-abc123",
    object: "chat.completion",
    created: 1715700000,
    model: "gpt-4o-2024-08-06",
    choices: [
      {
        index: 0,
        message: { role: "assistant", content: "2 + 2 = 4." },
        finish_reason: "stop",
      },
    ],
    usage: { prompt_tokens: 13, completion_tokens: 9, total_tokens: 22 },
  },
  timestamp: 1715700000000,
  durationMs: 410,
};

describe("parseOpenAILog", () => {
  it("returns success for a minimal valid log", () => {
    expect(parseOpenAILog(baseLog).success).toBe(true);
  });

  it("maps provider and model from response", () => {
    const result = parseOpenAILog(baseLog);
    if (!result.success) throw new Error(result.error);
    expect(result.trace.metadata.provider).toBe("openai");
    expect(result.trace.metadata.model).toBe("gpt-4o-2024-08-06");
  });

  it("maps usage tokens", () => {
    const result = parseOpenAILog(baseLog);
    if (!result.success) throw new Error(result.error);
    expect(result.trace.usage.inputTokens).toBe(13);
    expect(result.trace.usage.outputTokens).toBe(9);
  });

  it("maps cached tokens when present", () => {
    const log: OpenAIRawLog = {
      ...baseLog,
      response: {
        ...baseLog.response,
        usage: {
          prompt_tokens: 100,
          completion_tokens: 20,
          total_tokens: 120,
          prompt_tokens_details: { cached_tokens: 80 },
        },
      },
    };
    const result = parseOpenAILog(log);
    if (!result.success) throw new Error(result.error);
    expect(result.trace.usage.cacheReadTokens).toBe(80);
  });

  it("uses explicit timestamp when provided", () => {
    const result = parseOpenAILog(baseLog);
    if (!result.success) throw new Error(result.error);
    expect(result.trace.timestamp).toBe(new Date(1715700000000).toISOString());
  });

  it("falls back to response.created when no timestamp", () => {
    const { timestamp: _, ...logWithoutTs } = baseLog;
    const result = parseOpenAILog(logWithoutTs);
    if (!result.success) throw new Error(result.error);
    expect(result.trace.timestamp).toBe(new Date(1715700000 * 1000).toISOString());
  });

  it("carries durationMs", () => {
    const result = parseOpenAILog(baseLog);
    if (!result.success) throw new Error(result.error);
    expect(result.trace.metadata.durationMs).toBe(410);
  });

  it("preserves raw log", () => {
    const result = parseOpenAILog(baseLog);
    if (!result.success) throw new Error(result.error);
    expect(result.trace.raw).toBe(baseLog);
  });

  it("extracts system prompt and excludes it from messages", () => {
    const log: OpenAIRawLog = {
      ...baseLog,
      request: {
        ...baseLog.request,
        messages: [
          { role: "system", content: "You are helpful." },
          { role: "user", content: "Hi" },
        ],
      },
    };
    const result = parseOpenAILog(log);
    if (!result.success) throw new Error(result.error);
    expect(result.trace.metadata.systemPrompt).toBe("You are helpful.");
    expect(result.trace.messages.every((m) => m.role !== "system")).toBe(true);
  });

  it("produces user + assistant messages in order", () => {
    const result = parseOpenAILog(baseLog);
    if (!result.success) throw new Error(result.error);
    const roles = result.trace.messages.map((m) => m.role);
    expect(roles).toEqual(["user", "assistant"]);
  });

  it("normalizes string user content", () => {
    const result = parseOpenAILog(baseLog);
    if (!result.success) throw new Error(result.error);
    expect(result.trace.messages[0]!.content).toBe("What is 2+2?");
  });

  it("normalizes assistant text content as blocks", () => {
    const result = parseOpenAILog(baseLog);
    if (!result.success) throw new Error(result.error);
    const content = result.trace.messages[1]!.content;
    expect(Array.isArray(content)).toBe(true);
    if (Array.isArray(content)) {
      expect(content[0]).toEqual({ type: "text", text: "2 + 2 = 4." });
    }
  });

  it("maps finish_reason stop → end_turn", () => {
    const result = parseOpenAILog(baseLog);
    if (!result.success) throw new Error(result.error);
    expect(result.trace.metadata.stopReason).toBe("end_turn");
  });

  it("maps finish_reason length → max_tokens", () => {
    const log: OpenAIRawLog = {
      ...baseLog,
      response: {
        ...baseLog.response,
        choices: [{ ...baseLog.response.choices[0]!, finish_reason: "length" }],
      },
    };
    const result = parseOpenAILog(log);
    if (!result.success) throw new Error(result.error);
    expect(result.trace.metadata.stopReason).toBe("max_tokens");
  });

  it("maps finish_reason tool_calls → tool_use", () => {
    const log: OpenAIRawLog = {
      ...baseLog,
      response: {
        ...baseLog.response,
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: null,
              tool_calls: [
                {
                  id: "call_01",
                  type: "function",
                  function: { name: "get_weather", arguments: '{"location":"Warsaw"}' },
                },
              ],
            },
            finish_reason: "tool_calls",
          },
        ],
      },
    };
    const result = parseOpenAILog(log);
    if (!result.success) throw new Error(result.error);
    expect(result.trace.metadata.stopReason).toBe("tool_use");
    const assistant = result.trace.messages.at(-1)!;
    expect(assistant.toolCalls).toHaveLength(1);
    expect(assistant.toolCalls![0]).toEqual({
      id: "call_01",
      name: "get_weather",
      input: { location: "Warsaw" },
    });
  });

  it("handles malformed tool arguments gracefully", () => {
    const log: OpenAIRawLog = {
      ...baseLog,
      response: {
        ...baseLog.response,
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: null,
              tool_calls: [
                {
                  id: "call_bad",
                  type: "function",
                  function: { name: "broken", arguments: "NOT JSON" },
                },
              ],
            },
            finish_reason: "tool_calls",
          },
        ],
      },
    };
    const result = parseOpenAILog(log);
    if (!result.success) throw new Error(result.error);
    expect(result.trace.messages.at(-1)!.toolCalls![0]!.input).toEqual({
      _raw: "NOT JSON",
    });
  });

  it("normalizes tool role messages", () => {
    const log: OpenAIRawLog = {
      ...baseLog,
      request: {
        ...baseLog.request,
        messages: [
          { role: "user", content: "What's the weather?" },
          {
            role: "assistant",
            content: null,
            tool_calls: [
              {
                id: "call_01",
                type: "function",
                function: { name: "get_weather", arguments: '{"location":"Warsaw"}' },
              },
            ],
          },
          { role: "tool", tool_call_id: "call_01", content: "22°C, sunny" },
        ],
      },
    };
    const result = parseOpenAILog(log);
    if (!result.success) throw new Error(result.error);
    const toolMsg = result.trace.messages[2]!;
    expect(toolMsg.role).toBe("tool");
    expect(Array.isArray(toolMsg.content)).toBe(true);
    if (Array.isArray(toolMsg.content)) {
      const block = toolMsg.content[0]!;
      expect(block.type).toBe("tool_result");
      if (block.type === "tool_result") {
        expect(block.toolResult.toolCallId).toBe("call_01");
        expect(block.toolResult.content).toBe("22°C, sunny");
      }
    }
  });

  it("normalizes multipart user content with image", () => {
    const log: OpenAIRawLog = {
      ...baseLog,
      request: {
        ...baseLog.request,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "Describe this image." },
              { type: "image_url", image_url: { url: "https://example.com/img.png" } },
            ],
          },
        ],
      },
    };
    const result = parseOpenAILog(log);
    if (!result.success) throw new Error(result.error);
    const content = result.trace.messages[0]!.content;
    expect(Array.isArray(content)).toBe(true);
    if (Array.isArray(content)) {
      expect(content[0]).toEqual({ type: "text", text: "Describe this image." });
      expect(content[1]).toEqual({ type: "image", mimeType: "image/unknown", data: "https://example.com/img.png" });
    }
  });

  it("returns failure for empty choices", () => {
    const log: OpenAIRawLog = {
      ...baseLog,
      response: { ...baseLog.response, choices: [] },
    };
    const result = parseOpenAILog(log);
    expect(result.success).toBe(false);
  });

  it("returns failure for malformed input", () => {
    const result = parseOpenAILog(null as unknown as OpenAIRawLog);
    expect(result.success).toBe(false);
  });
});
