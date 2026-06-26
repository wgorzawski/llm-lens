<script setup lang="ts">
const usageBars = [
  { label: "Traces",  value: 32480, max: 50000, unit: "" },
  { label: "Storage", value: 1.4,   max: 5,     unit: "GB" },
  { label: "Members", value: 4,     max: 5,     unit: "seats" },
];

function usageTone(val: number, max: number) {
  const pct = (val / max) * 100;
  if (pct > 90) return "danger";
  if (pct > 70) return "warn";
  return "ok";
}
function usagePct(val: number, max: number) {
  return Math.min(100, Math.round((val / max) * 100)) + "%";
}
</script>

<template>
  <section class="set-section">
    <div class="set-section-head"><div>
      <div class="set-section-title">Plan</div>
      <div class="set-section-sub">You're on the free tier — perfect for indie projects and side gigs.</div>
    </div></div>
    <div class="set-section-body">
      <div class="plan-grid">
        <div class="plan-card current">
          <div class="plan-name">Free</div>
          <div class="plan-price">$0<span>/mo</span></div>
          <ul class="plan-feats">
            <li>50k traces / month</li>
            <li>7-day retention</li>
            <li>5 seats</li>
            <li>Community support</li>
          </ul>
          <button class="s-btn" disabled>Current plan</button>
        </div>
        <div class="plan-card popular">
          <div class="plan-badge">Popular</div>
          <div class="plan-name">Team</div>
          <div class="plan-price">$49<span>/mo</span></div>
          <ul class="plan-feats">
            <li>1M traces / month</li>
            <li>30-day retention</li>
            <li>Unlimited seats</li>
            <li>SSO · audit log</li>
            <li>Email + Slack support</li>
          </ul>
          <button class="s-btn primary">Upgrade to Team</button>
        </div>
        <div class="plan-card">
          <div class="plan-name">Enterprise</div>
          <div class="plan-price">Custom</div>
          <ul class="plan-feats">
            <li>Unlimited traces</li>
            <li>Self-hosted option</li>
            <li>SAML / SCIM</li>
            <li>Custom SLA</li>
            <li>Dedicated CSM</li>
          </ul>
          <button class="s-btn">Talk to sales</button>
        </div>
      </div>
    </div>
  </section>

  <section class="set-section">
    <div class="set-section-head"><div>
      <div class="set-section-title">This billing period</div>
      <div class="set-section-sub">May 1 – May 27, 2026 · resets in 4 days.</div>
    </div></div>
    <div class="set-section-body">
      <div class="usage-grid">
        <div v-for="u in usageBars" :key="u.label" class="usage-row">
          <div class="usage-head">
            <span class="usage-label">{{ u.label }}</span>
            <span class="usage-val mono">
              <span style="color:var(--text-0)">{{ u.value.toLocaleString() }}</span>
              <span style="color:var(--text-3)"> / {{ u.max.toLocaleString() }}{{ u.unit ? ' ' + u.unit : '' }}</span>
            </span>
          </div>
          <div class="usage-track">
            <div class="usage-fill" :class="usageTone(u.value, u.max)" :style="{ width: usagePct(u.value, u.max) }" />
          </div>
        </div>
      </div>
    </div>
  </section>

  <section class="set-section">
    <div class="set-section-head"><div><div class="set-section-title">Payment method</div></div></div>
    <div class="set-section-body">
      <div class="set-row">
        <div class="set-row-label">
          <div class="set-row-label-text">Card on file</div>
          <div class="set-row-hint">No card. Add one to unlock the Team plan.</div>
        </div>
        <div class="set-row-control"><button class="s-btn">+ Add card</button></div>
      </div>
      <div class="set-row">
        <div class="set-row-label"><div class="set-row-label-text">Billing email</div></div>
        <div class="set-row-control"><div class="field-input"><input value="wojtek@example.com" readonly class="mono" ></div></div>
      </div>
      <div class="set-row">
        <div class="set-row-label"><div class="set-row-label-text">Invoices</div></div>
        <div class="set-row-control"><button class="s-btn">View invoices</button></div>
      </div>
    </div>
  </section>
</template>
