import crypto from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db, orgMembers, users } from "./index";

export type MemberRole = "owner" | "admin" | "member" | "viewer";

export async function getOrCreateOwnerMembership(orgSlug: string, userId: string, email: string) {
  const existing = await db
    .select()
    .from(orgMembers)
    .where(and(eq(orgMembers.orgSlug, orgSlug), eq(orgMembers.userId, userId)))
    .limit(1);
  if (existing[0]) return existing[0];

  const row = {
    id: crypto.randomUUID(),
    orgSlug,
    userId,
    email,
    role: "owner" as MemberRole,
    status: "active",
    joinedAt: Date.now(),
  };
  await db.insert(orgMembers).values(row);
  return row;
}

export async function listMembers(orgSlug: string) {
  const rows = await db
    .select()
    .from(orgMembers)
    .leftJoin(users, eq(orgMembers.userId, users.id))
    .where(eq(orgMembers.orgSlug, orgSlug));

  return rows
    .map(({ org_members: m, users: u }) => {
      const email = u?.email ?? m.email;
      return {
        id: m.id,
        userId: m.userId,
        email,
        displayName: u?.displayName || email.split("@")[0],
        role: m.role as MemberRole,
        status: m.status as "pending" | "active",
        inviteToken: m.status === "pending" ? m.inviteToken : null,
        invitedAt: m.invitedAt,
        joinedAt: m.joinedAt,
      };
    })
    .sort((a, b) => a.invitedAt - b.invitedAt);
}

export async function findMemberByEmail(orgSlug: string, email: string) {
  const rows = await db
    .select()
    .from(orgMembers)
    .where(and(eq(orgMembers.orgSlug, orgSlug), eq(orgMembers.email, email)))
    .limit(1);
  return rows[0] ?? null;
}

export async function findMemberById(id: string, orgSlug: string) {
  const rows = await db
    .select()
    .from(orgMembers)
    .where(and(eq(orgMembers.id, id), eq(orgMembers.orgSlug, orgSlug)))
    .limit(1);
  return rows[0] ?? null;
}

export async function inviteMember(orgSlug: string, email: string, role: MemberRole) {
  const id = crypto.randomUUID();
  const token = crypto.randomBytes(24).toString("base64url");
  await db.insert(orgMembers).values({
    id,
    orgSlug,
    email,
    role,
    status: "pending",
    inviteToken: token,
    invitedAt: Date.now(),
  });
  return { id, token };
}

export async function findInviteByToken(token: string) {
  const rows = await db
    .select()
    .from(orgMembers)
    .where(and(eq(orgMembers.inviteToken, token), eq(orgMembers.status, "pending")))
    .limit(1);
  return rows[0] ?? null;
}

export async function acceptInvite(token: string, userId: string) {
  const invite = await findInviteByToken(token);
  if (!invite) return null;
  await db
    .update(orgMembers)
    .set({ userId, status: "active", joinedAt: Date.now(), inviteToken: null })
    .where(eq(orgMembers.id, invite.id));
  return invite;
}

export async function updateMemberRole(id: string, orgSlug: string, role: MemberRole) {
  await db
    .update(orgMembers)
    .set({ role })
    .where(and(eq(orgMembers.id, id), eq(orgMembers.orgSlug, orgSlug)));
}

export async function renameOrgMembers(oldSlug: string, newSlug: string) {
  await db.update(orgMembers).set({ orgSlug: newSlug }).where(eq(orgMembers.orgSlug, oldSlug));
}

export async function removeMember(id: string, orgSlug: string) {
  const result = await db
    .delete(orgMembers)
    .where(and(eq(orgMembers.id, id), eq(orgMembers.orgSlug, orgSlug)));
  return (result.rowsAffected ?? 0) > 0;
}

export async function removeAllOrgMembers(orgSlug: string) {
  await db.delete(orgMembers).where(eq(orgMembers.orgSlug, orgSlug));
}
