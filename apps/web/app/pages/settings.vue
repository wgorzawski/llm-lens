<script setup lang="ts">
import type { MemberRole, OrgMember } from "~/composables/useOrgMembers";
import type { TotpSetup } from "~/composables/useTwoFactor";

definePageMeta({ layout: "app" });

const { token } = useAuth();
const { me, fetchMe, updateProfile, updatePassword, updatePreferences } = useMe();
if (!me.value) await fetchMe();

// settings sub-nav
const navSection = ref("profile");
const navGroups = [
  {
    label: "Personal",
    items: [
      { id: "profile",       label: "Profile",           icon: "user" },
      { id: "account",       label: "Account & security", icon: "shield" },
      { id: "notifications", label: "Notifications",     icon: "bell" },
      { id: "appearance",    label: "Appearance",        icon: "sun" },
    ],
  },
  {
    label: "Organization",
    items: [
      { id: "org",     label: "Organization",  icon: "building" },
      { id: "members", label: "Members",       icon: "users" },
      { id: "billing", label: "Billing",       icon: "card" },
      { id: "data",    label: "Data retention", icon: "database" },
    ],
  },
  {
    label: "Advanced",
    items: [
      { id: "domain", label: "Custom domain", icon: "globe" },
      { id: "danger", label: "Danger zone",   icon: "warn", danger: true },
    ],
  },
];

// profile
const displayName = ref(me.value?.displayName || "");
const handle = ref(me.value?.handle || "");
const tz = ref(me.value?.timezone || "UTC");
const locale = ref(me.value?.locale || "en-US");
const dateFormat = ref(me.value?.dateFormat || "iso");

const savingProfile = ref(false);
const profileError = ref<string | null>(null);
const profileSaved = ref(false);

async function saveProfile() {
  savingProfile.value = true;
  profileError.value = null;
  profileSaved.value = false;
  try {
    await updateProfile({
      displayName: displayName.value,
      handle: handle.value,
      timezone: tz.value,
      locale: locale.value,
      dateFormat: dateFormat.value,
    });
    profileSaved.value = true;
    setTimeout(() => (profileSaved.value = false), 2000);
  } catch (err) {
    profileError.value = err instanceof Error ? err.message : String(err);
  } finally {
    savingProfile.value = false;
  }
}

// account
const { setup: setupTwoFactor, verify: verifyTwoFactor, disable: disableTwoFactor, regenerateRecoveryCodes } = useTwoFactor();
const twoFA = computed(() => me.value?.totpEnabled ?? false);
const signinAlerts = ref(true);

const totpSetup = ref<TotpSetup | null>(null);
const totpVerifyCode = ref("");
const totpError = ref<string | null>(null);
const totpBusy = ref(false);
const revealedRecoveryCodes = ref<string[] | null>(null);
const disableCode = ref("");
const showDisableForm = ref(false);

async function startTwoFactorSetup() {
  totpError.value = null;
  totpBusy.value = true;
  try {
    totpSetup.value = await setupTwoFactor();
  } catch (err) {
    totpError.value = err instanceof Error ? err.message : String(err);
  } finally {
    totpBusy.value = false;
  }
}

async function confirmTwoFactorSetup() {
  totpError.value = null;
  totpBusy.value = true;
  try {
    const { recoveryCodes } = await verifyTwoFactor(totpVerifyCode.value);
    revealedRecoveryCodes.value = recoveryCodes;
    totpSetup.value = null;
    totpVerifyCode.value = "";
    await fetchMe();
  } catch (err) {
    totpError.value = err instanceof Error ? err.message : String(err);
  } finally {
    totpBusy.value = false;
  }
}

async function confirmDisableTwoFactor() {
  totpError.value = null;
  totpBusy.value = true;
  try {
    await disableTwoFactor(disableCode.value);
    disableCode.value = "";
    showDisableForm.value = false;
    await fetchMe();
  } catch (err) {
    totpError.value = err instanceof Error ? err.message : String(err);
  } finally {
    totpBusy.value = false;
  }
}

async function regenerateCodes() {
  const code = window.prompt("Enter your current authenticator code to regenerate recovery codes:");
  if (!code) return;
  totpError.value = null;
  try {
    const { recoveryCodes } = await regenerateRecoveryCodes(code);
    revealedRecoveryCodes.value = recoveryCodes;
  } catch (err) {
    totpError.value = err instanceof Error ? err.message : String(err);
  }
}

const currentPasswordInput = ref("");
const newPasswordInput = ref("");
const confirmPasswordInput = ref("");
const savingPassword = ref(false);
const passwordError = ref<string | null>(null);
const passwordSaved = ref(false);

async function changePassword() {
  passwordError.value = null;
  passwordSaved.value = false;
  if (newPasswordInput.value !== confirmPasswordInput.value) {
    passwordError.value = "Passwords do not match";
    return;
  }
  savingPassword.value = true;
  try {
    await updatePassword(currentPasswordInput.value, newPasswordInput.value);
    currentPasswordInput.value = "";
    newPasswordInput.value = "";
    confirmPasswordInput.value = "";
    passwordSaved.value = true;
    setTimeout(() => (passwordSaved.value = false), 2000);
  } catch (err) {
    passwordError.value = err instanceof Error ? err.message : String(err);
  } finally {
    savingPassword.value = false;
  }
}

// notifications
const savedNotifs = (me.value?.preferences?.notifications as Record<string, boolean>) || {};
const notifs = reactive({
  digestDaily: savedNotifs.digestDaily ?? true,
  digestWeekly: savedNotifs.digestWeekly ?? false,
  alertErr: savedNotifs.alertErr ?? true,
  alertLatency: savedNotifs.alertLatency ?? true,
  alertCost: savedNotifs.alertCost ?? true,
  alertReplays: savedNotifs.alertReplays ?? false,
  inAppMentions: savedNotifs.inAppMentions ?? true,
  inAppAssignments: savedNotifs.inAppAssignments ?? true,
});

async function toggleNotif(key: keyof typeof notifs) {
  notifs[key] = !notifs[key];
  await updatePreferences({ notifications: { ...notifs } });
}

const slackWebhookUrl = ref((me.value?.preferences?.slackWebhookUrl as string) || "");
const slackConnected = computed(() => !!slackWebhookUrl.value);
const slackSaving = ref(false);
const slackTestResult = ref<string | null>(null);

async function saveSlackWebhook() {
  slackSaving.value = true;
  slackTestResult.value = null;
  try {
    await updatePreferences({ slackWebhookUrl: slackWebhookUrl.value });
  } finally {
    slackSaving.value = false;
  }
}

async function disconnectSlack() {
  slackWebhookUrl.value = "";
  await updatePreferences({ slackWebhookUrl: "" });
}

async function testSlack() {
  slackTestResult.value = null;
  try {
    const res = await fetch(slackWebhookUrl.value, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "LLM Lens test alert — your Slack integration is working." }),
    });
    slackTestResult.value = res.ok ? "Test message sent." : `Slack responded with ${res.status}`;
  } catch (err) {
    slackTestResult.value = err instanceof Error ? err.message : String(err);
  }
}

// appearance
const { theme: appTheme, accent: appAccent, density: appDensity } = useAppearance();
const appLigatures = ref(true);
const appShowKbd = ref(true);
const appVimNav = ref(false);

// data
const maskPII = ref(true);
const shareData = ref(false);

// org
const { org, fetchOrg, updateOrg } = useOrg();
await fetchOrg();
const orgName = ref(org.value?.name ?? "");
const orgSlug = ref(org.value?.slug ?? "");
const orgDefaultEnv = ref(org.value?.defaultEnv ?? "production");

