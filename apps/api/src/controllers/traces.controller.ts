import { Controller, GET, POST, PATCH, DELETE } from "fastify-decorators";
import type { FastifyReply, FastifyRequest } from "fastify";
import { parseAnthropicLog, parseOpenAILog, parseVercelAILog, maskPIIDeep, type ParseResult } from "@llm-lens/parsers";
import { OPENAI_COMPATIBLE_PROVIDERS } from "@llm-lens/types";
import type { AnthropicRawLog, OpenAIRawLog, VercelAIRawLog, TraceProvider, UnifiedTrace, OpenAICompatibleProvider } from "@llm-lens/types";
import {
  insertTrace,
  listTraces,
  listFacets,
  getTrace,
  setStarred,
  deleteTrace,
  deleteTraces,
  listNotes,
  addNote,
  type TraceSort,
  type TraceStatus,
  type LatencyBucket,
} from "../db/repository";
import { replayTrace } from "../services/replay";
import { findUserById } from "../db/users.repository";

async function fireWebhookIfConfigured(userId: string, trace: unknown) {
  const user = await findUserById(userId);
  const url = userPreferences(user)["outboundWebhookUrl"] as string | undefined;
  if (!url) return;
  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event: "trace.created", trace }),
  }).catch(() => null);
}

function userPreferences(user: { preferences?: unknown } | null): Record<string, unknown> {
  try {
    return JSON.parse((user?.preferences as string) || "{}") as Record<string, unknown>;
  } catch {
    return {};
  }
}

/**
 * Shared ingest path for every provider: fills the environment from the API key when the
 * caller didn't send one, masks PII when the user turned that on, then stores the trace.
 */
async function ingest(request: FastifyRequest, reply: FastifyReply, result: ParseResult) {
  if (!result.success) return reply.status(422).send({ error: result.error });
  const { userId, apiKeyEnv } = request.user;
  let trace: UnifiedTrace = result.trace;
  if (!trace.metadata.env && apiKeyEnv) trace = { ...trace, metadata: { ...trace.metadata, env: apiKeyEnv } };

  const user = await findUserById(userId);
  if (userPreferences(user)["maskPII"] === true) {
    trace = {
      ...trace,
      messages: maskPIIDeep(trace.messages),
      metadata: {
        ...trace.metadata,
        systemPrompt: trace.metadata.systemPrompt && maskPIIDeep(trace.metadata.systemPrompt),
        reasoning: trace.metadata.reasoning && maskPIIDeep(trace.metadata.reasoning),
        error: trace.metadata.error && maskPIIDeep(trace.metadata.error),
      },
      raw: maskPIIDeep(trace.raw),
    };
  }

  try {
    await insertTrace(trace, userId);
  } catch (err) {
    if (String((err as { message?: string })?.message ?? err).includes("UNIQUE")) {
      return reply.status(409).send({ error: `Trace ${trace.id} already exists` });
    }
    throw err;
  }
  void fireWebhookIfConfigured(userId, trace);
  return reply.status(201).send(trace);
}

const TRACE_SORTS: TraceSort[] = ["recent", "latency", "cost", "tokens"];
const TRACE_STATUSES: TraceStatus[] = ["ok", "warn", "err"];
const LATENCY_BUCKETS: LatencyBucket[] = ["fast", "med", "slow", "verySlow"];

@Controller("/traces")
export class TracesController {
  @GET("/")
  async list(
    request: FastifyRequest<{
      Querystring: {
        limit?: string;
        offset?: string;
        provider?: string;
        model?: string;
        status?: string;
        latency?: string;
        from?: string;
        to?: string;
        q?: string;
        sort?: string;
        name?: string;
        env?: string;
        sessionId?: string;
      };
    }>
  ) {
    const userId = request.user.userId;
    const limit = request.query.limit ? parseInt(request.query.limit, 10) : 50;
    const offset = request.query.offset ? parseInt(request.query.offset, 10) : 0;
    const provider = request.query.provider as TraceProvider | undefined;
    const model = request.query.model || undefined;
    const status = TRACE_STATUSES.includes(request.query.status as TraceStatus)
      ? (request.query.status as TraceStatus)
      : undefined;
    const latency = LATENCY_BUCKETS.includes(request.query.latency as LatencyBucket)
      ? (request.query.latency as LatencyBucket)
      : undefined;
    const from = request.query.from || undefined;
    const to = request.query.to || undefined;
    const q = request.query.q || undefined;
    const sort = TRACE_SORTS.includes(request.query.sort as TraceSort)
      ? (request.query.sort as TraceSort)
      : undefined;
    const name = request.query.name || undefined;
    const env = request.query.env || undefined;
    const sessionId = request.query.sessionId || undefined;
    return listTraces({ limit, offset, provider, model, status, latency, from, to, q, sort, name, env, sessionId, userId });
  }

