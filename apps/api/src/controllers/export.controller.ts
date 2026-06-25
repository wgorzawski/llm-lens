import { Controller, GET } from "fastify-decorators";
import type { FastifyReply, FastifyRequest } from "fastify";
import { Readable } from "node:stream";
import { createGzip } from "node:zlib";
import { iterateAllTraces, usageByDay } from "../db/repository.js";

@Controller("/export")
export class ExportController {
  @GET("/traces")
  async exportTraces(request: FastifyRequest, reply: FastifyReply) {
    const userId = request.user.userId;

    const lines = Readable.from(
      (async function* () {
        for await (const trace of iterateAllTraces(userId)) {
          yield `${JSON.stringify(trace)}\n`;
        }
      })()
    );

    reply.header("Content-Type", "application/jsonl");
    reply.header("Content-Encoding", "gzip");
    reply.header("Content-Disposition", "attachment; filename=\"traces.jsonl.gz\"");
    return reply.send(lines.pipe(createGzip()));
  }

  @GET("/usage")
  async exportUsage(request: FastifyRequest, reply: FastifyReply) {
    const rows = await usageByDay(request.user.userId);
    const header = "day,traces,input_tokens,output_tokens,cost_usd";
    const body = rows
      .map((r) => `${r.day},${r.traceCount},${r.inputTokens},${r.outputTokens},${r.costUsd.toFixed(6)}`)
      .join("\n");

    reply.header("Content-Type", "text/csv");
    reply.header("Content-Disposition", "attachment; filename=\"usage.csv\"");
    return reply.send(`${header}\n${body}\n`);
  }
}
