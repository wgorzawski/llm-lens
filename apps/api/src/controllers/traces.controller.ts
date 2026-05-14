import { Controller, GET, POST, DELETE } from "fastify-decorators";
import type { FastifyReply, FastifyRequest } from "fastify";
import { parseAnthropicLog, parseOpenAILog, parseVercelAILog } from "@llm-lens/parsers";
import type { AnthropicRawLog, OpenAIRawLog, VercelAIRawLog, TraceProvider } from "@llm-lens/types";
import { insertTrace, listTraces, getTrace, deleteTrace } from "../db/repository.js";

@Controller("/traces")
export class TracesController {
  @GET("/")
  async list(
    request: FastifyRequest<{
      Querystring: { limit?: string; offset?: string; provider?: string };
    }>
  ) {
    const limit = request.query.limit ? parseInt(request.query.limit, 10) : 50;
    const offset = request.query.offset ? parseInt(request.query.offset, 10) : 0;
    const provider = request.query.provider as TraceProvider | undefined;
    return listTraces({ limit, offset, provider });
  }

  @GET("/:id")
  async getById(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) {
    const trace = await getTrace(request.params.id);
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
    const trace = await insertTrace(result.trace);
    return reply.status(201).send(trace);
  }

  @POST("/openai")
  async ingestOpenAILog(
    request: FastifyRequest<{ Body: OpenAIRawLog }>,
    reply: FastifyReply
  ) {
    const result = parseOpenAILog(request.body);
    if (!result.success) return reply.status(422).send({ error: result.error });
    const trace = await insertTrace(result.trace);
    return reply.status(201).send(trace);
  }

  @POST("/vercel-ai")
  async ingestVercelAILog(
    request: FastifyRequest<{ Body: VercelAIRawLog }>,
    reply: FastifyReply
  ) {
    const result = parseVercelAILog(request.body);
    if (!result.success) return reply.status(422).send({ error: result.error });
    const trace = await insertTrace(result.trace);
    return reply.status(201).send(trace);
  }

  @DELETE("/:id")
  async remove(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) {
    const deleted = await deleteTrace(request.params.id);
    if (!deleted) return reply.status(404).send({ error: "Trace not found" });
    return reply.status(204).send();
  }
}
