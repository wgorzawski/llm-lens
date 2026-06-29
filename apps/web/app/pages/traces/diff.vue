<script setup lang="ts">
import type { UnifiedTrace, ToolCall } from "@llm-lens/types";
import { fmtMs, fmtUsd } from "~/utils/trace-format";

definePageMeta({ layout: "app" });

// ── routing ─────────────────────────────────────────────────────────────────
const route  = useRoute();
const router = useRouter();

const aId = ref(String(route.query.a ?? ""));
const bId = ref(String(route.query.b ?? ""));

// ── fetch ────────────────────────────────────────────────────────────────────
const { apiFetch } = useApiFetch();

const traceA   = ref<UnifiedTrace | null>(null);
const traceB   = ref<UnifiedTrace | null>(null);
const pending  = ref(false);
const loadErr  = ref<string | null>(null);

// candidate list for pickers
interface TracesPage { traces: UnifiedTrace[]; total: number }
const candidates = ref<UnifiedTrace[]>([]);

async function loadTrace(id: string): Promise<UnifiedTrace | null> {
  if (!id) return null;
  try { return await apiFetch<UnifiedTrace>(`/traces/${id}`); }
  catch (e) { loadErr.value = getErrorMessage(e); return null; }
}

pending.value = true;
const [a, b, cands] = await Promise.all([
  aId.value ? loadTrace(aId.value) : Promise.resolve(null),
  bId.value ? loadTrace(bId.value) : Promise.resolve(null),
  apiFetch<TracesPage>("/traces?limit=30&sort=recent").catch(() => null),
]);
traceA.value = a;
traceB.value = b;
candidates.value = cands?.traces ?? [];
pending.value = false;

async function changeA(id: string) {
  aId.value = id;
  traceA.value = await loadTrace(id);
  router.replace({ query: { ...route.query, a: id } });
}
async function changeB(id: string) {
  bId.value = id;
  traceB.value = await loadTrace(id);
  router.replace({ query: { ...route.query, b: id } });
}
function swapAB() {
  const oldA = aId.value, oldB = bId.value;
  const tA = traceA.value, tB = traceB.value;
  aId.value = oldB; bId.value = oldA;
  traceA.value = tB; traceB.value = tA;
  router.replace({ query: { ...route.query, a: oldB, b: oldA } });
}

// ── picker dropdowns ─────────────────────────────────────────────────────────
const pickerAOpen = ref(false);
const pickerBOpen = ref(false);
const pickerWrap  = useTemplateRef("pickerWrap");
onClickOutside(pickerWrap, () => { pickerAOpen.value = false; pickerBOpen.value = false; });

// ── view toggle ───────────────────────────────────────────────────────────────
const view = ref<"split" | "unified">("split");

// ── trace utilities ───────────────────────────────────────────────────────────
function lastAssistantText(t: UnifiedTrace): string {
  const msgs = t.messages.filter((m) => m.role === "assistant");
  const last  = msgs[msgs.length - 1];
  if (!last) return "";
  if (typeof last.content === "string") return last.content;
  return last.content
    .filter((b): b is { type: "text"; text: string } => b.type === "text")
    .map((b) => b.text)
    .join("\n");
}

function systemPromptText(t: UnifiedTrace): string {
  return t.metadata.systemPrompt ?? "";
}

function allToolCalls(t: UnifiedTrace): ToolCall[] {
  return t.messages.flatMap((m) => m.toolCalls ?? []);
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pl-PL", { day: "2-digit", month: "2-digit", year: "numeric" });
}

// ── LCS word-level diff ──────────────────────────────────────────────────────
interface DiffTok { t: string; s: "same" | "add" | "del" }

function tokenize(text: string): string[] {
  return text.match(/\s+|[^\s]+/g) ?? [];
}

function diffTokens(aStr: string, bStr: string): DiffTok[] {
  const a = tokenize(aStr), b = tokenize(bStr);
  const n = a.length, m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0) as number[]);
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i]![j] = a[i] === b[j]
        ? (dp[i + 1]![j + 1]! + 1)
        : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
  const out: DiffTok[] = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { out.push({ t: a[i]!, s: "same" }); i++; j++; }
    else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) { out.push({ t: a[i]!, s: "del" }); i++; }
    else { out.push({ t: b[j]!, s: "add" }); j++; }
  }
  while (i < n) { out.push({ t: a[i++]!, s: "del" }); }
  while (j < m) { out.push({ t: b[j++]!, s: "add" }); }
  return out;
}

