<script setup lang="ts">
const { me, updatePreferences } = useMe();

const savedNotifs = (me.value?.preferences?.notifications as Record<string, boolean>) || {};
const notifs = reactive({
  digestDaily: savedNotifs.digestDaily ?? true,
  digestWeekly: savedNotifs.digestWeekly ?? false,
  alertErr: savedNotifs.alertErr ?? true,
  alertLatency: savedNotifs.alertLatency ?? true,
  alertCost: savedNotifs.alertCost ?? true,
  alertReplays: savedNotifs.alertReplays ?? false,
  inAppMentions: savedNotifs.inAppMentions ?? true,
  inAppAssignments: savedNotifs.inAppAssignments ?? true,
});

async function toggleNotif(key: keyof typeof notifs) {
  notifs[key] = !notifs[key];
  await updatePreferences({ notifications: { ...notifs } });
}

const slackWebhookUrl = ref((me.value?.preferences?.slackWebhookUrl as string) || "");
const slackConnected = computed(() => !!slackWebhookUrl.value);
const slackSaving = ref(false);
const slackTestResult = ref<string | null>(null);

async function saveSlackWebhook() {
  slackSaving.value = true;
  slackTestResult.value = null;
  try {
    await updatePreferences({ slackWebhookUrl: slackWebhookUrl.value });
  } finally {
    slackSaving.value = false;
  }
}

async function disconnectSlack() {
  slackWebhookUrl.value = "";
  await updatePreferences({ slackWebhookUrl: "" });
}

async function testSlack() {
  slackTestResult.value = null;
  try {
    const res = await fetch(slackWebhookUrl.value, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "LLM Lens test alert — your Slack integration is working." }),
    });
    slackTestResult.value = res.ok ? "Test message sent." : `Slack responded with ${res.status}`;
  } catch (err) {
    slackTestResult.value = getErrorMessage(err);
  }
}
</script>

<template>
  <section class="set-section">
    <div class="set-section-head"><div>
      <div class="set-section-title">Email digests</div>
      <div class="set-section-sub">Sent to {{ me?.email }}.</div>
    </div></div>
    <div class="set-section-body">
      <div class="set-row">
        <div class="set-row-label">
          <div class="set-row-label-text">Daily summary</div>
          <div class="set-row-hint">Yesterday's trace volume, error rate, and cost — delivered at 8:00 in your timezone.</div>
        </div>
        <div class="set-row-control">
          <button class="toggle" :class="{ on: notifs.digestDaily }" role="switch" @click="toggleNotif('digestDaily')"><span class="thumb" /></button>
        </div>
      </div>
      <div class="set-row">
        <div class="set-row-label">
          <div class="set-row-label-text">Weekly recap</div>
          <div class="set-row-hint">Friday 17:00 — week-over-week trends and the slowest traces.</div>
        </div>
        <div class="set-row-control">
          <button class="toggle" :class="{ on: notifs.digestWeekly }" role="switch" @click="toggleNotif('digestWeekly')"><span class="thumb" /></button>
        </div>
      </div>
    </div>
  </section>

  <section class="set-section">
    <div class="set-section-head"><div>
      <div class="set-section-title">Alerts</div>
      <div class="set-section-sub">We email you (and Slack you, if connected) when production traces breach thresholds.</div>
    </div></div>
    <div class="set-section-body">
      <div class="set-row">
        <div class="set-row-label">
          <div class="set-row-label-text">Error rate spike</div>
          <div class="set-row-hint">When &gt; 5% of traces fail in any 5-minute window.</div>
        </div>
        <div class="set-row-control">
          <button class="toggle" :class="{ on: notifs.alertErr }" role="switch" @click="toggleNotif('alertErr')"><span class="thumb" /></button>
        </div>
      </div>
      <div class="set-row">
        <div class="set-row-label">
          <div class="set-row-label-text">P95 latency</div>
          <div class="set-row-hint">When p95 latency for any model exceeds 5s for 10+ minutes.</div>
        </div>
        <div class="set-row-control">
          <button class="toggle" :class="{ on: notifs.alertLatency }" role="switch" @click="toggleNotif('alertLatency')"><span class="thumb" /></button>
        </div>
      </div>
      <div class="set-row">
        <div class="set-row-label">
          <div class="set-row-label-text">Cost ceiling</div>
          <div class="set-row-hint">Alert at <code class="mono">$50/day</code> for production.</div>
        </div>
        <div class="set-row-control">
          <button class="toggle" :class="{ on: notifs.alertCost }" role="switch" @click="toggleNotif('alertCost')"><span class="thumb" /></button>
        </div>
      </div>
      <div class="set-row">
        <div class="set-row-label">
          <div class="set-row-label-text">Replay completion</div>
          <div class="set-row-hint">When a replay batch finishes or fails.</div>
        </div>
        <div class="set-row-control">
          <button class="toggle" :class="{ on: notifs.alertReplays }" role="switch" @click="toggleNotif('alertReplays')"><span class="thumb" /></button>
        </div>
      </div>
    </div>
  </section>

  <section class="set-section">
    <div class="set-section-head"><div><div class="set-section-title">In-app notifications</div></div></div>
    <div class="set-section-body">
      <div class="set-row">
        <div class="set-row-label"><div class="set-row-label-text">@mentions</div></div>
        <div class="set-row-control">
          <button class="toggle" :class="{ on: notifs.inAppMentions }" role="switch" @click="toggleNotif('inAppMentions')"><span class="thumb" /></button>
        </div>
      </div>
      <div class="set-row">
        <div class="set-row-label"><div class="set-row-label-text">Annotation assignments</div></div>
        <div class="set-row-control">
          <button class="toggle" :class="{ on: notifs.inAppAssignments }" role="switch" @click="toggleNotif('inAppAssignments')"><span class="thumb" /></button>
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
          <div class="set-row-hint">{{ slackConnected ? 'Incoming webhook configured.' : 'Paste a Slack incoming webhook URL to connect.' }}</div>
        </div>
        <div class="set-row-control" style="gap:8px">
          <span v-if="slackConnected" class="kpill ok"><span class="dot ok" /> connected</span>
          <div class="field-input"><input v-model="slackWebhookUrl" type="text" placeholder="https://hooks.slack.com/services/…" class="mono" ></div>
          <button class="s-btn" :disabled="slackSaving" @click="saveSlackWebhook">{{ slackSaving ? "Saving…" : "Save" }}</button>
          <button v-if="slackConnected" class="s-btn" @click="testSlack">Send test</button>
          <button v-if="slackConnected" class="s-btn danger" @click="disconnectSlack">Disconnect</button>
        </div>
      </div>
      <div v-if="slackTestResult" class="set-row-hint" style="padding:0 20px 12px">{{ slackTestResult }}</div>
      <div class="set-row">
        <div class="set-row-label">
          <div class="set-row-label-text">PagerDuty <span class="cs-badge">coming soon</span></div>
          <div class="set-row-hint">Page on-call for production alerts.</div>
        </div>
        <div class="set-row-control"><button class="s-btn" disabled>Connect PagerDuty</button></div>
      </div>
      <div class="set-row">
        <div class="set-row-label">
          <div class="set-row-label-text">Webhook</div>
          <div class="set-row-hint">POST notifications to your endpoint.</div>
        </div>
        <div class="set-row-control">
          <div class="static-val mono">https://hooks.example.com/llmlens</div>
        </div>
      </div>
    </div>
  </section>
</template>
