<script setup lang="ts">
import type { UnifiedTrace } from "@llm-lens/types";

const props = defineProps<{
  traces: UnifiedTrace[];
  selected: Set<string>;
  pending: boolean;
}>();

const emit = defineEmits<{
  "toggle-select": [id: string];
  "row-click": [id: string];
  "row-menu-select": [trace: UnifiedTrace, action: string];
}>();

const SKEL = Array.from({ length: 14 });

function latBarWidth(ms: number | undefined): string {
  if (!ms) return "4px";
  const w = Math.min(60, Math.max(4, ms / 100));
  return `${w}px`;
}
</script>

<template>
  <div class="table-wrap">
    <table class="tbl">
      <thead>
        <tr>
          <th style="width:18px" />
          <th>ID</th>
          <th>Name</th>
          <th>Provider · Model</th>
          <th class="num">In</th>
          <th class="num">Out</th>
          <th class="num">Latency</th>
          <th class="num">Cost</th>
          <th>Tags</th>
          <th class="num">Time</th>
          <th style="width:28px" />
        </tr>
      </thead>
      <tbody>
        <!-- skeleton -->
        <template v-if="pending">
          <tr v-for="(_, i) in SKEL" :key="i">
            <td><div class="sk box" style="width:14px;height:14px" /></td>
            <td><div class="sk line" style="width:52px" /></td>
            <td><div class="sk line" style="width:110px" /></td>
            <td><div class="sk pill" style="width:80px" /></td>
            <td class="num"><div class="sk line" style="width:28px;margin-left:auto" /></td>
            <td class="num"><div class="sk line" style="width:24px;margin-left:auto" /></td>
            <td class="num"><div class="sk line" style="width:44px;margin-left:auto" /></td>
            <td class="num"><div class="sk line" style="width:38px;margin-left:auto" /></td>
            <td><div class="sk pill" style="width:40px" /></td>
            <td class="num"><div class="sk line" style="width:52px;margin-left:auto" /></td>
            <td />
          </tr>
        </template>

        <!-- actual rows -->
        <template v-else>
          <tr
            v-for="t in traces" :key="t.id"
            :class="{ selected: selected.has(t.id) }"
            @click="emit('row-click', t.id)"
          >
            <td>
              <div
                class="cbox" :class="{ on: selected.has(t.id) }"
                @click.stop="emit('toggle-select', t.id)"
              />
            </td>
            <td class="col-id">{{ t.id.slice(-8) }}</td>
            <td class="col-name">{{ traceName(t) }}</td>
            <td>
              <span :class="`prov prov-${t.metadata.provider}`">{{ t.metadata.provider }}</span>
              <span class="model" style="margin-left:6px">{{ t.metadata.model }}</span>
            </td>
            <td class="num">{{ fmtN(t.usage.inputTokens) }}</td>
            <td class="num">{{ fmtN(t.usage.outputTokens) }}</td>
            <td class="num">
              <span
                class="latbar"
                :class="latClass(t.metadata.durationMs)"
                :style="{ width: latBarWidth(t.metadata.durationMs) }"
              />
              <span :class="['col-msg', latClass(t.metadata.durationMs)]">{{ fmtMs(t.metadata.durationMs) }}</span>
            </td>
            <td class="num" style="color:var(--success)">{{ fmtUsd(t.metadata.costUsd) }}</td>
            <td>
              <span class="markers">
                <span v-if="hasSystem(t)" class="marker sys">SYS</span>
                <span v-if="toolCallCount(t) > 0" class="marker tool">{{ toolCallCount(t) }}</span>
              </span>
            </td>
            <td class="num" style="color:var(--text-2);font-size:11px;font-family:var(--font-mono)">
              {{ getRelative(t.timestamp) }}
            </td>
            <td>
              <ActionMenu
                :items="[
                  { id: 'star', label: t.starred ? 'Unstar' : 'Star', icon: 'star' },
                  { id: 'copy-link', label: 'Copy link', icon: 'note' },
                  { id: 'delete', label: 'Delete', icon: 'trash', danger: true },
                ]"
                @select="emit('row-menu-select', t, $event)"
              >
                <button class="action-btn" title="More"><AppIcon name="more" :size="12" /></button>
              </ActionMenu>
            </td>
          </tr>
        </template>
      </tbody>
    </table>
  </div>
</template>
