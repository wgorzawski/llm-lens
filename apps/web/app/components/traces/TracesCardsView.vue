<script setup lang="ts">
import type { UnifiedTrace } from "@llm-lens/types";
import { extractMessageSnippet } from "@llm-lens/parsers";

defineProps<{
  traces: UnifiedTrace[];
  selected: Set<string>;
  pending: boolean;
}>();

const emit = defineEmits<{
  "toggle-select": [id: string];
  "row-click": [id: string];
  "row-menu-select": [trace: UnifiedTrace, action: string];
}>();

const SKEL = Array.from({ length: 9 });

function getSnippet(t: UnifiedTrace): string {
  return extractMessageSnippet(t.messages, 140);
}
</script>

<template>
  <div class="cards-wrap">
    <!-- skeleton -->
    <template v-if="pending">
      <div v-for="(_, i) in SKEL" :key="i" class="card" style="gap:12px">
        <div style="display:flex;gap:8px;align-items:center">
          <div class="sk pill" style="width:72px" />
          <div class="sk line" style="width:90px" />
        </div>
        <div class="sk box" style="height:42px" />
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:8px">
          <div v-for="j in 4" :key="j" style="display:flex;flex-direction:column;gap:4px">
            <div class="sk line sm" style="width:28px" />
            <div class="sk line" style="width:38px" />
          </div>
        </div>
      </div>
    </template>

    <!-- actual cards -->
    <template v-else>
      <div
        v-for="t in traces" :key="t.id"
        class="card"
        :class="{ selected: selected.has(t.id) }"
        @click="emit('row-click', t.id)"
      >
        <div class="card-head">
          <div class="left">
            <div class="card-row">
              <span :class="`prov prov-${t.metadata.provider}`">{{ t.metadata.provider }}</span>
              <span class="model">{{ t.metadata.model }}</span>
            </div>
            <div class="card-row">
              <span class="card-title">{{ traceName(t) }}</span>
              <span class="card-date" data-allow-mismatch="text">{{ formatDate(t.timestamp) }}</span>
            </div>
          </div>
          <div style="display:flex;gap:2px;align-items:center">
            <div
              class="cbox" :class="{ on: selected.has(t.id) }"
              @click.stop="emit('toggle-select', t.id)"
            />
            <ActionMenu
              :items="[
                { id: 'star', label: t.starred ? 'Unstar' : 'Star', icon: 'star' },
                { id: 'copy-link', label: 'Copy link', icon: 'note' },
                { id: 'delete', label: 'Delete', icon: 'trash', danger: true },
              ]"
              @select="emit('row-menu-select', t, $event)"
            >
              <button class="action-btn" title="More" @click.stop><AppIcon name="more" :size="12" /></button>
            </ActionMenu>
          </div>
        </div>

        <div class="card-snippet">
          <span class="role">user</span>{{ getSnippet(t) }}
        </div>

        <div class="card-meta">
          <div class="m">
            <span class="l">In</span>
            <span class="v">{{ fmtN(t.usage.inputTokens) }}</span>
          </div>
          <div class="m">
            <span class="l">Out</span>
            <span class="v">{{ fmtN(t.usage.outputTokens) }}</span>
          </div>
          <div class="m">
            <span class="l">Latency</span>
            <span class="v" :class="latClass(t.metadata.durationMs)">{{ fmtMs(t.metadata.durationMs) }}</span>
          </div>
          <div class="m">
            <span class="l">Cost</span>
            <span class="v" style="color:var(--success)">{{ fmtUsd(t.metadata.costUsd) }}</span>
          </div>
        </div>

        <div class="card-tags">
          <span v-if="hasSystem(t)" class="tag sys">sys</span>
          <span v-if="toolCallCount(t) > 0" class="tag tool">
            <AppIcon name="tool" :size="9" />{{ toolCallCount(t) }} tools
          </span>
          <span class="tag">{{ t.messages.length }} msgs</span>
        </div>
      </div>
    </template>
  </div>
</template>
