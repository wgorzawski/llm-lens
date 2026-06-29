<script setup lang="ts">
const { me, updateProfile, changeEmail, uploadAvatar, removeAvatar } = useMe();
const { members } = useOrgMembers();
const apiBase = useRuntimeConfig().public.apiBase as string;

// ── avatar ────────────────────────────────────────────────────────────────────
const avatarInput = ref<HTMLInputElement | null>(null);
const avatarError = ref<string | null>(null);

async function onAvatarChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  avatarError.value = null;
  try { await uploadAvatar(file); }
  catch (err) { avatarError.value = getErrorMessage(err); }
}

async function onRemoveAvatar() {
  avatarError.value = null;
  try { await removeAvatar(); }
  catch (err) { avatarError.value = getErrorMessage(err); }
}

// ── email change ──────────────────────────────────────────────────────────────
const showEmailForm = ref(false);
const newEmail = ref("");
const emailPassword = ref("");
const savingEmail = ref(false);
const emailError = ref<string | null>(null);
const emailSaved = ref(false);

async function submitEmailChange() {
  emailError.value = null;
  emailSaved.value = false;
  savingEmail.value = true;
  try {
    await changeEmail(newEmail.value, emailPassword.value);
    emailSaved.value = true;
    showEmailForm.value = false;
    newEmail.value = "";
    emailPassword.value = "";
    setTimeout(() => (emailSaved.value = false), 2000);
  } catch (err) {
    emailError.value = getErrorMessage(err);
  } finally {
    savingEmail.value = false;
  }
}

const displayName = ref(me.value?.displayName || "");
const handle = ref(me.value?.handle || "");
const tz = ref(me.value?.timezone || "UTC");
const locale = ref(me.value?.locale || "en-US");
const dateFormat = ref(me.value?.dateFormat || "iso");

const savingProfile = ref(false);
const profileError = ref<string | null>(null);
const profileSaved = ref(false);

const myRole = computed(() => members.value.find((m) => m.email === me.value?.email)?.role ?? "owner");

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
    profileError.value = getErrorMessage(err);
  } finally {
    savingProfile.value = false;
  }
}
</script>

<template>
  <section class="set-section">
    <div class="set-section-head">
      <div>
        <div class="set-section-title">Profile</div>
        <div class="set-section-sub">How you appear across LLM Lens to your teammates.</div>
      </div>
    </div>
    <div class="set-section-body">
      <div class="profile-head">
        <div class="profile-avatar">
          <img v-if="me?.avatarUrl" :src="`${apiBase.replace('/api', '')}${me.avatarUrl}`" alt="avatar" style="width:100%;height:100%;border-radius:50%;object-fit:cover" >
          <template v-else>{{ (me?.displayName || me?.email || 'U')[0]?.toUpperCase() }}</template>
        </div>
        <div class="profile-avatar-actions">
          <input ref="avatarInput" type="file" accept=".jpg,.jpeg,.png,.gif,.webp" style="display:none" @change="onAvatarChange" >
          <button class="s-btn" @click="avatarInput?.click()">Upload photo</button>
          <button v-if="me?.avatarUrl" class="s-btn" @click="onRemoveAvatar">Remove</button>
          <div class="set-row-hint" style="margin-top:4px">JPG, PNG, or GIF · max 2MB</div>
          <span v-if="avatarError" class="set-error">{{ avatarError }}</span>
        </div>
      </div>

      <div class="set-row">
        <div class="set-row-label">
          <div class="set-row-label-text">Display name</div>
          <div class="set-row-hint">Shown in audit logs and comments.</div>
        </div>
        <div class="set-row-control">
          <div class="field-input"><input v-model="displayName" type="text" ></div>
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
            <input v-model="handle" type="text" class="mono" >
          </div>
        </div>
      </div>

      <div class="set-row">
        <div class="set-row-label">
          <div class="set-row-label-text">Email</div>
          <div class="set-row-hint" style="color:var(--success)">● Verified</div>
        </div>
        <div class="set-row-control" style="flex-direction:column;align-items:stretch;gap:8px">
          <div class="field-input">
            <input :value="me?.email" readonly class="mono" >
            <span class="trail"><button class="link-btn" @click="showEmailForm = !showEmailForm">Change</button></span>
          </div>
          <template v-if="showEmailForm">
            <div class="field-input"><input v-model="newEmail" type="email" placeholder="New email address" ></div>
            <div class="field-input"><input v-model="emailPassword" type="password" placeholder="Current password to confirm" ></div>
            <div style="display:flex;gap:8px;align-items:center">
              <button class="s-btn primary" :disabled="savingEmail" @click="submitEmailChange">{{ savingEmail ? "Saving…" : "Save new email" }}</button>
              <button class="s-btn" @click="showEmailForm = false; emailError = null">Cancel</button>
            </div>
            <span v-if="emailError" class="set-error">{{ emailError }}</span>
            <span v-else-if="emailSaved" class="set-saved">Email updated</span>
          </template>
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
