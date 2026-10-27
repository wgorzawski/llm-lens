export type TraceProvider = "openai" | "anthropic" | "vercel-ai" | "groq";

/** Providers that speak the OpenAI Chat Completions format and share its parser */
export const OPENAI_COMPATIBLE_PROVIDERS = ["openai", "groq"] as const;
export type OpenAICompatibleProvider = (typeof OPENAI_COMPATIBLE_PROVIDERS)[number];

export type TraceRole = "user" | "assistant" | "system" | "tool";

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResult {
  toolCallId: string;
  content: string;
  isError?: boolean;
}

export interface TraceMessage {
  role: TraceRole;
  content: string | Array<TraceContentBlock>;
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
}

export type TraceContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; toolCall: ToolCall }
  | { type: "tool_result"; toolResult: ToolResult }
  | { type: "image"; mimeType: string; data: string };

export interface TraceUsage {
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens?: number;
  cacheReadTokens?: number;
}

export interface TraceMetadata {
  model: string;
  provider: TraceProvider;
  /** Wall-clock duration in milliseconds */
  durationMs?: number;
  /** Estimated cost in USD */
  costUsd?: number;
  stopReason?: "end_turn" | "max_tokens" | "tool_use" | "stop_sequence" | string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
  /** HTTP-style status code of the underlying LLM call, defaults to 200 when absent */
  statusCode?: number;
  /** Error message if the LLM call failed */
  error?: string;
  /** Provider error code, e.g. "rate_limit_exceeded" or "tool_use_failed" */
  errorCode?: string;
  /** Human-readable label set by the caller, e.g. "recipe.generate" */
  name?: string;
  /** Environment the call came from, e.g. "production" (defaults to the API key's env) */
  env?: string;
  /** Free-form tags set by the caller */
  tags?: string[];
  /** Groups calls belonging to one conversation / session */
  sessionId?: string;
  /** End-user id in the calling app */
  endUserId?: string;
  /** Hidden reasoning trace returned by reasoning models (e.g. Groq gpt-oss) */
  reasoning?: string;
  /** Tokens spent on hidden reasoning (part of outputTokens) */
  reasoningTokens?: number;
}

/** Optional context a client can send along with a raw log */
export interface TraceContext {
  name?: string;
  env?: string;
  tags?: string[];
  sessionId?: string;
  userId?: string;
}

export interface UnifiedTrace {
  id: string;
  timestamp: string; // ISO 8601
  messages: TraceMessage[];
  usage: TraceUsage;
  metadata: TraceMetadata;
  /** Raw original log, kept for debugging */
  raw?: unknown;
  starred?: boolean;
  /** id of the original trace this one replayed, if any */
  replayOf?: string;
}