const retention = ref(org.value?.retentionDays ?? 7);
const savingRetention = ref(false);
async function setRetention(days: number) {
  savingRetention.value = true;
  try {
    const updated = await updateOrg({ retentionDays: days });
    retention.value = updated.retentionDays;
  } finally {
    savingRetention.value = false;
  }
}

const savingOrg = ref(false);
const orgError = ref<string | null>(null);
const orgSaved = ref(false);

async function saveOrg() {
  savingOrg.value = true;
  orgError.value = null;
  orgSaved.value = false;
  try {
    const updated = await updateOrg({ name: orgName.value, slug: orgSlug.value, defaultEnv: orgDefaultEnv.value });
    orgSlug.value = updated.slug;
    orgSaved.value = true;
    setTimeout(() => (orgSaved.value = false), 2000);
  } catch (err) {
    orgError.value = err instanceof Error ? err.message : String(err);
  } finally {
    savingOrg.value = false;
  }
}

const { members, fetchMembers, inviteMember, updateRole, removeMember } = useOrgMembers();
await fetchMembers();
const myRole = computed(() => members.value.find((m) => m.email === me.value?.email)?.role ?? "owner");

const memberRoles: MemberRole[] = ["admin", "member", "viewer"];
const inviteEmail = ref("");
const inviteRole = ref<MemberRole>("member");
const inviting = ref(false);
const inviteError = ref<string | null>(null);
const lastInviteUrl = ref<string | null>(null);

async function submitInvite() {
  if (!inviteEmail.value.trim()) return;
  inviting.value = true;
  inviteError.value = null;
  try {
    const result = await inviteMember(inviteEmail.value.trim(), inviteRole.value);
    lastInviteUrl.value = result.inviteUrl;
    inviteEmail.value = "";
  } catch (err) {
    inviteError.value = err instanceof Error ? err.message : String(err);
  } finally {
    inviting.value = false;
  }
}

async function copyInviteLink() {
  if (!lastInviteUrl.value) return;
  await navigator.clipboard.writeText(lastInviteUrl.value);
}

function memberActions(m: OrgMember) {
  if (m.status === "pending") {
    return [
      { id: "copy", label: "Copy invite link", icon: "note" },
      { id: "remove", label: "Revoke invite", icon: "trash", danger: true },
    ];
  }
  return [
    ...memberRoles
      .filter((r) => r !== m.role)
      .map((r) => ({ id: `role:${r}`, label: `Make ${r}`, icon: "shield" })),
    { id: "remove", label: "Remove member", icon: "trash", danger: true },
  ];
}

async function onMemberAction(m: OrgMember, actionId: string) {
  if (actionId === "copy") {
    const frontendUrl = window.location.origin;
    await navigator.clipboard.writeText(`${frontendUrl}/invite/${m.inviteToken}`);
    return;
  }
  if (actionId === "remove") {
    await removeMember(m.id);
    return;
  }
  if (actionId.startsWith("role:")) {
    await updateRole(m.id, actionId.slice("role:".length) as MemberRole);
  }
}

const { sessions, fetchSessions, revoke: revokeSession } = useSessions();
await fetchSessions();

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

async function downloadTracesExport() {
  const res = await fetch(`${useRuntimeConfig().public.apiBase}/export/traces`, {
    headers: { Authorization: `Bearer ${token.value}` },
  });
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "traces.jsonl.gz";
  a.click();
  URL.revokeObjectURL(url);
}

async function downloadUsageExport() {
  const res = await fetch(`${useRuntimeConfig().public.apiBase}/export/usage`, {
    headers: { Authorization: `Bearer ${token.value}` },
  });
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "usage.csv";
  a.click();
  URL.revokeObjectURL(url);
}

const usageBars = [
  { label: "Traces",  value: 32480, max: 50000, unit: "" },
  { label: "Storage", value: 1.4,   max: 5,     unit: "GB" },
  { label: "Members", value: 4,     max: 5,     unit: "seats" },
];

function usageTone(val: number, max: number) {
  const pct = (val / max) * 100;
  if (pct > 90) return "danger";
  if (pct > 70) return "warn";
  return "ok";
}
function usagePct(val: number, max: number) {
  return Math.min(100, Math.round((val / max) * 100)) + "%";
}

const accentColors = [
  { v: "#5b8dff", name: "Blue" },
  { v: "#b078ff", name: "Violet" },
  { v: "#52d39c", name: "Green" },
  { v: "#f5b94a", name: "Amber" },
];
</script>

