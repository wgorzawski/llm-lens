// Building blocks for the demo seed: an "agent script" (user request → assistant turns
// with tool calls and their results → final answer) rendered as a raw Anthropic,
// OpenAI or Vercel AI SDK log. Token counts are estimated from the actual content, so
// usage, cost and cache numbers stay consistent with what the trace shows.

import type {
  AnthropicContentBlock,
  AnthropicRawLog,
  AnthropicTool,
  OpenAIMessage,
  OpenAIRawLog,
  OpenAITool,
  TraceMessage,
  UnifiedTrace,
  VercelAIMessage,
  VercelAIRawLog,
} from "@llm-lens/types";
import { parseAnthropicLog, parseOpenAILog, parseVercelAILog } from "@llm-lens/parsers";

export type DemoApiCall = (method: string, path: string, body?: unknown) => Promise<unknown>;

export interface DemoSeedContext {
  api: DemoApiCall;
  /** Direct DB insert, for traces the ingest routes can't produce (errors, replays). */
  insertTrace: (trace: UnifiedTrace, replayOf?: string) => Promise<void>;
}

// ── time, ids, randomness ─────────────────────────────────────────────────────

export const MIN = 60_000;
export const HOUR = 60 * MIN;
export const DAY = 24 * HOUR;

export const ago = (ms: number): number => Date.now() - ms;
export const isoDate = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

const ALPHANUM = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
export function rid(len: number): string {
  let s = "";
  for (let i = 0; i < len; i++) s += ALPHANUM[Math.floor(Math.random() * ALPHANUM.length)];
  return s;
}
export const anthropicId = () => `msg_01${rid(22)}`;
export const openaiId = () => `chatcmpl-${rid(29)}`;
export const vercelId = () => `aisdk_${rid(24)}`;
const toolUseId = () => `toolu_01${rid(22)}`;
const callId = () => `call_${rid(24)}`;

export function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
export function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)]!;
}

/** Rough token estimate (~4 characters per token for English and JSON). */
export function est(value: unknown): number {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return Math.max(1, Math.ceil(text.length / 4));
}

// ── scripts ───────────────────────────────────────────────────────────────────

export interface ToolCallStep {
  name: string;
  input: Record<string, unknown>;
  result: unknown;
  isError?: boolean;
}

export interface AgentTurn {
  /** Text the assistant writes before calling tools in this turn. */
  say?: string;
  /** Tool calls made in this turn; more than one = parallel calls. */
  calls: ToolCallStep[];
}

export type UserContent =
  | string
  | Array<{ type: "text"; text: string } | { type: "image"; url: string; mediaType: "image/jpeg" | "image/png" }>;

export interface AgentScript {
  /** Earlier back-and-forth in the same conversation, as [user, assistant] pairs. */
  history?: Array<[string, string]>;
  user: UserContent;
  turns: AgentTurn[];
  final: string;
}

export interface ToolDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface RenderOptions {
  model: string;
  system?: string;
  tools?: ToolDef[];
  timestamp: number;
  durationMs: number;
  maxTokens?: number;
  temperature?: number;
  /** Fraction of the input served from the prompt cache (system + tools, roughly). */
  cached?: boolean;
  /** Stop because of max_tokens instead of a natural end. */
  truncated?: boolean;
}

function resultText(result: unknown): string {
  return typeof result === "string" ? result : JSON.stringify(result);
}

function usageFor(opts: RenderOptions, requestBody: unknown, final: string) {
  const systemAndTools = est(opts.system ?? "") + (opts.tools ? est(opts.tools) : 0);
  const total = est(requestBody) + 12;
  const cacheRead = opts.cached ? Math.min(systemAndTools, total - 20) : 0;
  return { input: total - cacheRead, output: est(final) + randInt(2, 12), cacheRead };
}

// ── Anthropic ─────────────────────────────────────────────────────────────────

