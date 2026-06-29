<script setup lang="ts">
const { org, fetchOrg } = useOrg();
const router = useRouter();
const apiBase = useRuntimeConfig().public.apiBase as string;
const { token } = useAuth();

const orgSlug = computed(() => org.value?.slug ?? "");

// ── Transfer ownership ────────────────────────────────────────────────────────
const showTransfer = ref(false);
const transferEmail = ref("");
const transferring = ref(false);
const transferError = ref<string | null>(null);
const transferDone = ref(false);

async function doTransfer() {
  transferError.value = null;
  transferring.value = true;
  try {
    const res = await fetch(`${apiBase}/orgs/me/owner`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token.value}` },
      body: JSON.stringify({ email: transferEmail.value }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error((data as { error?: string }).error ?? "Transfer failed");
    }
    transferDone.value = true;
    transferEmail.value = "";
    showTransfer.value = false;
    await fetchOrg();
  } catch (err) {
    transferError.value = getErrorMessage(err);
  } finally {
    transferring.value = false;
  }
}

// ── Wipe traces ───────────────────────────────────────────────────────────────
const showWipe = ref(false);
const wipeConfirm = ref("");
const wiping = ref(false);
const wipeError = ref<string | null>(null);
const wipeDone = ref(false);

async function doWipe() {
  wipeError.value = null;
  wiping.value = true;
  try {
    const res = await fetch(`${apiBase}/orgs/me/traces`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token.value}` },
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error((data as { error?: string }).error ?? "Wipe failed");
    }
    wipeDone.value = true;
    wipeConfirm.value = "";
    showWipe.value = false;
  } catch (err) {
    wipeError.value = getErrorMessage(err);
  } finally {
    wiping.value = false;
  }
}

// ── Delete organization ───────────────────────────────────────────────────────
const showDelete = ref(false);
const deleteConfirm = ref("");
const deleting = ref(false);
const deleteError = ref<string | null>(null);

async function doDelete() {
  deleteError.value = null;
  deleting.value = true;
  try {
    const res = await fetch(`${apiBase}/orgs/me`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token.value}` },
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error((data as { error?: string }).error ?? "Delete failed");
    }
    await router.push("/");
  } catch (err) {
    deleteError.value = getErrorMessage(err);
    deleting.value = false;
  }
}
</script>

<template>
  <section class="set-section">
    <div class="set-section-head"><div>
      <div class="set-section-title">Danger zone</div>
      <div class="set-section-sub">These actions are permanent. They cannot be undone.</div>
    </div></div>
    <div class="set-section-body">

      <!-- Transfer ownership -->
      <div class="danger-row">
        <div>
          <div class="danger-title">Transfer ownership</div>
          <div class="danger-sub">Hand the organization off to another admin. You'll be demoted to Member.</div>
        </div>
        <button class="s-btn" @click="showTransfer = !showTransfer">Transfer…</button>
      </div>
      <div v-if="showTransfer" class="danger-form">
        <div class="field-input"><input v-model="transferEmail" type="email" placeholder="new-owner@example.com" ></div>
        <button class="s-btn danger" :disabled="!transferEmail || transferring" @click="doTransfer">
          {{ transferring ? "Transferring…" : "Confirm transfer" }}
        </button>
        <button class="s-btn" @click="showTransfer = false; transferError = null">Cancel</button>
        <span v-if="transferError" class="set-error">{{ transferError }}</span>
        <span v-if="transferDone" class="set-saved">Ownership transferred.</span>
      </div>

      <!-- Wipe traces -->
      <div class="danger-row">
        <div>
          <div class="danger-title">Wipe all traces</div>
          <div class="danger-sub">Delete every trace, replay, and annotation across all environments. Aggregates and keys are preserved.</div>
        </div>
        <button class="s-btn danger" @click="showWipe = !showWipe">Wipe traces…</button>
      </div>
      <div v-if="showWipe" class="danger-form">
        <div class="set-row-hint">Type <strong>{{ orgSlug }}</strong> to confirm.</div>
        <div class="field-input"><input v-model="wipeConfirm" type="text" :placeholder="orgSlug" class="mono" ></div>
        <button class="s-btn danger" :disabled="wipeConfirm !== orgSlug || wiping" @click="doWipe">
          {{ wiping ? "Wiping…" : "Delete all traces" }}
        </button>
        <button class="s-btn" @click="showWipe = false; wipeError = null; wipeConfirm = ''">Cancel</button>
        <span v-if="wipeError" class="set-error">{{ wipeError }}</span>
        <span v-if="wipeDone" class="set-saved">All traces deleted.</span>
      </div>

      <!-- Delete organization -->
      <div class="danger-row">
        <div>
          <div class="danger-title">Delete organization</div>
          <div class="danger-sub">Permanently delete {{ orgSlug }} and every member's access. This cannot be undone.</div>
        </div>
        <button class="s-btn danger" @click="showDelete = !showDelete">Delete organization…</button>
      </div>
      <div v-if="showDelete" class="danger-form">
        <div class="set-row-hint">Type <strong>{{ orgSlug }}</strong> to confirm. All data will be permanently erased.</div>
        <div class="field-input"><input v-model="deleteConfirm" type="text" :placeholder="orgSlug" class="mono" ></div>
        <button class="s-btn danger" :disabled="deleteConfirm !== orgSlug || deleting" @click="doDelete">
          {{ deleting ? "Deleting…" : "Delete organization permanently" }}
        </button>
        <button class="s-btn" @click="showDelete = false; deleteError = null; deleteConfirm = ''">Cancel</button>
        <span v-if="deleteError" class="set-error">{{ deleteError }}</span>
      </div>

    </div>
  </section>
</template>

<style scoped>
.danger-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 20px 16px;
  background: color-mix(in srgb, var(--danger, #e05252) 6%, transparent);
  border-top: 1px solid color-mix(in srgb, var(--danger, #e05252) 20%, transparent);
}
</style>
