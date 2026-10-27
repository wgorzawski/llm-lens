import type { TraceContext } from "../trace.js";

/**
 * Raw Anthropic Messages API request/response log. A failed call is sent with `error`
 * and without `response` (the type keeps `response` required for the common case).
 */
export interface AnthropicRawLog {
  request: AnthropicRequest;
  response: AnthropicResponse;
  error?: { status?: number; message: string; code?: string; type?: string };
  /** Optional caller context (label, env, session...) */
  metadata?: TraceContext;
  /** Unix timestamp ms when the request was sent */
  timestamp?: number;
  /** Round-trip duration in ms */
  durationMs?: number;
}

export interface AnthropicRequest {
  model: string;
  messages: AnthropicMessage[];
  system?: string | AnthropicSystemBlock[];
  max_tokens?: number;
  temperature?: number;
  tools?: AnthropicTool[];
  tool_choice?: AnthropicToolChoice;
  stop_sequences?: string[];
  stream?: boolean;
  metadata?: { user_id?: string };
}

export interface AnthropicSystemBlock {
  type: "text";
  text: string;
  cache_control?: { type: "ephemeral" };
}

export type AnthropicMessage = {
  role: "user" | "assistant";
  content: string | AnthropicContentBlock[];
};

export type AnthropicContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; source: AnthropicImageSource }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string | AnthropicContentBlock[]; is_error?: boolean }
  | { type: "text"; text: string; cache_control?: { type: "ephemeral" } };

export interface AnthropicImageSource {
  type: "base64" | "url";
  media_type: "image/jpeg" | "image/png" | "image/gif" | "image/webp";
  data?: string;
  url?: string;
}

export interface AnthropicTool {
  name: string;
  description?: string;
  input_schema: Record<string, unknown>;
  cache_control?: { type: "ephemeral" };
}

export type AnthropicToolChoice =
  | { type: "auto" }
  | { type: "any" }
  | { type: "tool"; name: string };

export interface AnthropicResponse {
  id: string;
  type: "message";
  role: "assistant";
  content: AnthropicContentBlock[];
  model: string;
  stop_reason: "end_turn" | "max_tokens" | "tool_use" | "stop_sequence" | null;
  stop_sequence: string | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
}
