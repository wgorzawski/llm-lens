<script setup lang="ts">
import type { UnifiedTrace, TraceProvider } from "@llm-lens/types";

definePageMeta({ layout: false });
useHead({ htmlAttrs: { "data-theme": "dark" } });

// ── helpers ───────────────────────────────────────────────────────────────────

function getSnippet(t: UnifiedTrace): string {
  const first = t.messages.find(m => m.role === "user");
  if (!first) return "";
  if (typeof first.content === "string") return first.content.slice(0, 140);
  const block = (first.content as Array<{ type: string; text?: string }>).find(b => b.type === "text");
  return block?.text?.slice(0, 140) ?? "";
}

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

// ── ui state ─────────────────────────────────────────────────────────────────

const section = ref("traces");
const variant = useCookie<"list" | "table" | "cards">("llm-lens:traces-variant", {
  default: () => "list",
  sameSite: "lax",
});
const filterProvider = ref<TraceProvider | "all">("all");
const filterModel = ref("all");
const filterStatus = ref("all");
const filterLatency = ref("any");
const filterRange = ref("24h");
const sort = ref("recent");
const selected = ref<Set<string>>(new Set());
const showTip = ref(true);
const theme = ref<"dark" | "light">("dark");

watch(theme, v => { document.documentElement.setAttribute("data-theme", v); });

const escHandler = (e: KeyboardEvent) => { if (e.key === "Escape") selected.value = new Set(); };
onMounted(() => window.addEventListener("keydown", escHandler));
onUnmounted(() => window.removeEventListener("keydown", escHandler));

// ── data ─────────────────────────────────────────────────────────────────────

const { page, pending, error, fetchTraces } = useTraces({
  get provider() { return filterProvider.value === "all" ? undefined : filterProvider.value; },
  get sort() { return sort.value; },
});

await fetchTraces();
watch(filterProvider, () => fetchTraces(0));
watch(sort, () => fetchTraces(0));

// ── computed ──────────────────────────────────────────────────────────────────

const traces = computed(() => page.value.traces);

const stats = computed(() => {
  const ts = traces.value;
  const valid = ts.filter(t => t.metadata.durationMs);
  return {
    count: ts.length,
    totalCost: ts.reduce((s, t) => s + (t.metadata.costUsd ?? 0), 0),
    avgLat: valid.length
      ? Math.round(valid.reduce((s, t) => s + (t.metadata.durationMs ?? 0), 0) / valid.length)
      : 0,
    tokensIn: ts.reduce((s, t) => s + t.usage.inputTokens, 0),
    tokensOut: ts.reduce((s, t) => s + t.usage.outputTokens, 0),
  };
});

const totalPages = computed(() => Math.max(1, Math.ceil(page.value.total / page.value.limit)));
const currentPage = computed(() => Math.floor(page.value.offset / page.value.limit) + 1);

const pageNumbers = computed<Array<number | null>>(() => {
  const total = totalPages.value;
  const cur = currentPage.value;
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: Array<number | null> = [1];
  if (cur > 3) pages.push(null);
  for (let i = Math.max(2, cur - 1); i <= Math.min(total - 1, cur + 1); i++) pages.push(i);
  if (cur < total - 2) pages.push(null);
  pages.push(total);
  return pages;
});

// ── actions ───────────────────────────────────────────────────────────────────

function goToPage(p: number) { fetchTraces((p - 1) * page.value.limit); }

function toggleSelect(id: string) {
  const s = new Set(selected.value);
  s.has(id) ? s.delete(id) : s.add(id);
  selected.value = s;
}

function handleRowClick(id: string, isCheckbox = false) {
  if (isCheckbox) { toggleSelect(id); return; }
  navigateTo(`/traces/${id}`);
}

// sidebar nav
const sidebarItems1 = [
  { id: "traces",    label: "Traces",        icon: "activity",  kbd: "T" },
  { id: "dashboard", label: "Dashboard",     icon: "dashboard", kbd: "D" },
  { id: "compare",   label: "Compare & diff", icon: "diff",     kbd: "C" },
  { id: "replays",   label: "Replays",       icon: "replay" },
];
const sidebarItems2 = [
  { id: "keys",       label: "API keys",        icon: "key" },
  { id: "instrument", label: "Instrumentation", icon: "tool" },
  { id: "docs",       label: "Docs",            icon: "docs" },
  { id: "settings",   label: "Settings",        icon: "settings" },
];

const providerOptions = [
  { id: "all",       label: "All providers" },
  { id: "anthropic", label: "Anthropic",  swatch: "anthropic" },
  { id: "openai",    label: "OpenAI",     swatch: "openai" },
  { id: "vercel-ai", label: "Vercel AI",  swatch: "vercel-ai" },
];
const modelOptions = [
  { id: "all",                   label: "All models" },
  { id: "claude-opus-4-7",       label: "claude-opus-4-7",       hint: "anthropic" },
  { id: "claude-sonnet-4-6",     label: "claude-sonnet-4-6",     hint: "anthropic" },
  { id: "claude-haiku-4-5",      label: "claude-haiku-4-5",      hint: "anthropic" },
  { id: "gpt-4o-2024-08-06",     label: "gpt-4o-2024-08-06",     hint: "openai" },
  { id: "gpt-4o-mini",           label: "gpt-4o-mini",           hint: "openai · vercel" },
];
const statusOptions = [
  { id: "all",  label: "All statuses" },
  { id: "ok",   label: "OK",      dot: "ok"   as const },
  { id: "warn", label: "Warning", dot: "warn" as const },
  { id: "err",  label: "Error",   dot: "err"  as const },
];
const latencyOptions = [
  { id: "any",      label: "Any" },
  { id: "fast",     label: "Fast",      hint: "< 500ms" },
  { id: "med",      label: "Medium",    hint: "0.5–1.5s" },
  { id: "slow",     label: "Slow",      hint: "> 1.5s" },
  { id: "verySlow", label: "Very slow", hint: "> 5s" },
];
const rangeOptions = [
  { id: "15m",    label: "Last 15m" },
  { id: "1h",     label: "Last 1h" },
  { id: "24h",    label: "Last 24h" },
  { id: "7d",     label: "Last 7 days" },
  { id: "30d",    label: "Last 30 days" },
  { id: "_div",   label: "",  divider: true },
  { id: "custom", label: "Custom range…" },
];
const sortOptions = [
  { id: "recent",  label: "Most recent" },
  { id: "latency", label: "Latency (desc)" },
  { id: "cost",    label: "Cost (desc)" },
  { id: "tokens",  label: "Tokens (desc)" },
];

