<script setup lang="ts">
const { token } = useAuth();
const { org, updateOrg } = useOrg();

const retention = ref(org.value?.retentionDays ?? 7);
const savingRetention = ref(false);
const maskPII = ref(true);
const shareData = ref(false);

async function setRetention(days: number) {
  savingRetention.value = true;
  try {
    const updated = await updateOrg({ retentionDays: days });
    retention.value = updated.retentionDays;
  } finally {
    savingRetention.value = false;
  }
}

async function downloadTracesExport() {
  const res = await fetch(`${useRuntimeConfig().public.apiBase}/export/traces`, {
    headers: { Authorization: `Bearer ${token.value}` },
  });
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "traces.jsonl.gz";
  a.click();
  URL.revokeObjectURL(url);
}

async function downloadUsageExport() {
  const res = await fetch(`${useRuntimeConfig().public.apiBase}/export/usage`, {
    headers: { Authorization: `Bearer ${token.value}` },
  });
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "usage.csv";
  a.click();
  URL.revokeObjectURL(url);
}
</script>

<template>
  <section class="set-section">
    <div class="set-section-head"><div>
      <div class="set-section-title">Retention</div>
      <div class="set-section-sub">How long we keep your trace payloads. Aggregates and metrics are kept forever.</div>
    </div></div>
    <div class="set-section-body">
      <div class="set-row">
        <div class="set-row-label">
          <div class="set-row-label-text">Trace retention</div>
          <div class="set-row-hint">Free tier allows up to 7 days. Team allows 30, Enterprise up to 365.</div>
        </div>
        <div class="set-row-control">
          <div class="segmented">
            <button :class="{ active: retention === 1 }" :disabled="savingRetention" @click="setRetention(1)">1 day</button>
            <button :class="{ active: retention === 7 }" :disabled="savingRetention" @click="setRetention(7)">7 days</button>
            <button style="opacity:0.45" disabled>30 days</button>
            <button style="opacity:0.45" disabled>365 days</button>
          </div>
        </div>
      </div>
      <div class="set-row">
        <div class="set-row-label">
          <div class="set-row-label-text">PII masking</div>
          <div class="set-row-hint">Automatically redact emails, phone numbers, and credit cards in trace payloads.</div>
        </div>
        <div class="set-row-control">
          <button class="toggle" :class="{ on: maskPII }" role="switch" @click="maskPII = !maskPII"><span class="thumb" /></button>
        </div>
      </div>
      <div class="set-row">
        <div class="set-row-label">
          <div class="set-row-label-text">Share anonymized data with Anthropic & OpenAI</div>
          <div class="set-row-hint">Helps improve provider models. We never share keys or message bodies.</div>
        </div>
        <div class="set-row-control">
          <button class="toggle" :class="{ on: shareData }" role="switch" @click="shareData = !shareData"><span class="thumb" /></button>
        </div>
      </div>
    </div>
  </section>

  <section class="set-section">
    <div class="set-section-head"><div>
      <div class="set-section-title">Export</div>
      <div class="set-section-sub">Download your data at any time.</div>
    </div></div>
    <div class="set-section-body">
      <div class="set-row">
        <div class="set-row-label">
          <div class="set-row-label-text">Export all traces</div>
          <div class="set-row-hint">JSON Lines · gzipped · split by day.</div>
        </div>
        <div class="set-row-control"><button class="s-btn" @click="downloadTracesExport">Request export</button></div>
      </div>
      <div class="set-row">
        <div class="set-row-label">
          <div class="set-row-label-text">Export usage report</div>
          <div class="set-row-hint">Daily usage and cost summary as CSV.</div>
        </div>
        <div class="set-row-control"><button class="s-btn" @click="downloadUsageExport">Download CSV</button></div>
      </div>
    </div>
  </section>
</template>
