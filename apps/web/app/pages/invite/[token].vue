<script setup lang="ts">
definePageMeta({ layout: false });
useHead({ htmlAttrs: { "data-theme": "dark" } });

const route = useRoute();
const inviteToken = route.params.token as string;
const config = useRuntimeConfig();
const apiBase = config.public.apiBase as string;
const { isAuthenticated, token } = useAuth();

interface InvitePreview { orgSlug: string; orgName: string; email: string; role: string }

const preview = ref<InvitePreview | null>(null);
const loadError = ref<string | null>(null);
const accepting = ref(false);
const acceptError = ref<string | null>(null);

try {
  preview.value = await $fetch<InvitePreview>(`${apiBase}/orgs/invites/${inviteToken}`);
} catch (err) {
  const e = err as { data?: { error?: string }; message?: string };
  loadError.value = e.data?.error ?? e.message ?? "Invite not found";
}

const currentEmail = computed<string | null>(() => {
  if (!token.value) return null;
  try {
    const payload = JSON.parse(atob(token.value.split(".")[1]!));
    return payload.email as string;
  } catch { return null; }
});

const emailMismatch = computed(() =>
  !!preview.value && !!currentEmail.value && preview.value.email.toLowerCase() !== currentEmail.value.toLowerCase()
);

async function acceptInvite() {
  accepting.value = true;
  acceptError.value = null;
  try {
    await $fetch(`${apiBase}/orgs/invites/${inviteToken}/accept`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token.value}` },
    });
    await navigateTo("/");
  } catch (err) {
    const e = err as { data?: { error?: string }; message?: string };
    acceptError.value = e.data?.error ?? e.message ?? "Failed to accept invite";
  } finally {
    accepting.value = false;
  }
}
</script>

<template>
  <div class="invite-page">
    <div class="invite-card">
      <div class="invite-brand">LLM Lens</div>

      <template v-if="loadError">
        <h2>Invite not found</h2>
        <p class="sub">{{ loadError }}</p>
      </template>

      <template v-else-if="preview">
        <h2>Join {{ preview.orgName }}</h2>
        <p class="sub">You've been invited to join <strong>{{ preview.orgName }}</strong> as <strong>{{ preview.role }}</strong>.</p>

        <template v-if="!isAuthenticated">
          <p class="sub">Sign in or create an account with <span class="mono">{{ preview.email }}</span> to accept.</p>
          <div class="invite-actions">
            <NuxtLink :to="`/login?redirect=${encodeURIComponent(route.fullPath)}`" class="btn">Sign in</NuxtLink>
            <NuxtLink :to="`/register?redirect=${encodeURIComponent(route.fullPath)}`" class="btn primary">Create account</NuxtLink>
          </div>
        </template>

        <template v-else-if="emailMismatch">
          <p class="sub error">This invite was sent to {{ preview.email }}, but you're signed in as {{ currentEmail }}. Sign out and sign in with the invited email to accept.</p>
        </template>

        <template v-else>
          <p v-if="acceptError" class="sub error">{{ acceptError }}</p>
          <button class="btn primary" :disabled="accepting" @click="acceptInvite">{{ accepting ? "Joining…" : "Accept invite" }}</button>
        </template>
      </template>
    </div>
  </div>
</template>

<style scoped>
.invite-page {
  min-height: 100vh;
  display: grid;
  place-items: center;
  background: var(--bg-0);
  padding: 24px;
}
.invite-card {
  width: 100%;
  max-width: 420px;
  background: var(--bg-1);
  border: 1px solid var(--border-1);
  border-radius: var(--radius-md);
  padding: 28px;
  text-align: center;
}
.invite-brand { font-size: 13px; font-weight: 600; color: var(--text-2); margin-bottom: 16px; }
h2 { font-size: 18px; color: var(--text-0); margin: 0 0 8px; }
.sub { font-size: 13px; color: var(--text-1); margin: 0 0 16px; }
.sub.error { color: var(--danger); }
.invite-actions { display: flex; gap: 8px; justify-content: center; }
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 34px;
  padding: 0 16px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-1);
  background: var(--bg-2);
  color: var(--text-0);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
}
.btn:disabled { opacity: 0.5; cursor: default; }
.btn.primary { background: var(--accent); color: white; border-color: var(--accent); }
</style>
