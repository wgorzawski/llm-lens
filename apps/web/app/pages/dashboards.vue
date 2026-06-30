<script setup lang="ts">
import type { UnifiedTrace } from "@llm-lens/types";
definePageMeta({ layout: "app" });

const { stats, range, pending, fetchStats } = useDashboard();
const { apiFetch } = useApiFetch();
const { stats: usageStats, days, fetchStats: fetchUsageStats } = useAnalytics();

onMounted(fetchStats);
onMounted(fetchUsageStats);

// ── formatting ────────────────────────────────────────────────────────────────
function fmtUsd(v: number) { return v < 0.01 ? "<$0.01" : `$${v.toFixed(2)}`; }
function fmtMs(ms: number) { return ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${Math.round(ms)}ms`; }
function fmtNum(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}
function fmtDelta(d: number) { return `${d >= 0 ? "▲" : "▼"} ${Math.abs(d).toFixed(1)}%`; }
function provColor(id: string) {
  if (id === "anthropic") return "var(--provider-anthropic)";
  if (id === "openai") return "var(--provider-openai)";
  return "var(--provider-vercel)";
}

// ── subbar range dropdown ─────────────────────────────────────────────────────
const rangeOpen = ref(false);
const RANGES = [
  { id: "1h", label: "last 1h" },
  { id: "24h", label: "last 24h" },
  { id: "7d", label: "last 7 days" },
  { id: "30d", label: "last 30 days" },
];
function setRange(r: string) { range.value = r; rangeOpen.value = false; }
const rangeLabel = computed(() => RANGES.find((r) => r.id === range.value)?.label ?? range.value);
onClickOutside(useTemplateRef("rangeBtn"), () => { rangeOpen.value = false; });

// ── hero chart ────────────────────────────────────────────────────────────────
const metric = ref<"cost" | "reqs" | "latency" | "errors">("cost");
const W = 720, H = 168, PAD = 8;

function buildLine(vals: number[]): string {
  const max = Math.max(...vals), min = Math.min(...vals, 0);
  const range = (max - min) || 1;
  const step = W / ((vals.length - 1) || 1);
  return vals.map((v, i) =>
    `${i === 0 ? "M" : "L"}${(i * step).toFixed(1)} ${(H - PAD - ((v - min) / range) * (H - PAD * 2)).toFixed(1)}`
  ).join(" ");
}

const heroBody = computed(() => {
  if (!stats.value) return null;
  const S = stats.value.series;
  if (metric.value === "cost") return { type: "area", vals: S.cost, color: "var(--success)" };
  if (metric.value === "reqs") return { type: "stacked", split: S.split };
  if (metric.value === "latency") return { type: "percentile", p50: S.p50, p95: S.p95, p99: S.p99 };
  return { type: "bars", vals: S.errs };
});

const heroYTicks = computed(() => {
  if (!stats.value) return ["", "", ""];
  const S = stats.value.series;
  if (metric.value === "cost") {
    const mx = Math.max(...S.cost, 0.01);
    return [`$${mx.toFixed(2)}`, `$${(mx / 2).toFixed(2)}`, "$0"];
  }
  if (metric.value === "reqs") {
    const totals = S.split.map((s) => s.anthropic + s.openai + s["vercel-ai"]);
    const mx = Math.max(...totals, 1);
    return [String(mx), String(Math.round(mx / 2)), "0"];
  }
  if (metric.value === "latency") {
    const mx = Math.max(...S.p99, 1);
    return [fmtMs(mx), fmtMs(Math.round(mx / 2)), "0"];
  }
  const mx = Math.max(...S.errs, 1);
  return [String(mx), String(Math.round(mx / 2)), "0"];
});

const heroXTicks = computed(() => {
  if (!stats.value) return [];
  const labels = stats.value.series.labels;
  const n = labels.length;
  if (n === 0) return [];
  return [labels[0], labels[Math.floor(n / 3)], labels[Math.floor(2 * n / 3)], labels[n - 1]].filter(Boolean) as string[];
});

const heroSub = computed(() => ({
  cost: "Hourly spend across all providers",
  reqs: "Requests per bucket, stacked by provider",
  latency: "Response latency percentiles",
  errors: "Failed requests per bucket",
})[metric.value]);

function stackedBarsPath() {
  if (!stats.value) return [];
  const S = stats.value.series;
  const n = S.split.length;
  const slot = W / n;
  const bw = slot * 0.62;
  const totals = S.split.map((s) => s.anthropic + s.openai + s["vercel-ai"]);
  const max = Math.max(...totals, 1);
  const ORDER: Array<"anthropic" | "openai" | "vercel-ai"> = ["anthropic", "openai", "vercel-ai"];
  const result: Array<{ x: number; y: number; h: number; w: number; provider: string }> = [];
  S.split.forEach((s, i) => {
    let acc = 0;
    ORDER.forEach((k) => {
      const h = (s[k] / max) * (H - PAD);
      if (h > 0) {
        result.push({ x: i * slot + (slot - bw) / 2, y: H - acc - h, h: Math.max(0, h), w: bw, provider: k });
        acc += h;
      }
    });
  });
  return result;
}

function errorBarsPath() {
  if (!stats.value) return [];
  const vals = stats.value.series.errs;
  const n = vals.length, slot = W / n, bw = slot * 0.5;
  const max = Math.max(...vals, 1);
  return vals.map((v, i) => ({
    x: i * slot + (slot - bw) / 2,
    y: H - (v / max) * (H - PAD),
    h: Math.max(v > 0 ? 2 : 0, (v / max) * (H - PAD)),
    w: bw,
    dim: v === 0,
  }));
}

// ── app usage (page views) ──────────────────────────────────────────────────────
function viewBarsPath() {
  if (!usageStats.value?.series.length) return [];
  const vals = usageStats.value.series.map((d) => d.views);
  const n = vals.length, slot = W / n, bw = slot * 0.5;
  const max = Math.max(...vals, 1);
  return vals.map((v, i) => ({
    x: i * slot + (slot - bw) / 2,
    y: H - (v / max) * (H - PAD),
    h: Math.max(v > 0 ? 2 : 0, (v / max) * (H - PAD)),
    w: bw,
    dim: v === 0,
  }));
}

function fmtDay(d: string): string {
  const date = new Date(`${d}T00:00:00`);
  return Number.isNaN(date.getTime()) ? d : date.toLocaleDateString([], { month: "short", day: "numeric" });
}

// ── donut ─────────────────────────────────────────────────────────────────────
const donutSegments = computed(() => {
  if (!stats.value?.providers.length) return [];
  const total = stats.value.providers.reduce((s, p) => s + p.cost, 0) || 1;
  const R = 50, C = 2 * Math.PI * R;
  let acc = 0;
  return stats.value.providers.map((p) => {
    const len = (p.cost / total) * C;
    const seg = { id: p.id, len, offset: -acc, R, color: provColor(p.id) };
    acc += len;
    return seg;
  });
});

// ── top traces ────────────────────────────────────────────────────────────────
const topTab = ref<"cost" | "slow" | "risk">("cost");
const topTraces = ref<UnifiedTrace[]>([]);
const topPending = ref(false);

async function fetchTopTraces() {
  topPending.value = true;
  try {
    const sortMap = { cost: "cost", slow: "latency", risk: "recent" } as const;
    const statusFilter = topTab.value === "risk" ? "&status=warn" : "";
    const data = await apiFetch<{ traces: UnifiedTrace[] }>(
      `/traces?limit=6&sort=${sortMap[topTab.value]}${statusFilter}`
    );
    topTraces.value = data.traces;
  } finally {
    topPending.value = false;
  }
}

watch(topTab, fetchTopTraces);
onMounted(fetchTopTraces);

function traceStatus(t: UnifiedTrace): string {
  if (t.metadata.error || (t.metadata.statusCode && t.metadata.statusCode >= 400)) return "err";
  if (t.metadata.durationMs && t.metadata.durationMs > 1500) return "warn";
  return "ok";
}

function topMetric(t: UnifiedTrace): { label: string; cls: string } {
  if (topTab.value === "cost") {
    const v = t.metadata.costUsd;
    return { label: v != null ? fmtUsd(v) : "—", cls: "ok-cost" };
  }
  const ms = t.metadata.durationMs ?? 0;
  const cls = ms >= 5000 ? "slow" : ms >= 1500 ? "twarn" : "";
  return { label: t.metadata.durationMs != null ? fmtMs(ms) : "—", cls };
}

function traceSnippet(t: UnifiedTrace): string {
  const msgs = t.messages as Array<{ role: string; content: unknown }>;
  const user = msgs.find((m) => m.role === "user");
  const c = user?.content;
  const text = typeof c === "string" ? c : Array.isArray(c) ? (c[0] as { text?: string })?.text ?? "" : "";
  return text.slice(0, 60) || t.metadata.model;
}

// ── sparkline ─────────────────────────────────────────────────────────────────
function sparkPath(vals: number[], w = 62, h = 18): string {
  if (!vals.length) return "";
  const max = Math.max(...vals, 0.001), min = 0;
  const step = w / ((vals.length - 1) || 1);
  return vals.map((v, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(1)} ${(h - ((v - min) / (max - min)) * h).toFixed(1)}`).join(" ");
}
</script>