// skeleton rows
const SKEL_LIST = Array.from({ length: 12 });
const SKEL_TABLE = Array.from({ length: 14 });
const SKEL_CARDS = Array.from({ length: 9 });
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
        <div
          v-for="it in sidebarItems1" :key="it.id"
          class="sb-item" :class="{ active: section === it.id }"
          @click="section = it.id"
        >
          <AppIcon :name="it.icon" :size="14" />
          <span>{{ it.label }}</span>
          <span v-if="it.id === 'traces'" class="sb-item-badge">{{ fmtN(page.total) }}</span>
          <span v-else-if="it.kbd" class="sb-item-kbd">{{ it.kbd }}</span>
        </div>
      </div>

      <div class="sb-section">
        <div class="sb-section-label">Configure</div>
        <div
          v-for="it in sidebarItems2" :key="it.id"
          class="sb-item" :class="{ active: section === it.id }"
          @click="it.id === 'settings' ? navigateTo('/settings') : (section = it.id)"
        >
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

      <!-- topbar -->
      <div class="topbar">
        <div class="crumbs">
          <span>{{ userName }}</span>
          <span class="sep">/</span>
          <span>llm-lens</span>
          <span class="sep">/</span>
          <span class="here">Traces</span>
        </div>
        <div class="search">
          <AppIcon name="search" :size="12" />
          <input placeholder="Search traces, models, prompts…" />
          <span class="kbd">⌘K</span>
        </div>
        <div class="tb-actions">
          <button class="icon-btn" title="Refresh" :disabled="pending" @click="fetchTraces(page.offset)">
            <AppIcon name="refresh" :size="14" />
          </button>
          <div class="vsep" />
          <button class="icon-btn" title="Toggle theme" @click="theme = theme === 'dark' ? 'light' : 'dark'">
            <AppIcon :name="theme === 'dark' ? 'sun' : 'moon'" :size="14" />
          </button>
          <button class="icon-btn" title="Settings" @click="navigateTo('/settings')">
            <AppIcon name="settings" :size="14" />
          </button>
        </div>
      </div>

      <!-- subbar -->
      <div class="subbar">
        <FilterChip
          icon="filter"
          :value="filterProvider"
          default-value="all"
          :options="providerOptions"
          :width="170"
          @change="filterProvider = $event as TraceProvider | 'all'"
        />
        <FilterChip
          label="Model"
          :value="filterModel"
          default-value="all"
          :options="modelOptions"
          :width="230"
          @change="filterModel = $event"
        />
        <FilterChip
          label="Status"
          :value="filterStatus"
          default-value="all"
          :options="statusOptions"
          :width="170"
          @change="filterStatus = $event"
        />
        <FilterChip
          label="Latency"
          :value="filterLatency"
          default-value="any"
          :options="latencyOptions"
          :width="200"
          @change="filterLatency = $event"
        />
        <FilterChip
          label="Range"
          :value="filterRange"
          default-value="24h"
          :options="rangeOptions"
          :width="180"
          @change="filterRange = $event"
        />
        <button class="chip-plain" style="color:var(--text-2)">
          <AppIcon name="plus" :size="11" /> filter
        </button>

        <div style="flex:1" />

        <FilterChip
          icon="sort"
          label="Sort"
          :value="sort"
          default-value="recent"
          :options="sortOptions"
          align="right"
          :width="180"
          @change="sort = $event"
        />
        <div class="segmented" role="tablist" aria-label="View">
          <button :class="{ active: variant === 'list' }" @click="variant = 'list'">
            <AppIcon name="list" :size="12" /> List
          </button>
          <button :class="{ active: variant === 'table' }" @click="variant = 'table'">
            <AppIcon name="table" :size="12" /> Table
          </button>
          <button :class="{ active: variant === 'cards' }" @click="variant = 'cards'">
            <AppIcon name="grid" :size="12" /> Cards
          </button>
        </div>
      </div>

      <!-- content -->
      <div class="content">

        <!-- content header -->
        <div class="content-header">
          <div class="content-title-row">
            <div class="content-title">Traces</div>
            <div class="content-sub">
              <template v-if="pending">Loading traces…</template>
              <template v-else>{{ stats.count }} traces · auto-refresh</template>
            </div>
          </div>
          <div class="content-stats">
            <div class="stat-box">
              <div class="label">Cost · 24h</div>
              <div class="val">{{ pending ? "—" : fmtUsd(stats.totalCost) }}</div>
            </div>
            <div class="stat-box">
              <div class="label">Avg latency</div>
              <div class="val">{{ pending ? "—" : fmtMs(stats.avgLat) }}</div>
            </div>
            <div class="stat-box">
              <div class="label">Tokens · in / out</div>
              <div class="val">
                {{ pending ? "—" : fmtN(stats.tokensIn) }}
                <span class="unit">/</span>
                {{ pending ? "—" : fmtN(stats.tokensOut) }}
              </div>
            </div>
          </div>
        </div>

        <!-- tip strip -->
        <div v-if="showTip && !pending" class="tip-strip">
          <span class="dot" style="background:var(--accent)" />
          <span class="label">tip</span>
          <span>Click a row to open trace detail. Use checkboxes to select traces for bulk actions.</span>
          <span class="x" @click="showTip = false"><AppIcon name="x" :size="11" /></span>
        </div>

        <!-- error -->
        <div v-if="error" class="error-strip">{{ error }}</div>

        <!-- ── LIST VIEW ── -->
        <template v-if="variant === 'list'">
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
              <div v-for="(_, i) in SKEL_LIST" :key="i" class="list-row">
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
                @click="handleRowClick(t.id)"
              >
                <div
                  class="cbox" :class="{ on: selected.has(t.id) }"
                  @click.stop="toggleSelect(t.id)"
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
                  <span
                    class="dot"
                    :class="latClass(t.metadata.durationMs) || 'ok'"
                    style="margin-right:4px"
                  />
                  {{ fmtMs(t.metadata.durationMs) }}
                </div>
                <div class="col-msg" style="color:var(--success)">{{ fmtUsd(t.metadata.costUsd) }}</div>
                <div class="col-msg" style="color:var(--text-2)">{{ t.messages.length }}</div>
                <div class="col-date">{{ getRelative(t.timestamp) }}</div>
                <div class="col-actions">
                  <button class="action-btn" title="More" @click.stop><AppIcon name="more" :size="12" /></button>
                </div>
              </div>
            </template>
          </div>
        </template>

        <!-- ── TABLE VIEW ── -->
        <template v-else-if="variant === 'table'">
          <div class="table-wrap">
            <table class="tbl">
              <thead>
                <tr>
                  <th style="width:28px"><div class="cbox" style="opacity:.6" /></th>
                  <th style="width:90px">ID</th>
                  <th style="width:82px">Provider</th>
                  <th>Trace · model</th>
                  <th>Last prompt</th>
                  <th class="num" style="width:52px">In</th>
                  <th class="num" style="width:52px">Out</th>
                  <th class="num" style="width:58px">$</th>
                  <th style="width:110px">Latency</th>
                  <th class="num" style="width:42px">Msg</th>
                  <th style="width:52px">Status</th>
                  <th style="width:80px;text-align:right">Time</th>
                </tr>
              </thead>
              <tbody>
                <!-- skeleton -->
                <template v-if="pending">
                  <tr v-for="(_, i) in SKEL_TABLE" :key="i">
                    <td><div class="sk box" style="width:14px;height:14px" /></td>
                    <td><div class="sk line sm" style="width:60px" /></td>
                    <td><div class="sk pill" style="width:50px" /></td>
                    <td>
                      <div class="sk line" style="width:55%;margin-bottom:4px" />
                      <div class="sk line sm" style="width:35%" />
                    </td>
                    <td><div class="sk line" style="width:60%" /></td>
                    <td><div class="sk line sm" style="width:26px;margin-left:auto" /></td>
                    <td><div class="sk line sm" style="width:22px;margin-left:auto" /></td>
                    <td><div class="sk line sm" style="width:34px;margin-left:auto" /></td>
                    <td><div class="sk line" style="width:55%" /></td>
                    <td><div class="sk line sm" style="width:18px;margin-left:auto" /></td>
                    <td><div class="sk pill" style="width:38px" /></td>
                    <td><div class="sk line sm" style="width:42px;margin-left:auto" /></td>
                  </tr>
                </template>

                <!-- actual rows -->
                <template v-else>
                  <tr
                    v-for="t in traces" :key="t.id"
                    :class="{ selected: selected.has(t.id) }"
                    @click="handleRowClick(t.id)"
                  >
                    <td>
                      <div
                        class="cbox" :class="{ on: selected.has(t.id) }"
                        @click.stop="toggleSelect(t.id)"
                      />
                    </td>
                    <td class="col-id">{{ t.id.slice(-8) }}</td>
                    <td>
                      <span :class="`prov prov-${t.metadata.provider}`" style="padding:1px 5px;font-size:9px">
                        {{ t.metadata.provider }}
                      </span>
                    </td>
                    <td class="col-name">
                      <div style="display:flex;flex-direction:column;line-height:1.3">
                        <span style="color:var(--text-0)">{{ traceName(t) }}</span>
                        <span class="mono" style="color:var(--text-2);font-size:10px">{{ t.metadata.model }}</span>
                      </div>
                    </td>
                    <td class="col-snippet">
                      <span v-if="toolCallCount(t) > 0" class="marker tool" style="margin-right:4px">
                        <AppIcon name="tool" :size="9" />{{ toolCallCount(t) }}
                      </span>
                      {{ getSnippet(t) }}
                    </td>
                    <td class="num" style="color:var(--text-1)">{{ fmtN(t.usage.inputTokens) }}</td>
                    <td class="num" style="color:var(--text-1)">{{ fmtN(t.usage.outputTokens) }}</td>
                    <td class="num" style="color:var(--success)">{{ fmtUsd(t.metadata.costUsd) }}</td>
                    <td>
                      <span
                        class="latbar"
                        :class="latClass(t.metadata.durationMs)"
                        :style="{ width: Math.max(4, Math.min(60, (t.metadata.durationMs ?? 0) / 250)) + 'px' }"
                      />
                      <span
                        class="mono"
                        :style="{
                          color: latClass(t.metadata.durationMs) === 'slow' ? 'var(--danger)' :
                                 latClass(t.metadata.durationMs) === 'warn' ? 'var(--warn)' : 'var(--text-1)',
                          fontSize: '11px'
                        }"
                      >{{ fmtMs(t.metadata.durationMs) }}</span>
                    </td>
                    <td class="num" style="color:var(--text-2)">{{ t.messages.length }}</td>
                    <td>
                      <span
                        class="dot"
                        :class="latClass(t.metadata.durationMs) || 'ok'"
                        style="margin-right:5px"
                      />
                      <span class="mono" style="font-size:10px;color:var(--text-2)">
                        {{ latClass(t.metadata.durationMs) === 'slow' ? 'SLOW' : 'OK' }}
                      </span>
                    </td>
                    <td class="num" style="color:var(--text-2);font-size:11px;text-align:right">
                      {{ getRelative(t.timestamp) }}
                    </td>
                  </tr>
                </template>
              </tbody>
            </table>
          </div>
        </template>

        <!-- ── CARDS VIEW ── -->
        <template v-else-if="variant === 'cards'">
          <div class="cards-wrap">
            <!-- skeleton -->
            <template v-if="pending">
              <div v-for="(_, i) in SKEL_CARDS" :key="i" class="card" style="cursor:default">
                <div class="card-head">
                  <div class="left" style="gap:6px;flex:1">
                    <div style="display:flex;gap:8px">
                      <div class="sk pill" style="width:60px" />
                      <div class="sk line" style="width:100px" />
                    </div>
                    <div class="sk line lg" style="width:55%" />
                    <div class="sk line sm" style="width:140px" />
                  </div>
                  <div style="display:flex;gap:4px">
                    <div class="sk box" style="width:22px;height:22px" />
                    <div class="sk box" style="width:22px;height:22px" />
                  </div>
                </div>
                <div class="sk box" style="height:50px" />
                <div style="display:flex;gap:6px">
                  <div class="sk pill" style="width:50px" />
                  <div class="sk pill" style="width:70px" />
                  <div class="sk pill" style="width:40px" />
                </div>
                <div class="card-meta">
                  <div v-for="k in 4" :key="k" class="m" style="gap:4px">
                    <div class="sk line sm" style="width:30px" />
                    <div class="sk line lg" style="width:44px" />
                  </div>
                </div>
              </div>
            </template>

            <!-- actual cards -->
            <template v-else>
              <div
                v-for="t in traces" :key="t.id"
                class="card"
                :style="selected.has(t.id) ? 'border-color:var(--accent-border);background:var(--accent-bg)' : ''"
                @click="handleRowClick(t.id)"
              >
                <div class="card-head">
                  <div class="left">
                    <div class="card-row">
                      <span :class="`prov prov-${t.metadata.provider}`">{{ t.metadata.provider }}</span>
                      <span class="model">{{ t.metadata.model }}</span>
                    </div>
                    <div class="card-row">
                      <span class="card-title">{{ traceName(t) }}</span>
                    </div>
                    <div class="card-row" style="gap:6px">
                      <span class="mono" style="font-size:10px;color:var(--text-3)">{{ t.id.slice(-8) }}</span>
                      <span style="color:var(--text-3)">·</span>
                      <span class="card-date">{{ formatDate(t.timestamp) }}</span>
                    </div>
                  </div>
                  <div style="display:flex;gap:2px">
                    <button class="action-btn" title="Select" @click.stop="toggleSelect(t.id)">
                      <div class="cbox" :class="{ on: selected.has(t.id) }" style="pointer-events:none" />
                    </button>
                    <button class="action-btn" title="More" @click.stop>
                      <AppIcon name="more" :size="12" />
                    </button>
                  </div>
                </div>

                <div class="card-snippet">
                  <span class="role">user</span>{{ getSnippet(t) || "—" }}
                </div>

                <div style="display:flex;align-items:center;gap:8px">
                  <div class="card-tags" style="flex:1">
                    <span v-if="hasSystem(t)" class="tag sys">system</span>
                    <span v-if="toolCallCount(t) > 0" class="tag tool">
                      <AppIcon name="tool" :size="9" />{{ toolCallCount(t) }} tool {{ toolCallCount(t) === 1 ? 'call' : 'calls' }}
                    </span>
                    <span
                      v-if="t.metadata.stopReason && t.metadata.stopReason !== 'end_turn'"
                      class="tag flag"
                    >{{ t.metadata.stopReason }}</span>
                  </div>
                </div>

                <div class="card-meta">
                  <div class="m">
                    <div class="l">↑ in</div>
                    <div class="v">{{ fmtN(t.usage.inputTokens) }}</div>
                  </div>
                  <div class="m">
                    <div class="l">↓ out</div>
                    <div class="v">{{ fmtN(t.usage.outputTokens) }}</div>
                  </div>
                  <div class="m">
                    <div class="l">latency</div>
                    <div class="v" :class="latClass(t.metadata.durationMs)">{{ fmtMs(t.metadata.durationMs) }}</div>
                  </div>
                  <div class="m">
                    <div class="l">cost</div>
                    <div class="v" style="color:var(--success)">{{ fmtUsd(t.metadata.costUsd) }}</div>
                  </div>
                </div>
              </div>
            </template>
          </div>
        </template>

        <!-- empty state -->
        <div v-if="!pending && traces.length === 0 && !error" class="empty-state">
          <div class="empty-icon"><AppIcon name="activity" :size="28" /></div>
          <div class="empty-title">No traces yet</div>
          <div class="empty-sub">
            POST a trace to <code>/api/traces/anthropic</code> to get started.
          </div>
        </div>

        <!-- pager -->
        <div v-if="!pending && totalPages > 1" class="pager">
          <div style="color:var(--text-2);font-size:12px">
            Showing <span class="mono" style="color:var(--text-0)">{{ (currentPage - 1) * page.limit + 1 }}–{{ Math.min(currentPage * page.limit, page.total) }}</span>
            of <span class="mono" style="color:var(--text-0)">{{ page.total.toLocaleString() }}</span>
          </div>
          <div class="controls">
            <button class="pager-btn" :class="{ disabled: currentPage === 1 }" :disabled="currentPage === 1" @click="goToPage(currentPage - 1)">‹</button>
            <template v-for="(p, i) in pageNumbers" :key="i">
              <button
                v-if="p !== null"
                class="pager-btn"
                :class="{ active: p === currentPage }"
                @click="goToPage(p)"
              >{{ p }}</button>
              <button v-else class="pager-btn" style="color:var(--text-3);cursor:default">…</button>
            </template>
            <button class="pager-btn" :class="{ disabled: currentPage === totalPages }" :disabled="currentPage === totalPages" @click="goToPage(currentPage + 1)">›</button>
          </div>
        </div>

      </div><!-- /content -->
    </div><!-- /main-col -->

    <!-- ══════════════════════ BULK BAR ══════════════════════ -->
    <div v-if="selected.size > 0" class="bulkbar">
      <span class="count">{{ selected.size }}</span>
      <span style="color:var(--text-1)">selected</span>
      <span class="sep" />
      <button class="primary" :disabled="selected.size !== 2">
        <AppIcon name="diff" :size="12" /> Compare diff
        <span v-if="selected.size !== 2" style="color:var(--text-3);margin-left:4px;font-size:10px">(need 2)</span>
      </button>
      <button><AppIcon name="replay" :size="12" /> Replay</button>
      <button><AppIcon name="note" :size="12" /> Annotate</button>
      <button><AppIcon name="export" :size="12" /> Export</button>
      <span class="sep" />
      <button><AppIcon name="trash" :size="12" /></button>
      <span class="sep" />
      <button @click="selected = new Set()">
        Clear <span class="kbd">esc</span>
      </button>
    </div>

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