function isWs(t: string) { return /^\s+$/.test(t); }

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function renderDiff(diff: DiffTok[], side?: "a" | "b"): string {
  return diff.map((d) => {
    if (side === "a" && d.s === "add") return "";
    if (side === "b" && d.s === "del") return "";
    const txt = esc(d.t).replace(/\n/g, "<br>");
    if (isWs(d.t)) return txt;
    if (d.s === "add") return `<span class="d-add">${txt}</span>`;
    if (d.s === "del") return `<span class="d-del">${txt}</span>`;
    return txt;
  }).join("");
}

// ── derived diffs ─────────────────────────────────────────────────────────────
const respDiff = computed(() =>
  traceA.value && traceB.value
    ? diffTokens(lastAssistantText(traceA.value), lastAssistantText(traceB.value))
    : [],
);
const sysDiff = computed(() =>
  traceA.value && traceB.value
    ? diffTokens(systemPromptText(traceA.value), systemPromptText(traceB.value))
    : [],
);

const addW = computed(() =>
  respDiff.value.filter((d) => d.s === "add" && !isWs(d.t)).length +
  sysDiff.value.filter((d) => d.s === "add" && !isWs(d.t)).length,
);
const delW = computed(() =>
  respDiff.value.filter((d) => d.s === "del" && !isWs(d.t)).length +
  sysDiff.value.filter((d) => d.s === "del" && !isWs(d.t)).length,
);

// ── scoreboard ────────────────────────────────────────────────────────────────
function pctDelta(a: number | undefined, b: number | undefined) {
  if (!a || !b) return null;
  return ((b - a) / a) * 100;
}

interface ScoreCell {
  label: string;
  aDisp: string;
  bDisp: string;
  delta: number | null;
  dir: "down" | "up" | null;
}

const scoreboardCells = computed((): ScoreCell[] => {
  const A = traceA.value, B = traceB.value;
  if (!A || !B) return [];
  return [
    { label: "Model",      aDisp: A.metadata.model, bDisp: B.metadata.model, delta: null, dir: null },
    { label: "Latency",    aDisp: fmtMs(A.metadata.durationMs), bDisp: fmtMs(B.metadata.durationMs), delta: pctDelta(A.metadata.durationMs, B.metadata.durationMs), dir: "down" },
    { label: "Cost",       aDisp: fmtUsd(A.metadata.costUsd),   bDisp: fmtUsd(B.metadata.costUsd),   delta: pctDelta(A.metadata.costUsd, B.metadata.costUsd),         dir: "down" },
    { label: "Output tok", aDisp: String(A.usage.outputTokens),  bDisp: String(B.usage.outputTokens),  delta: pctDelta(A.usage.outputTokens, B.usage.outputTokens),     dir: "down" },
    { label: "Input tok",  aDisp: String(A.usage.inputTokens),   bDisp: String(B.usage.inputTokens),   delta: pctDelta(A.usage.inputTokens, B.usage.inputTokens),       dir: "down" },
    { label: "Temp",       aDisp: A.metadata.temperature != null ? A.metadata.temperature.toFixed(1) : "—", bDisp: B.metadata.temperature != null ? B.metadata.temperature.toFixed(1) : "—", delta: null, dir: null },
  ];
});

function deltaTone(cell: ScoreCell): string {
  if (cell.delta == null || Math.abs(cell.delta) <= 0.5) return "flat";
  if (!cell.dir) return "flat";
  const better = cell.dir === "down" ? cell.delta < 0 : cell.delta > 0;
  return better ? "good" : "bad";
}

