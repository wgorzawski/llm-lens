<script setup lang="ts">
import type { ToolCall } from "@llm-lens/types";

defineProps<{ toolCall: ToolCall }>();

const open = ref(false);
</script>

<template>
  <div class="rounded border border-amber-200 bg-amber-50 text-sm overflow-hidden">
    <button
      class="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-amber-100 transition-colors"
      @click="open = !open"
    >
      <span class="font-mono text-amber-800 font-semibold">{{ toolCall.name }}</span>
      <span class="text-amber-500 text-xs ml-auto">{{ open ? "▲" : "▼" }}</span>
    </button>
    <pre
      v-if="open"
      class="px-3 py-2 text-xs font-mono bg-white border-t border-amber-200 overflow-x-auto"
    >{{ JSON.stringify(toolCall.input, null, 2) }}</pre>
  </div>
</template>
