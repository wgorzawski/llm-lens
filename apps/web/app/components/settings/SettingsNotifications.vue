<script setup lang="ts">
const { me, updatePreferences } = useMe();
const { apiFetch } = useApiFetch();
const toast = useToast();

// What the server can send: e-mail needs SMTP, alerts are off on the public demo.
const capabilities = ref<{ email: boolean; alerts: boolean }>({ email: true, alerts: true });
onMounted(async () => {
  try {
    capabilities.value = await apiFetch("/users/me/notifications/capabilities");
  } catch { /* keep defaults */ }
});

const savedNotifs = (me.value?.preferences?.notifications as Record<string, boolean>) || {};
const notifs = reactive({
  digestDaily: savedNotifs.digestDaily ?? true,
  digestWeekly: savedNotifs.digestWeekly ?? false,
  alertErr: savedNotifs.alertErr ?? true,
  alertLatency: savedNotifs.alertLatency ?? true,
  alertCost: savedNotifs.alertCost ?? true,
});

async function toggleNotif(key: keyof typeof notifs) {
  notifs[key] = !notifs[key];
  try {
    await updatePreferences({ notifications: { ...notifs } });
    toast.success("Notification settings saved");
  } catch (err) {
    notifs[key] = !notifs[key]; // revert the switch
    toast.error(err);
  }
}

// ── thresholds ───────────────────────────────────────────────────────────────
const savedThresholds = (me.value?.preferences?.alertThresholds as Record<string, number> | undefined) ?? {};
const thresholds = reactive({
  errorRatePct: savedThresholds.errorRatePct ?? 5,
  latencyP95S: (savedThresholds.latencyP95Ms ?? 5000) / 1000,
  dailyCostUsd: savedThresholds.dailyCostUsd ?? 50,
});
const thresholdsSaving = ref(false);
async function saveThresholds() {
  const errorRatePct = Number(thresholds.errorRatePct);
  const latencyP95S = Number(thresholds.latencyP95S);
  const dailyCostUsd = Number(thresholds.dailyCostUsd);
  if (!(errorRatePct > 0 && errorRatePct <= 100) || !(latencyP95S > 0) || !(dailyCostUsd >= 0)) {
    toast.error("Thresholds must be positive numbers (error rate up to 100%)");
    return;
  }
  thresholdsSaving.value = true;
  try {
    await updatePreferences({ alertThresholds: { errorRatePct, latencyP95Ms: Math.round(latencyP95S * 1000), dailyCostUsd } });
    toast.success("Alert thresholds saved");
  } catch (err) {
    toast.error(err);
  } finally {
    thresholdsSaving.value = false;
  }
}

// ── channels ─────────────────────────────────────────────────────────────────
type Channel = "slack" | "pagerduty" | "webhook" | "email";
const prefKey: Record<Exclude<Channel, "email">, string> = {
  slack: "slackWebhookUrl",
  pagerduty: "pagerdutyKey",
  webhook: "outboundWebhookUrl",
};
const channelLabel: Record<Channel, string> = { slack: "Slack", pagerduty: "PagerDuty", webhook: "Webhook", email: "E-mail" };

const values = reactive({
  slack: (me.value?.preferences?.slackWebhookUrl as string) || "",
  pagerduty: (me.value?.preferences?.pagerdutyKey as string) || "",
  webhook: (me.value?.preferences?.outboundWebhookUrl as string) || "",
});
const saved = reactive({ ...values });
const saving = reactive<Record<string, boolean>>({});
const testing = reactive<Record<string, boolean>>({});

async function saveChannel(ch: Exclude<Channel, "email">) {
  const value = values[ch].trim();
  if (value && ch !== "pagerduty" && !/^https:\/\//.test(value)) {
    toast.error(`${channelLabel[ch]} URL must start with https://`);
    return;
  }
  saving[ch] = true;
  try {
    await updatePreferences({ [prefKey[ch]]: value });
    saved[ch] = value;
    toast.success(value ? `${channelLabel[ch]} connected` : `${channelLabel[ch]} disconnected`);
  } catch (err) {
    toast.error(err);
  } finally {
    saving[ch] = false;
  }
}