<template>
      <div class="topbar">
        <div class="crumbs">
          <NuxtLink to="/" class="crumb-link">Traces</NuxtLink>
          <span class="crumb-sep">/</span>
          <span class="crumb-cur">Settings</span>
        </div>
      </div>

      <div class="set-layout">

        <!-- settings sub-nav -->
        <nav class="set-nav">
          <div v-for="g in navGroups" :key="g.label" class="set-nav-group">
            <div class="set-nav-label">{{ g.label }}</div>
            <button
              v-for="it in g.items" :key="it.id"
              class="set-nav-item"
              :class="{ active: navSection === it.id, danger: it.danger }"
              @click="navSection = it.id"
            >
              <AppIcon :name="it.icon" :size="12" />
              <span>{{ it.label }}</span>
            </button>
          </div>
        </nav>

        <!-- settings body -->
        <div class="set-body">

          <!-- ── Profile ── -->
          <template v-if="navSection === 'profile'">
            <section class="set-section">
              <div class="set-section-head">
                <div>
                  <div class="set-section-title">Profile</div>
                  <div class="set-section-sub">How you appear across LLM Lens to your teammates.</div>
                </div>
              </div>
              <div class="set-section-body">
                <div class="profile-head">
                  <div class="profile-avatar">W</div>
                  <div class="profile-avatar-actions">
                    <button class="s-btn">Upload photo</button>
                    <button class="s-btn">Remove</button>
                    <div class="set-row-hint" style="margin-top:4px">JPG, PNG, or GIF · max 2MB</div>
                  </div>
                </div>

                <div class="set-row">
                  <div class="set-row-label">
                    <div class="set-row-label-text">Display name</div>
                    <div class="set-row-hint">Shown in audit logs and comments.</div>
                  </div>
                  <div class="set-row-control">
                    <div class="field-input"><input v-model="displayName" type="text" /></div>
                  </div>
                </div>

                <div class="set-row">
                  <div class="set-row-label">
                    <div class="set-row-label-text">Handle</div>
                    <div class="set-row-hint">Used in @-mentions and trace authorship.</div>
                  </div>
                  <div class="set-row-control">
                    <div class="field-input">
                      <span class="lead" style="color:var(--text-3)">llmlens.dev/</span>
                      <input v-model="handle" type="text" class="mono" />
                    </div>
                  </div>
                </div>

                <div class="set-row">
                  <div class="set-row-label">
                    <div class="set-row-label-text">Email</div>
                    <div class="set-row-hint" style="color:var(--success)">● Verified</div>
                  </div>
                  <div class="set-row-control">
                    <div class="field-input">
                      <input :value="me?.email" readonly class="mono" />
                      <span class="trail"><button class="link-btn">Change</button></span>
                    </div>
                  </div>
                </div>

                <div class="set-row">
                  <div class="set-row-label">
                    <div class="set-row-label-text">Role</div>
                    <div class="set-row-hint">Set by your organization owner.</div>
                  </div>
                  <div class="set-row-control">
                    <div class="static-val mono">{{ myRole }}</div>
                  </div>
                </div>
              </div>
            </section>

            <section class="set-section">
              <div class="set-section-head">
                <div>
                  <div class="set-section-title">Localization</div>
                  <div class="set-section-sub">Date, time, and number formatting in the UI.</div>
                </div>
              </div>
              <div class="set-section-body">
                <div class="set-row">
                  <div class="set-row-label"><div class="set-row-label-text">Timezone</div></div>
                  <div class="set-row-control">
                    <select v-model="tz" class="s-select">
                      <option>Europe/Warsaw</option>
                      <option>Europe/Berlin</option>
                      <option>Europe/London</option>
                      <option>America/New_York</option>
                      <option>America/Los_Angeles</option>
                      <option>Asia/Tokyo</option>
                      <option>UTC</option>
                    </select>
                  </div>
                </div>

                <div class="set-row">
                  <div class="set-row-label"><div class="set-row-label-text">Locale</div></div>
                  <div class="set-row-control">
                    <select v-model="locale" class="s-select">
                      <option value="en-US">English (US)</option>
                      <option value="en-GB">English (UK)</option>
                      <option value="pl-PL">Polski</option>
                      <option value="de-DE">Deutsch</option>
                      <option value="fr-FR">Français</option>
                    </select>
                  </div>
                </div>

                <div class="set-row">
                  <div class="set-row-label"><div class="set-row-label-text">Date format</div></div>
                  <div class="set-row-control">
                    <div class="segmented">
                      <button :class="{ active: dateFormat === 'iso' }" @click="dateFormat = 'iso'">2026-05-27</button>
                      <button :class="{ active: dateFormat === 'eu' }"  @click="dateFormat = 'eu'">27 May 2026</button>
                      <button :class="{ active: dateFormat === 'us' }"  @click="dateFormat = 'us'">05/27/2026</button>
                    </div>
                  </div>
                </div>
              </div>
              <div class="set-row-actions">
                <span v-if="profileError" class="set-error">{{ profileError }}</span>
                <span v-else-if="profileSaved" class="set-saved">Saved</span>
                <button class="s-btn primary" :disabled="savingProfile" @click="saveProfile">{{ savingProfile ? "Saving…" : "Save changes" }}</button>
              </div>
            </section>
          </template>

          <!-- ── Account ── -->
          <template v-else-if="navSection === 'account'">
            <section class="set-section">
              <div class="set-section-head"><div>
                <div class="set-section-title">Password</div>
                <div class="set-section-sub">Used to sign in with email.</div>
              </div></div>
              <div class="set-section-body">
                <div class="set-row">
                  <div class="set-row-label"><div class="set-row-label-text">Current password</div></div>
                  <div class="set-row-control"><div class="field-input"><input v-model="currentPasswordInput" type="password" /></div></div>
                </div>
                <div class="set-row">
                  <div class="set-row-label">
                    <div class="set-row-label-text">New password</div>
                    <div class="set-row-hint">Min 8 characters.</div>
                  </div>
                  <div class="set-row-control"><div class="field-input"><input v-model="newPasswordInput" type="password" placeholder="Enter a new password" /></div></div>
                </div>
                <div class="set-row">
                  <div class="set-row-label"><div class="set-row-label-text">Confirm new password</div></div>
                  <div class="set-row-control"><div class="field-input"><input v-model="confirmPasswordInput" type="password" placeholder="Repeat it" /></div></div>
                </div>
                <div class="set-row-actions">
                  <span v-if="passwordError" class="set-error">{{ passwordError }}</span>
                  <span v-else-if="passwordSaved" class="set-saved">Password updated</span>
                  <button class="s-btn primary" :disabled="savingPassword" @click="changePassword">{{ savingPassword ? "Updating…" : "Update password" }}</button>
                </div>
              </div>
            </section>

            <section class="set-section">
              <div class="set-section-head"><div>
                <div class="set-section-title">Two-factor authentication</div>
                <div class="set-section-sub">Required for every sign-in to LLM Lens.</div>
              </div></div>
              <div class="set-section-body">
                <div class="set-row">
                  <div class="set-row-label">
                    <div class="set-row-label-text">Authenticator app</div>
                    <div class="set-row-hint">{{ twoFA ? 'Enrolled' : 'Not configured' }}</div>
                  </div>
                  <div class="set-row-control">
                    <button v-if="!twoFA" class="s-btn" :disabled="totpBusy" @click="startTwoFactorSetup">Enable</button>
                    <button v-else class="s-btn" @click="showDisableForm = !showDisableForm">Disable</button>
                  </div>
                </div>

                <div v-if="totpSetup" class="set-row" style="flex-direction:column;align-items:flex-start;gap:10px">
                  <img :src="totpSetup.qrCode" alt="TOTP QR code" width="160" height="160" style="border-radius:6px" />
                  <div class="set-row-hint">Can't scan? Enter this code manually: <span class="mono">{{ totpSetup.secret }}</span></div>
                  <div style="display:flex;gap:8px;align-items:center">
                    <div class="field-input"><input v-model="totpVerifyCode" placeholder="123456" @keydown.enter="confirmTwoFactorSetup" /></div>
                    <button class="s-btn primary" :disabled="totpBusy" @click="confirmTwoFactorSetup">Verify & enable</button>
                  </div>
                  <span v-if="totpError" class="set-error">{{ totpError }}</span>
                </div>

                <div v-if="showDisableForm" class="set-row" style="flex-direction:column;align-items:flex-start;gap:10px">
                  <div class="set-row-hint">Enter your current code or a recovery code to disable two-factor authentication.</div>
                  <div style="display:flex;gap:8px;align-items:center">
                    <div class="field-input"><input v-model="disableCode" placeholder="123456" @keydown.enter="confirmDisableTwoFactor" /></div>
                    <button class="s-btn" :disabled="totpBusy" @click="confirmDisableTwoFactor">Confirm disable</button>
                  </div>
                  <span v-if="totpError" class="set-error">{{ totpError }}</span>
                </div>

                <div v-if="revealedRecoveryCodes" class="set-row" style="flex-direction:column;align-items:flex-start;gap:8px">
                  <div class="set-row-label-text">Recovery codes — save these now, shown only once</div>
                  <div class="mono" style="display:grid;grid-template-columns:1fr 1fr;gap:4px">
                    <span v-for="c in revealedRecoveryCodes" :key="c">{{ c }}</span>
                  </div>
                  <button class="s-btn" @click="revealedRecoveryCodes = null">Done</button>
                </div>

                <div v-if="twoFA" class="set-row">
                  <div class="set-row-label">
                    <div class="set-row-label-text">Recovery codes</div>
                    <div class="set-row-hint">Re-generate if you suspect a leak. Invalidates old codes.</div>
                  </div>
                  <div class="set-row-control" style="gap:8px">
                    <button class="s-btn" @click="regenerateCodes">Regenerate</button>
                  </div>
                </div>
                <div class="set-row">
                  <div class="set-row-label">
                    <div class="set-row-label-text">Sign-in email alerts</div>
                    <div class="set-row-hint">We'll email you whenever a new device signs in.</div>
                  </div>
                  <div class="set-row-control">
                    <button class="toggle" :class="{ on: signinAlerts }" role="switch" :aria-checked="signinAlerts" @click="signinAlerts = !signinAlerts">
                      <span class="thumb" />
                    </button>
                  </div>
                </div>
              </div>
            </section>

            <section class="set-section">
              <div class="set-section-head"><div>
                <div class="set-section-title">Active sessions</div>
                <div class="set-section-sub">Devices currently signed in.</div>
              </div></div>
              <div class="set-section-body">
                <div class="session-list">
                  <div v-for="(s, i) in sessions" :key="s.id" class="session-row">
                    <div class="session-icon">
                      <AppIcon :name="s.userAgent.includes('llmlens-sdk') ? 'tool' : 'user'" :size="14" />
                    </div>
                    <div class="session-main">
                      <div class="session-device">
                        {{ s.device }}
                        <span v-if="i === 0" class="kpill ok"><span class="dot ok" /> this device</span>
                      </div>
                      <div class="session-meta mono">{{ s.ip }} · {{ s.userAgent }}</div>
                    </div>
                    <div class="session-time mono">{{ relativeTime(s.lastActiveAt) }}</div>
                    <button v-if="i !== 0" class="icon-btn xs" title="Revoke" @click="revokeSession(s.id)">
                      <AppIcon name="x" :size="12" />
                    </button>
                  </div>
                </div>
              </div>
            </section>
          </template>

          <!-- ── Notifications ── -->
          <template v-else-if="navSection === 'notifications'">
            <section class="set-section">
              <div class="set-section-head"><div>
                <div class="set-section-title">Email digests</div>
                <div class="set-section-sub">Sent to wojtek@example.com.</div>
              </div></div>
              <div class="set-section-body">
                <div class="set-row">
                  <div class="set-row-label">
                    <div class="set-row-label-text">Daily summary</div>
                    <div class="set-row-hint">Yesterday's trace volume, error rate, and cost — delivered at 8:00 in your timezone.</div>
                  </div>
                  <div class="set-row-control">
                    <button class="toggle" :class="{ on: notifs.digestDaily }" role="switch" @click="toggleNotif('digestDaily')"><span class="thumb" /></button>
                  </div>
                </div>
                <div class="set-row">
                  <div class="set-row-label">
                    <div class="set-row-label-text">Weekly recap</div>
                    <div class="set-row-hint">Friday 17:00 — week-over-week trends and the slowest traces.</div>
                  </div>
                  <div class="set-row-control">
                    <button class="toggle" :class="{ on: notifs.digestWeekly }" role="switch" @click="toggleNotif('digestWeekly')"><span class="thumb" /></button>
                  </div>
                </div>
              </div>
            </section>

            <section class="set-section">
              <div class="set-section-head"><div>
                <div class="set-section-title">Alerts</div>
                <div class="set-section-sub">We email you (and Slack you, if connected) when production traces breach thresholds.</div>
              </div></div>
              <div class="set-section-body">
                <div class="set-row">
                  <div class="set-row-label">
                    <div class="set-row-label-text">Error rate spike</div>
                    <div class="set-row-hint">When &gt; 5% of traces fail in any 5-minute window.</div>
                  </div>
                  <div class="set-row-control">
                    <button class="toggle" :class="{ on: notifs.alertErr }" role="switch" @click="toggleNotif('alertErr')"><span class="thumb" /></button>
                  </div>
                </div>
                <div class="set-row">
                  <div class="set-row-label">
                    <div class="set-row-label-text">P95 latency</div>
                    <div class="set-row-hint">When p95 latency for any model exceeds 5s for 10+ minutes.</div>
                  </div>
                  <div class="set-row-control">
                    <button class="toggle" :class="{ on: notifs.alertLatency }" role="switch" @click="toggleNotif('alertLatency')"><span class="thumb" /></button>
                  </div>
                </div>
                <div class="set-row">
                  <div class="set-row-label">
                    <div class="set-row-label-text">Cost ceiling</div>
                    <div class="set-row-hint">Alert at <code class="mono">$50/day</code> for production.</div>
                  </div>
                  <div class="set-row-control">
                    <button class="toggle" :class="{ on: notifs.alertCost }" role="switch" @click="toggleNotif('alertCost')"><span class="thumb" /></button>
                  </div>
                </div>
                <div class="set-row">
                  <div class="set-row-label">
                    <div class="set-row-label-text">Replay completion</div>
                    <div class="set-row-hint">When a replay batch finishes or fails.</div>
                  </div>
                  <div class="set-row-control">
                    <button class="toggle" :class="{ on: notifs.alertReplays }" role="switch" @click="toggleNotif('alertReplays')"><span class="thumb" /></button>
                  </div>
                </div>
              </div>
            </section>

            <section class="set-section">
              <div class="set-section-head"><div><div class="set-section-title">In-app notifications</div></div></div>
              <div class="set-section-body">
                <div class="set-row">
                  <div class="set-row-label"><div class="set-row-label-text">@mentions</div></div>
                  <div class="set-row-control">
                    <button class="toggle" :class="{ on: notifs.inAppMentions }" role="switch" @click="toggleNotif('inAppMentions')"><span class="thumb" /></button>
                  </div>
                </div>
                <div class="set-row">
                  <div class="set-row-label"><div class="set-row-label-text">Annotation assignments</div></div>
                  <div class="set-row-control">
                    <button class="toggle" :class="{ on: notifs.inAppAssignments }" role="switch" @click="toggleNotif('inAppAssignments')"><span class="thumb" /></button>
                  </div>
                </div>
              </div>
            </section>

            <section class="set-section">
              <div class="set-section-head"><div><div class="set-section-title">Integrations</div></div></div>
              <div class="set-section-body">
                <div class="set-row">
                  <div class="set-row-label">
                    <div class="set-row-label-text">Slack</div>
                    <div class="set-row-hint">{{ slackConnected ? 'Incoming webhook configured.' : 'Paste a Slack incoming webhook URL to connect.' }}</div>
                  </div>
                  <div class="set-row-control" style="gap:8px">
                    <span v-if="slackConnected" class="kpill ok"><span class="dot ok" /> connected</span>
                    <div class="field-input"><input v-model="slackWebhookUrl" type="text" placeholder="https://hooks.slack.com/services/…" class="mono" /></div>
                    <button class="s-btn" :disabled="slackSaving" @click="saveSlackWebhook">{{ slackSaving ? "Saving…" : "Save" }}</button>
                    <button v-if="slackConnected" class="s-btn" @click="testSlack">Send test</button>
                    <button v-if="slackConnected" class="s-btn danger" @click="disconnectSlack">Disconnect</button>
                  </div>
                </div>
                <div v-if="slackTestResult" class="set-row-hint" style="padding:0 20px 12px">{{ slackTestResult }}</div>
                <div class="set-row">
                  <div class="set-row-label">
                    <div class="set-row-label-text">PagerDuty</div>
                    <div class="set-row-hint">Page on-call for production alerts.</div>
                  </div>
                  <div class="set-row-control"><button class="s-btn">Connect PagerDuty</button></div>
                </div>
                <div class="set-row">
                  <div class="set-row-label">
                    <div class="set-row-label-text">Webhook</div>
                    <div class="set-row-hint">POST notifications to your endpoint.</div>
                  </div>
                  <div class="set-row-control">
                    <div class="static-val mono">https://hooks.example.com/llmlens</div>
                  </div>
                </div>
              </div>
            </section>
          </template>

          <!-- ── Appearance ── -->
          <template v-else-if="navSection === 'appearance'">
            <section class="set-section">
              <div class="set-section-head"><div>
                <div class="set-section-title">Theme</div>
                <div class="set-section-sub">Colors used across the app. Auto follows your OS preference.</div>
              </div></div>
              <div class="set-section-body">
                <div class="set-row">
                  <div class="set-row-label"><div class="set-row-label-text">Mode</div></div>
                  <div class="set-row-control">
                    <div class="segmented">
                      <button :class="{ active: appTheme === 'dark' }"  @click="appTheme = 'dark'">Dark</button>
                      <button :class="{ active: appTheme === 'light' }" @click="appTheme = 'light'">Light</button>
                      <button>Auto</button>
                    </div>
                  </div>
                </div>
                <div class="set-row">
                  <div class="set-row-label">
                    <div class="set-row-label-text">Accent color</div>
                    <div class="set-row-hint">Used for selection, focus rings, and primary actions.</div>
                  </div>
                  <div class="set-row-control">
                    <div class="accent-pick">
                      <button
                        v-for="c in accentColors" :key="c.v"
                        class="swatch" :class="{ on: appAccent === c.v }"
                        :style="{ background: c.v }"
                        :title="c.name"
                        @click="appAccent = c.v"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section class="set-section">
              <div class="set-section-head"><div>
                <div class="set-section-title">Density</div>
                <div class="set-section-sub">How much breathing room between rows.</div>
              </div></div>
              <div class="set-section-body">
                <div class="set-row">
                  <div class="set-row-label"><div class="set-row-label-text">Layout density</div></div>
                  <div class="set-row-control">
                    <div class="segmented">
                      <button :class="{ active: appDensity === 'compact' }" @click="appDensity = 'compact'">Compact</button>
                      <button :class="{ active: appDensity === 'dense' }"   @click="appDensity = 'dense'">Dense</button>
                      <button :class="{ active: appDensity === 'loose' }"   @click="appDensity = 'loose'">Loose</button>
                    </div>
                  </div>
                </div>
                <div class="set-row">
                  <div class="set-row-label">
                    <div class="set-row-label-text">Mono ligatures</div>
                    <div class="set-row-hint">Render →, ==>, !=, etc. as glyphs in code blocks.</div>
                  </div>
                  <div class="set-row-control">
                    <button class="toggle" :class="{ on: appLigatures }" role="switch" @click="appLigatures = !appLigatures"><span class="thumb" /></button>
                  </div>
                </div>
              </div>
            </section>

            <section class="set-section">
              <div class="set-section-head"><div><div class="set-section-title">Keyboard</div></div></div>
              <div class="set-section-body">
                <div class="set-row">
                  <div class="set-row-label"><div class="set-row-label-text">Show shortcuts in tooltips</div></div>
                  <div class="set-row-control">
                    <button class="toggle" :class="{ on: appShowKbd }" role="switch" @click="appShowKbd = !appShowKbd"><span class="thumb" /></button>
                  </div>
                </div>
                <div class="set-row">
                  <div class="set-row-label">
                    <div class="set-row-label-text">Vim-style nav (j/k)</div>
                    <div class="set-row-hint">Move row-by-row in trace lists.</div>
                  </div>
                  <div class="set-row-control">
                    <button class="toggle" :class="{ on: appVimNav }" role="switch" @click="appVimNav = !appVimNav"><span class="thumb" /></button>
                  </div>
                </div>
              </div>
            </section>
          </template>

          <!-- ── Organization ── -->
          <template v-else-if="navSection === 'org'">
            <section class="set-section">
              <div class="set-section-head"><div>
                <div class="set-section-title">Organization</div>
                <div class="set-section-sub">Settings that apply to every member of {{ orgSlug }}.</div>
              </div></div>
              <div class="set-section-body">
                <div class="set-row">
                  <div class="set-row-label"><div class="set-row-label-text">Organization name</div></div>
                  <div class="set-row-control"><div class="field-input"><input v-model="orgName" type="text" /></div></div>
                </div>
                <div class="set-row">
                  <div class="set-row-label">
                    <div class="set-row-label-text">Slug</div>
                    <div class="set-row-hint">Used in URLs and API endpoints.</div>
                  </div>
                  <div class="set-row-control">
                    <div class="field-input">
                      <span class="lead" style="color:var(--text-3)">llmlens.dev/</span>
                      <input v-model="orgSlug" type="text" class="mono" />
                    </div>
                  </div>
                </div>
                <div class="set-row">
                  <div class="set-row-label">
                    <div class="set-row-label-text">Logo</div>
                    <div class="set-row-hint">Shown in the sidebar and on shared trace links.</div>
                  </div>
                  <div class="set-row-control" style="gap:8px">
                    <div class="org-logo">Y</div>
                    <button class="s-btn">Upload</button>
                  </div>
                </div>
                <div class="set-row">
                  <div class="set-row-label"><div class="set-row-label-text">Default environment for new keys</div></div>
                  <div class="set-row-control">
                    <select v-model="orgDefaultEnv" class="s-select">
                      <option>production</option>
                      <option>staging</option>
                      <option>dev</option>
                    </select>
                  </div>
                </div>
              </div>
              <div class="set-row-actions">
                <span v-if="orgError" class="set-error">{{ orgError }}</span>
                <span v-else-if="orgSaved" class="set-saved">Saved</span>
                <button class="s-btn primary" :disabled="savingOrg" @click="saveOrg">{{ savingOrg ? "Saving…" : "Save changes" }}</button>
              </div>
            </section>

            <section class="set-section">
              <div class="set-section-head"><div>
                <div class="set-section-title">SSO & authentication</div>
                <div class="set-section-sub">Available on the team plan.</div>
              </div></div>
              <div class="set-section-body">
                <div class="set-row">
                  <div class="set-row-label">
                    <div class="set-row-label-text">Google Workspace SSO</div>
                    <div class="set-row-hint">Restrict sign-in to {{ orgSlug }}.fun email addresses.</div>
                  </div>
                  <div class="set-row-control"><button class="s-btn" disabled>Enable</button></div>
                </div>
                <div class="set-row">
                  <div class="set-row-label">
                    <div class="set-row-label-text">SAML / OIDC</div>
                    <div class="set-row-hint">Bring your own identity provider.</div>
                  </div>
                  <div class="set-row-control"><button class="s-btn" disabled>Configure</button></div>
                </div>
              </div>
            </section>
          </template>

          <!-- ── Members ── -->
          <template v-else-if="navSection === 'members'">
            <section class="set-section">
              <div class="set-section-head">
                <div>
                  <div class="set-section-title">Members</div>
                  <div class="set-section-sub">
                    {{ members.filter(m => m.status === 'active').length }} members ·
                    {{ members.filter(m => m.status === 'pending').length }} pending
                  </div>
                </div>
              </div>
              <div class="set-section-body">
                <div class="set-row">
                  <div class="set-row-label">
                    <div class="set-row-label-text">Invite by email</div>
                    <div v-if="inviteError" class="set-error">{{ inviteError }}</div>
                  </div>
                  <div class="set-row-control" style="gap:8px">
                    <div class="field-input"><input v-model="inviteEmail" type="email" placeholder="teammate@company.com" @keydown.enter="submitInvite" /></div>
                    <select v-model="inviteRole" class="field-input">
                      <option v-for="r in memberRoles" :key="r" :value="r">{{ r }}</option>
                    </select>
                    <button class="s-btn primary" :disabled="inviting" @click="submitInvite">{{ inviting ? "Inviting…" : "+ Invite" }}</button>
                  </div>
                </div>
                <div v-if="lastInviteUrl" class="set-row">
                  <div class="set-row-label"><div class="set-row-label-text">Invite link — share this with the invitee</div></div>
                  <div class="set-row-control" style="gap:8px">
                    <div class="field-input"><input :value="lastInviteUrl" readonly class="mono" /></div>
                    <button class="s-btn" @click="copyInviteLink">Copy</button>
                  </div>
                </div>
              </div>
            </section>
            <section class="set-section">
              <div class="set-section-body">
                <div class="member-table">
                  <div class="member-head">
                    <div>Member</div>
                    <div>Role</div>
                    <div>Invited</div>
                    <div>Joined</div>
                    <div />
                  </div>
                  <div v-for="m in members" :key="m.id" class="member-row" :class="{ pending: m.status === 'pending' }">
                    <div class="member-cell member-who">
                      <div class="member-avatar">{{ m.displayName.slice(0,1).toUpperCase() }}</div>
                      <div>
                        <div class="member-name">{{ m.status === "pending" ? "(invite pending)" : m.displayName }}</div>
                        <div class="member-email mono">{{ m.email }}</div>
                      </div>
                    </div>
                    <div class="member-cell">
                      <span class="role-pill" :class="'role-' + m.role">{{ m.role }}</span>
                    </div>
                    <div class="member-cell mono">{{ new Date(m.invitedAt).toLocaleDateString() }}</div>
                    <div class="member-cell mono">{{ m.joinedAt ? new Date(m.joinedAt).toLocaleDateString() : "—" }}</div>
                    <div class="member-cell" style="justify-content:flex-end">
                      <ActionMenu v-if="m.role !== 'owner'" :items="memberActions(m)" @select="(id) => onMemberAction(m, id)">
                        <button class="icon-btn xs"><AppIcon name="more" :size="12" /></button>
                      </ActionMenu>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </template>

          <!-- ── Billing ── -->
          <template v-else-if="navSection === 'billing'">
            <section class="set-section">
              <div class="set-section-head"><div>
                <div class="set-section-title">Plan</div>
                <div class="set-section-sub">You're on the free tier — perfect for indie projects and side gigs.</div>
              </div></div>
              <div class="set-section-body">
                <div class="plan-grid">
                  <div class="plan-card current">
                    <div class="plan-name">Free</div>
                    <div class="plan-price">$0<span>/mo</span></div>
                    <ul class="plan-feats">
                      <li>50k traces / month</li>
                      <li>7-day retention</li>
                      <li>5 seats</li>
                      <li>Community support</li>
                    </ul>
                    <button class="s-btn" disabled>Current plan</button>
                  </div>
                  <div class="plan-card popular">
                    <div class="plan-badge">Popular</div>
                    <div class="plan-name">Team</div>
                    <div class="plan-price">$49<span>/mo</span></div>
                    <ul class="plan-feats">
                      <li>1M traces / month</li>
                      <li>30-day retention</li>
                      <li>Unlimited seats</li>
                      <li>SSO · audit log</li>
                      <li>Email + Slack support</li>
                    </ul>
                    <button class="s-btn primary">Upgrade to Team</button>
                  </div>
                  <div class="plan-card">
                    <div class="plan-name">Enterprise</div>
                    <div class="plan-price">Custom</div>
                    <ul class="plan-feats">
                      <li>Unlimited traces</li>
                      <li>Self-hosted option</li>
                      <li>SAML / SCIM</li>
                      <li>Custom SLA</li>
                      <li>Dedicated CSM</li>
                    </ul>
                    <button class="s-btn">Talk to sales</button>
                  </div>
                </div>
              </div>
            </section>

            <section class="set-section">
              <div class="set-section-head"><div>
                <div class="set-section-title">This billing period</div>
                <div class="set-section-sub">May 1 – May 27, 2026 · resets in 4 days.</div>
              </div></div>
              <div class="set-section-body">
                <div class="usage-grid">
                  <div v-for="u in usageBars" :key="u.label" class="usage-row">
                    <div class="usage-head">
                      <span class="usage-label">{{ u.label }}</span>
                      <span class="usage-val mono">
                        <span style="color:var(--text-0)">{{ u.value.toLocaleString() }}</span>
                        <span style="color:var(--text-3)"> / {{ u.max.toLocaleString() }}{{ u.unit ? ' ' + u.unit : '' }}</span>
                      </span>
                    </div>
                    <div class="usage-track">
                      <div class="usage-fill" :class="usageTone(u.value, u.max)" :style="{ width: usagePct(u.value, u.max) }" />
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section class="set-section">
              <div class="set-section-head"><div><div class="set-section-title">Payment method</div></div></div>
              <div class="set-section-body">
                <div class="set-row">
                  <div class="set-row-label">
                    <div class="set-row-label-text">Card on file</div>
                    <div class="set-row-hint">No card. Add one to unlock the Team plan.</div>
                  </div>
                  <div class="set-row-control"><button class="s-btn">+ Add card</button></div>
                </div>
                <div class="set-row">
                  <div class="set-row-label"><div class="set-row-label-text">Billing email</div></div>
                  <div class="set-row-control"><div class="field-input"><input value="wojtek@example.com" readonly class="mono" /></div></div>
                </div>
                <div class="set-row">
                  <div class="set-row-label"><div class="set-row-label-text">Invoices</div></div>
                  <div class="set-row-control"><button class="s-btn">View invoices</button></div>
                </div>
              </div>
            </section>
          </template>

          <!-- ── Data ── -->
          <template v-else-if="navSection === 'data'">
            <section class="set-section">
              <div class="set-section-head"><div>
                <div class="set-section-title">Retention</div>
                <div class="set-section-sub">How long we keep your trace payloads. Aggregates and metrics are kept forever.</div>
              </div></div>
              <div class="set-section-body">
                <div class="set-row">
                  <div class="set-row-label">
                    <div class="set-row-label-text">Trace retention</div>
                    <div class="set-row-hint">Free tier allows up to 7 days. Team allows 30, Enterprise up to 365.</div>
                  </div>
                  <div class="set-row-control">
                    <div class="segmented">
                      <button :class="{ active: retention === 1 }" :disabled="savingRetention" @click="setRetention(1)">1 day</button>
                      <button :class="{ active: retention === 7 }" :disabled="savingRetention" @click="setRetention(7)">7 days</button>
                      <button style="opacity:0.45" disabled>30 days</button>
                      <button style="opacity:0.45" disabled>365 days</button>
                    </div>
                  </div>
                </div>
                <div class="set-row">
                  <div class="set-row-label">
                    <div class="set-row-label-text">PII masking</div>
                    <div class="set-row-hint">Automatically redact emails, phone numbers, and credit cards in trace payloads.</div>
                  </div>
                  <div class="set-row-control">
                    <button class="toggle" :class="{ on: maskPII }" role="switch" @click="maskPII = !maskPII"><span class="thumb" /></button>
                  </div>
                </div>
                <div class="set-row">
                  <div class="set-row-label">
                    <div class="set-row-label-text">Share anonymized data with Anthropic & OpenAI</div>
                    <div class="set-row-hint">Helps improve provider models. We never share keys or message bodies.</div>
                  </div>
                  <div class="set-row-control">
                    <button class="toggle" :class="{ on: shareData }" role="switch" @click="shareData = !shareData"><span class="thumb" /></button>
                  </div>
                </div>
              </div>
            </section>

            <section class="set-section">
              <div class="set-section-head"><div>
                <div class="set-section-title">Export</div>
                <div class="set-section-sub">Download your data at any time.</div>
              </div></div>
              <div class="set-section-body">
                <div class="set-row">
                  <div class="set-row-label">
                    <div class="set-row-label-text">Export all traces</div>
                    <div class="set-row-hint">JSON Lines · gzipped · split by day.</div>
                  </div>
                  <div class="set-row-control"><button class="s-btn" @click="downloadTracesExport">Request export</button></div>
                </div>
                <div class="set-row">
                  <div class="set-row-label">
                    <div class="set-row-label-text">Export usage report</div>
                    <div class="set-row-hint">Daily usage and cost summary as CSV.</div>
                  </div>
                  <div class="set-row-control"><button class="s-btn" @click="downloadUsageExport">Download CSV</button></div>
                </div>
              </div>
            </section>
          </template>

          <!-- ── Domain ── -->
          <template v-else-if="navSection === 'domain'">
            <section class="set-section">
              <div class="set-section-head"><div>
                <div class="set-section-title">Custom domain</div>
                <div class="set-section-sub">Serve LLM Lens on your own subdomain. Available on the team plan.</div>
              </div></div>
              <div class="set-section-body">
                <div class="set-row">
                  <div class="set-row-label"><div class="set-row-label-text">Domain</div></div>
                  <div class="set-row-control"><div class="field-input"><input type="text" placeholder="lens.yumio.fun" class="mono" /></div></div>
                </div>
                <div class="set-row">
                  <div class="set-row-label">
                    <div class="set-row-label-text">DNS</div>
                    <div class="set-row-hint">Add a <code class="mono">CNAME</code> record pointing to <code class="mono">cname.llmlens.dev</code>.</div>
                  </div>
                  <div class="set-row-control"><button class="s-btn" disabled>Verify DNS</button></div>
                </div>
              </div>
            </section>
          </template>

          <!-- ── Danger ── -->
          <template v-else-if="navSection === 'danger'">
            <section class="set-section">
              <div class="set-section-head"><div>
                <div class="set-section-title">Danger zone</div>
                <div class="set-section-sub">These actions are permanent. They cannot be undone.</div>
              </div></div>
              <div class="set-section-body">
                <div class="danger-row">
                  <div>
                    <div class="danger-title">Transfer ownership</div>
                    <div class="danger-sub">Hand the organization off to another admin. You'll be demoted to Member.</div>
                  </div>
                  <button class="s-btn">Transfer…</button>
                </div>
                <div class="danger-row">
                  <div>
                    <div class="danger-title">Wipe all traces</div>
                    <div class="danger-sub">Delete every trace, replay, and annotation across all environments. Aggregates and keys are preserved.</div>
                  </div>
                  <button class="s-btn danger">Wipe traces…</button>
                </div>
                <div class="danger-row">
                  <div>
                    <div class="danger-title">Delete organization</div>
                    <div class="danger-sub">Permanently delete {{ orgSlug }} and every member's access. We'll email a 30-day grace-period notice first.</div>
                  </div>
                  <button class="s-btn danger">Delete organization…</button>
                </div>
              </div>
            </section>
          </template>

        </div><!-- /set-body -->
      </div><!-- /set-layout -->
