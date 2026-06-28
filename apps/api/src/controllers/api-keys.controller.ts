import { Controller, GET, POST, DELETE } from "fastify-decorators";
import type { FastifyReply, FastifyRequest } from "fastify";
import { createApiKey, listApiKeys, deleteApiKey } from "../db/api-keys.repository";

@Controller("/keys")
export class ApiKeysController {
  @GET("/")
  async list(request: FastifyRequest) {
    return listApiKeys(request.user.userId);
  }

  @POST("/")
  async create(
    request: FastifyRequest<{ Body: { name: string } }>,
    reply: FastifyReply
  ) {
    const { name } = request.body;
    if (!name?.trim()) {
      return reply.status(400).send({ error: "name is required" });
    }
    const result = await createApiKey(request.user.userId, name.trim());
    return reply.status(201).send(result);
  }

  @DELETE("/:id")
  async revoke(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) {
    const deleted = await deleteApiKey(request.params.id, request.user.userId);
    if (!deleted) return reply.status(404).send({ error: "Key not found" });
    return reply.status(204).send();
  }
}