  /** Distinct trace names, environments and models - for filter dropdowns */
  @GET("/facets")
  async facets(request: FastifyRequest) {
    return listFacets(request.user.userId);
  }

  @GET("/:id")
  async getById(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) {
    const trace = await getTrace(request.params.id, request.user.userId);
    if (!trace) return reply.status(404).send({ error: "Trace not found" });
    return trace;
  }

  @POST("/anthropic")
  async ingestAnthropicLog(
    request: FastifyRequest<{ Body: AnthropicRawLog }>,
    reply: FastifyReply
  ) {
    return ingest(request, reply, parseAnthropicLog(request.body));
  }

  @POST("/openai")
  async ingestOpenAILog(
    request: FastifyRequest<{ Body: OpenAIRawLog }>,
    reply: FastifyReply
  ) {
    return ingest(request, reply, parseOpenAILog(request.body));
  }

  /**
   * Every other OpenAI-compatible provider (Groq, Gemini, Mistral, DeepSeek, xAI, OpenRouter,
   * Together, Fireworks, Perplexity, Cerebras, Ollama, Azure OpenAI) - same parser, recorded
   * under its own provider id.
   */
  @POST("/:provider")
  async ingestOpenAICompatibleLog(
    request: FastifyRequest<{ Params: { provider: string }; Body: OpenAIRawLog }>,
    reply: FastifyReply
  ) {
    const provider = request.params.provider as OpenAICompatibleProvider;
    if (!OPENAI_COMPATIBLE_PROVIDERS.includes(provider)) {
      return reply.status(404).send({ error: `Unknown provider "${request.params.provider}"` });
    }
    return ingest(request, reply, parseOpenAILog(request.body, { provider }));
  }

  @POST("/vercel-ai")
  async ingestVercelAILog(
    request: FastifyRequest<{ Body: VercelAIRawLog }>,
    reply: FastifyReply
  ) {
    return ingest(request, reply, parseVercelAILog(request.body));
  }

  @PATCH("/:id")
  async patch(
    request: FastifyRequest<{ Params: { id: string }; Body: { starred?: boolean } }>,
    reply: FastifyReply
  ) {
    if (typeof request.body?.starred !== "boolean") {
      return reply.status(400).send({ error: "starred must be a boolean" });
    }
    const trace = await setStarred(request.params.id, request.user.userId, request.body.starred);
    if (!trace) return reply.status(404).send({ error: "Trace not found" });
    return trace;
  }

  @POST("/:id/replay")
  async replay(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) {
    const original = await getTrace(request.params.id, request.user.userId);
    if (!original) return reply.status(404).send({ error: "Trace not found" });

    const result = await replayTrace(original);
    if (!result.success) return reply.status(422).send({ error: result.error });

    const trace = await insertTrace(result.trace, request.user.userId, original.id);
    return reply.status(201).send(trace);
  }

  @DELETE("/:id")
  async remove(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) {
    const deleted = await deleteTrace(request.params.id, request.user.userId);
    if (!deleted) return reply.status(404).send({ error: "Trace not found" });
    return reply.status(204).send();
  }

  @DELETE("/")
  async removeMany(
    request: FastifyRequest<{ Body: { ids?: string[] } }>,
    reply: FastifyReply
  ) {
    const ids = request.body?.ids;
    if (!Array.isArray(ids) || ids.length === 0) {
      return reply.status(400).send({ error: "ids must be a non-empty array" });
    }
    const deletedCount = await deleteTraces(ids, request.user.userId);
    return { deletedCount };
  }

  @GET("/:id/notes")
  async getNotes(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) {
    const trace = await getTrace(request.params.id, request.user.userId);
    if (!trace) return reply.status(404).send({ error: "Trace not found" });
    return listNotes(request.params.id);
  }

  @POST("/:id/notes")
  async postNote(
    request: FastifyRequest<{ Params: { id: string }; Body: { body?: string } }>,
    reply: FastifyReply
  ) {
    const trace = await getTrace(request.params.id, request.user.userId);
    if (!trace) return reply.status(404).send({ error: "Trace not found" });
    const body = request.body?.body?.trim();
    if (!body) return reply.status(400).send({ error: "body is required" });
    const note = await addNote(request.params.id, request.user.userId, body);
    return reply.status(201).send(note);
  }
}
