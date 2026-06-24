export type TraceProvider = "openai" | "anthropic" | "vercel-ai";

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
}

export interface UnifiedTrace {
  id: string;
  timestamp: string; // ISO 8601
  messages: TraceMessage[];
  usage: TraceUsage;
  metadata: TraceMetadata;
  /** Raw original log, kept for debugging */
  raw?: unknown;
}