export function anthropicLog(script: AgentScript, opts: RenderOptions): AnthropicRawLog {
  const messages: AnthropicRawLog["request"]["messages"] = [];
  for (const [u, a] of script.history ?? []) {
    messages.push({ role: "user", content: u }, { role: "assistant", content: a });
  }
  messages.push({
    role: "user",
    content: typeof script.user === "string"
      ? script.user
      : script.user.map((p): AnthropicContentBlock => p.type === "text"
        ? { type: "text", text: p.text }
        : { type: "image", source: { type: "url", media_type: p.mediaType, url: p.url } }),
  });
  for (const turn of script.turns) {
    const ids = turn.calls.map(() => toolUseId());
    messages.push({
      role: "assistant",
      content: [
        ...(turn.say ? [{ type: "text" as const, text: turn.say }] : []),
        ...turn.calls.map((c, i): AnthropicContentBlock => ({ type: "tool_use", id: ids[i]!, name: c.name, input: c.input })),
      ],
    });
    messages.push({
      role: "user",
      content: turn.calls.map((c, i): AnthropicContentBlock => ({
        type: "tool_result", tool_use_id: ids[i]!, content: resultText(c.result), ...(c.isError ? { is_error: true } : {}),
      })),
    });
  }

  const tools: AnthropicTool[] | undefined = opts.tools?.map((t, i, all) => ({
    name: t.name, description: t.description, input_schema: t.parameters,
    ...(opts.cached && i === all.length - 1 ? { cache_control: { type: "ephemeral" as const } } : {}),
  }));
  const request: AnthropicRawLog["request"] = {
    model: opts.model,
    max_tokens: opts.maxTokens ?? 2048,
    ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
    ...(opts.system ? { system: [{ type: "text" as const, text: opts.system, ...(opts.cached ? { cache_control: { type: "ephemeral" as const } } : {}) }] } : {}),
    ...(tools ? { tools } : {}),
    messages,
  };
  const u = usageFor(opts, request, script.final);
  return {
    request,
    response: {
      id: anthropicId(), type: "message", role: "assistant", model: opts.model,
      stop_reason: opts.truncated ? "max_tokens" : "end_turn", stop_sequence: null,
      content: [{ type: "text", text: script.final }],
      usage: {
        input_tokens: u.input,
        output_tokens: opts.truncated ? (opts.maxTokens ?? u.output) : u.output,
        ...(opts.cached ? { cache_read_input_tokens: u.cacheRead, cache_creation_input_tokens: 0 } : {}),
      },
    },
    timestamp: opts.timestamp,
    durationMs: opts.durationMs,
  };
}

// ── OpenAI ────────────────────────────────────────────────────────────────────

export function openaiLog(script: AgentScript, opts: RenderOptions & { reasoningTokens?: number }): OpenAIRawLog {
  const messages: OpenAIMessage[] = [];
  if (opts.system) messages.push({ role: "system", content: opts.system });
  for (const [u, a] of script.history ?? []) {
    messages.push({ role: "user", content: u }, { role: "assistant", content: a });
  }
  messages.push({
    role: "user",
    content: typeof script.user === "string"
      ? script.user
      : script.user.map((p) => p.type === "text"
        ? { type: "text" as const, text: p.text }
        : { type: "image_url" as const, image_url: { url: p.url, detail: "high" as const } }),
  });
  for (const turn of script.turns) {
    const ids = turn.calls.map(() => callId());
    messages.push({
      role: "assistant",
      content: turn.say ?? null,
      tool_calls: turn.calls.map((c, i) => ({ id: ids[i]!, type: "function" as const, function: { name: c.name, arguments: JSON.stringify(c.input) } })),
    });
    turn.calls.forEach((c, i) => messages.push({ role: "tool", tool_call_id: ids[i]!, content: resultText(c.result) }));
  }

  const tools: OpenAITool[] | undefined = opts.tools?.map((t) => ({
    type: "function", function: { name: t.name, description: t.description, parameters: t.parameters },
  }));
  const request: OpenAIRawLog["request"] = {
    model: opts.model,
    ...(opts.maxTokens ? { max_tokens: opts.maxTokens } : {}),
    ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
    ...(tools ? { tools } : {}),
    messages,
  };
  const u = usageFor(opts, request, script.final);
  const completion = (opts.truncated ? (opts.maxTokens ?? u.output) : u.output) + (opts.reasoningTokens ?? 0);
  const prompt = u.input + u.cacheRead;
  return {
    request,
    response: {
      id: openaiId(), object: "chat.completion", created: Math.floor(opts.timestamp / 1000), model: opts.model,
      choices: [{ index: 0, finish_reason: opts.truncated ? "length" : "stop", message: { role: "assistant", content: script.final } }],
      usage: {
        prompt_tokens: prompt,
        completion_tokens: completion,
        total_tokens: prompt + completion,
        ...(opts.cached ? { prompt_tokens_details: { cached_tokens: u.cacheRead } } : {}),
        ...(opts.reasoningTokens ? { completion_tokens_details: { reasoning_tokens: opts.reasoningTokens } } : {}),
      },
    },
    timestamp: opts.timestamp,
    durationMs: opts.durationMs,
  };
}

