<script setup lang="ts">
import type { CreatedApiKey } from "~/composables/useApiKeys";

const { keys, pending, error, fetchKeys, createKey, revokeKey } = useApiKeys();

await fetchKeys();

const showModal = ref(false);
const newKeyName = ref("");
const submitting = ref(false);
const modalError = ref<string | null>(null);
const createdKey = ref<CreatedApiKey | null>(null);
const copied = ref(false);

function openModal() {
  newKeyName.value = "";
  modalError.value = null;
  createdKey.value = null;
  copied.value = false;
  showModal.value = true;
}

function closeModal() {
  showModal.value = false;
  createdKey.value = null;
}

async function submitCreate() {
  if (!newKeyName.value.trim()) {
    modalError.value = "Name is required";
    return;
  }
  submitting.value = true;
  modalError.value = null;
  try {
    createdKey.value = await createKey(newKeyName.value.trim());
  } catch (err) {
    modalError.value = err instanceof Error ? err.message : "Failed to create key";
  } finally {
    submitting.value = false;
  }
}

async function copyKey() {
  if (!createdKey.value) return;
  await navigator.clipboard.writeText(createdKey.value.key);
  copied.value = true;
  setTimeout(() => { copied.value = false; }, 2000);
}

async function handleRevoke(id: string, name: string) {
  if (!confirm(`Revoke key "${name}"? This cannot be undone.`)) return;
  await revokeKey(id);
}

function formatDate(ms: number) {
  return new Date(ms).toLocaleDateString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
  });
}

function formatLastUsed(iso: string | null) {
  if (!iso) return "Never";
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return `${days} days ago`;
}
</script>

<template>
  <div class="min-h-screen bg-gray-50">
    <header class="bg-white border-b border-gray-200 px-6 py-4 flex items-center gap-4">
      <NuxtLink to="/" class="text-xl font-bold text-gray-900 tracking-tight hover:opacity-80">
        🔍 LLM Lens
      </NuxtLink>
      <span class="text-gray-300">/</span>
      <span class="text-sm font-medium text-gray-600">Settings</span>
    </header>

    <main class="max-w-2xl mx-auto px-6 py-10">
      <div class="flex items-center justify-between mb-6">
        <div>
          <h2 class="text-lg font-semibold text-gray-900">API Keys</h2>
          <p class="text-sm text-gray-500 mt-0.5">
            Use these keys to send traces from scripts and backends.
          </p>
        </div>
        <button
          class="text-sm px-4 py-2 rounded-lg bg-gray-900 text-white hover:bg-gray-700 transition-colors"
          @click="openModal"
        >
          + New key
        </button>
      </div>

      <div v-if="error" class="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        {{ error }}
      </div>

      <div v-if="pending" class="flex justify-center py-12">
        <div class="w-7 h-7 border-3 border-blue-400 border-t-transparent rounded-full animate-spin" />
      </div>

      <div v-else-if="keys.length === 0" class="text-center py-16 text-gray-400">
        <div class="text-4xl mb-3">🔑</div>
        <p class="font-medium text-gray-500">No API keys yet</p>
        <p class="text-sm mt-1">Create a key to start sending traces programmatically.</p>
      </div>

      <div v-else class="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <div
          v-for="(key, i) in keys"
          :key="key.id"
          class="flex items-center px-5 py-4 gap-4"
          :class="i > 0 ? 'border-t border-gray-100' : ''"
        >
          <div class="flex-1 min-w-0">
            <p class="text-sm font-medium text-gray-900 truncate">{{ key.name }}</p>
            <p class="text-xs text-gray-400 mt-0.5">
              Created {{ formatDate(key.createdAt) }} · Last used: {{ formatLastUsed(key.lastUsedAt) }}
            </p>
          </div>
          <button
            class="text-xs px-3 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition-colors shrink-0"
            @click="handleRevoke(key.id, key.name)"
          >
            Revoke
          </button>
        </div>
      </div>
    </main>

    <!-- Modal -->
    <div
      v-if="showModal"
      class="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4"
      @click.self="closeModal"
    >
      <div class="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">

        <!-- Step 1: enter name -->
        <template v-if="!createdKey">
          <h3 class="text-base font-semibold text-gray-900 mb-4">New API key</h3>

          <label class="block text-sm font-medium text-gray-700 mb-1.5">Name</label>
          <input
            v-model="newKeyName"
            type="text"
            placeholder="e.g. prod backend, local dev"
            class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            @keydown.enter="submitCreate"
          />

          <p v-if="modalError" class="mt-2 text-xs text-red-600">{{ modalError }}</p>

          <div class="flex gap-2 mt-5 justify-end">
            <button
              class="text-sm px-4 py-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
              @click="closeModal"
            >
              Cancel
            </button>
            <button
              class="text-sm px-4 py-2 rounded-lg bg-gray-900 text-white hover:bg-gray-700 transition-colors disabled:opacity-50"
              :disabled="submitting"
              @click="submitCreate"
            >
              {{ submitting ? "Creating…" : "Create" }}
            </button>
          </div>
        </template>

        <!-- Step 2: show plaintext key -->
        <template v-else>
          <h3 class="text-base font-semibold text-gray-900 mb-1">Key created</h3>
          <p class="text-sm text-gray-500 mb-4">
            Copy it now — you won't be able to see it again.
          </p>

          <div class="flex gap-2">
            <input
              :value="createdKey.key"
              readonly
              class="flex-1 min-w-0 rounded-lg border border-gray-200 px-3 py-2 text-xs font-mono bg-gray-50 text-gray-800 focus:outline-none"
            />
            <button
              class="shrink-0 text-sm px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
              @click="copyKey"
            >
              {{ copied ? "✓ Copied" : "Copy" }}
            </button>
          </div>

          <div class="mt-3 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700">
            Store this key in your <code class="font-mono">.env</code> as <code class="font-mono">LLMLENS_API_KEY</code>.
            It will not be shown again.
          </div>

          <div class="mt-5 flex justify-end">
            <button
              class="text-sm px-4 py-2 rounded-lg bg-gray-900 text-white hover:bg-gray-700 transition-colors"
              @click="closeModal"
            >
              Done
            </button>
          </div>
        </template>

      </div>
    </div>
  </div>
</template>