/* ── Sidebar ── */
.sidebar {
  background: var(--bg-0);
  border-right: 1px solid var(--border-0);
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow-y: auto;
}
.sb-brand {
  display: flex;
  align-items: center;
  gap: 8px;
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
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-2);
  background: var(--bg-2);
  padding: 2px 6px;
  border-radius: 3px;
  border: 1px solid var(--border-1);
}
.sb-section { padding: 10px 8px 4px; }
.sb-section-label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-2);
  padding: 4px 8px;
  font-weight: 500;
}
.sb-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: var(--radius-sm);
  color: var(--text-1);
  font-size: 13px;
  cursor: pointer;
  position: relative;
  white-space: nowrap;
}
.sb-item > span:first-of-type { overflow: hidden; text-overflow: ellipsis; flex: 1; min-width: 0; }
.sb-item:hover { background: var(--bg-2); color: var(--text-0); }
.sb-item.active { background: var(--bg-3); color: var(--text-0); }
.sb-item.active::before {
  content: "";
  position: absolute;
  left: -8px; top: 50%;
  transform: translateY(-50%);
  width: 2px; height: 14px;
  background: var(--accent);
  border-radius: 0 2px 2px 0;
}
.sb-item :deep(svg) { color: var(--text-2); flex-shrink: 0; }
.sb-item.active :deep(svg), .sb-item:hover :deep(svg) { color: var(--text-0); }
.sb-item-badge {
  margin-left: auto;
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-2);
  background: var(--bg-2);
  padding: 1px 5px;
  border-radius: 3px;
  border: 1px solid var(--border-1);
}
.sb-item-kbd { margin-left: auto; font-family: var(--font-mono); font-size: 10px; color: var(--text-3); }
.sb-spacer { flex: 1; }
.sb-footer { padding: 8px; border-top: 1px solid var(--border-0); flex-shrink: 0; }
.sb-user {
  display: flex; align-items: center; gap: 8px;
  padding: 6px 8px;
  border-radius: var(--radius-sm);
  cursor: pointer;
}
.sb-user:hover { background: var(--bg-2); }
.sb-avatar {
  width: 22px; height: 22px;
  border-radius: 50%;
  background: var(--accent-bg);
  border: 1px solid var(--accent-border);
  color: var(--accent);
  display: grid; place-items: center;
  font-size: 11px; font-weight: 600;
  flex-shrink: 0;
}
.sb-user-name { font-size: 12px; }
.sb-user-org { font-size: 10px; color: var(--text-2); }