// ── config diff rows ──────────────────────────────────────────────────────────
const configRows = computed(() => {
  const A = traceA.value, B = traceB.value;
  if (!A || !B) return [];
  const tcA = allToolCalls(A).map((tc) => tc.name);
  const tcB = allToolCalls(B).map((tc) => tc.name);
  return [
    { k: "model",       av: A.metadata.model,                         bv: B.metadata.model },
    { k: "temperature", av: A.metadata.temperature?.toFixed(1) ?? "—", bv: B.metadata.temperature?.toFixed(1) ?? "—" },
    { k: "max_tokens",  av: A.metadata.maxTokens ?? "—",               bv: B.metadata.maxTokens ?? "—" },
    { k: "stop_reason", av: A.metadata.stopReason ?? "—",              bv: B.metadata.stopReason ?? "—" },
    { k: "tools",       av: tcA.join(", ") || "none",                  bv: tcB.join(", ") || "none" },
  ].map((r) => ({ ...r, changed: String(r.av) !== String(r.bv) }));
});

// ── header summary ───────────────────────────────────────────────────────────
const costDelta  = computed(() => traceA.value && traceB.value ? pctDelta(traceA.value.metadata.costUsd, traceB.value.metadata.costUsd) : null);
const latDelta   = computed(() => traceA.value && traceB.value ? pctDelta(traceA.value.metadata.durationMs, traceB.value.metadata.durationMs) : null);
const modelShift = computed(() => {
  const a = traceA.value?.metadata.model ?? "";
  const b = traceB.value?.metadata.model ?? "";
  if (a === b) return null;
  return `${a.split("-").slice(1, 3).join("-")} → ${b.split("-").slice(1, 3).join("-")}`;
});

</script>

<template>
  <div ref="pickerWrap" class="content">

    <!-- ── header ──────────────────────────────────────────────────────────── -->
    <div class="content-header">
      <div class="content-title-row">
        <div class="content-title">Compare &amp; diff</div>
        <div class="content-sub">
          Word-level LCS diff across two runs
        </div>
      </div>
      <div v-if="traceA && traceB" class="cmp-summary">
        <span class="sum-pill add">+{{ addW }}</span>
        <span class="sum-pill del">−{{ delW }}</span>
        <span class="sum-sep" />
        <span v-if="costDelta != null" class="sum-stat">
          cost <strong :class="costDelta < 0 ? 'good' : 'bad'">{{ costDelta < 0 ? "↓" : "↑" }} {{ Math.abs(costDelta).toFixed(0) }}%</strong>
        </span>
        <span v-if="latDelta != null" class="sum-stat">
          latency <strong :class="latDelta < 0 ? 'good' : 'bad'">{{ latDelta < 0 ? "↓" : "↑" }} {{ Math.abs(latDelta).toFixed(0) }}%</strong>
        </span>
        <span v-if="modelShift" class="sum-stat">
          model <strong class="flat mono">{{ modelShift }}</strong>
        </span>
      </div>
    </div>

    <!-- ── subbar ──────────────────────────────────────────────────────────── -->
    <div class="subbar cmp-subbar">
      <!-- picker A -->
      <div class="rp" style="position:relative">
        <span class="rp-slot a">A</span>
        <button class="rp-chip" :class="{ open: pickerAOpen }" @click="pickerAOpen = !pickerAOpen; pickerBOpen = false">
          <span class="mono">{{ traceA ? traceA.metadata.model : (aId || "Pick a trace…") }}</span>
          <span v-if="traceA" class="rp-meta">{{ traceA.id.slice(-8) }}</span>
          <span class="chip-caret">▾</span>
        </button>
        <div v-if="pickerAOpen" class="rp-menu">
          <div v-if="candidates.length === 0" class="rp-empty">No recent traces</div>
          <div
v-for="c in candidates" :key="c.id"
               class="rp-item" :class="{ selected: c.id === aId }"
               @click="changeA(c.id); pickerAOpen = false">
            <span class="rp-provider" :class="`prov-${c.metadata.provider}`" />
            <span class="mono rp-model">{{ c.metadata.model }}</span>
            <span class="rp-hint">{{ c.id.slice(-8) }} · {{ fmtUsd(c.metadata.costUsd) }} · {{ fmtMs(c.metadata.durationMs) }}</span>
          </div>
        </div>
      </div>

      <!-- swap -->
      <button class="swap-btn" title="Swap A / B" @click="swapAB">
        <AppIcon name="diff" :size="13" />
      </button>

      <!-- picker B -->
      <div class="rp" style="position:relative">
        <span class="rp-slot b">B</span>
        <button class="rp-chip" :class="{ open: pickerBOpen }" @click="pickerBOpen = !pickerBOpen; pickerAOpen = false">
          <span class="mono">{{ traceB ? traceB.metadata.model : (bId || "Pick a trace…") }}</span>
          <span v-if="traceB" class="rp-meta">{{ traceB.id.slice(-8) }}</span>
          <span class="chip-caret">▾</span>
        </button>
        <div v-if="pickerBOpen" class="rp-menu">
          <div v-if="candidates.length === 0" class="rp-empty">No recent traces</div>
          <div
