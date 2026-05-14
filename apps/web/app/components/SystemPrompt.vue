<script setup lang="ts">
defineProps<{ text: string }>();
const open = ref(false);
</script>

<template>
  <div class="rounded-xl border border-purple-200 bg-purple-50 overflow-hidden">
    <button
      class="w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-purple-100 transition-colors"
      @click="open = !open"
    >
      <span class="text-xs font-semibold text-purple-700 uppercase tracking-wide">System Prompt</span>
      <span class="text-purple-400 text-xs ml-auto">{{ open ? "▲" : "▼" }}</span>
    </button>
    <div v-if="open" class="px-4 py-3 border-t border-purple-200 text-sm text-purple-900 italic whitespace-pre-wrap">
      {{ text }}
    </div>
  </div>
</template>