async function disconnect(ch: Exclude<Channel, "email">) {
  values[ch] = "";
  await saveChannel(ch);
}

async function sendTest(ch: Channel) {
  testing[ch] = true;
  try {
    await apiFetch("/users/me/notifications/test", { method: "POST", body: { channel: ch } });
    toast.success(`Test sent to ${channelLabel[ch]}`);
  } catch (err) {
    toast.error(err, `Couldn't deliver to ${channelLabel[ch]}`);
  } finally {
    testing[ch] = false;
  }
}
</script>

<template>
  <div v-if="!capabilities.alerts" class="set-note">
    Alerts and digests are turned off on the public demo.
  </div>

  <section class="set-section">
    <div class="set-section-head"><div>
      <div class="set-section-title">Email digests</div>
      <div class="set-section-sub">
        Sent to {{ me?.email }}.
        <template v-if="!capabilities.email"> E-mail isn't configured on this server (SMTP) - digests are skipped.</template>
      </div>
    </div></div>
    <div class="set-section-body">
      <div class="set-row">
        <div class="set-row-label">
          <div class="set-row-label-text">Daily summary</div>
          <div class="set-row-hint">Last 24 hours of production traffic: calls, failures, cost, latency and the busiest features - at 8:00 in your timezone.</div>
        </div>
        <div class="set-row-control">
          <button class="toggle" :class="{ on: notifs.digestDaily }" role="switch" @click="toggleNotif('digestDaily')"><span class="thumb" /></button>
        </div>
      </div>
      <div class="set-row">
        <div class="set-row-label">
          <div class="set-row-label-text">Weekly recap</div>
          <div class="set-row-hint">Friday 17:00 - the same numbers for the last 7 days, compared with the week before.</div>
        </div>
        <div class="set-row-control">
          <button class="toggle" :class="{ on: notifs.digestWeekly }" role="switch" @click="toggleNotif('digestWeekly')"><span class="thumb" /></button>
        </div>
      </div>
      <div v-if="capabilities.email" class="set-row">
        <div class="set-row-label"><div class="set-row-label-text">Test e-mail</div></div>
        <div class="set-row-control">
          <button class="s-btn" :disabled="testing.email" @click="sendTest('email')">Send test</button>
        </div>
      </div>
    </div>
  </section>

  <section class="set-section">
    <div class="set-section-head"><div>
      <div class="set-section-title">Alerts</div>
      <div class="set-section-sub">
        Sent by e-mail and to every connected integration below when production traces (env "production" or none) cross a threshold.
        Checked every 5 minutes; each alert fires at most once an hour.
      </div>
    </div></div>
    <div class="set-section-body">
      <div class="set-row">
        <div class="set-row-label">
          <div class="set-row-label-text">Error rate spike</div>
          <div class="set-row-hint">When at least this share of calls failed in the last 10 minutes (10+ calls).</div>
        </div>
        <div class="set-row-control" style="gap:8px">
          <div class="field-input num"><input v-model="thresholds.errorRatePct" type="number" min="1" max="100" step="1" ><span>%</span></div>
          <button class="toggle" :class="{ on: notifs.alertErr }" role="switch" @click="toggleNotif('alertErr')"><span class="thumb" /></button>
        </div>
      </div>
      <div class="set-row">
        <div class="set-row-label">
          <div class="set-row-label-text">P95 latency</div>
          <div class="set-row-hint">When p95 latency over the last 15 minutes is above this (10+ calls).</div>
        </div>
        <div class="set-row-control" style="gap:8px">
          <div class="field-input num"><input v-model="thresholds.latencyP95S" type="number" min="0.1" step="0.5" ><span>s</span></div>
          <button class="toggle" :class="{ on: notifs.alertLatency }" role="switch" @click="toggleNotif('alertLatency')"><span class="thumb" /></button>
        </div>
      </div>
      <div class="set-row">
        <div class="set-row-label">
          <div class="set-row-label-text">Cost ceiling</div>
          <div class="set-row-hint">When today's spend (UTC) reaches this amount - once a day.</div>
        </div>
        <div class="set-row-control" style="gap:8px">
          <div class="field-input num"><span>$</span><input v-model="thresholds.dailyCostUsd" type="number" min="0" step="1" ></div>
          <button class="toggle" :class="{ on: notifs.alertCost }" role="switch" @click="toggleNotif('alertCost')"><span class="thumb" /></button>
        </div>
      </div>
      <div class="set-row">
        <div class="set-row-label"><div class="set-row-label-text">Thresholds</div></div>
        <div class="set-row-control">
          <button class="s-btn primary" :disabled="thresholdsSaving" @click="saveThresholds">{{ thresholdsSaving ? "Saving…" : "Save thresholds" }}</button>
        </div>
      </div>
    </div>
  </section>

  <section class="set-section">
    <div class="set-section-head"><div><div class="set-section-title">Integrations</div></div></div>
    <div class="set-section-body">
      <div class="set-row">
        <div class="set-row-label">
          <div class="set-row-label-text">Slack</div>
          <div class="set-row-hint">{{ saved.slack ? 'Alerts are posted to your Slack channel.' : 'Paste a Slack incoming webhook URL to get alerts in Slack.' }}</div>
        </div>
        <div class="set-row-control" style="gap:8px">
          <span v-if="saved.slack" class="kpill ok"><span class="dot ok" /> connected</span>
          <div class="field-input"><input v-model="values.slack" type="text" placeholder="https://hooks.slack.com/services/…" class="mono" ></div>
          <button class="s-btn" :disabled="saving.slack" @click="saveChannel('slack')">{{ saving.slack ? "Saving…" : "Save" }}</button>
          <button v-if="saved.slack" class="s-btn" :disabled="testing.slack" @click="sendTest('slack')">Send test</button>
          <button v-if="saved.slack" class="s-btn danger" @click="disconnect('slack')">Disconnect</button>
        </div>
      </div>
      <div class="set-row">
        <div class="set-row-label">
          <div class="set-row-label-text">PagerDuty</div>
          <div class="set-row-hint">Page on-call for alerts (Events API v2 integration key).</div>
        </div>
        <div class="set-row-control" style="gap:8px">
          <span v-if="saved.pagerduty" class="kpill ok"><span class="dot ok" /> connected</span>
          <div class="field-input"><input v-model="values.pagerduty" type="password" placeholder="Integration key" class="mono" ></div>
          <button class="s-btn" :disabled="saving.pagerduty" @click="saveChannel('pagerduty')">{{ saving.pagerduty ? "Saving…" : "Save" }}</button>
          <button v-if="saved.pagerduty" class="s-btn" :disabled="testing.pagerduty" @click="sendTest('pagerduty')">Send test</button>
          <button v-if="saved.pagerduty" class="s-btn danger" @click="disconnect('pagerduty')">Disconnect</button>
        </div>
      </div>
      <div class="set-row">
        <div class="set-row-label">
          <div class="set-row-label-text">Webhook</div>
          <div class="set-row-hint">POSTs <code class="mono">trace.created</code> for every new trace and <code class="mono">alert</code> for alerts.</div>
        </div>
        <div class="set-row-control" style="gap:8px">
          <span v-if="saved.webhook" class="kpill ok"><span class="dot ok" /> connected</span>
          <div class="field-input"><input v-model="values.webhook" type="text" placeholder="https://your-endpoint.com/webhook" class="mono" ></div>
          <button class="s-btn" :disabled="saving.webhook" @click="saveChannel('webhook')">{{ saving.webhook ? "Saving…" : "Save" }}</button>
          <button v-if="saved.webhook" class="s-btn" :disabled="testing.webhook" @click="sendTest('webhook')">Send test</button>
          <button v-if="saved.webhook" class="s-btn danger" @click="disconnect('webhook')">Disconnect</button>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.set-note {
  margin-bottom: 16px; padding: 10px 14px; border: 1px solid var(--border, var(--accent-border));
  border-radius: 8px; color: var(--text-2); font-size: 12px;
}
.field-input.num { display: inline-flex; align-items: center; gap: 4px; width: 96px; }
.field-input.num input { width: 100%; text-align: right; }
.field-input.num span { color: var(--text-3); font-size: 12px; }
</style>
