import { Controller, GET, DELETE } from "fastify-decorators";
import type { FastifyReply, FastifyRequest } from "fastify";
import { listSessions, deleteSession } from "../db/sessions.repository";

@Controller("/sessions")
export class SessionsController {
  @GET("/")
  async list(request: FastifyRequest) {
    const sessions = await listSessions(request.user.userId);
    return sessions.map((s) => ({ ...s, current: s.id === request.user.sid }));
  }

  /** Signs out the session the request was made with */
  @DELETE("/current")
  async revokeCurrent(request: FastifyRequest, reply: FastifyReply) {
    if (request.user.sid) await deleteSession(request.user.sid, request.user.userId);
    return reply.status(204).send();
  }

  @DELETE("/:id")
  async revoke(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) {
    const deleted = await deleteSession(request.params.id, request.user.userId);
    if (!deleted) return reply.status(404).send({ error: "Session not found" });
    return reply.status(204).send();
  }
}