<template>
  <div class="dash-page-wrap">
    <!-- ── subbar ──────────────────────────────────────────────────────────── -->
    <div class="dash-subbar">
      <!-- range chip -->
      <div ref="rangeBtn" class="chip-dropdown">
        <button class="chip" @click="rangeOpen = !rangeOpen">
          <AppIcon name="clock" :size="11" />
          {{ rangeLabel }}
          <span class="chip-caret">▾</span>
        </button>
        <div v-if="rangeOpen" class="chip-menu">
          <div
            v-for="r in RANGES" :key="r.id"
            class="chip-menu-item" :class="{ selected: range === r.id }"
            @click="setRange(r.id)"
          >{{ r.label }}</div>
        </div>
      </div>

      <button class="chip">
        <span class="sdot ok" style="width:5px;height:5px" /> prod
        <span class="chip-caret">▾</span>
      </button>
      <button class="chip" style="color:var(--text-2)">
        <AppIcon name="plus" :size="11" /> filter
      </button>

      <div style="flex:1" />
      <span class="live-pill"><span class="dot-run" /> {{ usageStats?.live ?? 0 }} live</span>
      <button class="chip" @click="fetchStats"><AppIcon name="refresh" :size="11" /> Refresh</button>
      <button class="chip"><AppIcon name="export" :size="11" /> Export</button>
    </div>

    <!-- ── content ─────────────────────────────────────────────────────────── -->
    <div class="dash-content">
      <div class="content-title-row">
        <div class="content-title">Dashboard</div>
        <div class="content-sub">Production overview · {{ rangeLabel }}</div>
      </div>

      <div v-if="pending && !stats" style="color:var(--text-2);font-size:.85rem;padding:40px 0">Loading…</div>

      <template v-else-if="stats">
        <!-- ── KPI row ──────────────────────────────────────────────────── -->
        <div class="kpi-row">
          <!-- Spend -->
          <div class="kpi">
            <div class="kpi-top">
              <span class="kpi-label">Spend</span>
              <span class="kpi-ic"><AppIcon name="card" :size="13" /></span>
            </div>
            <div class="kpi-val">{{ fmtUsd(stats.kpis.spend) }}</div>
            <div class="kpi-foot">
              <span class="kpi-delta" :class="stats.kpis.spendDelta <= 0 ? 'pos' : 'neg'">{{ fmtDelta(stats.kpis.spendDelta) }}</span>
              <span class="kpi-unit">vs prior period</span>
              <span class="kpi-spark">
                <svg :width="62" :height="18" viewBox="0 0 62 18">
                  <path :d="sparkPath(stats.kpis.spendSpark)" fill="none" stroke="var(--success)" stroke-width="1.4" stroke-linecap="round" />
                </svg>
              </span>
            </div>
          </div>
          <!-- Requests -->
          <div class="kpi">
            <div class="kpi-top">
              <span class="kpi-label">Requests</span>
              <span class="kpi-ic"><AppIcon name="activity" :size="13" /></span>
            </div>
            <div class="kpi-val">{{ fmtNum(stats.kpis.requests) }}</div>
            <div class="kpi-foot">
              <span class="kpi-delta" :class="stats.kpis.requestsDelta >= 0 ? 'pos' : 'neg'">{{ fmtDelta(stats.kpis.requestsDelta) }}</span>
              <span class="kpi-unit">vs prior period</span>
              <span class="kpi-spark">
                <svg :width="62" :height="18" viewBox="0 0 62 18">
                  <path :d="sparkPath(stats.kpis.requestsSpark)" fill="none" stroke="var(--accent)" stroke-width="1.4" stroke-linecap="round" />
                </svg>
              </span>
            </div>
          </div>
          <!-- p50 -->
          <div class="kpi">
            <div class="kpi-top">
              <span class="kpi-label">Latency · p50</span>
              <span class="kpi-ic"><AppIcon name="clock" :size="13" /></span>
            </div>
            <div class="kpi-val">{{ fmtMs(stats.kpis.p50) }}</div>
            <div class="kpi-foot">
              <span class="kpi-delta" :class="stats.kpis.p50Delta <= 0 ? 'pos' : 'neg'">{{ fmtDelta(stats.kpis.p50Delta) }}</span>
              <span class="kpi-unit">median</span>
              <span class="kpi-spark">
                <svg :width="62" :height="18" viewBox="0 0 62 18">
                  <path :d="sparkPath(stats.kpis.latencySpark)" fill="none" stroke="var(--accent)" stroke-width="1.4" stroke-linecap="round" />
                </svg>
              </span>
            </div>
          </div>
          <!-- p95 -->
          <div class="kpi">
            <div class="kpi-top">
              <span class="kpi-label">Latency · p95</span>
              <span class="kpi-ic"><AppIcon name="warn" :size="13" /></span>
            </div>
            <div class="kpi-val">{{ fmtMs(stats.kpis.p95) }}</div>
            <div class="kpi-foot">
              <span class="kpi-delta" :class="stats.kpis.p95Delta <= 0 ? 'pos' : 'neg'">{{ fmtDelta(stats.kpis.p95Delta) }}</span>
              <span class="kpi-unit">p95</span>
            </div>
          </div>
          <!-- Error rate -->
          <div class="kpi">
            <div class="kpi-top">
              <span class="kpi-label">Error rate</span>
              <span class="kpi-ic"><AppIcon name="x" :size="13" /></span>
            </div>
            <div class="kpi-val">{{ stats.kpis.errorRate.toFixed(2) }}%</div>
            <div class="kpi-foot">
              <span class="kpi-unit">{{ stats.kpis.errorSpark.reduce((s, v) => s + v, 0) }} failed</span>
              <span class="kpi-spark">
                <svg :width="62" :height="18" viewBox="0 0 62 18">
                  <path :d="sparkPath(stats.kpis.errorSpark)" fill="none" stroke="var(--danger)" stroke-width="1.4" stroke-linecap="round" />
                </svg>
              </span>
            </div>
          </div>
          <!-- Cache hit -->
          <div class="kpi">
            <div class="kpi-top">
              <span class="kpi-label">Cache hit</span>
              <span class="kpi-ic"><AppIcon name="database" :size="13" /></span>
            </div>
            <div class="kpi-val">{{ stats.kpis.cacheHit.toFixed(0) }}%</div>
            <div class="kpi-foot">
              <span class="kpi-unit">of input tokens</span>
            </div>
          </div>
        </div>

        <!-- ── grid A: hero chart + donut ─────────────────────────────── -->
        <div class="dash-grid a">
          <!-- Hero chart -->
          <div class="dchart-card">
            <div class="dchart-head">
              <div class="dchart-titles">
                <div class="dchart-title">Activity</div>
                <div class="dchart-sub">{{ heroSub }}</div>
              </div>
              <div class="seg-tabs">
                <button