</template>

<style scoped>
/* ── topbar ──────────────────────────────────────────────────────────────── */
.topbar {
  height: var(--topbar-h);
  display: flex;
  align-items: center;
  padding: 0 20px;
  border-bottom: 1px solid var(--border-0);
  background: var(--bg-1);
  flex-shrink: 0;
}
.crumbs { display: flex; align-items: center; gap: 6px; font-size: 13px; color: var(--text-2); }
.crumb-link { color: var(--text-2); text-decoration: none; }
.crumb-link:hover { color: var(--text-0); }
.crumb-sep  { color: var(--text-3); }
.crumb-cur  { color: var(--text-0); font-weight: 500; }

/* ── settings layout ──────────────────────────────────────────────────────── */
.set-layout {
  display: grid;
  grid-template-columns: 180px 1fr;
  flex: 1;
  overflow: hidden;
}

/* settings sub-nav */
.set-nav {
  border-right: 1px solid var(--border-0);
  padding: 16px 8px;
  overflow-y: auto;
  background: var(--bg-1);
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.set-nav-group { display: flex; flex-direction: column; gap: 1px; }
.set-nav-label {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: .06em;
  text-transform: uppercase;
  color: var(--text-3);
  padding: 0 8px 4px;
}
.set-nav-item {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 6px 8px;
  border-radius: var(--radius-md);
  cursor: pointer;
  color: var(--text-1);
  font-size: 12.5px;
  background: none;
  border: none;
  width: 100%;
  text-align: left;
  transition: background 0.1s, color 0.1s;
}
.set-nav-item:hover { background: var(--bg-3); color: var(--text-0); }
.set-nav-item.active { background: var(--bg-3); color: var(--text-0); }
.set-nav-item.danger { color: var(--danger); }
.set-nav-item.danger:hover { background: oklch(from var(--danger) l c h / 0.08); }
.set-nav-item.danger.active { background: oklch(from var(--danger) l c h / 0.1); }

/* settings body */
.set-body {
  overflow-y: auto;
  padding: 24px 32px;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

/* ── section ──────────────────────────────────────────────────────────────── */
.set-section {
  border: 1px solid var(--border-1);
  border-radius: var(--radius-lg);
  background: var(--bg-1);
  overflow: hidden;
}
.set-section-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-0);
  background: var(--bg-2);
}
.set-section-title { font-size: 13px; font-weight: 600; color: var(--text-0); }
.set-section-sub   { font-size: 12px; color: var(--text-2); margin-top: 2px; }
.set-section-body  { display: flex; flex-direction: column; }

