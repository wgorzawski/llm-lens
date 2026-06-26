<script setup lang="ts">
const { me, updateProfile } = useMe();
const { members } = useOrgMembers();

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
        <div class="set-row-control">
          <div class="field-input">
            <input :value="me?.email" readonly class="mono" >
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
