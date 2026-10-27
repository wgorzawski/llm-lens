import type { TraceContext } from "../trace.js";

/**
 * Raw OpenAI Chat Completions API request/response log. A failed call has `error`
 * instead of `response`.
 */
export interface OpenAIRawLog {
  request: OpenAIRequest;
  response?: OpenAIResponse;
  error?: OpenAIRawError;
  timestamp?: number;
  durationMs?: number;
  /** Optional caller context (label, env, session...) */
  metadata?: TraceContext;
}

export interface OpenAIRawError {
  /** HTTP status, absent for network errors and timeouts */
  status?: number;
  message: string;
  code?: string;
  type?: string;
}

export interface OpenAIRequest {
  model: string;
  messages: OpenAIMessage[];
  max_tokens?: number;
  max_completion_tokens?: number;
  temperature?: number;
  tools?: OpenAITool[];
  tool_choice?: "auto" | "none" | "required" | { type: "function"; function: { name: string } };
  stream?: boolean;
  stop?: string | string[];
  user?: string;
}

export type OpenAIMessage =
  | { role: "system" | "developer"; content: string }
  | { role: "user"; content: string | OpenAIContentPart[] }
  | { role: "assistant"; content: string | null; tool_calls?: OpenAIToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

export type OpenAIContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string; detail?: "low" | "high" | "auto" } };

export interface OpenAIToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface OpenAITool {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters: Record<string, unknown>;
  };
}

export interface OpenAIResponse {
  id: string;
  object: "chat.completion";
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: "assistant";
      content: string | null;
      tool_calls?: OpenAIToolCall[];
      /** Reasoning trace returned by some providers (Groq gpt-oss, DeepSeek...) */
      reasoning?: string;
      reasoning_content?: string;
    };
    finish_reason: "stop" | "length" | "tool_calls" | "content_filter" | null;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    prompt_tokens_details?: { cached_tokens?: number };
    completion_tokens_details?: { reasoning_tokens?: number };
  };
}
