/**
 * Every provider LLM Lens knows. OpenAI-compatible ones share the OpenAI parser and are
 * ingested at POST /api/traces/<id>; `baseUrl` + `keyEnv` let the server replay their traces.
 */
export const PROVIDERS = {
  openai:         { label: "OpenAI",       openaiCompatible: true,  baseUrl: "https://api.openai.com/v1", keyEnv: "OPENAI_API_KEY" },
  anthropic:      { label: "Anthropic",    openaiCompatible: false, baseUrl: "https://api.anthropic.com/v1", keyEnv: "ANTHROPIC_API_KEY" },
  "vercel-ai":    { label: "Vercel AI",    openaiCompatible: false, baseUrl: undefined, keyEnv: undefined },
  groq:           { label: "Groq",         openaiCompatible: true,  baseUrl: "https://api.groq.com/openai/v1", keyEnv: "GROQ_API_KEY" },
  gemini:         { label: "Gemini",       openaiCompatible: true,  baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", keyEnv: "GEMINI_API_KEY" },
  mistral:        { label: "Mistral",      openaiCompatible: true,  baseUrl: "https://api.mistral.ai/v1", keyEnv: "MISTRAL_API_KEY" },
  deepseek:       { label: "DeepSeek",     openaiCompatible: true,  baseUrl: "https://api.deepseek.com/v1", keyEnv: "DEEPSEEK_API_KEY" },
  xai:            { label: "xAI",          openaiCompatible: true,  baseUrl: "https://api.x.ai/v1", keyEnv: "XAI_API_KEY" },
  openrouter:     { label: "OpenRouter",   openaiCompatible: true,  baseUrl: "https://openrouter.ai/api/v1", keyEnv: "OPENROUTER_API_KEY" },
  together:       { label: "Together AI",  openaiCompatible: true,  baseUrl: "https://api.together.xyz/v1", keyEnv: "TOGETHER_API_KEY" },
  fireworks:      { label: "Fireworks",    openaiCompatible: true,  baseUrl: "https://api.fireworks.ai/inference/v1", keyEnv: "FIREWORKS_API_KEY" },
  perplexity:     { label: "Perplexity",   openaiCompatible: true,  baseUrl: "https://api.perplexity.ai", keyEnv: "PERPLEXITY_API_KEY" },
  cerebras:       { label: "Cerebras",     openaiCompatible: true,  baseUrl: "https://api.cerebras.ai/v1", keyEnv: "CEREBRAS_API_KEY" },
  ollama:         { label: "Ollama",       openaiCompatible: true,  baseUrl: "http://localhost:11434/v1", keyEnv: undefined },
  "azure-openai": { label: "Azure OpenAI", openaiCompatible: true,  baseUrl: undefined, keyEnv: "AZURE_OPENAI_API_KEY" },
} as const;

export type TraceProvider = keyof typeof PROVIDERS;

/** Providers that speak the OpenAI Chat Completions format and share its parser */
export const OPENAI_COMPATIBLE_PROVIDERS = (Object.keys(PROVIDERS) as TraceProvider[]).filter(
  (id) => PROVIDERS[id].openaiCompatible
) as OpenAICompatibleProvider[];
export type OpenAICompatibleProvider = {
  [K in TraceProvider]: (typeof PROVIDERS)[K]["openaiCompatible"] extends true ? K : never;
}[TraceProvider];

export function isTraceProvider(id: string): id is TraceProvider {
  return Object.prototype.hasOwnProperty.call(PROVIDERS, id);
}

export function providerLabel(id: string): string {
  return isTraceProvider(id) ? PROVIDERS[id].label : id;
}

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
