import { Controller, GET, POST, PATCH, DELETE } from "fastify-decorators";
import type { FastifyReply, FastifyRequest } from "fastify";
import { parseAnthropicLog, parseOpenAILog, parseVercelAILog } from "@llm-lens/parsers";
import type { AnthropicRawLog, OpenAIRawLog, VercelAIRawLog, TraceProvider } from "@llm-lens/types";
import {
  insertTrace,
  listTraces,
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
    return listTraces({ limit, offset, provider, model, status, latency, from, to, q, sort, userId });
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
    const result = parseAnthropicLog(request.body);
    if (!result.success) return reply.status(422).send({ error: result.error });
    const trace = await insertTrace(result.trace, request.user.userId);
    return reply.status(201).send(trace);
  }

  @POST("/openai")
  async ingestOpenAILog(
    request: FastifyRequest<{ Body: OpenAIRawLog }>,
    reply: FastifyReply
  ) {
    const result = parseOpenAILog(request.body);
    if (!result.success) return reply.status(422).send({ error: result.error });
    const trace = await insertTrace(result.trace, request.user.userId);
    return reply.status(201).send(trace);
  }

  @POST("/vercel-ai")
  async ingestVercelAILog(
    request: FastifyRequest<{ Body: VercelAIRawLog }>,
    reply: FastifyReply
  ) {
    const result = parseVercelAILog(request.body);
    if (!result.success) return reply.status(422).send({ error: result.error });
    const trace = await insertTrace(result.trace, request.user.userId);
    return reply.status(201).send(trace);
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
