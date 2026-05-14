<script setup lang="ts">
const route = useRoute();
const id = route.params.id as string;

const { trace, pending, error, fetchTrace } = useTrace(id);
await fetchTrace();

function formatDate(iso: string) {
  return new Date(iso).toLocaleString();
}
</script>

<template>
  <div class="min-h-screen bg-gray-50">
    <!-- Header -->
    <header class="bg-white border-b border-gray-200 px-6 py-4 flex items-center gap-4">
      <NuxtLink
        to="/"
        class="text-sm text-gray-500 hover:text-gray-900 transition-colors flex items-center gap-1"
      >
        ← Traces
      </NuxtLink>
      <span class="text-gray-300">|</span>
      <h1 class="text-sm font-medium text-gray-700 font-mono truncate">{{ id }}</h1>
    </header>

    <main class="max-w-3xl mx-auto px-6 py-8">
      <!-- Error -->
      <div
        v-if="error"
        class="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
      >
        {{ error }}
      </div>

      <!-- Loading -->
      <div v-else-if="pending" class="flex justify-center py-16">
        <div class="w-8 h-8 border-3 border-blue-400 border-t-transparent rounded-full animate-spin" />
      </div>

      <template v-else-if="trace">
        <!-- Metadata bar -->
        <div class="bg-white rounded-xl border border-gray-200 px-4 py-3 mb-6 flex flex-wrap items-center gap-3">
          <ProviderBadge :provider="trace.metadata.provider" />
          <span class="text-sm font-mono text-gray-700">{{ trace.metadata.model }}</span>
          <UsageStats :usage="trace.usage" :duration-ms="trace.metadata.durationMs" />
          <span class="ml-auto text-xs text-gray-400">{{ formatDate(trace.timestamp) }}</span>
          <span
            v-if="trace.metadata.stopReason && trace.metadata.stopReason !== 'end_turn'"
            class="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 font-mono"
          >
            {{ trace.metadata.stopReason }}
          </span>
        </div>

        <!-- System prompt -->
        <SystemPrompt
          v-if="trace.metadata.systemPrompt"
          :text="trace.metadata.systemPrompt"
          class="mb-6"
        />

        <!-- Message thread -->
        <div class="flex flex-col gap-4">
          <MessageBubble
            v-for="(msg, i) in trace.messages"
            :key="i"
            :message="msg"
          />
        </div>

        <!-- Raw JSON toggle -->
        <details class="mt-8 rounded-xl border border-gray-200 overflow-hidden">
          <summary class="px-4 py-3 cursor-pointer text-xs font-medium text-gray-500 hover:bg-gray-50 select-none">
            Raw JSON
          </summary>
          <pre class="px-4 py-3 text-xs font-mono bg-gray-50 border-t border-gray-200 overflow-x-auto max-h-96">{{ JSON.stringify(trace, null, 2) }}</pre>
        </details>
      </template>
    </main>
  </div>
</template>