/* ── Main col ── */
.main-col {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  height: 100vh;
}

/* ── Topbar ── */
.topbar {
  height: var(--topbar-h);
  border-bottom: 1px solid var(--border-0);
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 16px;
  background: var(--bg-1);
  flex-shrink: 0;
}
.crumbs {
  display: flex; align-items: center; gap: 6px;
  font-size: 13px; color: var(--text-1);
  white-space: nowrap;
}
.crumbs .sep { color: var(--text-3); }
.crumbs .here { color: var(--text-0); font-weight: 500; }
.search {
  flex: 1; max-width: 480px; margin: 0 auto;
  display: flex; align-items: center; gap: 8px;
  background: var(--bg-2);
  border: 1px solid var(--border-1);
  border-radius: var(--radius-md);
  padding: 5px 10px;
  color: var(--text-2);
  height: 28px;
}
.search input { flex: 1; font-size: 12px; background: transparent; border: 0; outline: 0; color: var(--text-0); }
.search input::placeholder { color: var(--text-2); }
.search .kbd {
  font-family: var(--font-mono); font-size: 10px; color: var(--text-2);
  background: var(--bg-3); border: 1px solid var(--border-1);
  padding: 1px 5px; border-radius: 3px;
}
.tb-actions { display: flex; gap: 4px; align-items: center; margin-left: auto; }
.icon-btn {
  width: 28px; height: 28px;
  display: grid; place-items: center;
  border-radius: var(--radius-sm);
  color: var(--text-1);
}
.icon-btn:hover { background: var(--bg-2); color: var(--text-0); }
.vsep { width: 1px; height: 20px; background: var(--border-1); margin: 0 4px; }

