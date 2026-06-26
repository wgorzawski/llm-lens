<script setup lang="ts">
import type { UnifiedTrace } from "@llm-lens/types";
import { extractMessageSnippet } from "@llm-lens/parsers";

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

const SKEL = Array.from({ length: 12 });

function getSnippet(t: UnifiedTrace): string {
  return extractMessageSnippet(t.messages, 140);
}
</script>

<template>
  <div class="list">
    <div class="list-row head">
      <div />
      <div>Provider</div>
      <div>Trace</div>
      <div>Last prompt</div>
      <div>In</div>
      <div>Out</div>
      <div>Latency</div>
      <div>Cost</div>
      <div>Msgs</div>
      <div style="text-align:right">Time</div>
      <div />
    </div>

    <!-- skeleton -->
    <template v-if="pending">
      <div v-for="(_, i) in SKEL" :key="i" class="list-row">
        <div class="sk box" style="width:14px;height:14px" />
        <div class="sk pill" style="width:70px" />
        <div class="col-title" style="gap:4px">
          <div class="sk line" style="width:55%" />
          <div class="sk line sm" style="width:35%" />
        </div>
        <div class="sk line" style="width:65%" />
        <div class="sk line" style="width:30px" />
        <div class="sk line" style="width:24px" />
        <div class="sk line" style="width:44px" />
        <div class="sk line" style="width:40px" />
        <div class="sk line" style="width:18px" />
        <div class="sk line" style="width:52px;margin-left:auto" />
        <div />
      </div>
    </template>

    <!-- actual rows -->
    <template v-else>
      <div
        v-for="t in traces" :key="t.id"
        class="list-row"
        :class="{ selected: selected.has(t.id) }"
        @click="emit('row-click', t.id)"
      >
        <div
          class="cbox" :class="{ on: selected.has(t.id) }"
          @click.stop="emit('toggle-select', t.id)"
        />
        <div>
          <span :class="`prov prov-${t.metadata.provider}`">{{ t.metadata.provider }}</span>
        </div>
        <div class="col-title">
          <span class="t1">{{ traceName(t) }}</span>
          <span class="t2">{{ t.metadata.model }} · <span style="color:var(--text-3)">{{ t.id.slice(-8) }}</span></span>
        </div>
        <div class="col-snippet">
          <span class="markers" style="margin-right:6px">
            <span v-if="hasSystem(t)" class="marker sys">SYS</span>
            <span v-if="toolCallCount(t) > 0" class="marker tool">
              <AppIcon name="tool" :size="9" />{{ toolCallCount(t) }}
            </span>
          </span>
          {{ getSnippet(t) }}
        </div>
        <div class="col-msg">
          <AppIcon name="up" :size="9" /> {{ fmtN(t.usage.inputTokens) }}
        </div>
        <div class="col-msg">
          <AppIcon name="down" :size="9" /> {{ fmtN(t.usage.outputTokens) }}
        </div>
        <div class="col-msg lat" :class="latClass(t.metadata.durationMs)">
          <span class="dot" :class="latClass(t.metadata.durationMs) || 'ok'" style="margin-right:4px" />
          {{ fmtMs(t.metadata.durationMs) }}
        </div>
        <div class="col-msg" style="color:var(--success)">{{ fmtUsd(t.metadata.costUsd) }}</div>
        <div class="col-msg" style="color:var(--text-2)">{{ t.messages.length }}</div>
        <div class="col-date">{{ getRelative(t.timestamp) }}</div>
        <div class="col-actions">
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
        </div>
      </div>
    </template>
  </div>
</template>
