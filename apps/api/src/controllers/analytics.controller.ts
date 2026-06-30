import { Controller, GET, POST } from "fastify-decorators";
import type { FastifyReply, FastifyRequest } from "fastify";
import { recordPageview, touchPing, getStats } from "../db/analytics.repository";
import { ANALYTICS_PING_RATE_LIMIT } from "../constants";

interface PingBody {
  path: string;
  visitorId: string;
  sessionId: string;
  view?: boolean;
}

@Controller("/analytics")
export class AnalyticsController {
  @POST("/ping", { config: { rateLimit: ANALYTICS_PING_RATE_LIMIT } })
  async ping(request: FastifyRequest<{ Body: PingBody }>, reply: FastifyReply) {
    const { path, visitorId, sessionId, view } = request.body ?? {};
    if (!path || !visitorId || !sessionId) return reply.status(400).send({ error: "path, visitorId, sessionId are required" });

    const safePath = path.slice(0, 200);
    const safeVisitorId = visitorId.slice(0, 64);
    const safeSessionId = sessionId.slice(0, 64);

    await touchPing(safeSessionId, safePath);
    if (view) await recordPageview(safePath, safeVisitorId, safeSessionId);

    return reply.status(204).send();
  }

  @GET("/stats")
  async stats(request: FastifyRequest<{ Querystring: { days?: string } }>) {
    const days = Math.min(Math.max(parseInt(request.query.days ?? "14", 10) || 14, 1), 90);
    return getStats(days);
  }
}