/* ── Subbar ── */
.subbar {
  height: 42px;
  border-bottom: 1px solid var(--border-0);
  display: flex; align-items: center; gap: 8px;
  padding: 0 16px;
  background: var(--bg-1);
  font-size: 12px;
  flex-shrink: 0;
}
.chip-plain {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 3px 8px;
  border-radius: 4px;
  background: var(--bg-2);
  border: 1px solid var(--border-1);
  color: var(--text-1);
  font-size: 12px;
  cursor: pointer;
  height: 24px;
  white-space: nowrap;
}
.chip-plain:hover { color: var(--text-0); border-color: var(--border-2); }
.segmented {
  display: inline-flex;
  background: var(--bg-2);
  border: 1px solid var(--border-1);
  border-radius: var(--radius-md);
  padding: 2px;
  height: 28px;
}
.segmented button {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 0 10px;
  font-size: 12px;
  border-radius: 4px;
  color: var(--text-1);
  height: 22px;
}
.segmented button:hover { color: var(--text-0); }
.segmented button.active {
  background: var(--bg-3);
  color: var(--text-0);
  box-shadow: 0 0 0 1px var(--border-1);
}

/* ── Content ── */
.content {
  flex: 1;
  min-height: 0;
  overflow: auto;
  background: var(--bg-1);
}
.content::-webkit-scrollbar { width: 8px; height: 8px; }
.content::-webkit-scrollbar-thumb { background: var(--border-1); border-radius: 4px; }
.content::-webkit-scrollbar-track { background: transparent; }