/* ── row ──────────────────────────────────────────────────────────────────── */
.set-row {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px 20px;
  border-bottom: 1px solid var(--border-0);
}
.set-row:last-child { border-bottom: none; }
.set-row-label { flex: 1; min-width: 0; }
.set-row-label-text { font-size: 12.5px; color: var(--text-0); font-weight: 450; }
.set-row-hint { font-size: 11.5px; color: var(--text-2); margin-top: 2px; line-height: 1.4; }
.set-row-control { display: flex; align-items: center; flex-shrink: 0; }
.set-row-actions { display: flex; align-items: center; justify-content: flex-end; gap: 10px; padding: 10px 20px; border-top: 1px solid var(--border-0); }
.set-error { font-size: 12px; color: var(--danger); }
.set-saved { font-size: 12px; color: var(--success); }
.static-val { font-size: 12px; color: var(--text-1); }

/* ── field-input ──────────────────────────────────────────────────────────── */
.field-input {
  display: flex;
  align-items: center;
  background: var(--bg-2);
  border: 1px solid var(--border-1);
  border-radius: var(--radius-md);
  overflow: hidden;
  min-width: 200px;
}
.field-input input {
  background: none;
  border: none;
  outline: none;
  font-family: var(--font-sans);
  font-size: 12.5px;
  color: var(--text-0);
  padding: 6px 10px;
  flex: 1;
  min-width: 0;
}
.field-input input.mono { font-family: var(--font-mono); font-size: 11.5px; }
.field-input input:read-only { color: var(--text-1); }
.field-input:focus-within { border-color: var(--accent-border); }
.lead  { padding: 0 0 0 10px; color: var(--text-2); font-size: 12px; white-space: nowrap; }
.trail { padding: 0 6px 0 0; }

