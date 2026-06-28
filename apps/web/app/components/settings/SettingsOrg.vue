<script setup lang="ts">
const { org, updateOrg } = useOrg();

const orgName = ref(org.value?.name ?? "");
const orgSlug = ref(org.value?.slug ?? "");
const orgDefaultEnv = ref(org.value?.defaultEnv ?? "production");

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
    orgError.value = getErrorMessage(err);
  } finally {
    savingOrg.value = false;
  }
}
</script>

<template>
  <section class="set-section">
    <div class="set-section-head"><div>
      <div class="set-section-title">Organization</div>
      <div class="set-section-sub">Settings that apply to every member of {{ orgSlug }}.</div>
    </div></div>
    <div class="set-section-body">
      <div class="set-row">
        <div class="set-row-label"><div class="set-row-label-text">Organization name</div></div>
        <div class="set-row-control"><div class="field-input"><input v-model="orgName" type="text" ></div></div>
      </div>
      <div class="set-row">
        <div class="set-row-label">
          <div class="set-row-label-text">Slug</div>
          <div class="set-row-hint">Used in URLs and API endpoints.</div>
        </div>
        <div class="set-row-control">
          <div class="field-input">
            <span class="lead" style="color:var(--text-3)">llmlens.dev/</span>
            <input v-model="orgSlug" type="text" class="mono" >
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
    <div class="set-section-head">
      <div>
        <div class="set-section-title">SSO & authentication</div>
        <div class="set-section-sub">Available on the team plan.</div>
      </div>
      <span class="cs-badge">coming soon</span>
    </div>
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
