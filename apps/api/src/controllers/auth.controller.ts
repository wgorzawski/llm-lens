import { Controller, POST } from "fastify-decorators";
import type { FastifyReply, FastifyRequest } from "fastify";
import bcrypt from "bcryptjs";
import { createUser, findUserByEmail } from "../db/users.repository.js";

declare module "@fastify/jwt" {
  interface FastifyJWT {
    user: { userId: string; email: string };
  }
}

@Controller("/auth")
export class AuthController {
  @POST("/register")
  async register(
    request: FastifyRequest<{ Body: { email: string; password: string } }>,
    reply: FastifyReply
  ) {
    const { email, password } = request.body;

    if (!email || !password) {
      return reply.status(400).send({ error: "Email and password are required" });
    }
    if (password.length < 8) {
      return reply.status(400).send({ error: "Password must be at least 8 characters" });
    }

    const existing = await findUserByEmail(email);
    if (existing) {
      return reply.status(409).send({ error: "Email already in use" });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await createUser(email, passwordHash);

    const token = request.server.jwt.sign({ userId: user.id, email: user.email });
    return reply.status(201).send({ token, user });
  }

  @POST("/login")
  async login(
    request: FastifyRequest<{ Body: { email: string; password: string } }>,
    reply: FastifyReply
  ) {
    const { email, password } = request.body;

    if (!email || !password) {
      return reply.status(400).send({ error: "Email and password are required" });
    }

    const user = await findUserByEmail(email);
    if (!user) {
      return reply.status(401).send({ error: "Invalid email or password" });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return reply.status(401).send({ error: "Invalid email or password" });
    }

    const token = request.server.jwt.sign({ userId: user.id, email: user.email });
    return { token, user: { id: user.id, email: user.email } };
  }
}