v-for="m in ['cost','reqs','latency','errors']" :key="m"
                  :class="{ active: metric === m }"
                  @click="metric = m as typeof metric"
                >{{ { cost:'Cost', reqs:'Requests', latency:'Latency', errors:'Errors' }[m] }}</button>
              </div>
            </div>
            <!-- latency legend -->
            <div v-if="metric === 'latency'" class="dchart-legend">
              <span class="leg"><span class="leg-sw" style="background:var(--accent)" />p50</span>
              <span class="leg"><span class="leg-sw" style="background:var(--warn)" />p95</span>
              <span class="leg"><span class="leg-sw" style="background:var(--danger)" />p99</span>
            </div>
            <div v-if="metric === 'reqs'" class="dchart-legend">
              <span class="leg"><span class="leg-sw" style="background:var(--provider-anthropic)" />anthropic</span>
              <span class="leg"><span class="leg-sw" style="background:var(--provider-openai)" />openai</span>
              <span class="leg"><span class="leg-sw" style="background:var(--provider-vercel)" />vercel-ai</span>
            </div>

            <!-- Plot area -->
            <div v-if="heroBody" class="dplot">
              <div class="dplot-y">
                <span v-for="t in heroYTicks" :key="t">{{ t }}</span>
              </div>
              <div class="dplot-area">
                <svg class="dplot-svg" viewBox="0 0 720 168" preserveAspectRatio="none" width="100%" height="168" aria-hidden>
                  <!-- grid lines -->
                  <line