/* ── select ───────────────────────────────────────────────────────────────── */
.s-select {
  background: var(--bg-2);
  border: 1px solid var(--border-1);
  border-radius: var(--radius-md);
  color: var(--text-0);
  font-family: var(--font-sans);
  font-size: 12.5px;
  padding: 5px 28px 5px 10px;
  outline: none;
  cursor: pointer;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%236a6b73' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 8px center;
}
.s-select:focus { border-color: var(--accent-border); }

/* ── segmented ────────────────────────────────────────────────────────────── */
.segmented {
  display: flex;
  background: var(--bg-2);
  border: 1px solid var(--border-1);
  border-radius: var(--radius-md);
  overflow: hidden;
  gap: 0;
}
.segmented button {
  padding: 5px 12px;
  font-size: 12px;
  color: var(--text-1);
  background: none;
  border: none;
  border-right: 1px solid var(--border-1);
  cursor: pointer;
  font-family: var(--font-sans);
  white-space: nowrap;
  transition: background 0.1s, color 0.1s;
}
.segmented button:last-child { border-right: none; }
.segmented button:hover { background: var(--bg-3); color: var(--text-0); }
.segmented button.active { background: var(--bg-4); color: var(--text-0); font-weight: 500; }
.segmented button:disabled { cursor: default; }

