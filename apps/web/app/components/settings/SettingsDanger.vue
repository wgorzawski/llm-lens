<script setup lang="ts">
const { org } = useOrg();
const orgSlug = computed(() => org.value?.slug ?? "");
</script>

<template>
  <section class="set-section">
    <div class="set-section-head"><div>
      <div class="set-section-title">Danger zone</div>
      <div class="set-section-sub">These actions are permanent. They cannot be undone.</div>
    </div></div>
    <div class="set-section-body">
      <div class="danger-row">
        <div>
          <div class="danger-title">Transfer ownership</div>
          <div class="danger-sub">Hand the organization off to another admin. You'll be demoted to Member.</div>
        </div>
        <button class="s-btn">Transfer…</button>
      </div>
      <div class="danger-row">
        <div>
          <div class="danger-title">Wipe all traces</div>
          <div class="danger-sub">Delete every trace, replay, and annotation across all environments. Aggregates and keys are preserved.</div>
        </div>
        <button class="s-btn danger">Wipe traces…</button>
      </div>
      <div class="danger-row">
        <div>
          <div class="danger-title">Delete organization</div>
          <div class="danger-sub">Permanently delete {{ orgSlug }} and every member's access. We'll email a 30-day grace-period notice first.</div>
        </div>
        <button class="s-btn danger">Delete organization…</button>
      </div>
    </div>
  </section>
</template>