v-for="c in candidates" :key="c.id"
               class="rp-item" :class="{ selected: c.id === bId }"
               @click="changeB(c.id); pickerBOpen = false">
            <span class="rp-provider" :class="`prov-${c.metadata.provider}`" />
            <span class="mono rp-model">{{ c.metadata.model }}</span>
            <span class="rp-hint">{{ c.id.slice(-8) }} · {{ fmtUsd(c.metadata.costUsd) }} · {{ fmtMs(c.metadata.durationMs) }}</span>
          </div>
        </div>
      </div>

      <div style="flex:1" />

      <!-- view toggle -->
      <div class="seg-tabs sm">
        <button :class="{ active: view === 'split' }"   @click="view = 'split'">Split</button>
        <button :class="{ active: view === 'unified' }" @click="view = 'unified'">Unified</button>
      </div>

      <button class="chip"><AppIcon name="docs" :size="11" /> Export</button>
    </div>

    <!-- ── states ─────────────────────────────────────────────────────────── -->
    <div v-if="pending"  class="cmp-state">Loading…</div>
    <div v-else-if="loadErr" class="cmp-state err">{{ loadErr }}</div>
    <div v-else-if="!traceA && !traceB" class="cmp-empty">
      <AppIcon name="diff" :size="24" style="color:var(--text-3)" />
      <div class="cmp-empty-title">Pick two traces to compare</div>
      <div class="cmp-empty-sub">Use the dropdowns above or navigate here from a trace detail page.</div>
    </div>

    <!-- ── main body ──────────────────────────────────────────────────────── -->
    <template v-else-if="traceA && traceB">
      <div class="cmp-body">

        <!-- scoreboard -->
        <div class="scoreboard">
          <div v-for="cell in scoreboardCells" :key="cell.label" class="ms-cell">
            <span class="ms-label">{{ cell.label }}</span>
            <div class="ms-vals">
              <span class="ms-a mono">{{ cell.aDisp }}</span>
              <AppIcon name="chevron-right" :size="10" class="ms-arrow" />
              <span class="ms-b mono">{{ cell.bDisp }}</span>
            </div>
            <span :class="['ms-delta', deltaTone(cell)]">
              <template v-if="cell.delta == null">
                {{ cell.aDisp === cell.bDisp ? "no change" : "changed" }}
              </template>
              <template v-else>
                {{ cell.delta > 0 ? "▲" : cell.delta < 0 ? "▼" : "" }}
                {{ Math.abs(cell.delta).toFixed(0) }}%
              </template>
            </span>
          </div>
        </div>

        <!-- two-column layout -->
        <div class="cmp-cols">

          <!-- ── left column ─────────────────────────────────────────────── -->
          <div class="cmp-left">

            <!-- config diff -->
            <div class="cmp-panel">
              <div class="cmp-panel-head"><span class="cmp-panel-title">Configuration</span></div>
              <div class="cmp-panel-body">
                <div class="cfg-diff">
                  <div v-for="r in configRows" :key="r.k" class="cfg-row" :class="{ changed: r.changed }">
                    <span class="cfg-k mono">{{ r.k }}</span>
                    <span class="cfg-a mono">{{ r.av }}</span>
                    <AppIcon v-if="r.changed" name="chevron-right" :size="10" class="cfg-arrow" />
                    <span v-else class="cfg-eq">=</span>
                    <span class="cfg-b mono" :class="{ hot: r.changed }">{{ r.bv }}</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- system prompt diff -->
            <div class="cmp-panel">
              <div class="cmp-panel-head">
                <span class="cmp-panel-title">System prompt</span>
                <div class="diff-legend">
                  <span class="dl"><span class="dl-sw add" />added in B</span>
                  <span class="dl"><span class="dl-sw del" />removed from A</span>
                </div>
              </div>
              <div class="cmp-panel-body">
                <template v-if="sysDiff.length === 0">
                  <span style="color:var(--text-3);font-size:.72rem">No system prompt on either run.</span>
                </template>
                <template v-else-if="view === 'split'">
                  <div class="split2">
                    <div class="split-col">
                      <div class="split-head">A</div>
                      <!-- eslint-disable-next-line vue/no-v-html -->
                      <div class="diff-text" v-html="renderDiff(sysDiff, 'a')" />
                    </div>
                    <div class="split-col b">
                      <div class="split-head">B</div>
                      <!-- eslint-disable-next-line vue/no-v-html -->
                      <div class="diff-text" v-html="renderDiff(sysDiff, 'b')" />
                    </div>
                  </div>
                </template>
                <template v-else>
                  <!-- eslint-disable-next-line vue/no-v-html -->
                  <div class="diff-text" v-html="renderDiff(sysDiff)" />
                </template>
              </div>
            </div>

            <!-- tool calls -->
            <div class="cmp-panel">
              <div class="cmp-panel-head"><span class="cmp-panel-title">Tool calls</span></div>
              <div class="cmp-panel-body">
                <template v-if="allToolCalls(traceA).length === 0 && allToolCalls(traceB).length === 0">
                  <span style="color:var(--text-3);font-size:.72rem">No tool calls on either run.</span>
                </template>
                <div v-else class="tc-compare">
                  <template v-if="allToolCalls(traceA).length === 0 || allToolCalls(traceB).length === 0">
                    <div class="tc-foot" style="color:var(--warn)">
                      Tool calls present only on {{ allToolCalls(traceA).length > 0 ? "run A" : "run B" }}.
                    </div>
                  </template>
                  <template v-else>
                    <template v-for="(tc, i) in allToolCalls(traceA)" :key="i">
                      <div class="tc-row">
                        <span class="tc-name mono">{{ tc.name }}({{ Object.keys(tc.input).map(k => `${k}: …`).join(", ") }})</span>
                        <span v-if="allToolCalls(traceB)[i]?.name === tc.name" class="tc-eq">identical</span>
                        <span v-else class="tc-diff">differs</span>
                      </div>
                    </template>
                    <div class="tc-foot">
                      Both runs issued <strong>{{ allToolCalls(traceA).length }}</strong>
                      tool call{{ allToolCalls(traceA).length !== 1 ? "s" : "" }}.
                    </div>
                  </template>
                </div>
              </div>
            </div>

          </div><!-- end cmp-left -->

          <!-- ── right column (hero) ─────────────────────────────────────── -->
          <div class="cmp-right">
            <div class="cmp-panel hero">
              <div class="cmp-panel-head">
                <span class="cmp-panel-title">Final response</span>
                <div class="diff-legend">
                  <span class="dl"><span class="dl-sw add" />added in B</span>
                  <span class="dl"><span class="dl-sw del" />removed from A</span>
                </div>
                <span class="resp-meta">
                  {{ traceA.usage.outputTokens }} → {{ traceB.usage.outputTokens }} tok
                </span>
              </div>
              <div class="cmp-panel-body">
                <template v-if="view === 'split'">
                  <div class="split2 resp">
                    <div class="split-col">
                      <!-- run tag A -->
                      <div class="runtag">
                        <span class="runtag-slot a">A</span>
                        <span :class="`prov prov-${traceA.metadata.provider}`">{{ traceA.metadata.provider }}</span>
                        <span class="runtag-model mono">{{ traceA.metadata.model }}</span>
                        <span class="runtag-meta">{{ shortDate(traceA.timestamp) }} · {{ traceA.id.slice(-8) }}</span>
                      </div>
                      <!-- eslint-disable-next-line vue/no-v-html -->
                      <div class="diff-text" v-html="renderDiff(respDiff, 'a')" />
                    </div>
                    <div class="split-col b">
                      <!-- run tag B -->
                      <div class="runtag">
                        <span class="runtag-slot b">B</span>
                        <span :class="`prov prov-${traceB.metadata.provider}`">{{ traceB.metadata.provider }}</span>
                        <span class="runtag-model mono">{{ traceB.metadata.model }}</span>
                        <span class="runtag-meta">{{ shortDate(traceB.timestamp) }} · {{ traceB.id.slice(-8) }}</span>
                      </div>
                      <!-- eslint-disable-next-line vue/no-v-html -->
                      <div class="diff-text" v-html="renderDiff(respDiff, 'b')" />
                    </div>
                  </div>
                </template>
                <template v-else>
                  <div class="unified-wrap">
                    <!-- eslint-disable-next-line vue/no-v-html -->
                    <div class="diff-text" v-html="renderDiff(respDiff)" />
                  </div>
                </template>
              </div>
            </div>
          </div><!-- end cmp-right -->

        </div><!-- end cmp-cols -->
      </div><!-- end cmp-body -->
    </template>

  </div>
