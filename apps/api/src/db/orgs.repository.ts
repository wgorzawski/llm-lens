import { eq, ne, and } from "drizzle-orm";
import { db, orgs } from "./index";

export async function getOrg(slug: string) {
  const rows = await db.select().from(orgs).where(eq(orgs.slug, slug)).limit(1);
  return rows[0] ?? null;
}

export async function findOrgBySlugExcluding(slug: string, excludeSlug: string) {
  const rows = await db.select().from(orgs).where(and(eq(orgs.slug, slug), ne(orgs.slug, excludeSlug))).limit(1);
  return rows[0] ?? null;
}

export async function updateLogoUrl(slug: string, logoUrl: string | null) {
  await db.update(orgs).set({ logoUrl }).where(eq(orgs.slug, slug));
}

export interface OrgUpdate {
  slug?: string;
  name?: string;
  defaultEnv?: string;
  retentionDays?: number;
}

export async function upsertOrg(currentSlug: string, update: OrgUpdate) {
  const existing = await getOrg(currentSlug);
  const nextSlug = update.slug ?? currentSlug;
  if (!existing) {
    const row = {
      slug: nextSlug,
      name: update.name ?? currentSlug,
      defaultEnv: update.defaultEnv ?? "production",
      retentionDays: update.retentionDays ?? 7,
    };
    await db.insert(orgs).values(row);
    return getOrg(nextSlug);
  }
  if (nextSlug !== currentSlug) {
    await db.insert(orgs).values({
      slug: nextSlug,
      name: update.name ?? existing.name,
      defaultEnv: update.defaultEnv ?? existing.defaultEnv,
      retentionDays: update.retentionDays ?? existing.retentionDays,
    });
    await db.delete(orgs).where(eq(orgs.slug, currentSlug));
    return getOrg(nextSlug);
  }
  await db.update(orgs).set(update).where(eq(orgs.slug, currentSlug));
  return getOrg(currentSlug);
}

export async function deleteOrg(slug: string) {
  await db.delete(orgs).where(eq(orgs.slug, slug));
}

export async function listAllOrgs() {
  return db.select().from(orgs);
}
