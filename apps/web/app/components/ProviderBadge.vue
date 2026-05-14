<script setup lang="ts">
import type { TraceProvider } from "@llm-lens/types";

const props = defineProps<{ provider: TraceProvider }>();

const label: Record<TraceProvider, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  "vercel-ai": "Vercel AI",
};

const cls: Record<TraceProvider, string> = {
  anthropic: "bg-amber-100 text-amber-800 border-amber-300",
  openai: "bg-emerald-100 text-emerald-800 border-emerald-300",
  "vercel-ai": "bg-indigo-100 text-indigo-800 border-indigo-300",
};
</script>

<template>
  <span
    class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border"
    :class="cls[props.provider]"
  >
    {{ label[props.provider] }}
  </span>
</template>
