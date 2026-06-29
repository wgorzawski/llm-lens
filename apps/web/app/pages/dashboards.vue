<script setup lang="ts">
definePageMeta({ layout: "app" });

const { stats, pending, error, fetchStats, daily30 } = useDashboard();
onMounted(fetchStats);

function fmtNum(n: number, decimals = 0) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(decimals > 0 ? decimals : 1)}k`;
  return n.toFixed(decimals);
}

function fmtMs(ms: number) {
  return ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${ms}ms`;
}

function fmtUsd(v: number) {
  return v < 0.01 ? `<$0.01` : `$${v.toFixed(2)}`;
}

function providerColor(provider: string) {
  if (provider === "anthropic") return "var(--provider-anthropic)";
  if (provider === "openai") return "var(--provider-openai)";
  return "var(--provider-vercel)";
}

// ── bar chart helpers ─────────────────────────────────────────────────────────

const CHART_W = 600;
const CHART_H = 100;
const BAR_GAP = 2;

function barWidth() {
  return (CHART_W - BAR_GAP * 29) / 30;
}

function barsForField(field: "traceCount" | "inputTokens" | "outputTokens" | "costUsd") {
  const values = daily30.value.map((d) => d[field]);
  const max = Math.max(...values, 1);
  const bw = barWidth();
  return daily30.value.map((d, i) => ({
    x: i * (bw + BAR_GAP),
    h: Math.max((d[field] / max) * CHART_H, d[field] > 0 ? 2 : 0),
    day: d.day,
    val: d[field],
  }));
}

function stackedBars() {
  const maxTotal = Math.max(...daily30.value.map((d) => d.inputTokens + d.outputTokens), 1);
  const bw = barWidth();
  return daily30.value.map((d, i) => {
    const total = d.inputTokens + d.outputTokens;
    const inputH = (d.inputTokens / maxTotal) * CHART_H;
    const outputH = (d.outputTokens / maxTotal) * CHART_H;
    const x = i * (bw + BAR_GAP);
    return { x, inputH, outputH, total, day: d.day, bw };
  });
}

// ── x-axis labels ─────────────────────────────────────────────────────────────

const xLabels = computed(() => {
  const bw = barWidth();
  return daily30.value
    .filter((_, i) => i === 0 || i === 14 || i === 29)
    .map((d, idx) => {
      const i = idx === 0 ? 0 : idx === 1 ? 14 : 29;
      return { x: i * (bw + BAR_GAP) + bw / 2, label: d.day.slice(5) };
    });
});

// ── model bar chart ───────────────────────────────────────────────────────────

const maxModelTraces = computed(() =>
  stats.value ? Math.max(...stats.value.byModel.map((m) => m.traceCount), 1) : 1
);
</script>

