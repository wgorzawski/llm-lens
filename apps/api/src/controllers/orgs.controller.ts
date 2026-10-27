import { Controller, GET, PATCH, POST, DELETE } from "fastify-decorators";
import type { FastifyReply, FastifyRequest } from "fastify";
import { createWriteStream, mkdirSync } from "node:fs";
import { unlink } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { findUserById, updateUserOrgSlug, listOrgUserIds, privateOrgSlug } from "../db/users.repository";
import { getOrg, upsertOrg, findOrgBySlugExcluding, updateLogoUrl, deleteOrg, type OrgUpdate } from "../db/orgs.repository";
import { deleteAllOrgTraces, getDashboardV2 } from "../db/repository";
import { clearScopeCache } from "../db/scope";
import { roleOf } from "../services/roles";
import { defaultRetentionDays } from "../services/instance";

const UPLOADS_DIR = path.resolve(process.env["UPLOADS_DIR"] ?? "./uploads");
const LOGOS_DIR = path.join(UPLOADS_DIR, "logos");
mkdirSync(LOGOS_DIR, { recursive: true });
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
  removeAllOrgMembers,
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
    const role = await roleOf(user.id);
    return { ...(org ?? { slug: user.org, name: user.org, defaultEnv: "production", retentionDays: defaultRetentionDays, logoUrl: null }), role };
  }

  @GET("/me/stats")
  async getStats(request: FastifyRequest<{ Querystring: { range?: string } }>, reply: FastifyReply) {
    const user = await findUserById(request.user.userId);
    if (!user) return reply.status(404).send({ error: "User not found" });
    return getDashboardV2(user.id, request.query.range ?? "24h");
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
    if (retentionDays !== undefined) {
      if (!Number.isInteger(retentionDays) || retentionDays < 0 || retentionDays > 3650) {
        return reply.status(400).send({ error: "retentionDays must be a whole number of days (0 = keep forever)" });
      }
      update.retentionDays = retentionDays;
    }

    const org = await upsertOrg(user.org, update);
    if (update.slug && update.slug !== user.org) {
      await updateUserOrgSlug(user.id, update.slug);
      await renameOrgMembers(user.org, update.slug);
    }
    return org;
  }

  @POST("/me/logo")
  async uploadLogo(request: FastifyRequest, reply: FastifyReply) {
    const user = await findUserById(request.user.userId);
    if (!user) return reply.status(404).send({ error: "User not found" });

    const data = await request.file();
    if (!data) return reply.status(400).send({ error: "No file provided" });

    const ext = path.extname(data.filename).toLowerCase() || ".png";
    const allowed = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg"];
    if (!allowed.includes(ext)) return reply.status(400).send({ error: "File type not allowed" });

    const filename = `${user.org}${ext}`;
    const dest = path.join(LOGOS_DIR, filename);
    await pipeline(data.file, createWriteStream(dest));

    const logoUrl = `/uploads/logos/${filename}`;
    await updateLogoUrl(user.org, logoUrl);
    return { logoUrl };
  }

  @DELETE("/me/logo")
  async deleteLogo(request: FastifyRequest, reply: FastifyReply) {
    const user = await findUserById(request.user.userId);
    if (!user) return reply.status(404).send({ error: "User not found" });
    const org = await getOrg(user.org);
    if (org?.logoUrl) {
      const filePath = path.join(UPLOADS_DIR, org.logoUrl.replace("/uploads/", ""));
      await unlink(filePath).catch(() => null);
    }
    await updateLogoUrl(user.org, null);
    return reply.status(204).send();
  }

  @PATCH("/me/owner")
  async transferOwnership(
    request: FastifyRequest<{ Body: { email: string } }>,
    reply: FastifyReply
  ) {
    const user = await findUserById(request.user.userId);
    if (!user) return reply.status(404).send({ error: "User not found" });

    const email = request.body.email?.trim().toLowerCase();
    if (!email) return reply.status(400).send({ error: "Email is required" });
    if (email === user.email.toLowerCase()) return reply.status(400).send({ error: "Cannot transfer to yourself" });

    const newOwner = await findMemberByEmail(user.org, email);
    if (!newOwner || newOwner.status !== "active") {
      return reply.status(404).send({ error: "No active member found with that email" });
    }

    // make sure the current owner has a membership row, so the demotion sticks
    await getOrCreateOwnerMembership(user.org, user.id, user.email);
    const currentMember = await findMemberByEmail(user.org, user.email);
    if (currentMember) await updateMemberRole(currentMember.id, user.org, "admin");
    await updateMemberRole(newOwner.id, user.org, "owner");

    return { ok: true };
  }

  @DELETE("/me/traces")
  async wipeTraces(request: FastifyRequest, reply: FastifyReply) {
    const user = await findUserById(request.user.userId);
    if (!user) return reply.status(404).send({ error: "User not found" });
    const deleted = await deleteAllOrgTraces(user.id);
    return { deleted };
  }

  @DELETE("/me")
  async deleteOrganization(request: FastifyRequest, reply: FastifyReply) {
    const user = await findUserById(request.user.userId);
    if (!user) return reply.status(404).send({ error: "User not found" });
    await deleteAllOrgTraces(user.id);
    // everyone in the org (owner included) gets a fresh private org of their own
    const orgUsers = await listOrgUserIds(user.org);
    for (const id of orgUsers) await updateUserOrgSlug(id, privateOrgSlug(id));
    await removeAllOrgMembers(user.org);
    await deleteOrg(user.org);
    clearScopeCache();
    return reply.status(204).send();
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

    if (role === "owner") return reply.status(400).send({ error: "Use \"Transfer ownership\" to make someone the owner" });
    const member = await findMemberById(request.params.id, user.org);
    if (!member) return reply.status(404).send({ error: "Member not found" });
    if (member.userId === user.id) return reply.status(400).send({ error: "Cannot change your own role" });
    if (member.role === "owner") return reply.status(403).send({ error: "The owner's role can't be changed" });

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
    if (member.role === "owner") return reply.status(403).send({ error: "The owner can't be removed" });

    await removeMember(member.id, user.org);
    if (member.userId && member.status === "active") {
      // a private org of their own - "personal" would be shared with every other removed member
      await updateUserOrgSlug(member.userId, privateOrgSlug(member.userId));
      clearScopeCache();
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
    clearScopeCache();
    const org = await getOrg(invite.orgSlug);
    return org;
  }
}
