<script setup lang="ts">
import type { TraceMessage } from "@llm-lens/types";

definePageMeta({ layout: "app" });

const route = useRoute();
const idA = String(route.query.a ?? "");
const idB = String(route.query.b ?? "");

const { trace: traceA, pending: pendingA, error: errorA, fetchTrace: fetchA } = useTrace(idA);
const { trace: traceB, pending: pendingB, error: errorB, fetchTrace: fetchB } = useTrace(idB);
if (idA && idB) await Promise.all([fetchA(), fetchB()]);

const pending = computed(() => pendingA.value || pendingB.value);

function textOf(content: TraceMessage["content"]): string {
  if (typeof content === "string") return content;
  return content.filter(b => b.type === "text").map(b => b.text).join("\n");
}

const rows = computed(() => {
  const a = traceA.value?.messages ?? [];
  const b = traceB.value?.messages ?? [];
  const len = Math.max(a.length, b.length);
  return Array.from({ length: len }, (_, i) => {
    const ma = a[i];
    const mb = b[i];
    const ta = ma ? textOf(ma.content) : undefined;
    const tb = mb ? textOf(mb.content) : undefined;
    return {
      i,
      roleA: ma?.role,
      roleB: mb?.role,
      textA: ta,
      textB: tb,
      changed: ta !== tb,
    };
  });
});
</script>

<template>
  <div class="diff-page">
    <div class="diff-top">
      <NuxtLink to="/" class="back">
        <AppIcon name="chevron-down" :size="10" class="back-chevron" /> Traces
      </NuxtLink>
      <div class="diff-title"><AppIcon name="diff" :size="14" /> Compare traces</div>
    </div>

    <div v-if="pending" style="padding:40px;color:var(--text-2)">Loading…</div>
    <div v-else-if="errorA || errorB" style="padding:40px;color:var(--danger)">{{ errorA || errorB }}</div>
    <div v-else-if="!traceA || !traceB" style="padding:40px;color:var(--text-2)">Pick two traces to compare.</div>

    <template v-else>
      <div class="diff-cols">
        <div class="diff-col">
          <div class="diff-col-head">
            <span :class="`prov prov-${traceA.metadata.provider}`">{{ traceA.metadata.provider }}</span>
            <span class="model">{{ traceA.metadata.model }}</span>
            <span class="id">{{ traceA.id.slice(-8) }}</span>
          </div>
          <div class="diff-meta">
            <span>{{ fmtMs(traceA.metadata.durationMs) }}</span>
            <span>{{ fmtUsd(traceA.metadata.costUsd) }}</span>
            <span>{{ fmtN(traceA.usage.inputTokens) }} in / {{ fmtN(traceA.usage.outputTokens) }} out</span>
          </div>
        </div>
        <div class="diff-col">
          <div class="diff-col-head">
            <span :class="`prov prov-${traceB.metadata.provider}`">{{ traceB.metadata.provider }}</span>
            <span class="model">{{ traceB.metadata.model }}</span>
            <span class="id">{{ traceB.id.slice(-8) }}</span>
          </div>
          <div class="diff-meta">
            <span>{{ fmtMs(traceB.metadata.durationMs) }}</span>
            <span>{{ fmtUsd(traceB.metadata.costUsd) }}</span>
            <span>{{ fmtN(traceB.usage.inputTokens) }} in / {{ fmtN(traceB.usage.outputTokens) }} out</span>
          </div>
        </div>
      </div>

      <div class="diff-rows">
        <div v-for="r in rows" :key="r.i" class="diff-row">
          <div class="diff-cell" :class="{ changed: r.changed, missing: r.textA === undefined }">
            <div v-if="r.roleA" class="role">{{ r.roleA }}</div>
            <div class="text">{{ r.textA ?? "—" }}</div>
          </div>
          <div class="diff-cell" :class="{ changed: r.changed, missing: r.textB === undefined }">
            <div v-if="r.roleB" class="role">{{ r.roleB }}</div>
            <div class="text">{{ r.textB ?? "—" }}</div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.diff-page { height: 100%; overflow-y: auto; background: var(--bg-1); color: var(--text-0); font-family: var(--font-sans); font-size: 13px; }
.diff-top {
  display: flex; align-items: center; gap: 16px;
  padding: 0 20px; height: 52px;
  border-bottom: 1px solid var(--border-0);
}
.back { display: flex; align-items: center; gap: 4px; color: var(--text-2); font-size: 12px; }
.back:hover { color: var(--text-0); }
.back-chevron { transform: rotate(90deg); }
.diff-title { display: flex; align-items: center; gap: 6px; font-weight: 600; font-size: 14px; }

.diff-cols { display: grid; grid-template-columns: 1fr 1fr; border-bottom: 1px solid var(--border-0); }
.diff-col { padding: 14px 20px; border-right: 1px solid var(--border-0); }
.diff-col:last-child { border-right: 0; }
.diff-col-head { display: flex; align-items: center; gap: 8px; }
.diff-col-head .model { font-family: var(--font-mono); font-size: 12px; }
.diff-col-head .id { font-family: var(--font-mono); font-size: 10px; color: var(--text-3); }
.diff-meta { display: flex; gap: 12px; margin-top: 6px; font-family: var(--font-mono); font-size: 11px; color: var(--text-2); }

.prov {
  display: inline-flex; align-items: center; gap: 4px;
  font-family: var(--font-mono); font-size: 10px;
  padding: 2px 6px; border-radius: 3px; text-transform: lowercase;
}
.prov::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
.prov-anthropic { color: var(--provider-anthropic); background: var(--provider-anthropic-bg); }
.prov-openai    { color: var(--provider-openai);    background: var(--provider-openai-bg); }
.prov-vercel-ai { color: var(--provider-vercel);    background: var(--provider-vercel-bg); }

.diff-rows { display: flex; flex-direction: column; }
.diff-row { display: grid; grid-template-columns: 1fr 1fr; border-bottom: 1px solid var(--border-0); }
.diff-cell { padding: 10px 20px; border-right: 1px solid var(--border-0); white-space: pre-wrap; font-size: 12px; line-height: 1.5; }
.diff-cell:last-child { border-right: 0; }
.diff-cell .role { font-family: var(--font-mono); font-size: 10px; text-transform: uppercase; color: var(--text-2); margin-bottom: 4px; }
.diff-cell.changed { background: oklch(0.78 0.15 70 / 0.08); }
.diff-cell.missing { background: oklch(0.68 0.20 25 / 0.06); color: var(--text-3); }
</style>
