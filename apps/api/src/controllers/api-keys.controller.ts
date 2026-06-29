import { Controller, GET, POST, PATCH, DELETE } from "fastify-decorators";
import type { FastifyReply, FastifyRequest } from "fastify";
import {
  createApiKey, listApiKeys, updateApiKey, rotateApiKey, deleteApiKey,
  getOrCreateWebhookSecret, rotateWebhookSecret,
} from "../db/api-keys.repository";
import { findUserById } from "../db/users.repository";

const VALID_ENVS = ["production", "staging", "ci", "dev"] as const;
const VALID_SCOPES = ["read", "write", "replay", "export", "delete"] as const;
const VALID_STATUSES = ["active", "disabled"] as const;

@Controller("/keys")
export class ApiKeysController {
  @GET("/")
  async list(request: FastifyRequest) {
    return listApiKeys(request.user.userId);
  }

  @POST("/")
  async create(
    request: FastifyRequest<{ Body: { name: string; env?: string; scopes?: string[] } }>,
    reply: FastifyReply,
  ) {
    const { name, env = "production", scopes = ["read", "write"] } = request.body;
    if (!name?.trim()) return reply.status(400).send({ error: "name is required" });
    if (!VALID_ENVS.includes(env as typeof VALID_ENVS[number])) {
      return reply.status(400).send({ error: `env must be one of: ${VALID_ENVS.join(", ")}` });
    }
    if (!Array.isArray(scopes) || scopes.length === 0 || scopes.some((s) => !VALID_SCOPES.includes(s as typeof VALID_SCOPES[number]))) {
      return reply.status(400).send({ error: `scopes must be a non-empty array of: ${VALID_SCOPES.join(", ")}` });
    }
    const result = await createApiKey(request.user.userId, name.trim(), env, scopes);
    return reply.status(201).send(result);
  }

  @PATCH("/:id")
  async update(
    request: FastifyRequest<{ Params: { id: string }; Body: { name?: string; scopes?: string[]; status?: string } }>,
    reply: FastifyReply,
  ) {
    const { name, scopes, status } = request.body;
    if (status !== undefined && !VALID_STATUSES.includes(status as typeof VALID_STATUSES[number])) {
      return reply.status(400).send({ error: `status must be one of: ${VALID_STATUSES.join(", ")}` });
    }
    if (scopes !== undefined && (
      !Array.isArray(scopes) || scopes.some((s) => !VALID_SCOPES.includes(s as typeof VALID_SCOPES[number]))
    )) {
      return reply.status(400).send({ error: `invalid scopes` });
    }
    const result = await updateApiKey(request.params.id, request.user.userId, { name, scopes, status });
    if (!result) return reply.status(404).send({ error: "Key not found" });
    return result;
  }

  @POST("/:id/rotate")
  async rotate(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ) {
    const result = await rotateApiKey(request.params.id, request.user.userId);
    if (!result) return reply.status(404).send({ error: "Key not found" });
    return result;
  }

  @DELETE("/:id")
  async revoke(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ) {
    const deleted = await deleteApiKey(request.params.id, request.user.userId);
    if (!deleted) return reply.status(404).send({ error: "Key not found" });
    return reply.status(204).send();
  }

  @GET("/webhook-secret")
  async getWebhookSecret(request: FastifyRequest, reply: FastifyReply) {
    const user = await findUserById(request.user.userId);
    if (!user) return reply.status(404).send({ error: "User not found" });
    const secret = await getOrCreateWebhookSecret(user.org);
    const tail = secret.slice(-4);
    return { prefix: "whsec_", tail, masked: `whsec_${"•".repeat(20)}${tail}` };
  }

  @POST("/webhook-secret/rotate")
  async rotateWebhook(request: FastifyRequest, reply: FastifyReply) {
    const user = await findUserById(request.user.userId);
    if (!user) return reply.status(404).send({ error: "User not found" });
    const secret = await rotateWebhookSecret(user.org);
    return { key: secret };
  }

  @POST("/webhook-secret/reveal")
  async revealWebhook(request: FastifyRequest, reply: FastifyReply) {
    const user = await findUserById(request.user.userId);
    if (!user) return reply.status(404).send({ error: "User not found" });
    const secret = await getOrCreateWebhookSecret(user.org);
    return { key: secret };
  }
}