// ── Vercel AI SDK ─────────────────────────────────────────────────────────────

export function vercelLog(
  script: AgentScript,
  opts: RenderOptions & { provider: string; type?: VercelAIRawLog["type"] },
): VercelAIRawLog {
  const messages: VercelAIMessage[] = [];
  for (const [u, a] of script.history ?? []) {
    messages.push({ role: "user", content: u }, { role: "assistant", content: a });
  }
  messages.push({
    role: "user",
    content: typeof script.user === "string"
      ? script.user
      : script.user.map((p) => p.type === "text"
        ? { type: "text" as const, text: p.text }
        : { type: "image" as const, image: p.url, mimeType: p.mediaType }),
  });
  for (const turn of script.turns) {
    const ids = turn.calls.map(() => callId());
    messages.push({
      role: "assistant",
      content: [
        ...(turn.say ? [{ type: "text" as const, text: turn.say }] : []),
        ...turn.calls.map((c, i) => ({ type: "tool-call" as const, toolCallId: ids[i]!, toolName: c.name, args: c.input })),
      ],
    });
    messages.push({
      role: "tool",
      content: turn.calls.map((c, i) => ({
        type: "tool-result" as const, toolCallId: ids[i]!, toolName: c.name, result: c.result, ...(c.isError ? { isError: true } : {}),
      })),
    });
  }
  const input = {
    ...(opts.system ? { system: opts.system } : {}),
    ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
    ...(opts.maxTokens ? { maxTokens: opts.maxTokens } : {}),
    messages,
  };
  const u = usageFor(opts, { input, tools: opts.tools }, script.final);
  const completion = opts.truncated ? (opts.maxTokens ?? u.output) : u.output;
  return {
    type: opts.type ?? "ai.streamText",
    operationId: vercelId(),
    model: opts.model,
    provider: opts.provider,
    timestamp: opts.timestamp,
    durationMs: opts.durationMs,
    input,
    output: { finishReason: opts.truncated ? "length" : "stop", text: script.final },
    usage: { promptTokens: u.input + u.cacheRead, completionTokens: completion, totalTokens: u.input + u.cacheRead + completion },
  };
}

// ── ingest / insert ───────────────────────────────────────────────────────────

export type Provider = "anthropic" | "openai" | "vercel-ai";

export type AnyLog =
  | { provider: "anthropic"; log: AnthropicRawLog }
  | { provider: "openai"; log: OpenAIRawLog }
  | { provider: "vercel-ai"; log: VercelAIRawLog };

export async function ingest(ctx: DemoSeedContext, l: AnyLog): Promise<string> {
  return ((await ctx.api("POST", `/traces/${l.provider}`, l.log)) as { id: string }).id;
}

function parse(l: AnyLog): UnifiedTrace {
  const r = l.provider === "anthropic" ? parseAnthropicLog(l.log)
    : l.provider === "openai" ? parseOpenAILog(l.log)
      : parseVercelAILog(l.log);
  if (!r.success) throw new Error(`demo seed: cannot parse ${l.provider} log: ${r.error}`);
  return r.trace;
}

/** Insert a replay of `originalId`: same request, different model/response. */
export async function insertReplay(ctx: DemoSeedContext, l: AnyLog, originalId: string): Promise<string> {
  const trace = parse(l);
  await ctx.insertTrace(trace, originalId);
  return trace.id;
}

/**
 * Insert a call that failed: the conversation up to the failing request is kept,
 * there is no assistant reply, and the trace carries the provider's error.
 */
export async function insertFailed(
  ctx: DemoSeedContext,
  l: AnyLog,
  failure: { statusCode: number; error: string; durationMs: number },
): Promise<string> {
  const trace = parse(l);
  const messages: TraceMessage[] = trace.messages.slice(0, -1); // drop the (never received) reply
  await ctx.insertTrace({
    ...trace,
    messages,
    usage: { inputTokens: 0, outputTokens: 0 },
    metadata: {
      ...trace.metadata,
      durationMs: failure.durationMs,
      costUsd: 0,
      stopReason: undefined,
      statusCode: failure.statusCode,
      error: failure.error,
    },
    raw: { request: (l.log as { request?: unknown; input?: unknown }).request ?? (l.log as { input?: unknown }).input, error: { status: failure.statusCode, message: failure.error } },
  });
  return trace.id;
}

/** Cut an agent script after `turns` assistant turns (for failures mid-loop). */
export function upToTurn(script: AgentScript, turns: number): AgentScript {
  return { ...script, turns: script.turns.slice(0, turns) };
}
