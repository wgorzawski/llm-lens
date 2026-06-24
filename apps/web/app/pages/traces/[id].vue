<script setup lang="ts">
import type { TraceMessage, ToolCall, ToolResult } from "@llm-lens/types";
import { highlightJson } from "~/utils/json-highlight";

definePageMeta({ layout: false });
useHead({ htmlAttrs: { "data-theme": "dark" } });

// ── route + data ──────────────────────────────────────────────────────────────
const route = useRoute();
const id = route.params.id as string;
const { trace, pending, error, fetchTrace } = useTrace(id);
await fetchTrace();

// ── auth ──────────────────────────────────────────────────────────────────────
const { logout, token } = useAuth();
const { me, fetchMe } = useMe();
if (!me.value) await fetchMe();
const userName = computed<string>(() => {
  if (!token.value) return "user";
  try {
    const payload = JSON.parse(atob(token.value.split(".")[1]!));
    return (payload.email as string).split("@")[0] ?? "user";
  } catch { return "user"; }
});

// ── ui state ──────────────────────────────────────────────────────────────────
const inspectorTab = ref<"inspector" | "timeline" | "raw" | "notes">("inspector");
const theme = ref<"dark" | "light">("dark");
watch(theme, v => document.documentElement.setAttribute("data-theme", v));

// ── message normalization ─────────────────────────────────────────────────────
type RenderBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; toolCall: ToolCall }
  | { type: "tool_result"; toolResult: ToolResult };

interface NormalizedMsg {
  id: string;
  role: TraceMessage["role"];
  blocks: RenderBlock[];
  isToolResult: boolean;
  tMs: number;
}

function fmtT(ms: number): string {
  return ms >= 1000 ? (ms / 1000).toFixed(2) + "s" : ms + "ms";
}

function normalizeMsg(msg: TraceMessage, idx: number, count: number, totalMs: number): NormalizedMsg {
  const blocks: RenderBlock[] = [];
  if (typeof msg.content === "string") {
    if (msg.content) blocks.push({ type: "text", text: msg.content });
  } else if (Array.isArray(msg.content)) {
    for (const b of msg.content) {
      if (b.type === "text") blocks.push({ type: "text", text: b.text });
      else if (b.type === "tool_use") blocks.push({ type: "tool_use", toolCall: b.toolCall });
      else if (b.type === "tool_result") blocks.push({ type: "tool_result", toolResult: b.toolResult });
    }
  }
  if (msg.toolCalls) for (const tc of msg.toolCalls) blocks.push({ type: "tool_use", toolCall: tc });
  if (msg.toolResults) for (const tr of msg.toolResults) blocks.push({ type: "tool_result", toolResult: tr });

  const isToolResult = msg.role === "user" && blocks.length > 0 && blocks.every(b => b.type === "tool_result");
  const tMs = count > 1 ? Math.round((idx / (count - 1)) * totalMs) : 0;
  return { id: `msg-${idx}`, role: msg.role, blocks, isToolResult, tMs };
}

const normalizedMessages = computed<NormalizedMsg[]>(() => {
  const msgs = trace.value?.messages ?? [];
  const totalMs = trace.value?.metadata.durationMs ?? 0;
  return msgs.map((m, i) => normalizeMsg(m, i, msgs.length, totalMs));
});
const systemMessages = computed(() => normalizedMessages.value.filter(m => m.role === "system"));
const conversationMessages = computed(() => normalizedMessages.value.filter(m => m.role !== "system"));

const toolCallCount = computed(() =>
  normalizedMessages.value.reduce((s, m) => s + m.blocks.filter(b => b.type === "tool_use").length, 0)
);
const toolNames = computed(() => {
  const names = new Set<string>();
  for (const m of normalizedMessages.value)
    for (const b of m.blocks)
      if (b.type === "tool_use") names.add(b.toolCall.name);
  return [...names];
});

// ── timeline (approximate from message sequence) ───────────────────────────────
const timeline = computed(() => {
  if (!trace.value) return [];
  const total = trace.value.metadata.durationMs ?? 1000;
  const entries: { label: string; kind: string; startMs: number; durMs: number; indent?: number }[] = [];
  let cur = 0;
  const hasSystem = systemMessages.value.length > 0;
  const firstUserMsg = conversationMessages.value.find(m => m.role === "user" && !m.isToolResult);

  if (hasSystem || firstUserMsg) {
    const d = Math.round(total * 0.015);
    entries.push({ label: hasSystem ? "system + user" : "user", kind: "user", startMs: 0, durMs: d });
    cur = d;
  }

  for (const msg of conversationMessages.value) {
    if (msg.role === "assistant") {
      const hasTools = msg.blocks.some(b => b.type === "tool_use");
      const d = hasTools ? Math.round(total * 0.33) : Math.round(total * 0.70);
      entries.push({ label: trace.value.metadata.model, kind: "assistant", startMs: cur, durMs: d });
      cur += d;
    } else if (msg.isToolResult) {
      for (const b of msg.blocks) {
        if (b.type === "tool_result") {
          const d = Math.round(total * 0.015);
          entries.push({ label: b.toolResult.toolCallId ?? "tool_result", kind: "tool", startMs: cur, durMs: d, indent: 1 });
        }
      }
      cur += Math.round(total * 0.02);
    }
  }
  return entries;
});

const rawJsonHtml = computed(() => highlightJson(trace.value ?? {}));
const rawLineCount = computed(() => JSON.stringify(trace.value, null, 2).split("\n").length);
const status = computed(() => trace.value ? traceStatus(trace.value) : { ok: true, label: "200 OK" });