v-for="i in [0,1,2,3]" :key="i" class="dgrid" x1="0" x2="720"
                    :y1="i * (168/3)" :y2="i * (168/3)" vector-effect="non-scaling-stroke" />

                  <!-- cost area -->
                  <template v-if="heroBody.type === 'area'">
                    <defs>
                      <linearGradient id="g-cost" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" :stop-color="heroBody.color" stop-opacity="0.28" />
                        <stop offset="100%" :stop-color="heroBody.color" stop-opacity="0.01" />
                      </linearGradient>
                    </defs>
                    <path :d="buildLine(heroBody.vals!) + ` L720 ${H} L0 ${H} Z`" :fill="'url(#g-cost)'" />
                    <path
:d="buildLine(heroBody.vals!)" fill="none" :stroke="heroBody.color" stroke-width="1.6"
                      vector-effect="non-scaling-stroke" stroke-linejoin="round" />
                  </template>

                  <!-- stacked bars by provider -->
                  <template v-if="heroBody.type === 'stacked'">
                    <rect
v-for="(b, idx) in stackedBarsPath()" :key="idx"
                      :x="b.x" :y="b.y" :width="b.w" :height="Math.max(0, b.h)"
                      rx="1" :fill="provColor(b.provider)" opacity="0.9" />
                  </template>

                  <!-- percentile lines -->
                  <template v-if="heroBody.type === 'percentile'">
                    <path :d="buildLine(heroBody.p99!)" fill="none" stroke="var(--danger)" stroke-width="1.6" vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round" />
                    <path :d="buildLine(heroBody.p95!)" fill="none" stroke="var(--warn)" stroke-width="1.6" vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round" />
                    <path :d="buildLine(heroBody.p50!)" fill="none" stroke="var(--accent)" stroke-width="1.6" vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round" />
                  </template>

                  <!-- error bars -->
                  <template v-if="heroBody.type === 'bars'">
                    <rect
