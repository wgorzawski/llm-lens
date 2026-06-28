<script setup lang="ts">
import type { UnifiedTrace, TraceProvider } from "@llm-lens/types";

const SEARCH_DEBOUNCE_MS = 300;

definePageMeta({ layout: "app" });

// ── helpers ───────────────────────────────────────────────────────────────────

const RANGE_MS: Record<string, number> = {
  "15m": 15 * 60 * 1000,
  "1h": 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
};

function rangeToFrom(range: string): string | undefined {
  const ms = RANGE_MS[range];
  return ms ? new Date(Date.now() - ms).toISOString() : undefined;
}

// ── ui state ─────────────────────────────────────────────────────────────────

const variant = useCookie<"list" | "table" | "cards">("llm-lens:traces-variant", {
  default: () => "list",
  sameSite: "lax",
});
const filterProvider = ref<TraceProvider | "all">("all");
const filterModel = ref("all");
const filterStatus = ref("all");
const filterLatency = ref("any");
const filterRange = ref("30d");
const customFrom = ref("");
const customTo = ref("");
const sort = ref("recent");
const selected = ref<Set<string>>(new Set());
const showTip = ref(true);
const searchQuery = ref("");
const { theme } = useAppearance();

const escHandler = (e: KeyboardEvent) => { if (e.key === "Escape") selected.value = new Set(); };
onMounted(() => {
  window.addEventListener("keydown", escHandler);
  const presel = useRoute().query.select;
  if (typeof presel === "string") selected.value = new Set([presel]);
});
onUnmounted(() => window.removeEventListener("keydown", escHandler));

let searchDebounce: ReturnType<typeof setTimeout> | undefined;
const debouncedQuery = ref("");
watch(searchQuery, (v) => {
  if (searchDebounce) clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => { debouncedQuery.value = v.trim(); }, SEARCH_DEBOUNCE_MS);
});

// ── data ─────────────────────────────────────────────────────────────────────

const { page, pending, error, fetchTraces, deleteOne, deleteMany, setStarred } = useTraces({
  get provider() { return filterProvider.value === "all" ? undefined : filterProvider.value; },
  get model() { return filterModel.value === "all" ? undefined : filterModel.value; },
  get status() { return filterStatus.value === "all" ? undefined : filterStatus.value; },
  get latency() { return filterLatency.value === "any" ? undefined : filterLatency.value; },
  get from() {
    return filterRange.value === "custom"
      ? (customFrom.value ? new Date(customFrom.value).toISOString() : undefined)
      : rangeToFrom(filterRange.value);
  },
  get to() {
    return filterRange.value === "custom" && customTo.value
      ? new Date(customTo.value).toISOString()
      : undefined;
  },
  get q() { return debouncedQuery.value || undefined; },
  get sort() { return sort.value; },
});

const traceCount = useState("trace-count", () => 0);
await fetchTraces();
watch(page, () => { traceCount.value = page.value.total; }, { immediate: true });
watch(filterProvider, () => fetchTraces(0));
watch(filterModel, () => fetchTraces(0));
watch(filterStatus, () => fetchTraces(0));
watch(filterLatency, () => fetchTraces(0));
watch(filterRange, () => { if (filterRange.value !== "custom") fetchTraces(0); });
watch([customFrom, customTo], () => { if (filterRange.value === "custom") fetchTraces(0); });
watch(sort, () => fetchTraces(0));
watch(debouncedQuery, () => fetchTraces(0));

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
  if (s.has(id)) s.delete(id); else s.add(id);
  selected.value = s;
}

function handleRowClick(id: string, isCheckbox = false) {
  if (isCheckbox) { toggleSelect(id); return; }
  navigateTo(`/traces/${id}`);
}

const bulkError = ref<string | null>(null);

async function onRowMenuSelect(t: UnifiedTrace, action: string) {
  if (action === "delete") {
    try { await deleteOne(t.id); await fetchTraces(page.value.offset); }
    catch (err) { bulkError.value = getErrorMessage(err); }
  } else if (action === "star") {
    try { await setStarred(t.id, !t.starred); await fetchTraces(page.value.offset); }
    catch (err) { bulkError.value = getErrorMessage(err); }
  } else if (action === "copy-link") {
    navigator.clipboard?.writeText(`${window.location.origin}/traces/${t.id}`);
  }
}