.content-header {
  padding: 18px 20px 14px;
  display: flex; align-items: flex-end;
  justify-content: space-between;
  gap: 24px;
}
.content-title-row { display: flex; flex-direction: column; gap: 4px; }
.content-title { font-size: 18px; font-weight: 600; letter-spacing: -0.02em; }
.content-sub { font-size: 12px; color: var(--text-2); }
.content-stats { display: flex; gap: 18px; }
.stat-box .label {
  font-size: 10px; text-transform: uppercase;
  letter-spacing: 0.06em; color: var(--text-2); font-weight: 500;
}
.stat-box .val {
  font-family: var(--font-mono);
  font-size: 16px; color: var(--text-0);
  font-weight: 500; margin-top: 2px;
  font-feature-settings: "tnum";
}
.stat-box .val .unit { color: var(--text-2); font-size: 12px; margin: 0 2px; }

/* ── Tip strip ── */
.tip-strip {
  display: flex; align-items: center; gap: 10px;
  padding: 8px 12px;
  margin: 0 20px 12px;
  background: var(--bg-2);
  border: 1px solid var(--border-1);
  border-radius: var(--radius-md);
  font-size: 12px; color: var(--text-1);
}
.tip-strip .label {
  color: var(--text-2); font-family: var(--font-mono);
  font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em;
}
.tip-strip .x { margin-left: auto; color: var(--text-3); cursor: pointer; }
.tip-strip .x:hover { color: var(--text-0); }

/* ── Error strip ── */
.error-strip {
  margin: 0 20px 12px;
  padding: 10px 14px;
  background: oklch(0.68 0.20 25 / 0.08);
  border: 1px solid oklch(0.68 0.20 25 / 0.35);
  border-radius: var(--radius-md);
  font-size: 12px; color: var(--danger);
}

/* ── Provider badge ── */
.prov {
  display: inline-flex; align-items: center; gap: 4px;
  font-family: var(--font-mono); font-size: 10px;
  padding: 2px 6px; border-radius: 3px;
  text-transform: lowercase; letter-spacing: 0.02em;
  font-weight: 500; white-space: nowrap;
}
.prov::before {
  content: ""; width: 6px; height: 6px;
  border-radius: 50%; background: currentColor; opacity: 0.9;
}
.prov-anthropic { color: var(--provider-anthropic); background: var(--provider-anthropic-bg); }
.prov-openai    { color: var(--provider-openai);    background: var(--provider-openai-bg); }
.prov-vercel    { color: var(--provider-vercel);    background: var(--provider-vercel-bg); }
.prov-vercel-ai { color: var(--provider-vercel);    background: var(--provider-vercel-bg); }
.model { font-family: var(--font-mono); font-size: 12px; color: var(--text-0); white-space: nowrap; }

