<script setup lang="ts">
import type { TraceMessage, TraceContentBlock } from "@llm-lens/types";

const props = defineProps<{ message: TraceMessage }>();

const isUser = computed(() => props.message.role === "user");
const isAssistant = computed(() => props.message.role === "assistant");
const isSystem = computed(() => props.message.role === "system");

const blocks = computed<TraceContentBlock[]>(() => {
  const c = props.message.content;
  if (typeof c === "string") return [{ type: "text", text: c }];
  return c;
});

const roleLabel: Record<string, string> = {
  user: "User",
  assistant: "Assistant",
  system: "System",
  tool: "Tool",
};
</script>

<template>
  <div
    class="flex gap-3"
    :class="isUser ? 'flex-row-reverse' : 'flex-row'"
  >
    <!-- Avatar -->
    <div
      class="flex-none w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
      :class="{
        'bg-blue-500': isUser,
        'bg-gray-600': isAssistant,
        'bg-purple-400': isSystem,
        'bg-amber-400': !isUser && !isAssistant && !isSystem,
      }"
    >
      {{ roleLabel[message.role]?.[0] ?? "?" }}
    </div>

    <!-- Content -->
    <div
      class="max-w-[80%] flex flex-col gap-2"
      :class="isUser ? 'items-end' : 'items-start'"
    >
      <span class="text-xs text-gray-400 font-medium">
        {{ roleLabel[message.role] ?? message.role }}
      </span>

      <template v-for="(block, i) in blocks" :key="i">
        <div
          v-if="block.type === 'text' && block.text"
          class="rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words"
          :class="isUser
            ? 'bg-blue-500 text-white rounded-tr-sm'
            : isSystem
              ? 'bg-purple-50 text-purple-900 border border-purple-200 italic rounded-tl-sm'
              : 'bg-white text-gray-900 border border-gray-200 rounded-tl-sm shadow-sm'"
        >
          {{ block.text }}
        </div>

        <ToolCallBlock
          v-else-if="block.type === 'tool_use'"
          :tool-call="block.toolCall"
        />

        <ToolResultBlock
          v-else-if="block.type === 'tool_result'"
          :tool-result="block.toolResult"
        />

        <div
          v-else-if="block.type === 'image'"
          class="rounded border border-gray-200 overflow-hidden"
        >
          <img
            v-if="block.data.startsWith('http')"
            :src="block.data"
            :alt="`Image (${block.mimeType})`"
            class="max-w-xs max-h-48 object-contain"
          />
          <div v-else class="px-3 py-2 text-xs text-gray-500 font-mono bg-gray-50">
            [image/base64 {{ block.mimeType }}]
          </div>
        </div>
      </template>
    </div>
  </div>
</template>