async function deleteSelected() {
  bulkError.value = null;
  try {
    await deleteMany([...selected.value]);
    selected.value = new Set();
    await fetchTraces(0);
  } catch (err) {
    bulkError.value = getErrorMessage(err);
  }
}

function exportSelected() {
  const rows = traces.value.filter(t => selected.value.has(t.id));
  const blob = new Blob([JSON.stringify(rows, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `traces-export-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function compareDiff() {
  const [a, b] = [...selected.value];
  if (a && b) navigateTo(`/traces/diff?a=${a}&b=${b}`);
}

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

</script>

<template>
      <!-- topbar -->
      <div class="topbar">
        <div class="crumbs">
          <span class="here">Traces</span>
        </div>
        <div class="search">
          <AppIcon name="search" :size="12" />
          <input v-model="searchQuery" placeholder="Search traces, models, prompts…" >
          <span v-if="!searchQuery" class="kbd">⌘K</span>
          <span v-else class="kbd" style="cursor:pointer" @click="searchQuery = ''">✕</span>
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
          default-value="30d"
          :options="rangeOptions"
          :width="180"
          @change="filterRange = $event"
        />
        <div v-if="filterRange === 'custom'" class="custom-range">
          <input v-model="customFrom" type="date" >
          <span style="color:var(--text-3)">→</span>
          <input v-model="customTo" type="date" >
        </div>
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
        <TracesListView
          v-if="variant === 'list'"
          :traces="traces"
          :selected="selected"
          :pending="pending"
          @toggle-select="toggleSelect"
          @row-click="handleRowClick"
          @row-menu-select="onRowMenuSelect"
        />

        <!-- ── TABLE VIEW ── -->
        <TracesTableView
          v-else-if="variant === 'table'"
          :traces="traces"
          :selected="selected"
          :pending="pending"
          @toggle-select="toggleSelect"
          @row-click="handleRowClick"
          @row-menu-select="onRowMenuSelect"
        />

        <!-- ── CARDS VIEW ── -->
        <TracesCardsView
          v-else-if="variant === 'cards'"
          :traces="traces"
          :selected="selected"
          :pending="pending"
          @toggle-select="toggleSelect"
          @row-click="handleRowClick"
          @row-menu-select="onRowMenuSelect"
        />

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

    <!-- ══════════════════════ BULK BAR ══════════════════════ -->
    <div v-if="selected.size > 0" class="bulkbar">
      <span class="count">{{ selected.size }}</span>
      <span style="color:var(--text-1)">selected</span>
      <span class="sep" />
      <button class="primary" :disabled="selected.size !== 2" @click="compareDiff">
        <AppIcon name="diff" :size="12" /> Compare diff
        <span v-if="selected.size !== 2" style="color:var(--text-3);margin-left:4px;font-size:10px">(need 2)</span>
      </button>
      <button><AppIcon name="replay" :size="12" /> Replay</button>
      <button><AppIcon name="note" :size="12" /> Annotate</button>
      <button @click="exportSelected"><AppIcon name="export" :size="12" /> Export</button>
      <span class="sep" />
      <button title="Delete selected" @click="deleteSelected"><AppIcon name="trash" :size="12" /></button>
      <span class="sep" />
      <button @click="selected = new Set()">
        Clear <span class="kbd">esc</span>
      </button>
    </div>

    <div v-if="bulkError" class="bulk-error">{{ bulkError }}</div>
</template>

<style scoped>
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
.custom-range {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 0 6px; height: 24px;
  background: var(--bg-2); border: 1px solid var(--border-1);
  border-radius: 4px;
}
.custom-range input[type="date"] {
  background: transparent; border: 0; outline: 0;
  color: var(--text-0); font-size: 11px; font-family: var(--font-mono);
  width: 92px;
}
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

/* ── Bulk error ── */
.bulk-error {
  position: fixed;
  bottom: 64px; left: calc(var(--sidebar-w) + 50%);
  transform: translateX(-50%);
  background: oklch(0.68 0.20 25 / 0.12);
  border: 1px solid oklch(0.68 0.20 25 / 0.4);
  color: var(--danger);
  padding: 6px 12px;
  border-radius: var(--radius-md);
  font-size: 12px;
  z-index: 10;
}


</style>