/* ── Markers / tags ── */
.markers { display: inline-flex; gap: 4px; align-items: center; }
.marker {
  display: inline-flex; align-items: center; gap: 3px;
  padding: 0 4px; height: 16px;
  border-radius: 3px;
  font-family: var(--font-mono); font-size: 9px;
  color: var(--text-2);
  background: var(--bg-2); border: 1px solid var(--border-1);
  white-space: nowrap;
}
.marker.tool { color: var(--warn); border-color: var(--provider-anthropic-bg); }
.marker.sys  { color: var(--accent); border-color: var(--accent-border); }
.tag {
  display: inline-flex; align-items: center; gap: 3px;
  font-family: var(--font-mono); font-size: 10px;
  color: var(--text-2);
  background: var(--bg-1); border: 1px solid var(--border-0);
  border-radius: 3px; padding: 1px 5px;
}
.tag.sys  { color: var(--accent); border-color: var(--accent-border); }
.tag.tool { color: var(--warn); border-color: var(--provider-anthropic-bg); }
.tag.flag { color: var(--danger); border-color: oklch(0.68 0.20 25 / 0.35); }

/* ── Checkbox ── */
.cbox {
  width: 14px; height: 14px;
  border: 1px solid var(--border-2);
  border-radius: 3px;
  display: inline-grid; place-items: center;
  background: var(--bg-1);
  flex-shrink: 0; cursor: pointer;
}
.cbox.on { background: var(--accent); border-color: var(--accent); color: white; }
.cbox.on::after {
  content: "";
  width: 7px; height: 4px;
  border-left: 1.5px solid white;
  border-bottom: 1.5px solid white;
  transform: rotate(-45deg) translate(0, -1px);
}

