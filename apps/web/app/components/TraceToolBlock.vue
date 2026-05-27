<script setup lang="ts">
import type { ToolCall, ToolResult } from "@llm-lens/types";
import { highlightJson } from "~/utils/json-highlight";

const props = defineProps<{
  kind: "input" | "result";
  toolCall?: ToolCall;
  toolResult?: ToolResult;
}>();

const open = ref(true);

const jsonHtml = computed(() =>
  props.kind === "input" && props.toolCall
    ? highlightJson(props.toolCall.input)
    : null
);
</script>

<template>
  <div class="tool-block" :class="[kind, { collapsed: !open }]">
    <div class="tool-block-head" @click="open = !open">
      <span class="tool-tag" :class="kind === 'input' ? 'call' : 'result'">
        <AppIcon v-if="kind === 'input'" name="tool" :size="9" />
        {{ kind === "input" ? "tool_use" : "tool_result" }}
      </span>
      <span v-if="kind === 'input' && toolCall" class="tool-name">{{ toolCall.name }}</span>
      <span class="tool-id">{{ kind === 'input' ? toolCall?.id : toolResult?.toolCallId }}</span>
      <span v-if="toolResult?.isError" style="color:var(--danger);font-size:10px">error</span>
      <span class="tool-chevron" :style="{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)' }">
        <AppIcon name="chevron-down" :size="10" style="transform:rotate(-90deg)" />
      </span>
    </div>
    <div v-show="open" class="tool-block-body">
      <pre v-if="kind === 'input' && jsonHtml" v-html="jsonHtml" />
      <span v-else-if="kind === 'result'">{{ toolResult?.content }}</span>
    </div>
  </div>
</template>

<style scoped>
.tool-block {
  border: 1px solid var(--border-1);
  border-radius: var(--radius-md);
  background: var(--bg-2);
  overflow: hidden;
}
.tool-block.input { border-color: oklch(0.74 0.13 75 / 0.30); }
.tool-block.result { border-color: oklch(0.74 0.13 155 / 0.30); }

.tool-block-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  background: var(--bg-3);
  border-bottom: 1px solid var(--border-1);
  cursor: pointer;
  font-family: var(--font-mono);
  font-size: 11px;
  user-select: none;
}
.tool-block.input .tool-block-head {
  background: oklch(0.74 0.13 75 / 0.08);
  border-bottom-color: oklch(0.74 0.13 75 / 0.20);
}
.tool-block.result .tool-block-head {
  background: oklch(0.74 0.13 155 / 0.08);
  border-bottom-color: oklch(0.74 0.13 155 / 0.20);
}
.tool-block.collapsed .tool-block-head { border-bottom: 0; }

.tool-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 1px 5px;
  border-radius: 3px;
}
.tool-tag.call  { background: oklch(0.74 0.13 75 / 0.18);  color: var(--warn); }
.tool-tag.result { background: oklch(0.74 0.13 155 / 0.18); color: var(--success); }

.tool-name { color: var(--text-0); font-weight: 500; }
.tool-id   { color: var(--text-3); font-size: 10px; margin-left: auto; }

.tool-chevron {
  color: var(--text-2);
  display: inline-flex;
  transition: transform 0.15s;
}

.tool-block-body {
  padding: 10px 12px;
  font-family: var(--font-mono);
  font-size: 11px;
  line-height: 1.55;
  color: var(--text-1);
  white-space: pre-wrap;
  word-wrap: break-word;
}
.tool-block-body pre {
  margin: 0;
  font-family: inherit;
  font-size: inherit;
  line-height: inherit;
  white-space: pre-wrap;
  word-wrap: break-word;
}

/* JSON highlighting (global so v-html works) */
:deep(.j-key)   { color: oklch(0.74 0.14 230); }
:deep(.j-str)   { color: var(--success); }
:deep(.j-num)   { color: var(--warn); }
:deep(.j-bool)  { color: oklch(0.72 0.16 295); }
:deep(.j-null)  { color: var(--text-3); }
:deep(.j-punct) { color: var(--text-2); }
[data-theme="light"] :deep(.j-key)  { color: oklch(0.48 0.16 230); }
[data-theme="light"] :deep(.j-str)  { color: oklch(0.42 0.14 155); }
[data-theme="light"] :deep(.j-num)  { color: oklch(0.55 0.16 75); }
[data-theme="light"] :deep(.j-bool) { color: oklch(0.46 0.18 295); }
</style>
