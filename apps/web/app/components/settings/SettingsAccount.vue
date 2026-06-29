<script setup lang="ts">
import type { TotpSetup } from "~/composables/useTwoFactor";

const { me, fetchMe, updatePassword, updatePreferences } = useMe();
const { setup: setupTwoFactor, verify: verifyTwoFactor, disable: disableTwoFactor, regenerateRecoveryCodes } = useTwoFactor();
const { sessions, fetchSessions, revoke: revokeSession } = useSessions();
await fetchSessions();

const twoFA = computed(() => me.value?.totpEnabled ?? false);
const signinAlerts = computed({
  get: () => (me.value?.preferences?.signinAlerts as boolean | undefined) ?? true,
  set: (val: boolean) => { void updatePreferences({ signinAlerts: val }); },
});

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
    totpError.value = getErrorMessage(err);
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
    totpError.value = getErrorMessage(err);
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
    totpError.value = getErrorMessage(err);
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
    totpError.value = getErrorMessage(err);
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
    passwordError.value = getErrorMessage(err);
  } finally {
    savingPassword.value = false;
  }
}

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
</script>

<template>
  <!-- ── Password ── -->
  <section class="set-section">
    <div class="set-section-head"><div>
      <div class="set-section-title">Password</div>
      <div class="set-section-sub">Used to sign in with email.</div>
    </div></div>
    <div class="set-section-body">
      <div class="set-row">
        <div class="set-row-label"><div class="set-row-label-text">Current password</div></div>
        <div class="set-row-control"><div class="field-input"><input v-model="currentPasswordInput" type="password" ></div></div>
      </div>
      <div class="set-row">
        <div class="set-row-label">
          <div class="set-row-label-text">New password</div>
          <div class="set-row-hint">Min 8 characters.</div>
        </div>
        <div class="set-row-control"><div class="field-input"><input v-model="newPasswordInput" type="password" placeholder="Enter a new password" ></div></div>
      </div>
      <div class="set-row">
        <div class="set-row-label"><div class="set-row-label-text">Confirm new password</div></div>
        <div class="set-row-control"><div class="field-input"><input v-model="confirmPasswordInput" type="password" placeholder="Repeat it" ></div></div>
      </div>
      <div class="set-row-actions">
        <span v-if="passwordError" class="set-error">{{ passwordError }}</span>
        <span v-else-if="passwordSaved" class="set-saved">Password updated</span>
        <button class="s-btn primary" :disabled="savingPassword" @click="changePassword">{{ savingPassword ? "Updating…" : "Update password" }}</button>
      </div>
    </div>
  </section>

  <!-- ── 2FA ── -->
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
        <img :src="totpSetup.qrCode" alt="TOTP QR code" width="160" height="160" style="border-radius:6px" >
        <div class="set-row-hint">Can't scan? Enter this code manually: <span class="mono">{{ totpSetup.secret }}</span></div>
        <div style="display:flex;gap:8px;align-items:center">
          <div class="field-input"><input v-model="totpVerifyCode" placeholder="123456" @keydown.enter="confirmTwoFactorSetup" ></div>
          <button class="s-btn primary" :disabled="totpBusy" @click="confirmTwoFactorSetup">Verify & enable</button>
        </div>
        <span v-if="totpError" class="set-error">{{ totpError }}</span>
      </div>

      <div v-if="showDisableForm" class="set-row" style="flex-direction:column;align-items:flex-start;gap:10px">
        <div class="set-row-hint">Enter your current code or a recovery code to disable two-factor authentication.</div>
        <div style="display:flex;gap:8px;align-items:center">
          <div class="field-input"><input v-model="disableCode" placeholder="123456" @keydown.enter="confirmDisableTwoFactor" ></div>
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

  <!-- ── Sessions ── -->
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