/* ── List view ── */
.list { display: flex; flex-direction: column; }
.list-row {
  display: grid;
  grid-template-columns: 18px 90px minmax(160px,1.4fr) minmax(160px,1fr) 64px 64px 84px 64px 44px 72px 40px;
  align-items: center;
  gap: 14px;
  padding: 8px 20px;
  border-bottom: 1px solid var(--border-0);
  cursor: pointer;
  font-size: 12px;
  min-height: 38px;
}
.list-row:hover { background: var(--bg-2); }
.list-row.selected { background: var(--accent-bg); }
.list-row.head {
  font-size: 10px; text-transform: uppercase;
  letter-spacing: 0.06em; color: var(--text-2); font-weight: 500;
  cursor: default; min-height: 30px;
  padding-top: 4px; padding-bottom: 4px;
  background: var(--bg-1);
  position: sticky; top: 0; z-index: 2;
}
.list-row.head:hover { background: var(--bg-1); }
.col-title { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.col-title .t1 { color: var(--text-0); font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.col-title .t2 { color: var(--text-2); font-family: var(--font-mono); font-size: 10px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.col-snippet { color: var(--text-1); font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: flex; align-items: center; }
.col-msg { font-family: var(--font-mono); font-size: 11px; color: var(--text-1); font-feature-settings: "tnum"; display: inline-flex; align-items: center; gap: 3px; }
.col-msg.lat.warn { color: var(--warn); }
.col-msg.lat.slow { color: var(--danger); }
.col-date { font-family: var(--font-mono); font-size: 11px; color: var(--text-2); font-feature-settings: "tnum"; text-align: right; }
.col-actions { display: flex; gap: 2px; justify-content: flex-end; opacity: 0; transition: opacity 0.1s; }
.list-row:hover .col-actions { opacity: 1; }
.action-btn {
  width: 22px; height: 22px;
  display: grid; place-items: center;
  border-radius: 3px; color: var(--text-2);
}
.action-btn:hover { background: var(--bg-3); color: var(--text-0); }

/* ── Table view ── */
.table-wrap { padding: 0 20px 20px; }
.tbl {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
  border: 1px solid var(--border-0);
  border-radius: var(--radius-md);
  overflow: hidden;
  background: var(--bg-2);
}
.tbl th {
  text-align: left; font-size: 10px;
  text-transform: uppercase; letter-spacing: 0.06em;
  color: var(--text-2); font-weight: 500;
  padding: 7px 10px;
  background: var(--bg-1);
  border-bottom: 1px solid var(--border-0);
  white-space: nowrap;
  position: sticky; top: 0;
}
.tbl th.num, .tbl td.num { text-align: right; font-family: var(--font-mono); font-feature-settings: "tnum"; }
.tbl td {
  padding: 6px 10px;
  border-bottom: 1px solid var(--border-0);
  vertical-align: middle;
  font-size: 12px; height: 30px;
}
.tbl tbody tr { cursor: pointer; }
.tbl tbody tr:hover { background: var(--bg-3); }
.tbl tbody tr:last-child td { border-bottom: 0; }
.tbl tbody tr.selected { background: var(--accent-bg); }
.tbl tbody tr.selected td:first-child { box-shadow: inset 2px 0 0 var(--accent); }
.col-id { color: var(--text-3); font-family: var(--font-mono); font-size: 10px; }
.col-name { color: var(--text-0); font-weight: 500; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.col-snippet { color: var(--text-1); font-size: 11px; max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.latbar {
  display: inline-block; height: 4px; border-radius: 2px;
  background: var(--success); min-width: 4px;
  vertical-align: middle; margin-right: 6px;
}
.latbar.warn { background: var(--warn); }
.latbar.slow { background: var(--danger); }
.mono { font-family: var(--font-mono); }

/* ── Cards view ── */
.cards-wrap {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
  gap: 12px;
  padding: 4px 20px 20px;
}
.card {
  background: var(--bg-2);
  border: 1px solid var(--border-1);
  border-radius: var(--radius-lg);
  padding: 14px;
  cursor: pointer;
  display: flex; flex-direction: column; gap: 10px;
  transition: border-color 0.1s, background 0.1s;
}
.card:hover { border-color: var(--border-2); background: var(--bg-3); }
.card-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
.card-head .left { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.card-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.card-title { font-weight: 500; font-size: 13px; color: var(--text-0); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.card-date { font-family: var(--font-mono); font-size: 11px; color: var(--text-2); font-feature-settings: "tnum"; white-space: nowrap; }
.card-snippet {
  font-size: 12px; color: var(--text-1);
  background: var(--bg-1);
  border-radius: var(--radius-sm);
  padding: 8px 10px;
  border: 1px solid var(--border-0);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  line-height: 1.45;
}
.card-snippet .role {
  font-family: var(--font-mono); font-size: 10px;
  text-transform: uppercase; color: var(--text-2);
  margin-right: 6px; letter-spacing: 0.05em;
}
.card-meta {
  display: grid; grid-template-columns: 1fr 1fr 1fr 1fr;
  gap: 8px; padding-top: 8px;
  border-top: 1px solid var(--border-0);
}
.card-meta .m { display: flex; flex-direction: column; gap: 2px; }
.card-meta .m .l { font-size: 9px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-2); font-weight: 500; }
.card-meta .m .v { font-family: var(--font-mono); font-size: 12px; color: var(--text-0); font-feature-settings: "tnum"; }
.card-meta .m .v.warn { color: var(--warn); }
.card-meta .m .v.slow { color: var(--danger); }
.card-tags { display: flex; gap: 4px; flex-wrap: wrap; }

/* ── Skeleton ── */
.sk {
  background: linear-gradient(90deg, var(--bg-2) 0%, var(--bg-3) 50%, var(--bg-2) 100%);
  background-size: 200% 100%;
  animation: shimmer 1.4s linear infinite;
  border-radius: 4px;
}
@keyframes shimmer {
  0%   { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
.sk.line    { height: 10px; }
.sk.line.sm { height: 8px; }
.sk.line.lg { height: 14px; }
.sk.pill    { height: 16px; border-radius: 3px; }
.sk.box     { border-radius: 6px; }

/* ── Pager ── */
.pager {
  padding: 12px 20px 20px;
  display: flex; align-items: center;
  justify-content: space-between;
  color: var(--text-2); font-size: 12px;
}
.pager .controls { display: flex; gap: 4px; align-items: center; }
.pager-btn {
  height: 26px; min-width: 26px; padding: 0 8px;
  border: 1px solid var(--border-1); border-radius: 4px;
  display: inline-flex; align-items: center; justify-content: center;
  font-size: 12px; font-family: var(--font-mono);
  color: var(--text-1); background: var(--bg-2);
}
.pager-btn:hover { color: var(--text-0); border-color: var(--border-2); }
.pager-btn.disabled { color: var(--text-3); cursor: not-allowed; }
.pager-btn.active { background: var(--accent-bg); border-color: var(--accent-border); color: var(--accent); }

/* ── Empty state ── */
.empty-state {
  display: flex; flex-direction: column; align-items: center;
  padding: 80px 20px; text-align: center;
  color: var(--text-2);
}
.empty-icon { color: var(--text-3); margin-bottom: 14px; }
.empty-title { font-size: 15px; font-weight: 500; color: var(--text-1); margin-bottom: 6px; }
.empty-sub { font-size: 12px; color: var(--text-2); }
.empty-sub code {
  font-family: var(--font-mono); font-size: 11px;
  background: var(--bg-3); border: 1px solid var(--border-1);
  padding: 1px 4px; border-radius: 3px; color: var(--text-0);
}

/* ── Bulk bar ── */
.bulkbar {
  position: fixed;
  bottom: 12px; left: calc(var(--sidebar-w) + 50%);
  transform: translateX(-50%);
  width: max-content;
  background: var(--bg-3);
  border: 1px solid var(--border-2);
  border-radius: var(--radius-lg);
  padding: 6px 8px 6px 12px;
  display: flex; align-items: center; gap: 8px;
  font-size: 12px;
  box-shadow: 0 8px 24px rgba(0,0,0,.4), 0 0 0 1px rgba(255,255,255,.02);
  z-index: 10;
}
.bulkbar .count {
  color: var(--text-0); font-weight: 500;
  font-feature-settings: "tnum"; font-family: var(--font-mono);
}
.bulkbar .sep { width: 1px; height: 16px; background: var(--border-1); }
.bulkbar button {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 4px 8px; border-radius: 4px; color: var(--text-1);
}
.bulkbar button:hover { background: var(--bg-4); color: var(--text-0); }
.bulkbar button.primary { color: var(--accent); }
.bulkbar .kbd {
  font-family: var(--font-mono); font-size: 10px;
  color: var(--text-3); background: var(--bg-2);
  border: 1px solid var(--border-1);
  padding: 0 4px; border-radius: 3px; margin-left: 2px;
}

/* ── Dot ── */
.dot { width: 6px; height: 6px; border-radius: 50%; display: inline-block; flex-shrink: 0; }
.dot.ok   { background: var(--success); }
.dot.warn { background: var(--warn); }
.dot.slow { background: var(--danger); }
.dot.err  { background: var(--danger); }
</style>