/* ── toggle ───────────────────────────────────────────────────────────────── */
.toggle {
  width: 32px;
  height: 18px;
  border-radius: 9px;
  background: var(--bg-4);
  border: 1px solid var(--border-2);
  cursor: pointer;
  position: relative;
  transition: background 0.15s, border-color 0.15s;
  flex-shrink: 0;
  padding: 0;
}
.toggle.on {
  background: var(--accent);
  border-color: transparent;
}
.thumb {
  display: block;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--text-2);
  position: absolute;
  top: 2px;
  left: 2px;
  transition: transform 0.15s, background 0.15s;
}
.toggle.on .thumb {
  transform: translateX(14px);
  background: #fff;
}

/* ── buttons ──────────────────────────────────────────────────────────────── */
.s-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 12px;
  font-size: 12px;
  font-family: var(--font-sans);
  border-radius: var(--radius-md);
  background: var(--bg-3);
  border: 1px solid var(--border-1);
  color: var(--text-1);
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.1s, color 0.1s;
}
.s-btn:hover:not(:disabled) { background: var(--bg-4); color: var(--text-0); }
.s-btn:disabled { opacity: 0.45; cursor: default; }
.s-btn.primary {
  background: var(--accent);
  border-color: transparent;
  color: #fff;
}
.s-btn.primary:hover:not(:disabled) { filter: brightness(1.1); }
.s-btn.danger {
  color: var(--danger);
  border-color: oklch(from var(--danger) l c h / 0.3);
}
.s-btn.danger:hover:not(:disabled) {
  background: oklch(from var(--danger) l c h / 0.1);
  color: var(--danger);
}
.link-btn {
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  font-family: var(--font-sans);
  font-size: 12px;
  color: var(--accent);
}
.link-btn:hover { text-decoration: underline; }
.icon-btn {
  background: none;
  border: 1px solid var(--border-1);
  border-radius: var(--radius-sm);
  cursor: pointer;
  color: var(--text-2);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.1s;
}
.icon-btn.xs { width: 22px; height: 22px; }
.icon-btn:hover { background: var(--bg-3); color: var(--text-0); }