</template>

<style scoped>
/* ── content shell ── */
.content { flex: 1; overflow-y: auto; display: flex; flex-direction: column; padding: 0; }

/* ── header ── */
.content-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; padding: 20px 24px 0; flex-wrap: wrap; flex-shrink: 0; }
.content-title-row { display: flex; flex-direction: column; gap: 4px; }
.content-title { font-size: 1rem; font-weight: 600; color: var(--text-0); }
.content-sub { font-size: .72rem; color: var(--text-2); }
.cmp-summary { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.sum-pill { display: inline-flex; align-items: center; font-size: .68rem; font-weight: 600; padding: 2px 7px; border-radius: 3px; }
.sum-pill.add { background: color-mix(in srgb, var(--success) 12%, transparent); color: var(--success); }
.sum-pill.del { background: color-mix(in srgb, var(--danger) 12%, transparent);  color: var(--danger); }
.sum-sep { display: inline-block; width: 1px; height: 12px; background: var(--border-1); }
.sum-stat { font-size: .72rem; color: var(--text-2); }
.sum-stat strong { font-weight: 600; }
.sum-stat .good { color: var(--success); }
.sum-stat .bad  { color: var(--danger); }
.sum-stat .flat { color: var(--text-1); }

/* ── subbar ── */
.subbar { display: flex; align-items: center; gap: 6px; padding: 10px 24px; background: var(--bg-2); border-bottom: 1px solid var(--border-0); border-top: 1px solid var(--border-0); margin-top: 16px; flex-shrink: 0; }
.cmp-subbar { flex-wrap: wrap; }

/* ── pickers ── */
.rp { display: flex; align-items: center; gap: 6px; }
.rp-slot { display: inline-flex; align-items: center; justify-content: center; width: 18px; height: 18px; border-radius: 50%; font-size: .62rem; font-weight: 700; flex-shrink: 0; }
.rp-slot.a { background: color-mix(in srgb, var(--accent) 15%, transparent); color: var(--accent); }
.rp-slot.b { background: color-mix(in srgb, var(--success) 15%, transparent); color: var(--success); }
.rp-chip { display: flex; align-items: center; gap: 6px; padding: 4px 8px; background: var(--bg-3); border: 1px solid var(--border-1); border-radius: var(--radius-md); font-size: .72rem; color: var(--text-1); cursor: pointer; max-width: 260px; white-space: nowrap; overflow: hidden; }
.rp-chip.open { border-color: var(--accent); }
.rp-chip .mono { overflow: hidden; text-overflow: ellipsis; }
.rp-meta { color: var(--text-3); font-size: .65rem; flex-shrink: 0; }
.chip-caret { color: var(--text-3); flex-shrink: 0; }
.rp-menu { position: absolute; top: calc(100% + 4px); left: 0; z-index: 300; background: var(--bg-2); border: 1px solid var(--border-1); border-radius: var(--radius-md); padding: 4px; min-width: 320px; max-height: 320px; overflow-y: auto; box-shadow: 0 8px 24px #00000050; }
.rp-item { display: grid; grid-template-columns: 8px 1fr auto; gap: 6px; align-items: center; padding: 7px 8px; border-radius: var(--radius-sm); cursor: pointer; }
.rp-item:hover { background: var(--bg-3); }
.rp-item.selected { background: var(--accent-bg); }
.rp-provider { width: 6px; height: 6px; border-radius: 50%; background: var(--text-3); }
.prov-anthropic.rp-provider { background: var(--provider-anthropic); }
.prov-openai.rp-provider    { background: var(--provider-openai); }
.prov-vercel-ai.rp-provider { background: var(--provider-vercel); }
.rp-model { font-size: .72rem; color: var(--text-0); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rp-hint  { font-size: .65rem; color: var(--text-3); white-space: nowrap; }
.rp-empty { padding: 12px; font-size: .72rem; color: var(--text-3); text-align: center; }

/* swap button */
.swap-btn { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: var(--radius-sm); background: var(--bg-3); border: 1px solid var(--border-1); color: var(--text-2); cursor: pointer; flex-shrink: 0; }
.swap-btn:hover { background: var(--bg-4); color: var(--text-0); }

/* seg-tabs */
.seg-tabs.sm { display: flex; gap: 1px; background: var(--bg-4); border-radius: var(--radius-sm); padding: 2px; }
.seg-tabs.sm button { font-size: .68rem; padding: 3px 8px; border-radius: 3px; background: none; border: none; color: var(--text-2); cursor: pointer; font-family: inherit; }
.seg-tabs.sm button.active { background: var(--bg-2); color: var(--text-0); }

.chip { display: inline-flex; align-items: center; gap: 5px; padding: 4px 10px; border-radius: var(--radius-sm); background: var(--bg-3); border: 1px solid var(--border-1); font-size: .72rem; color: var(--text-1); cursor: pointer; }
.chip:hover { background: var(--bg-4); }

/* ── states ── */
.cmp-state { flex: 1; display: flex; align-items: center; justify-content: center; font-size: .80rem; color: var(--text-2); }
.cmp-state.err { color: var(--danger); }
.cmp-empty { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; padding: 60px 20px; }
.cmp-empty-title { font-size: .88rem; font-weight: 500; color: var(--text-1); }
.cmp-empty-sub { font-size: .72rem; color: var(--text-2); text-align: center; max-width: 360px; }

/* ── body ── */
.cmp-body { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 14px; padding: 18px 24px; }

/* ── scoreboard ── */
.scoreboard { display: grid; grid-template-columns: repeat(6, 1fr); gap: 8px; flex-shrink: 0; }
@media (max-width: 1100px) { .scoreboard { grid-template-columns: repeat(3, 1fr); } }
.ms-cell { background: var(--bg-2); border: 1px solid var(--border-0); border-radius: var(--radius-md); padding: 10px 12px; display: flex; flex-direction: column; gap: 4px; }
.ms-label { font-size: .62rem; text-transform: uppercase; letter-spacing: .06em; color: var(--text-3); }
.ms-vals { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
.ms-a, .ms-b { font-size: .72rem; color: var(--text-0); }
.ms-a { color: var(--text-2); }
.ms-arrow { color: var(--text-3); flex-shrink: 0; }
.ms-delta { font-size: .68rem; font-weight: 500; }
.ms-delta.good { color: var(--success); }
.ms-delta.bad  { color: var(--danger); }
.ms-delta.flat { color: var(--text-3); }

/* ── cmp columns ── */
.cmp-cols { display: grid; grid-template-columns: 320px 1fr; gap: 14px; flex: 1; min-height: 0; }
@media (max-width: 900px) { .cmp-cols { grid-template-columns: 1fr; } }
.cmp-left { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
.cmp-right { min-width: 0; display: flex; flex-direction: column; }

/* ── panel ── */
.cmp-panel { background: var(--bg-2); border: 1px solid var(--border-0); border-radius: var(--radius-md); overflow: hidden; display: flex; flex-direction: column; }
.cmp-panel.hero { flex: 1; }
.cmp-panel-head { display: flex; align-items: center; gap: 10px; padding: 9px 14px; border-bottom: 1px solid var(--border-0); flex-shrink: 0; flex-wrap: wrap; }
.cmp-panel-title { font-size: .75rem; font-weight: 500; color: var(--text-0); }
.cmp-panel-body { padding: 12px 14px; overflow-y: auto; font-size: .75rem; line-height: 1.6; flex: 1; }

/* diff legend */
.diff-legend { display: flex; align-items: center; gap: 10px; margin-left: auto; }
.dl { display: flex; align-items: center; gap: 4px; font-size: .65rem; color: var(--text-2); }
.dl-sw { display: inline-block; width: 10px; height: 10px; border-radius: 2px; }
.dl-sw.add { background: color-mix(in srgb, var(--success) 20%, transparent); border: 1px solid color-mix(in srgb, var(--success) 30%, transparent); }
.dl-sw.del { background: color-mix(in srgb, var(--danger) 20%, transparent);  border: 1px solid color-mix(in srgb, var(--danger) 30%, transparent); }

.resp-meta { font-size: .68rem; color: var(--text-2); font-family: var(--font-mono); white-space: nowrap; }

/* ── config diff table ── */
.cfg-diff { display: flex; flex-direction: column; gap: 0; }
.cfg-row { display: grid; grid-template-columns: 90px 1fr 14px 1fr; gap: 6px; align-items: center; padding: 5px 0; border-bottom: 1px solid var(--border-0); font-size: .70rem; }
.cfg-row:last-child { border-bottom: none; }
.cfg-row.changed { background: color-mix(in srgb, var(--warn) 5%, transparent); margin: 0 -14px; padding: 5px 14px; }
.cfg-k { color: var(--text-2); }
.cfg-a { color: var(--text-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cfg-b { color: var(--text-1); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cfg-b.hot { color: var(--accent); font-weight: 500; }
.cfg-arrow { color: var(--text-3); }
.cfg-eq { font-size: .65rem; color: var(--text-3); text-align: center; }

/* ── tool calls ── */
.tc-compare { display: flex; flex-direction: column; gap: 4px; }
.tc-row { display: flex; align-items: center; gap: 8px; padding: 5px 0; border-bottom: 1px solid var(--border-0); }
.tc-row:last-of-type { border-bottom: none; }
.tc-name { font-size: .70rem; color: var(--text-1); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tc-eq   { font-size: .65rem; color: var(--success); white-space: nowrap; }
.tc-diff { font-size: .65rem; color: var(--warn); white-space: nowrap; }
.tc-foot { font-size: .68rem; color: var(--text-2); margin-top: 4px; }

/* ── split view ── */
.split2 { display: grid; grid-template-columns: 1fr 1fr; gap: 0; }
.split2.resp { height: 100%; }
.split-col { display: flex; flex-direction: column; min-width: 0; }
.split-col.b { border-left: 1px solid var(--border-0); padding-left: 12px; margin-left: -1px; }
.split-head { font-size: .62rem; font-weight: 700; text-transform: uppercase; color: var(--text-3); letter-spacing: .06em; margin-bottom: 8px; }

/* ── run tag ── */
.runtag { display: flex; align-items: center; gap: 6px; margin-bottom: 8px; flex-wrap: wrap; }
.runtag-slot { display: inline-flex; align-items: center; justify-content: center; width: 16px; height: 16px; border-radius: 50%; font-size: .60rem; font-weight: 700; flex-shrink: 0; }
.runtag-slot.a { background: color-mix(in srgb, var(--accent) 15%, transparent); color: var(--accent); }
.runtag-slot.b { background: color-mix(in srgb, var(--success) 15%, transparent); color: var(--success); }
.runtag-model { font-size: .68rem; color: var(--text-1); }
.runtag-meta  { font-size: .62rem; color: var(--text-3); }

/* ── provider badges ── */
.prov { display: inline-flex; align-items: center; gap: 4px; font-family: var(--font-mono); font-size: .62rem; padding: 1px 5px; border-radius: 3px; text-transform: lowercase; }
.prov::before { content: ""; width: 5px; height: 5px; border-radius: 50%; background: currentColor; flex-shrink: 0; }
.prov-anthropic { color: var(--provider-anthropic); background: var(--provider-anthropic-bg); }
.prov-openai    { color: var(--provider-openai);    background: var(--provider-openai-bg); }
.prov-vercel-ai { color: var(--provider-vercel);    background: var(--provider-vercel-bg); }

/* ── diff text ── */
.diff-text { font-size: .75rem; line-height: 1.7; white-space: pre-wrap; word-break: break-word; color: var(--text-1); }
:deep(.d-add) { background: color-mix(in srgb, var(--success) 18%, transparent); color: var(--success); border-radius: 2px; padding: 0 1px; }
:deep(.d-del) { background: color-mix(in srgb, var(--danger) 18%, transparent);  color: var(--danger);  border-radius: 2px; padding: 0 1px; text-decoration: line-through; }

.unified-wrap { padding: 4px 0; }
</style>
