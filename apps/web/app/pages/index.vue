<script setup lang="ts">
import type { TraceProvider } from "@llm-lens/types";

const providers: Array<{ value: TraceProvider | ""; label: string }> = [
  { value: "", label: "All providers" },
  { value: "anthropic", label: "Anthropic" },
  { value: "openai", label: "OpenAI" },
  { value: "vercel-ai", label: "Vercel AI" },
];

const selectedProvider = ref<TraceProvider | "">("");

const { page, pending, error, fetchTraces } = useTraces({
  get provider() {
    return selectedProvider.value || undefined;
  },
});

await fetchTraces();

watch(selectedProvider, () => fetchTraces(0));

const totalPages = computed(() =>
  Math.max(1, Math.ceil(page.value.total / page.value.limit))
);
const currentPage = computed(() =>
  Math.floor(page.value.offset / page.value.limit) + 1
);

function goToPage(p: number) {
  fetchTraces((p - 1) * page.value.limit);
}
</script>

<template>
  <div class="min-h-screen bg-gray-50">
    <!-- Header -->
    <header class="bg-white border-b border-gray-200 px-6 py-4 flex items-center gap-4">
      <h1 class="text-xl font-bold text-gray-900 tracking-tight">
        🔍 LLM Lens
      </h1>
      <span v-if="page.total > 0" class="text-sm text-gray-400">
        {{ page.total }} trace{{ page.total !== 1 ? "s" : "" }}
      </span>

      <div class="ml-auto flex items-center gap-3">
        <select
          v-model="selectedProvider"
          class="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400"
        >
          <option v-for="p in providers" :key="p.value" :value="p.value">
            {{ p.label }}
          </option>
        </select>

        <button
          class="text-sm px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-600 transition-colors"
          :disabled="pending"
          @click="fetchTraces(page.offset)"
        >
          ↺ Refresh
        </button>
      </div>
    </header>

    <main class="max-w-3xl mx-auto px-6 py-8">
      <!-- Error -->
      <div
        v-if="error"
        class="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
      >
        {{ error }}
      </div>

      <!-- Loading -->
      <div v-if="pending" class="flex justify-center py-16">
        <div class="w-8 h-8 border-3 border-blue-400 border-t-transparent rounded-full animate-spin" />
      </div>

      <!-- Empty state -->
      <div
        v-else-if="page.traces.length === 0"
        class="text-center py-20 text-gray-400"
      >
        <div class="text-5xl mb-4">📭</div>
        <p class="font-medium">No traces yet</p>
        <p class="text-sm mt-1">
          POST a log to
          <code class="font-mono bg-gray-100 px-1 rounded">
            /api/traces/anthropic
          </code>
        </p>
      </div>

      <!-- Trace list -->
      <div v-else class="flex flex-col gap-3">
        <TraceCard v-for="trace in page.traces" :key="trace.id" :trace="trace" />
      </div>

      <!-- Pagination -->
      <div
        v-if="totalPages > 1"
        class="flex justify-center items-center gap-2 mt-8"
      >
        <button
          class="px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
          :disabled="currentPage === 1"
          @click="goToPage(currentPage - 1)"
        >
          ← Prev
        </button>
        <span class="text-sm text-gray-500">
          {{ currentPage }} / {{ totalPages }}
        </span>
        <button
          class="px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
          :disabled="currentPage === totalPages"
          @click="goToPage(currentPage + 1)"
        >
          Next →
        </button>
      </div>
    </main>
  </div>
</template>