// ── sidebar ───────────────────────────────────────────────────────────────────
const sidebarItems1 = [
  { id: "traces",    label: "Traces",         icon: "activity",  action: () => navigateTo("/") },
  { id: "dashboard", label: "Dashboard",      icon: "dashboard", action: () => {} },
  { id: "compare",   label: "Compare & diff", icon: "diff",      action: () => {} },
  { id: "replays",   label: "Replays",        icon: "replay",    action: () => {} },
];
const sidebarItems2 = [
  { id: "keys",       label: "API keys",        icon: "key",      action: () => {} },
  { id: "instrument", label: "Instrumentation", icon: "tool",     action: () => {} },
  { id: "docs",       label: "Docs",            icon: "docs",     action: () => {} },
  { id: "settings",   label: "Settings",        icon: "settings", action: () => navigateTo("/settings") },
];

function copyId() {
  if (trace.value) navigator.clipboard?.writeText(trace.value.id);
}
function copyJson() {
  if (trace.value) navigator.clipboard?.writeText(JSON.stringify(trace.value, null, 2));
}
function downloadJson() {
  if (!trace.value) return;
  const blob = new Blob([JSON.stringify(trace.value, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${traceName(trace.value)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
</script>

<template>
  <div class="app">

    <!-- ══════════════════════ SIDEBAR ══════════════════════ -->
    <aside class="sidebar">
      <div class="sb-brand">
        <div class="sb-logo"><AppIcon name="logo" :size="14" /></div>
        <div class="sb-name">LLM Lens</div>
        <div class="sb-env">prod</div>
      </div>

      <div class="sb-section">
        <div class="sb-section-label">Observe</div>
        <div v-for="it in sidebarItems1" :key="it.id" class="sb-item" @click="it.action()">
          <AppIcon :name="it.icon" :size="14" />
          <span>{{ it.label }}</span>
        </div>
      </div>

      <div class="sb-section">
        <div class="sb-section-label">Configure</div>
        <div v-for="it in sidebarItems2" :key="it.id" class="sb-item" @click="it.action()">
          <AppIcon :name="it.icon" :size="14" />
          <span>{{ it.label }}</span>
        </div>
      </div>

      <div class="sb-spacer" />

      <div class="sb-footer">
        <div class="sb-user" @click="logout()">
          <div class="sb-avatar">{{ userName[0]?.toUpperCase() }}</div>
          <div style="display:flex;flex-direction:column;line-height:1.2;flex:1;min-width:0">
            <span class="sb-user-name">{{ userName }}</span>
            <span class="sb-user-org">{{ me?.org ?? "personal" }} · {{ me?.plan ?? "free" }}</span>
          </div>
          <AppIcon name="logout" :size="12" style="color:var(--text-3)" />
        </div>
      </div>
    </aside>

    <!-- ══════════════════════ MAIN COLUMN ══════════════════════ -->
    <div class="main-col">

      <!-- ── Loading ── -->
      <template v-if="pending">
        <div class="detail-head">
          <div class="dh-crumb">
            <NuxtLink to="/"><AppIcon name="chevron-down" :size="10" class="back-chevron" /> Traces</NuxtLink>
            <span class="sep">/</span><span class="here">…</span>
          </div>
          <div class="sk line" style="width:300px;height:20px;margin:12px 0 8px" />
          <div class="sk line" style="width:480px;height:12px" />
          <div class="sk box" style="height:66px;margin-top:14px;border-radius:6px" />
        </div>
        <div style="padding:32px 24px;display:flex;flex-direction:column;gap:10px">
          <div v-for="i in 4" :key="i" class="sk box" style="height:76px;border-radius:8px" />
        </div>
      </template>

      <!-- ── Error ── -->
      <div v-else-if="error" style="padding:40px 24px;color:var(--danger);font-size:13px">{{ error }}</div>

      <!-- ── Trace ── -->
      <template v-else-if="trace">

        <!-- DETAIL HEAD -->
        <div class="detail-head">

          <!-- breadcrumb -->
          <div class="dh-crumb">
            <NuxtLink to="/">
              <AppIcon name="chevron-down" :size="10" class="back-chevron" /> Traces
            </NuxtLink>
            <span class="sep">/</span>
            <span class="here">{{ trace.metadata.model.split("-")[0] }}_{{ trace.id.slice(-8) }}</span>
          </div>

          <!-- title row + actions -->
          <div class="dh-top">
            <div class="dh-title-block">
              <div class="dh-title-row">
                <span :class="`prov prov-${trace.metadata.provider}`" style="font-size:10px">{{ trace.metadata.provider }}</span>
                <span class="model" style="font-size:13px">{{ trace.metadata.model }}</span>
                <span class="dh-title">{{ trace.metadata.model.split("-")[0] }}_{{ trace.id.slice(-8) }}</span>
              </div>
              <div class="dh-title-row" style="gap:8px;flex-wrap:wrap">
                <span class="dh-id" title="Copy ID" @click="copyId">{{ trace.id }}</span>
                <span style="color:var(--text-3)">·</span>
                <span style="font-size:11px;color:var(--text-2);font-family:var(--font-mono)">{{ formatDate(trace.timestamp) }}</span>
                <span style="font-size:11px;color:var(--text-3)">({{ getRelative(trace.timestamp) }})</span>
                <span style="display:flex;align-items:center;gap:4px;margin-left:8px">
                  <span class="dot" :class="status.ok ? 'ok' : 'err'" />
                  <span :style="{ fontSize: '10px', color: status.ok ? 'var(--success)' : 'var(--danger)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.05em' }">{{ status.label }}</span>
                </span>
              </div>
            </div>
            <div class="dh-actions">
              <button class="btn"><AppIcon name="diff" :size="12" />Diff <span class="kbd">D</span></button>
              <button class="btn primary"><AppIcon name="replay" :size="12" />Replay <span class="kbd">R</span></button>
              <button class="btn"><AppIcon name="star" :size="12" /></button>
              <button class="btn" @click="theme = theme === 'dark' ? 'light' : 'dark'">
                <AppIcon :name="theme === 'dark' ? 'sun' : 'moon'" :size="12" />
              </button>
              <button class="btn"><AppIcon name="more" :size="12" /></button>
            </div>
          </div>

          <!-- meta strip -->
          <div class="meta-strip">
            <div class="meta-cell">
              <span class="ml">Tokens · in</span>
              <span class="mv"><AppIcon name="up" :size="11" style="color:var(--text-2);margin-right:2px" />{{ fmtN(trace.usage.inputTokens) }}</span>
              <span class="ms">input tokens</span>
            </div>
            <div class="meta-cell">
              <span class="ml">Tokens · out</span>
              <span class="mv"><AppIcon name="down" :size="11" style="color:var(--text-2);margin-right:2px" />{{ fmtN(trace.usage.outputTokens) }}</span>
              <span class="ms">output tokens</span>
            </div>
            <div class="meta-cell">
              <span class="ml">Cache hit</span>
              <span class="mv" :class="(trace.usage.cacheReadTokens ?? 0) > 0 ? 'warn' : ''">
                ⚡ {{ fmtN(trace.usage.cacheReadTokens) }}
              </span>
              <span class="ms">{{ (trace.usage.cacheReadTokens ?? 0) > 0 ? Math.round(((trace.usage.cacheReadTokens ?? 0) / Math.max(1, trace.usage.inputTokens + (trace.usage.cacheReadTokens ?? 0))) * 100) + '% saving' : 'no cache' }}</span>
            </div>
            <div class="meta-cell">
              <span class="ml">Latency</span>
              <span class="mv" :class="latClass(trace.metadata.durationMs)">{{ fmtMs(trace.metadata.durationMs) }}</span>
              <span class="ms">total</span>
            </div>
            <div class="meta-cell">
              <span class="ml">Cost</span>
              <span class="mv ok">{{ trace.metadata.costUsd != null ? fmtUsd(trace.metadata.costUsd) : '—' }}</span>
              <span class="ms">USD total</span>
            </div>
            <div class="meta-cell">
              <span class="ml">Messages</span>
              <span class="mv">{{ trace.messages.length }}</span>
              <span class="ms">{{ systemMessages.length ? '1 system · ' : '' }}{{ conversationMessages.length }} turn</span>
            </div>
            <div class="meta-cell">
              <span class="ml">Tool calls</span>
              <span class="mv" :class="toolCallCount > 0 ? 'warn' : ''">
                <AppIcon v-if="toolCallCount > 0" name="tool" :size="11" style="margin-right:3px" />
                {{ toolCallCount || '—' }}
              </span>
              <span class="ms">{{ toolNames.join(', ') || 'none' }}</span>
            </div>
          </div>
        </div>

        <!-- DETAIL BODY -->
        <div class="detail-body">

          <!-- ── THREAD ── -->
          <div class="thread-col">
            <div class="thread">

              <!-- system messages -->
              <template v-if="systemMessages.length">
                <div v-for="(msg, si) in systemMessages" :key="msg.id" class="msg" :style="si === 0 ? 'border-top:0' : ''">
                  <div class="msg-avatar system">S</div>
                  <div class="msg-body">
                    <div class="msg-head">
                      <span class="msg-role">System</span>
                      <div class="msg-stats">
                        <span class="stat">prompt</span>
                      </div>
                    </div>
                    <div class="msg-text-blocks">
                      <div v-for="(block, bi) in msg.blocks" :key="bi">
                        <div v-if="block.type === 'text'" class="msg-text system" v-html="renderMd(block.text)" />
                      </div>
                    </div>
                  </div>
                  <div class="msg-meta-col">
                    <span class="t">T+{{ fmtT(msg.tMs) }}</span>
                    <span class="d">{{ msg.id }}</span>
                  </div>
                </div>
                <div class="thread-divider">— conversation —</div>
              </template>

              <!-- conversation messages -->
              <div
                v-for="(msg, ci) in conversationMessages"
                :key="msg.id"
                :id="msg.id"
                class="msg"
                :style="!systemMessages.length && ci === 0 ? 'border-top:0' : ''"
              >
                <!-- avatar -->
                <div class="msg-avatar" :class="msg.isToolResult ? 'tool' : msg.role">
                  {{ msg.isToolResult ? '↺' : msg.role === 'user' ? 'U' : msg.role === 'assistant' ? 'A' : 'T' }}
                </div>

                <div class="msg-body">
                  <div class="msg-head">
                    <span class="msg-role">
                      {{ msg.isToolResult ? 'Tool results' : msg.role === 'user' ? 'User' : msg.role === 'assistant' ? 'Assistant' : msg.role }}
                    </span>
                    <span v-if="msg.role === 'assistant'" class="msg-role-sub">{{ trace.metadata.model }}</span>
                    <span v-if="msg.isToolResult" class="msg-role-sub">
                      {{ msg.blocks.length }} result{{ msg.blocks.length !== 1 ? 's' : '' }}
                    </span>
                    <div class="msg-stats">
                      <span v-if="msg.blocks.some(b => b.type === 'tool_use')" class="stat">
                        <AppIcon name="tool" :size="9" />
                        {{ msg.blocks.filter(b => b.type === 'tool_use').length }} tool call{{ msg.blocks.filter(b => b.type === 'tool_use').length !== 1 ? 's' : '' }}
                      </span>
                    </div>
                  </div>

                  <div class="msg-text-blocks">
                    <template v-for="(block, bi) in msg.blocks" :key="bi">
                      <div
                        v-if="block.type === 'text'"
                        class="msg-text"
                        :class="msg.role === 'user' && !msg.isToolResult ? 'user' : msg.role === 'system' ? 'system' : ''"
                        v-html="renderMd(block.text)"
                      />
                      <TraceToolBlock
                        v-else-if="block.type === 'tool_use'"
                        kind="input"
                        :tool-call="block.toolCall"
                      />
                      <TraceToolBlock
                        v-else-if="block.type === 'tool_result'"
                        kind="result"
                        :tool-result="block.toolResult"
                      />
                    </template>
                  </div>
                </div>

                <div class="msg-meta-col">
                  <span class="t">T+{{ fmtT(msg.tMs) }}</span>
                  <span class="d">{{ msg.id }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- ── INSPECTOR ── -->
          <div class="inspector">
            <div class="insp-tabs">
              <button class="insp-tab" :class="{ active: inspectorTab === 'inspector' }" @click="inspectorTab = 'inspector'">Inspector</button>
              <button class="insp-tab" :class="{ active: inspectorTab === 'timeline' }" @click="inspectorTab = 'timeline'">Timeline</button>
              <button class="insp-tab" :class="{ active: inspectorTab === 'raw' }" @click="inspectorTab = 'raw'">Raw JSON</button>
              <button class="insp-tab" :class="{ active: inspectorTab === 'notes' }" @click="inspectorTab = 'notes'">
                Notes <span class="count">0</span>
              </button>
            </div>

            <div class="insp-body">

              <!-- ─ Inspector tab ─ -->
              <template v-if="inspectorTab === 'inspector'">
                <div class="is-section">
                  <div class="is-label">Request</div>
                  <div class="is-row">
                    <span class="k">provider</span>
                    <span class="v"><span :class="`prov prov-${trace.metadata.provider}`" style="font-size:9px">{{ trace.metadata.provider }}</span></span>
                  </div>
                  <div class="is-row"><span class="k">model</span><span class="v copyable">{{ trace.metadata.model }}</span></div>
                  <div class="is-row"><span class="k">max_tokens</span><span class="v">{{ trace.metadata.maxTokens ?? '—' }}</span></div>
                  <div class="is-row"><span class="k">temperature</span><span class="v">{{ trace.metadata.temperature ?? '—' }}</span></div>
                  <div v-if="toolNames.length" class="is-row">
                    <span class="k">tools</span>
                    <span class="v">{{ toolNames.join(', ') }}</span>
                  </div>
                </div>

                <div class="is-section">
                  <div class="is-label">Response</div>
                  <div class="is-row">
                    <span class="k">stop_reason</span>
                    <span class="v" style="color:var(--success)">{{ trace.metadata.stopReason ?? '—' }}</span>
                  </div>
                  <div class="is-row">
                    <span class="k">status</span>
                    <span class="v"><span class="dot" :class="status.ok ? 'ok' : 'err'" style="margin-right:6px" />{{ status.label }}</span>
                  </div>
                  <div class="is-row"><span class="k">duration</span><span class="v">{{ fmtMs(trace.metadata.durationMs) }}</span></div>
                </div>

                <div class="is-section">
                  <div class="is-label">Tokens</div>
                  <div class="is-row"><span class="k">input</span><span class="v">{{ trace.usage.inputTokens }}</span></div>
                  <div class="is-row"><span class="k">output</span><span class="v">{{ trace.usage.outputTokens }}</span></div>
                  <div class="is-row">
                    <span class="k">cache_read</span>
                    <span class="v" style="color:var(--warn)">{{ trace.usage.cacheReadTokens ?? 0 }}</span>
                  </div>
                  <div class="is-row">
                    <span class="k">cache_write</span>
                    <span class="v dim">{{ trace.usage.cacheCreationTokens ?? 0 }}</span>
                  </div>
                  <div class="tokbar">
                    <div class="seg cache" :style="{ width: ((trace.usage.cacheReadTokens ?? 0) / Math.max(1, trace.usage.inputTokens + trace.usage.outputTokens + (trace.usage.cacheReadTokens ?? 0)) * 100) + '%' }" />
                    <div class="seg in" :style="{ width: (trace.usage.inputTokens / Math.max(1, trace.usage.inputTokens + trace.usage.outputTokens + (trace.usage.cacheReadTokens ?? 0)) * 100) + '%' }" />
                    <div class="seg out" :style="{ width: (trace.usage.outputTokens / Math.max(1, trace.usage.inputTokens + trace.usage.outputTokens + (trace.usage.cacheReadTokens ?? 0)) * 100) + '%' }" />
                  </div>
                  <div class="tokbar-legend">
                    <span class="item"><span class="sw cache" />cache {{ trace.usage.cacheReadTokens ?? 0 }}</span>
                    <span class="item"><span class="sw in" />in {{ trace.usage.inputTokens }}</span>
                    <span class="item"><span class="sw out" />out {{ trace.usage.outputTokens }}</span>
                  </div>
                </div>

                <div v-if="trace.metadata.costUsd != null" class="is-section">
                  <div class="is-label">Cost · USD</div>
                  <table class="cost-tbl">
                    <tbody>
                      <tr class="tot"><td>total</td><td>{{ fmtUsd(trace.metadata.costUsd) }}</td></tr>
                    </tbody>
                  </table>
                </div>

                <div v-if="trace.metadata.systemPrompt" class="is-section">
                  <div class="is-label">System prompt</div>
                  <div class="sys-preview">{{ trace.metadata.systemPrompt }}</div>
                </div>
              </template>

              <!-- ─ Timeline tab ─ -->
              <template v-else-if="inspectorTab === 'timeline'">
                <div class="is-section">
                  <div class="is-label">Waterfall · total {{ fmtMs(trace.metadata.durationMs) }}</div>
                  <div v-if="trace.metadata.durationMs" class="tl-axis">
                    <div />
                    <div class="ticks">
                      <span>0</span>
                      <span>{{ Math.round(trace.metadata.durationMs / 4) }}ms</span>
                      <span>{{ Math.round(trace.metadata.durationMs / 2) }}ms</span>
                      <span>{{ Math.round(trace.metadata.durationMs * 3 / 4) }}ms</span>
                      <span>{{ trace.metadata.durationMs }}ms</span>
                    </div>
                    <div />
                  </div>
                  <div class="tl">
                    <div v-for="(step, i) in timeline" :key="i" class="tl-row">
                      <span class="tl-label" :style="{ paddingLeft: (step.indent ?? 0) * 10 + 'px' }">
                        {{ step.indent ? '↳ ' : '' }}{{ step.label }}
                      </span>
                      <div class="tl-track">
                        <div
                          class="tl-bar"
                          :class="step.kind"
                          :style="{
                            left: (step.startMs / (trace.metadata.durationMs ?? 1) * 100) + '%',
                            width: Math.max(1, step.durMs / (trace.metadata.durationMs ?? 1) * 100) + '%',
                          }"
                        />
                      </div>
                      <span class="tl-dur">{{ fmtMs(step.durMs) }}</span>
                    </div>
                  </div>
                </div>

                <div class="is-section">
                  <div class="is-label">Breakdown</div>
                  <div class="is-row"><span class="k">total</span><span class="v">{{ fmtMs(trace.metadata.durationMs) }}</span></div>
                  <div class="is-row"><span class="k">messages</span><span class="v">{{ trace.messages.length }}</span></div>
                  <div class="is-row"><span class="k">tool calls</span><span class="v">{{ toolCallCount }}</span></div>
                </div>
              </template>

              <!-- ─ Raw JSON tab ─ -->
              <template v-else-if="inspectorTab === 'raw'">
                <div style="display:flex;flex-direction:column;gap:8px">
                  <div style="display:flex;gap:6px;align-items:center">
                    <button class="btn" style="height:24px;padding:0 8px;font-size:11px" @click="copyJson">
                      <AppIcon name="note" :size="11" />Copy
                    </button>
                    <button class="btn" style="height:24px;padding:0 8px;font-size:11px" @click="downloadJson">
                      <AppIcon name="export" :size="11" />Download
                    </button>
                    <span style="flex:1" />
                    <span style="font-family:var(--font-mono);font-size:10px;color:var(--text-3)">{{ rawLineCount }} lines</span>
                  </div>
                  <pre class="json-pre" v-html="rawJsonHtml" />
                </div>
              </template>

              <!-- ─ Notes tab ─ -->
              <template v-else-if="inspectorTab === 'notes'">
                <div class="is-section">
                  <div class="is-label">Annotations · 0</div>
                  <div class="note-composer">
                    <textarea placeholder="Add a note about this trace…" />
                    <div class="note-composer-foot">
                      <span class="hint">md supported · select text in thread to anchor</span>
                      <span class="grow" />
                      <button class="btn">Cancel</button>
                      <button class="btn primary">Post <span class="kbd">⌘↵</span></button>
                    </div>
                  </div>
                </div>
              </template>

            </div>
          </div>

        </div><!-- /detail-body -->
      </template>
    </div><!-- /main-col -->
  </div>
</template>

<style scoped>
/* ── Layout ── */
.app {
  display: grid;
  grid-template-columns: var(--sidebar-w) 1fr;
  height: 100vh;
  background: var(--bg-1);
  overflow: hidden;
  font-family: var(--font-sans);
  font-size: 13px;
  color: var(--text-0);
}

/* ── Sidebar (identical to index.vue) ── */
.sidebar {
  background: var(--bg-0);
  border-right: 1px solid var(--border-0);
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow-y: auto;
}
.sb-brand {
  display: flex; align-items: center; gap: 8px;
  padding: 14px 14px 12px;
  border-bottom: 1px solid var(--border-0);
  height: var(--topbar-h);
  flex-shrink: 0;
}
.sb-logo {
  width: 22px; height: 22px;
  display: grid; place-items: center;
  background: var(--accent-bg);
  border: 1px solid var(--accent-border);
  border-radius: var(--radius-sm);
  color: var(--accent);
  flex-shrink: 0;
}
.sb-name { font-weight: 600; font-size: 13px; letter-spacing: -0.01em; }
.sb-env {
  margin-left: auto;
  font-family: var(--font-mono); font-size: 10px;
  color: var(--text-2); background: var(--bg-2);
  padding: 2px 6px; border-radius: 3px; border: 1px solid var(--border-1);
}
.sb-section { padding: 10px 8px 4px; }
.sb-section-label {
  font-size: 10px; text-transform: uppercase;
  letter-spacing: 0.08em; color: var(--text-2);
  padding: 4px 8px; font-weight: 500;
}
.sb-item {
  display: flex; align-items: center; gap: 8px;
  padding: 6px 8px; border-radius: var(--radius-sm);
  color: var(--text-1); font-size: 13px;
  cursor: pointer; white-space: nowrap;
}
.sb-item > span:first-of-type { overflow: hidden; text-overflow: ellipsis; flex: 1; min-width: 0; }
.sb-item:hover { background: var(--bg-2); color: var(--text-0); }
.sb-item :deep(svg) { color: var(--text-2); flex-shrink: 0; }
.sb-item:hover :deep(svg) { color: var(--text-0); }
.sb-spacer { flex: 1; }
.sb-footer { padding: 8px; border-top: 1px solid var(--border-0); flex-shrink: 0; }
.sb-user {
  display: flex; align-items: center; gap: 8px;
  padding: 6px 8px; border-radius: var(--radius-sm); cursor: pointer;
}
.sb-user:hover { background: var(--bg-2); }
.sb-avatar {
  width: 22px; height: 22px; border-radius: 50%;
  background: var(--accent-bg); border: 1px solid var(--accent-border);
  color: var(--accent); display: grid; place-items: center;
  font-size: 11px; font-weight: 600; flex-shrink: 0;
}
.sb-user-name { font-size: 12px; }
.sb-user-org  { font-size: 10px; color: var(--text-2); }

/* ── Main column ── */
.main-col {
  display: flex;
  flex-direction: column;
  min-width: 0;
  height: 100vh;
  overflow: hidden;
}

/* ── Detail head ── */
.detail-head {
  padding: 18px 24px 14px;
  border-bottom: 1px solid var(--border-0);
  background: var(--bg-1);
  flex-shrink: 0;
}
.dh-crumb {
  display: flex; align-items: center; gap: 8px;
  font-size: 12px; color: var(--text-1); margin-bottom: 10px;
}
.dh-crumb a { color: var(--text-2); display: inline-flex; align-items: center; gap: 4px; }
.dh-crumb a:hover { color: var(--text-0); }
.dh-crumb .sep  { color: var(--text-3); }
.dh-crumb .here { color: var(--text-0); font-family: var(--font-mono); font-size: 12px; }
.back-chevron { transform: rotate(90deg); display: inline-block; }

.dh-top {
  display: flex; align-items: center;
  justify-content: space-between; gap: 16px; min-width: 0;
}
.dh-title-block { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.dh-title-row   { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.dh-title {
  font-size: 20px; font-weight: 600; letter-spacing: -0.02em;
  color: var(--text-0); font-family: var(--font-mono);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0;
}
.dh-id {
  font-family: var(--font-mono); font-size: 11px; color: var(--text-3);
  background: var(--bg-2); padding: 2px 6px;
  border-radius: 3px; border: 1px solid var(--border-1);
  cursor: copy;
}
.dh-id:hover { color: var(--text-1); border-color: var(--border-2); }
.dh-actions { display: flex; gap: 4px; align-items: center; flex-shrink: 0; }

/* ── Meta strip ── */
.meta-strip {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  margin-top: 14px;
  border: 1px solid var(--border-1);
  border-radius: var(--radius-md);
  background: var(--bg-2);
  overflow: hidden;
}
@media (max-width: 1280px) {
  .meta-strip { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  .meta-cell:nth-child(4) { border-right: 0; }
  .meta-cell:nth-child(n+5) { border-top: 1px solid var(--border-0); }
  .meta-cell:nth-child(7) { border-right: 0; }
}
.meta-cell {
  padding: 10px 12px;
  border-right: 1px solid var(--border-0);
  display: flex; flex-direction: column; gap: 3px; min-width: 0;
}
.meta-cell:last-child { border-right: 0; }
.meta-cell .ml {
  font-size: 10px; text-transform: uppercase;
  letter-spacing: 0.06em; color: var(--text-2); font-weight: 500;
}
.meta-cell .mv {
  font-family: var(--font-mono); font-size: 14px;
  color: var(--text-0); font-feature-settings: "tnum";
  display: flex; align-items: center; gap: 3px;
}
.meta-cell .mv.warn { color: var(--warn); }
.meta-cell .mv.slow { color: var(--danger); }
.meta-cell .mv.ok   { color: var(--success); }
.meta-cell .ms { font-size: 10px; color: var(--text-3); font-family: var(--font-mono); }

/* ── Detail body ── */
.detail-body {
  flex: 1;
  display: grid;
  grid-template-columns: 1fr 300px;
  min-height: 0;
  overflow: hidden;
}

/* ── Thread column ── */
.thread-col {
  overflow-y: auto;
  border-right: 1px solid var(--border-0);
}
.thread-col::-webkit-scrollbar { width: 6px; }
.thread-col::-webkit-scrollbar-thumb { background: var(--border-1); border-radius: 3px; }

.thread {
  padding: 20px 24px 60px;
  display: flex; flex-direction: column;
}
.thread-divider {
  display: flex; align-items: center; gap: 8px;
  padding: 18px 0 8px;
  font-size: 10px; text-transform: uppercase;
  letter-spacing: 0.08em; color: var(--text-3); font-weight: 500;
}
.thread-divider::before, .thread-divider::after {
  content: ""; flex: 1; height: 1px; background: var(--border-0);
}

/* ── Message row ── */
.msg {
  display: grid;
  grid-template-columns: 28px 1fr 80px;
  gap: 12px;
  padding: 14px 0;
  border-top: 1px solid var(--border-0);
}
.msg-avatar {
  width: 26px; height: 26px; border-radius: 50%;
  display: grid; place-items: center;
  font-size: 11px; font-weight: 600;
  font-family: var(--font-mono);
  margin-top: 2px; flex-shrink: 0;
}
.msg-avatar.user      { background: var(--accent-bg); border: 1px solid var(--accent-border); color: var(--accent); }
.msg-avatar.assistant { background: var(--provider-anthropic-bg); border: 1px solid color-mix(in oklab, var(--provider-anthropic) 40%, transparent); color: var(--provider-anthropic); }
.msg-avatar.system    { background: oklch(0.65 0.15 295 / 0.14); border: 1px solid oklch(0.65 0.15 295 / 0.40); color: oklch(0.72 0.16 295); }
.msg-avatar.tool      { background: oklch(0.74 0.13 75 / 0.14); border: 1px solid oklch(0.74 0.13 75 / 0.40); color: var(--warn); }

.msg-body { min-width: 0; }
.msg-head {
  display: flex; align-items: center; gap: 8px; margin-bottom: 6px;
}
.msg-role     { font-size: 11px; font-weight: 500; color: var(--text-0); }
.msg-role-sub { font-family: var(--font-mono); font-size: 10px; color: var(--text-3); }
.msg-stats {
  margin-left: auto; display: flex; gap: 8px;
  font-family: var(--font-mono); font-size: 10px; color: var(--text-2);
  font-feature-settings: "tnum";
}
.msg-stats .stat { display: inline-flex; align-items: center; gap: 3px; }
.msg-stats .stat :deep(svg) { color: var(--text-3); }

.msg-meta-col {
  text-align: right; font-family: var(--font-mono);
  font-size: 10px; color: var(--text-3);
  display: flex; flex-direction: column; gap: 2px;
  margin-top: 4px;
}
.msg-meta-col .t { color: var(--text-2); }
.msg-meta-col .d { color: var(--text-3); }

.msg-text-blocks { display: flex; flex-direction: column; gap: 8px; }
.msg-text {
  background: var(--bg-2);
  border: 1px solid var(--border-1);
  border-radius: var(--radius-md);
  padding: 10px 12px;
  font-size: 13px; color: var(--text-0);
  line-height: 1.5; white-space: pre-wrap; word-wrap: break-word;
}
.msg-text.user   { background: var(--accent-bg); border-color: var(--accent-border); }
.msg-text.system { background: oklch(0.65 0.15 295 / 0.08); border-color: oklch(0.65 0.15 295 / 0.30); font-family: var(--font-mono); font-size: 12px; font-style: italic; color: var(--text-1); }
.msg-text :deep(strong) { font-weight: 600; color: var(--text-0); }

/* ── Inspector panel ── */
.inspector {
  background: var(--bg-1);
  display: flex; flex-direction: column;
  min-height: 0; overflow: hidden;
}
.insp-tabs {
  display: flex;
  border-bottom: 1px solid var(--border-0);
  padding: 0 8px;
  flex-shrink: 0;
}
.insp-tab {
  padding: 10px 12px; font-size: 12px;
  color: var(--text-2); position: relative;
  display: inline-flex; align-items: center; gap: 5px;
  cursor: pointer;
}
.insp-tab:hover { color: var(--text-1); }
.insp-tab.active { color: var(--text-0); }
.insp-tab.active::after {
  content: ""; position: absolute;
  left: 8px; right: 8px; bottom: -1px;
  height: 2px; background: var(--accent);
  border-radius: 2px 2px 0 0;
}
.insp-tab .count {
  font-family: var(--font-mono); font-size: 10px;
  background: var(--bg-3); border: 1px solid var(--border-1);
  padding: 0 4px; border-radius: 3px; color: var(--text-2);
}
.insp-body {
  flex: 1; overflow-y: auto; padding: 14px;
}
.insp-body::-webkit-scrollbar { width: 6px; }
.insp-body::-webkit-scrollbar-thumb { background: var(--border-1); border-radius: 3px; }

/* ── Inspector sections ── */
.is-section { margin-bottom: 18px; }
.is-label {
  font-size: 10px; text-transform: uppercase;
  letter-spacing: 0.08em; color: var(--text-2);
  font-weight: 500; margin-bottom: 8px;
  padding-bottom: 6px; border-bottom: 1px solid var(--border-0);
}
.is-row {
  display: grid; grid-template-columns: 110px 1fr;
  gap: 8px; font-size: 12px; padding: 4px 0; align-items: center;
}
.is-row .k { color: var(--text-2); font-family: var(--font-mono); font-size: 11px; }
.is-row .v { color: var(--text-0); font-family: var(--font-mono); font-size: 11px; word-break: break-word; font-feature-settings: "tnum"; }
.is-row .v.dim  { color: var(--text-2); }
.is-row .v.copyable { cursor: copy; }
.is-row .v.copyable:hover { color: var(--accent); }

/* ── Token bar ── */
.tokbar {
  display: flex; height: 6px;
  background: var(--bg-3); border-radius: 3px;
  overflow: hidden; margin-top: 6px;
}
.tokbar .seg       { height: 100%; }
.tokbar .seg.in    { background: var(--accent); }
.tokbar .seg.out   { background: var(--success); }
.tokbar .seg.cache { background: var(--warn); }
.tokbar-legend {
  display: flex; gap: 12px; margin-top: 6px;
  font-family: var(--font-mono); font-size: 10px; color: var(--text-2);
}
.tokbar-legend .item { display: inline-flex; align-items: center; gap: 4px; }
.tokbar-legend .sw { width: 8px; height: 8px; border-radius: 2px; }
.tokbar-legend .sw.in    { background: var(--accent); }
.tokbar-legend .sw.out   { background: var(--success); }
.tokbar-legend .sw.cache { background: var(--warn); }

/* ── Cost table ── */
.cost-tbl { width: 100%; font-size: 11px; border-collapse: collapse; }
.cost-tbl td { padding: 4px 0; font-family: var(--font-mono); color: var(--text-1); font-feature-settings: "tnum"; }
.cost-tbl td:last-child { text-align: right; color: var(--text-0); }
.cost-tbl tr.tot td { border-top: 1px solid var(--border-1); padding-top: 6px; font-weight: 500; }
.cost-tbl tr.tot td:last-child { color: var(--success); }

/* ── System prompt preview ── */
.sys-preview {
  font-size: 11px; color: var(--text-2); font-family: var(--font-mono);
  padding: 6px 8px; background: var(--bg-2);
  border: 1px solid var(--border-1); border-radius: 4px;
  white-space: pre-wrap; word-break: break-word;
  line-height: 1.5; max-height: 120px; overflow: auto;
}

/* ── Timeline ── */
.tl { display: flex; flex-direction: column; gap: 6px; }
.tl-row {
  display: grid; grid-template-columns: 96px 1fr 50px;
  gap: 8px; align-items: center; height: 22px;
}
.tl-label {
  font-family: var(--font-mono); font-size: 10px;
  color: var(--text-1); white-space: nowrap;
  overflow: hidden; text-overflow: ellipsis;
}
.tl-track {
  position: relative; height: 100%;
  background: var(--bg-2); border-radius: 3px; overflow: hidden;
}
.tl-bar {
  position: absolute; top: 0; bottom: 0; border-radius: 2px;
}
.tl-bar.user      { background: var(--accent); }
.tl-bar.assistant { background: var(--provider-anthropic); }
.tl-bar.tool      { background: var(--warn); }
.tl-bar.cache     { background: oklch(0.74 0.13 75 / 0.50); border: 1px dashed oklch(0.74 0.13 75); }
.tl-dur { text-align: right; font-family: var(--font-mono); font-size: 10px; color: var(--text-2); font-feature-settings: "tnum"; }
.tl-axis {
  display: grid; grid-template-columns: 96px 1fr 50px;
  gap: 8px; margin-bottom: 6px;
  font-size: 9px; color: var(--text-3); font-family: var(--font-mono);
}
.tl-axis .ticks { display: flex; justify-content: space-between; }

/* ── Raw JSON ── */
.json-pre {
  font-family: var(--font-mono); font-size: 11px; line-height: 1.55;
  background: var(--bg-2); border: 1px solid var(--border-1);
  border-radius: var(--radius-md); padding: 12px;
  overflow: auto; color: var(--text-1);
  white-space: pre; max-height: 600px;
  margin: 0;
}
.json-pre::-webkit-scrollbar { width: 6px; height: 6px; }
.json-pre::-webkit-scrollbar-thumb { background: var(--border-1); border-radius: 3px; }
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

/* ── Notes ── */
.note-composer {
  border: 1px solid var(--border-1); border-radius: var(--radius-md);
  padding: 10px; background: var(--bg-2);
}
.note-composer textarea {
  width: 100%; min-height: 60px; resize: vertical;
  font-family: var(--font-sans); font-size: 12px;
  color: var(--text-0); background: transparent;
  border: 0; outline: 0; padding: 0;
}
.note-composer-foot { display: flex; align-items: center; gap: 6px; margin-top: 8px; }
.note-composer-foot .hint { font-size: 10px; color: var(--text-3); font-family: var(--font-mono); }
.note-composer-foot .grow { flex: 1; }

/* ── Buttons ── */
.btn {
  display: inline-flex; align-items: center; gap: 6px;
  height: 28px; padding: 0 10px;
  border: 1px solid var(--border-1); border-radius: 5px;
  background: var(--bg-2); color: var(--text-1);
  font-size: 12px; cursor: pointer;
}
.btn:hover { color: var(--text-0); border-color: var(--border-2); background: var(--bg-3); }
.btn.primary { color: var(--accent); border-color: var(--accent-border); background: var(--accent-bg); }
.btn.primary:hover { filter: brightness(1.15); }
.btn .kbd { font-family: var(--font-mono); font-size: 10px; color: var(--text-3); margin-left: 2px; }

/* ── Provider badge ── */
.prov {
  display: inline-flex; align-items: center; gap: 4px;
  font-family: var(--font-mono); font-size: 10px;
  padding: 2px 6px; border-radius: 3px;
  text-transform: lowercase; letter-spacing: 0.02em;
  font-weight: 500; white-space: nowrap;
}
.prov::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: currentColor; opacity: 0.9; }
.prov-anthropic { color: var(--provider-anthropic); background: var(--provider-anthropic-bg); }
.prov-openai    { color: var(--provider-openai);    background: var(--provider-openai-bg); }
.prov-vercel-ai { color: var(--provider-vercel);    background: var(--provider-vercel-bg); }

/* ── Model name ── */
.model { font-family: var(--font-mono); color: var(--text-0); }

/* ── Dots ── */
.dot { width: 6px; height: 6px; border-radius: 50%; display: inline-block; flex-shrink: 0; }
.dot.ok   { background: var(--success); }
.dot.warn { background: var(--warn); }
.dot.err  { background: var(--danger); }

/* ── Skeleton ── */
.sk {
  background: linear-gradient(90deg, var(--bg-2) 0%, var(--bg-3) 50%, var(--bg-2) 100%);
  background-size: 200% 100%;
  animation: shimmer 1.4s linear infinite;
  border-radius: 4px;
}
@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
.sk.line { height: 10px; }
.sk.box  { border-radius: 6px; }
</style>
