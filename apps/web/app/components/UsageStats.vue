<script setup lang="ts">
import type { TraceUsage } from "@llm-lens/types";

defineProps<{ usage: TraceUsage; durationMs?: number }>();

function fmt(n: number) {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}
</script>

<template>
  <div class="flex items-center gap-3 text-xs text-gray-500 font-mono">
    <span title="Input tokens">↑ {{ fmt(usage.inputTokens) }}</span>
    <span title="Output tokens">↓ {{ fmt(usage.outputTokens) }}</span>
    <span v-if="usage.cacheReadTokens" title="Cache read tokens" class="text-indigo-400">
      ⚡ {{ fmt(usage.cacheReadTokens) }}
    </span>
    <span v-if="durationMs" title="Duration">⏱ {{ durationMs }}ms</span>
  </div>
</template>