<template>
  <div class="dash-page">
    <div class="dash-header">
      <h1 class="dash-title">Dashboards</h1>
    </div>

    <div v-if="pending && !stats" class="dash-loading">Loading…</div>
    <div v-else-if="error" class="dash-error">Failed to load stats.</div>

    <template v-else-if="stats">
      <!-- ── stat cards ─────────────────────────────────────────────────── -->
      <div class="stat-cards">
        <div class="stat-card">
          <div class="stat-label">Total traces</div>
          <div class="stat-value">{{ fmtNum(stats.totals.traceCount) }}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Total tokens</div>
          <div class="stat-value">{{ fmtNum(stats.totals.inputTokens + stats.totals.outputTokens) }}</div>
          <div class="stat-sub">{{ fmtNum(stats.totals.inputTokens) }} in · {{ fmtNum(stats.totals.outputTokens) }} out</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Total cost</div>
          <div class="stat-value">{{ fmtUsd(stats.totals.costUsd) }}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Avg latency</div>
          <div class="stat-value">{{ fmtMs(stats.totals.avgDurationMs) }}</div>
        </div>
      </div>

      <!-- ── traces per day ────────────────────────────────────────────── -->
      <div class="chart-card">
        <div class="chart-head">
          <span class="chart-title">Traces · last 30 days</span>
        </div>
        <svg class="bar-chart" :viewBox="`0 0 ${CHART_W} ${CHART_H + 18}`" preserveAspectRatio="none">
          <g>
            <rect
              v-for="b in barsForField('traceCount')"
              :key="b.day"
              :x="b.x"
              :y="CHART_H - b.h"
              :width="barWidth()"
              :height="b.h"
              rx="2"
              class="bar-trace"
            >
              <title>{{ b.day }}: {{ b.val }} traces</title>
            </rect>
          </g>
          <g class="x-labels">
            <text v-for="l in xLabels" :key="l.label" :x="l.x" :y="CHART_H + 14" text-anchor="middle">{{ l.label }}</text>
          </g>
        </svg>
      </div>

      <!-- ── tokens + cost side by side ───────────────────────────────── -->
      <div class="chart-row">
        <div class="chart-card">
          <div class="chart-head">
            <span class="chart-title">Tokens · last 30 days</span>
            <div class="legend">
              <span class="legend-dot legend-input"/><span>Input</span>
              <span class="legend-dot legend-output"/><span>Output</span>
            </div>
          </div>
          <svg class="bar-chart" :viewBox="`0 0 ${CHART_W} ${CHART_H + 18}`" preserveAspectRatio="none">
            <g>
              <g v-for="b in stackedBars()" :key="b.day">
                <rect
                  v-if="b.inputH > 0"
                  :x="b.x" :y="CHART_H - b.inputH - b.outputH"
                  :width="b.bw" :height="b.inputH" rx="0"
                  class="bar-input"
                >
                  <title>{{ b.day }}: {{ b.total.toLocaleString() }} tokens</title>
                </rect>
                <rect
                  v-if="b.outputH > 0"
                  :x="b.x" :y="CHART_H - b.outputH"
                  :width="b.bw" :height="b.outputH" rx="0"
                  class="bar-output"
                >
                  <title>{{ b.day }}: {{ b.total.toLocaleString() }} tokens</title>
                </rect>
              </g>
            </g>
            <g class="x-labels">
              <text v-for="l in xLabels" :key="l.label" :x="l.x" :y="CHART_H + 14" text-anchor="middle">{{ l.label }}</text>
            </g>
          </svg>
        </div>

        <div class="chart-card">
          <div class="chart-head">
            <span class="chart-title">Cost · last 30 days</span>
          </div>
          <svg class="bar-chart" :viewBox="`0 0 ${CHART_W} ${CHART_H + 18}`" preserveAspectRatio="none">
            <g>
              <rect
                v-for="b in barsForField('costUsd')"
                :key="b.day"
                :x="b.x"
                :y="CHART_H - b.h"
                :width="barWidth()"
                :height="b.h"
                rx="2"
                class="bar-cost"
              >
                <title>{{ b.day }}: ${{ b.val.toFixed(4) }}</title>
              </rect>
            </g>
            <g class="x-labels">
              <text v-for="l in xLabels" :key="l.label" :x="l.x" :y="CHART_H + 14" text-anchor="middle">{{ l.label }}</text>
            </g>
          </svg>
        </div>
      </div>

      <!-- ── model breakdown ───────────────────────────────────────────── -->
      <div class="chart-card">
        <div class="chart-head">
          <span class="chart-title">Models</span>
        </div>
        <div class="model-table">
          <div class="model-head">
            <span>Model</span>
            <span>Traces</span>
            <span>Tokens in</span>
            <span>Tokens out</span>
            <span>Cost</span>
            <span>Avg latency</span>
          </div>
          <div
            v-for="m in stats.byModel"
            :key="m.model"
            class="model-row"
          >
            <span class="model-name">
              <span class="model-dot" :style="{ background: providerColor(m.provider) }"/>
              {{ m.model }}
            </span>
            <span class="model-bar-cell">
              <span class="model-bar-wrap">
                <span
                  class="model-bar-fill"
                  :style="{
                    width: `${(m.traceCount / maxModelTraces) * 100}%`,
                    background: providerColor(m.provider),
                  }"
                />
              </span>
              <span class="model-bar-val">{{ m.traceCount }}</span>
            </span>
            <span class="mono dimmed">{{ fmtNum(m.inputTokens) }}</span>
            <span class="mono dimmed">{{ fmtNum(m.outputTokens) }}</span>
            <span class="mono dimmed">{{ fmtUsd(m.costUsd) }}</span>
            <span class="mono dimmed">{{ fmtMs(m.avgDurationMs) }}</span>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.dash-page {
  padding: 24px 32px;
  max-width: 1200px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.dash-header { display: flex; align-items: center; gap: 12px; }
.dash-title { font-size: 1.05rem; font-weight: 600; color: var(--text-0); margin: 0; }

.dash-loading, .dash-error { color: var(--text-2); font-size: 0.85rem; padding: 40px 0; }

/* ── stat cards ──────────────────────────────────────────────────────────── */
.stat-cards {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
}

.stat-card {
  background: var(--bg-2);
  border: 1px solid var(--border-0);
  border-radius: var(--radius-md);
  padding: 16px 20px;
}

.stat-label { font-size: 0.75rem; color: var(--text-2); margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.04em; }
.stat-value { font-size: 1.6rem; font-weight: 600; color: var(--text-0); font-variant-numeric: tabular-nums; }
.stat-sub { font-size: 0.75rem; color: var(--text-2); margin-top: 4px; font-variant-numeric: tabular-nums; }

/* ── chart card ──────────────────────────────────────────────────────────── */
.chart-card {
  background: var(--bg-2);
  border: 1px solid var(--border-0);
  border-radius: var(--radius-md);
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.chart-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.chart-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.chart-title { font-size: 0.8rem; font-weight: 500; color: var(--text-1); }

.legend { display: flex; align-items: center; gap: 8px; font-size: 0.72rem; color: var(--text-2); }
.legend-dot { width: 8px; height: 8px; border-radius: 2px; display: inline-block; }
.legend-input { background: var(--accent); opacity: 0.9; }
.legend-output { background: var(--accent); opacity: 0.45; }

/* ── bar chart ───────────────────────────────────────────────────────────── */
.bar-chart {
  width: 100%;
  height: auto;
  display: block;
  overflow: visible;
}

.bar-trace { fill: var(--accent); opacity: 0.85; }
.bar-cost  { fill: var(--warn); opacity: 0.8; }
.bar-input { fill: var(--accent); opacity: 0.85; }
.bar-output { fill: var(--accent); opacity: 0.40; }

.bar-chart .x-labels text {
  fill: var(--text-3);
  font-size: 11px;
  font-family: var(--font-mono);
}

/* ── model table ──────────────────────────────────────────────────────────── */
.model-table { display: flex; flex-direction: column; gap: 0; }

.model-head {
  display: grid;
  grid-template-columns: 2fr 1.5fr 1fr 1fr 1fr 1fr;
  gap: 12px;
  padding: 6px 0 8px;
  border-bottom: 1px solid var(--border-0);
  font-size: 0.72rem;
  color: var(--text-2);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.model-row {
  display: grid;
  grid-template-columns: 2fr 1.5fr 1fr 1fr 1fr 1fr;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px solid var(--border-0);
  align-items: center;
  font-size: 0.82rem;
  color: var(--text-0);
}
.model-row:last-child { border-bottom: none; }

.model-name {
  display: flex;
  align-items: center;
  gap: 8px;
  font-family: var(--font-mono);
  font-size: 0.78rem;
  color: var(--text-0);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.model-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
}

.model-bar-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}

.model-bar-wrap {
  flex: 1;
  height: 6px;
  background: var(--bg-4);
  border-radius: 3px;
  overflow: hidden;
}

.model-bar-fill {
  display: block;
  height: 100%;
  border-radius: 3px;
  opacity: 0.75;
  transition: width 0.3s ease;
}

.model-bar-val {
  font-size: 0.78rem;
  font-family: var(--font-mono);
  color: var(--text-1);
  min-width: 24px;
  text-align: right;
}

.mono { font-family: var(--font-mono); font-size: 0.78rem; }
.dimmed { color: var(--text-1); }
</style>
