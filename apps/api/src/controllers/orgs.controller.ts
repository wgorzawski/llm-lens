import { Controller, GET, PATCH, POST, DELETE } from "fastify-decorators";
import type { FastifyReply, FastifyRequest } from "fastify";
import { findUserById, updateUserOrgSlug } from "../db/users.repository";
import { getOrg, upsertOrg, findOrgBySlugExcluding, type OrgUpdate } from "../db/orgs.repository";
import {
  getOrCreateOwnerMembership,
  listMembers,
  findMemberByEmail,
  findMemberById,
  inviteMember,
  findInviteByToken,
  acceptInvite,
  updateMemberRole,
  removeMember,
  renameOrgMembers,
  type MemberRole,
} from "../db/org-members.repository";

const ROLES: MemberRole[] = ["owner", "admin", "member", "viewer"];

@Controller("/orgs")
export class OrgsController {
  @GET("/me")
  async getMine(request: FastifyRequest, reply: FastifyReply) {
    const user = await findUserById(request.user.userId);
    if (!user) return reply.status(404).send({ error: "User not found" });
    const org = await getOrg(user.org);
    return org ?? { slug: user.org, name: user.org, defaultEnv: "production", retentionDays: 7 };
  }

  @PATCH("/me")
  async updateMine(
    request: FastifyRequest<{ Body: OrgUpdate }>,
    reply: FastifyReply
  ) {
    const user = await findUserById(request.user.userId);
    if (!user) return reply.status(404).send({ error: "User not found" });

    const { slug, name, defaultEnv, retentionDays } = request.body;
    if (slug !== undefined && slug.trim() && slug.trim() !== user.org) {
      const existing = await findOrgBySlugExcluding(slug.trim(), user.org);
      if (existing) return reply.status(409).send({ error: "Slug is already taken" });
    }

    const update: OrgUpdate = {};
    if (slug !== undefined) update.slug = slug.trim();
    if (name !== undefined) update.name = name;
    if (defaultEnv !== undefined) update.defaultEnv = defaultEnv;
    if (retentionDays !== undefined) update.retentionDays = retentionDays;

    const org = await upsertOrg(user.org, update);
    if (update.slug && update.slug !== user.org) {
      await updateUserOrgSlug(user.id, update.slug);
      await renameOrgMembers(user.org, update.slug);
    }
    return org;
  }

  @GET("/me/members")
  async listMine(request: FastifyRequest, reply: FastifyReply) {
    const user = await findUserById(request.user.userId);
    if (!user) return reply.status(404).send({ error: "User not found" });
    await getOrCreateOwnerMembership(user.org, user.id, user.email);
    return listMembers(user.org);
  }

  @POST("/me/members/invite")
  async invite(
    request: FastifyRequest<{ Body: { email: string; role: MemberRole } }>,
    reply: FastifyReply
  ) {
    const user = await findUserById(request.user.userId);
    if (!user) return reply.status(404).send({ error: "User not found" });

    const email = request.body.email?.trim().toLowerCase();
    const role = request.body.role;
    if (!email) return reply.status(400).send({ error: "Email is required" });
    if (!ROLES.includes(role)) return reply.status(400).send({ error: "Invalid role" });
    if (role === "owner") return reply.status(400).send({ error: "Cannot invite as owner" });

    await getOrCreateOwnerMembership(user.org, user.id, user.email);
    const existing = await findMemberByEmail(user.org, email);
    if (existing) return reply.status(409).send({ error: "This person is already a member or has a pending invite" });

    const { id, token } = await inviteMember(user.org, email, role);
    const frontendUrl = process.env["FRONTEND_URL"] ?? "http://localhost:3000";
    return reply.status(201).send({ id, token, inviteUrl: `${frontendUrl}/invite/${token}` });
  }

  @PATCH("/me/members/:id")
  async changeRole(
    request: FastifyRequest<{ Params: { id: string }; Body: { role: MemberRole } }>,
    reply: FastifyReply
  ) {
    const user = await findUserById(request.user.userId);
    if (!user) return reply.status(404).send({ error: "User not found" });

    const role = request.body.role;
    if (!ROLES.includes(role)) return reply.status(400).send({ error: "Invalid role" });

    const member = await findMemberById(request.params.id, user.org);
    if (!member) return reply.status(404).send({ error: "Member not found" });
    if (member.userId === user.id) return reply.status(400).send({ error: "Cannot change your own role" });

    await updateMemberRole(member.id, user.org, role);
    return listMembers(user.org);
  }

  @DELETE("/me/members/:id")
  async kick(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) {
    const user = await findUserById(request.user.userId);
    if (!user) return reply.status(404).send({ error: "User not found" });

    const member = await findMemberById(request.params.id, user.org);
    if (!member) return reply.status(404).send({ error: "Member not found" });
    if (member.userId === user.id) return reply.status(400).send({ error: "Cannot remove yourself" });

    await removeMember(member.id, user.org);
    if (member.userId && member.status === "active") {
      await updateUserOrgSlug(member.userId, "personal");
    }
    return reply.status(204).send();
  }

  @GET("/invites/:token")
  async previewInvite(
    request: FastifyRequest<{ Params: { token: string } }>,
    reply: FastifyReply
  ) {
    const invite = await findInviteByToken(request.params.token);
    if (!invite) return reply.status(404).send({ error: "Invite not found or already used" });
    const org = await getOrg(invite.orgSlug);
    return { orgSlug: invite.orgSlug, orgName: org?.name ?? invite.orgSlug, email: invite.email, role: invite.role };
  }

  @POST("/invites/:token/accept")
  async accept(
    request: FastifyRequest<{ Params: { token: string } }>,
    reply: FastifyReply
  ) {
    const user = await findUserById(request.user.userId);
    if (!user) return reply.status(404).send({ error: "User not found" });

    const invite = await findInviteByToken(request.params.token);
    if (!invite) return reply.status(404).send({ error: "Invite not found or already used" });
    if (invite.email.toLowerCase() !== user.email.toLowerCase()) {
      return reply.status(403).send({ error: "This invite was sent to a different email address" });
    }

    await acceptInvite(request.params.token, user.id);
    await updateUserOrgSlug(user.id, invite.orgSlug);
    const org = await getOrg(invite.orgSlug);
    return org;
  }
}