/* ── pills ────────────────────────────────────────────────────────────────── */
.kpill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 11px;
  font-family: var(--font-mono);
  border: 1px solid var(--border-1);
  background: var(--bg-3);
  color: var(--text-1);
}
.kpill.ok   { color: var(--success); border-color: oklch(from var(--success) l c h / 0.3); background: oklch(from var(--success) l c h / 0.1); }
.kpill.mute { color: var(--text-2); }
.dot { display: inline-block; width: 6px; height: 6px; border-radius: 50%; }
.dot.ok   { background: var(--success); }
.dot.warn { background: var(--warn); }
.dot.err  { background: var(--danger); }

/* ── profile ─────────────────────────────────────────────────────────────── */
.profile-head {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-0);
}
.profile-avatar {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: var(--bg-4);
  border: 1px solid var(--border-1);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  font-weight: 700;
  color: var(--text-0);
  flex-shrink: 0;
}
.profile-avatar-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }

/* ── sessions ────────────────────────────────────────────────────────────── */
.session-list { display: flex; flex-direction: column; }
.session-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 20px;
  border-bottom: 1px solid var(--border-0);
}
.session-row:last-child { border-bottom: none; }
.session-icon {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  background: var(--bg-3);
  border: 1px solid var(--border-1);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-2);
  flex-shrink: 0;
}
.session-main { flex: 1; min-width: 0; }
.session-device { font-size: 12.5px; color: var(--text-0); display: flex; align-items: center; gap: 6px; }
.session-meta   { font-size: 11px; color: var(--text-2); margin-top: 2px; font-family: var(--font-mono); }
.session-time   { font-size: 11px; color: var(--text-2); font-family: var(--font-mono); white-space: nowrap; }

/* ── members ──────────────────────────────────────────────────────────────── */
.member-table { display: flex; flex-direction: column; }
.member-head {
  display: grid;
  grid-template-columns: 1fr 100px 100px 100px 36px;
  padding: 8px 20px;
  font-size: 11px;
  color: var(--text-2);
  background: var(--bg-2);
  border-bottom: 1px solid var(--border-0);
}
.member-row {
  display: grid;
  grid-template-columns: 1fr 100px 100px 100px 36px;
  align-items: center;
  border-bottom: 1px solid var(--border-0);
  transition: background 0.1s;
}
.member-row:last-child { border-bottom: none; }
.member-row:hover { background: var(--bg-2); }
.member-row.pending { opacity: 0.6; }
.member-cell {
  padding: 10px 20px 10px 0;
  display: flex;
  align-items: center;
}
.member-cell:first-child { padding-left: 20px; }
.member-who { gap: 10px; }
.member-avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--bg-4);
  border: 1px solid var(--border-1);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-0);
  flex-shrink: 0;
}
.member-name  { font-size: 12.5px; color: var(--text-0); font-weight: 450; }
.member-email { font-size: 11px; color: var(--text-2); font-family: var(--font-mono); margin-top: 1px; }
.role-pill {
  display: inline-flex;
  padding: 1px 7px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 500;
  border: 1px solid;
}
.role-owner  { color: var(--accent); background: var(--accent-bg); border-color: var(--accent-border); }
.role-admin  { color: var(--warn); background: oklch(from var(--warn) l c h / 0.1); border-color: oklch(from var(--warn) l c h / 0.3); }
.role-member { color: var(--text-1); background: var(--bg-3); border-color: var(--border-1); }
.role-viewer { color: var(--text-2); background: var(--bg-2); border-color: var(--border-0); }

/* ── billing ──────────────────────────────────────────────────────────────── */
.plan-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  padding: 16px 20px;
}
.plan-card {
  border: 1px solid var(--border-1);
  border-radius: var(--radius-lg);
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  position: relative;
  background: var(--bg-2);
}
.plan-card.current { border-color: var(--border-2); }
.plan-card.popular { border-color: var(--accent-border); background: var(--accent-bg); }
.plan-badge {
  position: absolute;
  top: -9px;
  left: 50%;
  transform: translateX(-50%);
  background: var(--accent);
  color: #fff;
  font-size: 10px;
  font-weight: 600;
  padding: 1px 8px;
  border-radius: 4px;
  letter-spacing: .04em;
}
.plan-name  { font-size: 13px; font-weight: 600; color: var(--text-0); }
.plan-price { font-size: 24px; font-weight: 700; color: var(--text-0); }
.plan-price span { font-size: 12px; font-weight: 400; color: var(--text-2); }
.plan-feats {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 5px;
  flex: 1;
}
.plan-feats li { font-size: 12px; color: var(--text-1); }
.plan-feats li::before { content: "✓ "; color: var(--success); }

/* ── usage ────────────────────────────────────────────────────────────────── */
.usage-grid { display: flex; flex-direction: column; gap: 0; }
.usage-row { padding: 12px 20px; border-bottom: 1px solid var(--border-0); }
.usage-row:last-child { border-bottom: none; }
.usage-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 6px; }
.usage-label { font-size: 12.5px; color: var(--text-0); }
.usage-val   { font-size: 11.5px; font-family: var(--font-mono); }
.usage-track {
  height: 4px;
  border-radius: 2px;
  background: var(--bg-4);
  overflow: hidden;
}
.usage-fill { height: 100%; border-radius: 2px; transition: width 0.3s; }
.usage-fill.ok     { background: var(--success); }
.usage-fill.warn   { background: var(--warn); }
.usage-fill.danger { background: var(--danger); }

/* ── org logo ─────────────────────────────────────────────────────────────── */
.org-logo {
  width: 32px;
  height: 32px;
  border-radius: var(--radius-md);
  background: var(--bg-4);
  border: 1px solid var(--border-1);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 14px;
  color: var(--text-0);
}

/* ── danger zone ──────────────────────────────────────────────────────────── */
.danger-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  padding: 14px 20px;
  border-bottom: 1px solid var(--border-0);
}
.danger-row:last-child { border-bottom: none; }
.danger-title { font-size: 12.5px; font-weight: 500; color: var(--text-0); }
.danger-sub   { font-size: 12px; color: var(--text-2); margin-top: 2px; }

/* ── accent swatches ──────────────────────────────────────────────────────── */
.accent-pick { display: flex; gap: 8px; }
.swatch {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 2px solid transparent;
  cursor: pointer;
  transition: transform 0.1s, border-color 0.1s;
}
.swatch:hover { transform: scale(1.15); }
.swatch.on { border-color: var(--text-0); }

/* ── utilities ────────────────────────────────────────────────────────────── */
.mono { font-family: var(--font-mono); }
code.mono { font-family: var(--font-mono); font-size: 11px; background: var(--bg-3); padding: 1px 4px; border-radius: 3px; }
</style>