v-for="(b, idx) in errorBarsPath()" :key="idx"
                      :x="b.x" :y="b.y" :width="b.w" :height="Math.max(0, b.h)"
                      rx="1" fill="var(--danger)" :opacity="b.dim ? 0.18 : 0.9" />
                  </template>
                </svg>
                <div class="dplot-x">
                  <span v-for="t in heroXTicks" :key="t">{{ t }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Provider donut -->
          <div class="dchart-card">
            <div class="dchart-head">
              <div class="dchart-titles">
                <div class="dchart-title">Spend by provider</div>
                <div class="dchart-sub">${{ stats.providers.reduce((s,p)=>s+p.cost,0).toFixed(2) }} · {{ rangeLabel }}</div>
              </div>
            </div>
            <div class="donut-wrap" style="flex:1;align-items:center">
              <div class="donut">
                <svg viewBox="0 0 140 140" width="120" height="120">
                  <circle cx="70" cy="70" r="50" class="donut-track" />
                  <circle
v-for="seg in donutSegments" :key="seg.id"
                    cx="70" cy="70" :r="seg.R"
                    fill="none" :stroke="seg.color" stroke-width="14"
                    :stroke-dasharray="`${seg.len} ${2 * Math.PI * seg.R - seg.len}`"
                    :stroke-dashoffset="seg.offset"
                    transform="rotate(-90 70 70)"
                  />
                </svg>
                <div class="donut-center">
                  <span class="dc-val">${{ stats.providers.reduce((s,p)=>s+p.cost,0).toFixed(0) }}</span>
                  <span class="dc-lab">total</span>
                </div>
              </div>
              <div class="donut-legend">
                <div v-for="p in stats.providers" :key="p.id" class="dleg-row">
                  <span class="dleg-sw" :style="{ background: provColor(p.id) }" />
                  <span class="dleg-name">{{ p.label }}</span>
                  <span class="dleg-val">${{ p.cost.toFixed(2) }}</span>
                  <span class="dleg-pct">{{ stats.providers.reduce((s,x)=>s+x.cost,0) > 0 ? Math.round((p.cost / stats.providers.reduce((s,x)=>s+x.cost,0)) * 100) : 0 }}%</span>
                </div>
                <div v-if="!stats.providers.length" style="font-size:.72rem;color:var(--text-3);padding:8px 0">No data yet</div>
              </div>
            </div>
          </div>
        </div>

        <!-- ── grid B: model table + top traces ───────────────────────── -->
        <div class="dash-grid b">
          <!-- Model table -->
          <div class="dchart-card">
            <div class="dchart-head">
              <div class="dchart-titles">
                <div class="dchart-title">Spend by model</div>
                <div class="dchart-sub">{{ stats.models.length }} active · {{ rangeLabel }}</div>
              </div>
            </div>
            <div class="mtable">
              <div class="mtable-head">
                <div>Model</div>
                <div class="num">Requests</div>
                <div class="num">Tokens</div>
                <div class="num">p95</div>
                <div class="num">Cost</div>
              </div>
              <div v-for="m in stats.models" :key="m.model" class="mtable-row">
                <div class="mt-model">
                  <span class="prov" :class="`prov-${m.provider}`">{{ m.provider === "vercel-ai" ? "vercel" : m.provider }}</span>
                  <span class="mt-name">{{ m.model }}</span>
                </div>
                <div class="num mono" style="color:var(--text-1)">{{ m.requests.toLocaleString() }}</div>
                <div class="num mono" style="color:var(--text-2)">{{ m.tokensK.toFixed(1) }}k</div>
                <div class="num mono" :style="{ color: m.p95 >= 3000 ? 'var(--danger)' : m.p95 >= 1500 ? 'var(--warn)' : 'var(--text-1)' }">{{ fmtMs(m.p95) }}</div>
                <div class="mt-cost-cell">
                  <div class="mt-bar-wrap">
                    <span class="mt-bar" :style="{ width: stats.models[0] ? `${(m.cost / stats.models[0].cost) * 100}%` : '0%' }" />
                  </div>
                  <span class="mt-cost-val">${{ m.cost.toFixed(2) }}</span>
                </div>
              </div>
              <div v-if="!stats.models.length" style="font-size:.75rem;color:var(--text-3);padding:16px 0;text-align:center">No traces in this period</div>
            </div>
          </div>

          <!-- Top traces -->
          <div class="dchart-card">
            <div class="dchart-head">
              <div class="dchart-titles">
                <div class="dchart-title">Top traces</div>
              </div>
              <div class="seg-tabs sm">
                <button :class="{ active: topTab === 'cost' }" @click="topTab = 'cost'">Costly</button>
                <button :class="{ active: topTab === 'slow' }" @click="topTab = 'slow'">Slowest</button>
                <button :class="{ active: topTab === 'risk' }" @click="topTab = 'risk'">At risk</button>
              </div>
            </div>
            <div class="toplist">
              <NuxtLink v-for="t in topTraces" :key="t.id" :to="`/traces/${t.id}`" class="top-row">
                <span class="sdot" :class="traceStatus(t)" />
                <span class="top-name">{{ traceSnippet(t) }}</span>
                <span class="prov" :class="`prov-${t.metadata.provider}`" style="font-size:9px">{{ t.metadata.provider === 'vercel-ai' ? 'vercel' : t.metadata.provider }}</span>
                <span class="top-metric" :class="topMetric(t).cls">{{ topMetric(t).label }}</span>
              </NuxtLink>
              <div v-if="!topTraces.length && !topPending" style="font-size:.75rem;color:var(--text-3);padding:16px 0;text-align:center">No traces found</div>
            </div>
          </div>
        </div>

        <!-- ── app usage ────────────────────────────────────────────────── -->
        <div class="dchart-card">
          <div class="dchart-head">
            <div class="dchart-titles">
              <div class="dchart-title">App usage</div>
              <div v-if="usageStats" class="dchart-sub">{{ fmtNum(usageStats.totalViews) }} views · {{ fmtNum(usageStats.uniqueVisitors) }} visitors · last {{ days }} days</div>
            </div>
            <span class="live-pill"><span class="dot-run" /> {{ usageStats?.live ?? 0 }} live now</span>
          </div>
          <div v-if="usageStats?.series.length" class="dplot">
            <div class="dplot-y">
              <span v-for="t in [Math.max(...usageStats.series.map(d => d.views), 1), Math.round(Math.max(...usageStats.series.map(d => d.views), 1) / 2), 0]" :key="t">{{ t }}</span>
            </div>
            <div class="dplot-area">
              <svg class="dplot-svg" viewBox="0 0 720 168" preserveAspectRatio="none" width="100%" height="168" aria-hidden>
                <line v-for="i in [0,1,2,3]" :key="i" class="dgrid" x1="0" x2="720" :y1="i * (168/3)" :y2="i * (168/3)" vector-effect="non-scaling-stroke" />
                <rect
                  v-for="(b, idx) in viewBarsPath()" :key="idx"
                  :x="b.x" :y="b.y" :width="b.w" :height="Math.max(0, b.h)"
                  rx="1" fill="var(--accent)" :opacity="b.dim ? 0.18 : 0.9" />
              </svg>
              <div class="dplot-x">
                <span v-for="d in [usageStats.series[0], usageStats.series[Math.floor(usageStats.series.length / 2)], usageStats.series[usageStats.series.length - 1]]" :key="d?.day">{{ d ? fmtDay(d.day) : '' }}</span>
              </div>
            </div>
          </div>
          <div v-else style="font-size:.75rem;color:var(--text-3);padding:16px 0;text-align:center">No visits recorded yet</div>
        </div>

        <!-- ── incident feed ───────────────────────────────────────────── -->
        <div class="dchart-card">
          <div class="dchart-head">
            <div class="dchart-titles">
              <div class="dchart-title">Recent errors</div>
              <div class="dchart-sub">Traces with error or warning status · {{ rangeLabel }}</div>
            </div>
            <NuxtLink to="/?status=err" class="chart-link">View all <AppIcon name="chevron-right" :size="11" /></NuxtLink>
          </div>
          <div class="inc-list">
            <NuxtLink
              v-for="t in topTraces.filter(x => traceStatus(x) === 'err' || traceStatus(x) === 'warn').slice(0,5)"
              :key="t.id" :to="`/traces/${t.id}`" class="inc-row"
            >
              <span class="inc-code">{{ t.metadata.durationMs != null ? fmtMs(t.metadata.durationMs) : '—' }}</span>
              <span class="inc-kind">{{ traceStatus(t) }}</span>
              <span class="inc-msg">{{ traceSnippet(t) }}</span>
              <span class="prov" :class="`prov-${t.metadata.provider}`" style="font-size:9px">{{ t.metadata.provider }}</span>
              <span class="inc-count">{{ t.metadata.model }}</span>
              <span class="inc-time">{{ new Date(t.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }}</span>
            </NuxtLink>
            <div v-if="!topTraces.filter(x => traceStatus(x) === 'err' || traceStatus(x) === 'warn').length" class="inc-empty">
              No errors or warnings in this period
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>
