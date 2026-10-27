<script setup lang="ts">
const { token } = useAuth();
const { org, updateOrg } = useOrg();
const { me, updatePreferences } = useMe();

const retention = ref(org.value?.retentionDays ?? 7);
watch(() => org.value?.retentionDays, (days) => { if (days !== undefined) retention.value = days; });
const savingRetention = ref(false);
const toast = useToast();
function savePreference(update: Record<string, unknown>, message: string) {
  updatePreferences(update).then(() => toast.success(message)).catch((err: unknown) => toast.error(err));
}

const maskPII = computed({
  get: () => (me.value?.preferences?.maskPII as boolean | undefined) ?? false,
  set: (val: boolean) => savePreference({ maskPII: val }, val ? "PII masking turned on" : "PII masking turned off"),
});

const { blockedInDemo } = useDemoGuard();

async function setRetention(days: number) {
  if (blockedInDemo()) return;
  savingRetention.value = true;
  try {
    const updated = await updateOrg({ retentionDays: days });
    retention.value = updated.retentionDays;
    toast.success(days === 0 ? "Traces are now kept forever" : `Traces are now kept for ${days} ${days === 1 ? "day" : "days"}`);
  } catch (err) {
    toast.error(err);
  } finally {
    savingRetention.value = false;
  }
}

async function downloadTracesExport() {
  try {
    const res = await fetch(`${useRuntimeConfig().public.apiBase}/export/traces`, {
      headers: { Authorization: `Bearer ${token.value}` },
    });
    if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Export failed");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "traces.jsonl.gz";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Traces export downloaded");
  } catch (err) {
    toast.error(err);
  }
}

async function downloadUsageExport() {
  try {
    const res = await fetch(`${useRuntimeConfig().public.apiBase}/export/usage`, {
      headers: { Authorization: `Bearer ${token.value}` },
    });
    if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Export failed");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "usage.csv";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Usage report downloaded");
  } catch (err) {
    toast.error(err);
  }
}
</script>

<template>
  <section class="set-section">
    <div class="set-section-head"><div>
      <div class="set-section-title">Retention</div>
      <div class="set-section-sub">How long traces are kept. Dashboards are computed from stored traces.</div>
    </div></div>
    <div class="set-section-body">
      <div class="set-row">
        <div class="set-row-label">
          <div class="set-row-label-text">Trace retention</div>
          <div class="set-row-hint">Traces older than this are deleted once a day.</div>
        </div>
        <div class="set-row-control">
          <div class="segmented">
            <button :class="{ active: retention === 1 }" :disabled="savingRetention" @click="setRetention(1)">1 day</button>
            <button :class="{ active: retention === 7 }" :disabled="savingRetention" @click="setRetention(7)">7 days</button>
            <button :class="{ active: retention === 30 }" :disabled="savingRetention" @click="setRetention(30)">30 days</button>
            <button :class="{ active: retention === 365 }" :disabled="savingRetention" @click="setRetention(365)">365 days</button>
            <button :class="{ active: retention === 0 }" :disabled="savingRetention" @click="setRetention(0)">Forever</button>
          </div>
        </div>
      </div>
      <div class="set-row">
        <div class="set-row-label">
          <div class="set-row-label-text">PII masking</div>
          <div class="set-row-hint">Replace e-mails, phone numbers and card numbers with placeholders in new traces, before they are stored.</div>
        </div>
        <div class="set-row-control">
          <button class="toggle" :class="{ on: maskPII }" role="switch" @click="maskPII = !maskPII as boolean"><span class="thumb" /></button>
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
