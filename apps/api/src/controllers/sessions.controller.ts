import { Controller, GET, DELETE } from "fastify-decorators";
import type { FastifyReply, FastifyRequest } from "fastify";
import { listSessions, deleteSession } from "../db/sessions.repository.js";

@Controller("/sessions")
export class SessionsController {
  @GET("/")
  async list(request: FastifyRequest) {
    return listSessions(request.user.userId);
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
