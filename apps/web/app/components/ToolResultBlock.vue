<script setup lang="ts">
import type { ToolResult } from "@llm-lens/types";

defineProps<{ toolResult: ToolResult }>();

const open = ref(false);
</script>

<template>
  <div
    class="rounded border text-sm overflow-hidden"
    :class="toolResult.isError ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-gray-50'"
  >
    <button
      class="w-full flex items-center gap-2 px-3 py-2 text-left transition-colors"
      :class="toolResult.isError ? 'hover:bg-red-100' : 'hover:bg-gray-100'"
      @click="open = !open"
    >
      <span class="font-mono text-gray-600 text-xs">tool_result</span>
      <code class="text-xs text-gray-400">{{ toolResult.toolCallId }}</code>
      <span v-if="toolResult.isError" class="text-red-500 text-xs ml-1">error</span>
      <span class="text-gray-400 text-xs ml-auto">{{ open ? "▲" : "▼" }}</span>
    </button>
    <pre
      v-if="open"
      class="px-3 py-2 text-xs font-mono bg-white border-t overflow-x-auto"
      :class="toolResult.isError ? 'border-red-200' : 'border-gray-200'"
    >{{ toolResult.content }}</pre>
  </div>
</template>
