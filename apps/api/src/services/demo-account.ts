import bcrypt from "bcryptjs";
import {
  createUser,
  disableTotp,
  findUserByEmail,
  findUserById,
  updateAvatarUrl,
  updatePasswordHash,
  updateUserOrgSlug,
} from "../db/users.repository";
import { getOrg, updateLogoUrl, upsertOrg } from "../db/orgs.repository";
import { BCRYPT_ROUNDS, DEMO_EMAIL, DEMO_MIN_RETENTION_DAYS, DEMO_ORG_NAME, DEMO_PASSWORD } from "../constants";

// Puts the shared demo account back into a working state, whatever visitors did to it
// (or older versions of the app allowed): the account exists, logs in with the public
// demo password, has no 2FA, and its org has the demo name, retention and no logo.
// Without this, one changed password or e-mail meant the "Try the demo" button logged
// visitors into an empty or non-existent account until someone re-seeded by hand.
export async function ensureDemoAccount(): Promise<{ id: string; email: string }> {
  let user = await findUserByEmail(DEMO_EMAIL);
  if (!user) {
    const created = await createUser(DEMO_EMAIL, await bcrypt.hash(DEMO_PASSWORD, BCRYPT_ROUNDS));
    user = await findUserById(created.id);
    if (!user) throw new Error("Failed to create the demo account");
  }

  if (!user.passwordHash || !(await bcrypt.compare(DEMO_PASSWORD, user.passwordHash))) {
    await updatePasswordHash(user.id, await bcrypt.hash(DEMO_PASSWORD, BCRYPT_ROUNDS));
  }
  if (user.totpEnabled || user.totpSecret) await disableTotp(user.id);
  if (user.avatarUrl) await updateAvatarUrl(user.id, null);

  // "personal" is what deleting the org leaves behind - give the account its own org again.
  let orgSlug = user.org;
  if (!orgSlug || orgSlug === "personal") {
    orgSlug = `org-${user.id.slice(0, 8)}`;
    await updateUserOrgSlug(user.id, orgSlug);
  }
  const org = await getOrg(orgSlug);
  if (!org || org.name !== DEMO_ORG_NAME || org.retentionDays < DEMO_MIN_RETENTION_DAYS) {
    await upsertOrg(orgSlug, { name: DEMO_ORG_NAME, retentionDays: DEMO_MIN_RETENTION_DAYS });
  }
  if (org?.logoUrl) await updateLogoUrl(orgSlug, null);

  return { id: user.id, email: user.email };
}
