<script setup lang="ts">
definePageMeta({ layout: "app" });

const { keys: apiKeys, pending: keysPending, fetchKeys, createKey, revokeKey } = useApiKeys();
const newKeyName = ref("");
const creatingKey = ref(false);
const createdKey = ref<{ id: string; name: string; key: string } | null>(null);
const keyError = ref<string | null>(null);

await fetchKeys();

async function onCreateKey() {
  if (!newKeyName.value.trim()) return;
  creatingKey.value = true;
  keyError.value = null;
  try {
    const result = await createKey(newKeyName.value.trim());
    newKeyName.value = "";
    createdKey.value = { id: result.id, name: result.name, key: result.key };
  } catch (err) {
    keyError.value = getErrorMessage(err);
  } finally {
    creatingKey.value = false;
  }
}

async function onRevokeKey(id: string) {
  keyError.value = null;
  try { await revokeKey(id); }
  catch (err) { keyError.value = getErrorMessage(err); }
}

function copyKey(val: string) {
  navigator.clipboard?.writeText(val);
}

function fmtDate(ts: number | string | null) {
  if (!ts) return "—";
  return new Date(typeof ts === "number" ? ts : ts).toLocaleDateString(undefined, {
    year: "numeric", month: "short", day: "numeric",
  });
}
</script>

<template>
  <!-- topbar -->
  <div class="topbar">
    <div class="crumbs">
      <NuxtLink to="/" class="crumb-link">Traces</NuxtLink>
      <span class="crumb-sep">/</span>
      <span class="crumb-cur">API keys</span>
    </div>
  </div>

  <!-- keys panel -->
  <div class="keys-panel">

    <div class="keys-header">
      <div class="keys-title">API keys</div>
      <div class="keys-sub">Use these keys to ingest traces from your application. Keep them secret — treat them like passwords.</div>
    </div>

    <!-- create form -->
    <div class="keys-create">
      <input
        v-model="newKeyName"
        class="keys-name-input"
        placeholder="Key name (e.g. production)"
        :disabled="creatingKey"
        @keydown.enter="onCreateKey"
      >
      <button class="create-btn" :disabled="creatingKey || !newKeyName.trim()" @click="onCreateKey">
        {{ creatingKey ? "Creating…" : "+ Create key" }}
      </button>
    </div>

    <!-- newly created key reveal -->
    <Transition name="fade">
      <div v-if="createdKey" class="keys-reveal">
        <AppIcon name="check" :size="13" style="color:var(--success);flex-shrink:0" />
        <span>Key created — copy it now, it won't be shown again.</span>
        <div class="keys-reveal-val">
          <code>{{ createdKey.key }}</code>
          <button class="icon-btn xs" title="Copy" @click="copyKey(createdKey!.key)">
            <AppIcon name="copy" :size="13" />
          </button>
        </div>
        <button class="icon-btn xs" title="Dismiss" style="margin-left:auto" @click="createdKey = null">
          <AppIcon name="x" :size="12" />
        </button>
      </div>
    </Transition>

    <div v-if="keyError" class="keys-error">{{ keyError }}</div>

    <!-- keys list -->
    <div class="keys-list">
      <div v-if="keysPending" class="keys-empty">Loading…</div>
      <div v-else-if="apiKeys.length === 0" class="keys-empty">
        No API keys yet. Create one above to start ingesting traces.
      </div>
      <template v-else>
        <div class="keys-list-head">
          <span>Name</span>
          <span>Created</span>
          <span>Last used</span>
          <span />
        </div>
        <div v-for="k in apiKeys" :key="k.id" class="key-row">
          <span class="key-name">{{ k.name }}</span>
          <span class="key-meta">{{ fmtDate(k.createdAt) }}</span>
          <span class="key-meta">{{ fmtDate(k.lastUsedAt) }}</span>
          <button class="icon-btn xs" style="color:var(--danger)" title="Revoke" @click="onRevokeKey(k.id)">
            <AppIcon name="trash" :size="12" />
          </button>
        </div>
      </template>
    </div>

  </div>
</template>

<style scoped>
/* ── Topbar ── */
.topbar {
  height: var(--topbar-h);
  border-bottom: 1px solid var(--border-0);
  display: flex;
  align-items: center;
  padding: 0 20px;
  background: var(--bg-1);
  flex-shrink: 0;
}
.crumbs { display: flex; align-items: center; gap: 6px; font-size: 13px; color: var(--text-2); }
.crumb-link { color: var(--text-2); text-decoration: none; }
.crumb-link:hover { color: var(--text-0); }
.crumb-sep { color: var(--text-3); }
.crumb-cur { color: var(--text-0); font-weight: 500; }

/* ── Keys panel ── */
.keys-panel {
  flex: 1;
  overflow-y: auto;
  padding: 32px 40px;
  display: flex;
  flex-direction: column;
  gap: 24px;
  max-width: 760px;
}
.keys-header { display: flex; flex-direction: column; gap: 4px; }
.keys-title { font-size: 18px; font-weight: 600; color: var(--text-0); }
.keys-sub { font-size: 13px; color: var(--text-3); line-height: 1.5; }

/* Create form */
.keys-create { display: flex; gap: 8px; align-items: center; }
.keys-name-input {
  flex: 1;
  max-width: 360px;
  height: 34px;
  padding: 0 12px;
  background: var(--bg-2);
  border: 1px solid var(--border-1);
  border-radius: 6px;
  color: var(--text-0);
  font-size: 13px;
}
.keys-name-input:focus { outline: none; border-color: var(--accent); }
.create-btn {
  height: 34px;
  padding: 0 16px;
  border-radius: 6px;
  border: 1px solid var(--accent-border);
  background: var(--accent-bg);
  color: var(--accent);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
}
.create-btn:hover { filter: brightness(1.15); }
.create-btn:disabled { opacity: 0.4; cursor: not-allowed; filter: none; }

/* Reveal banner */
.keys-reveal {
  display: flex;
  align-items: center;
  gap: 10px;
  background: var(--bg-2);
  border: 1px solid var(--border-1);
  border-radius: 8px;
  padding: 12px 16px;
  font-size: 12px;
  color: var(--text-1);
  flex-wrap: wrap;
}
.keys-reveal-val {
  display: flex;
  align-items: center;
  gap: 6px;
  background: var(--bg-3);
  border-radius: 4px;
  padding: 4px 10px;
}
.keys-reveal-val code { font-family: var(--font-mono); font-size: 12px; color: var(--text-0); }
.fade-enter-active, .fade-leave-active { transition: opacity 0.2s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

.keys-error { color: var(--danger); font-size: 13px; }

/* Keys list */
.keys-list {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border-1);
  border-radius: 8px;
  overflow: hidden;
}
.keys-list-head {
  display: grid;
  grid-template-columns: 1fr 140px 140px 44px;
  padding: 8px 16px;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-3);
  text-transform: uppercase;
  letter-spacing: .04em;
  background: var(--bg-2);
  border-bottom: 1px solid var(--border-1);
}
.key-row {
  display: grid;
  grid-template-columns: 1fr 140px 140px 44px;
  align-items: center;
  padding: 12px 16px;
  font-size: 13px;
  border-bottom: 1px solid var(--border-1);
}
.key-row:last-child { border-bottom: none; }
.key-name { font-weight: 500; color: var(--text-0); }
.key-meta { color: var(--text-3); font-size: 12px; }
.keys-empty { padding: 32px; text-align: center; color: var(--text-3); font-size: 13px; }
</style>
