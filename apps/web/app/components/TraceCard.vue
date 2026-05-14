<script setup lang="ts">
import type { UnifiedTrace } from "@llm-lens/types";

defineProps<{ trace: UnifiedTrace }>();

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return new Date(iso).toLocaleDateString();
}

function messageCount(trace: UnifiedTrace) {
  return trace.messages.filter((m) => m.role !== "system").length;
}
</script>

<template>
  <NuxtLink
    :to="`/traces/${trace.id}`"
    class="block bg-white rounded-xl border border-gray-200 px-4 py-3 hover:border-blue-300 hover:shadow-md transition-all group"
  >
    <div class="flex items-center gap-2 mb-2">
      <ProviderBadge :provider="trace.metadata.provider" />
      <span class="text-sm font-medium text-gray-700 font-mono truncate">
        {{ trace.metadata.model }}
      </span>
      <span class="ml-auto text-xs text-gray-400">{{ relativeTime(trace.timestamp) }}</span>
    </div>

    <div class="flex items-center gap-3">
      <UsageStats :usage="trace.usage" :duration-ms="trace.metadata.durationMs" />
      <span class="ml-auto text-xs text-gray-400">
        {{ messageCount(trace) }} msg
      </span>
      <span
        v-if="trace.metadata.stopReason && trace.metadata.stopReason !== 'end_turn'"
        class="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 font-mono"
      >
        {{ trace.metadata.stopReason }}
      </span>
    </div>
  </NuxtLink>
</template>
