<script setup lang="ts">
const { notice } = useDemoGuard();

let hideTimer: ReturnType<typeof setTimeout> | undefined;
watch(notice, (val) => {
  clearTimeout(hideTimer);
  if (val) hideTimer = setTimeout(() => (notice.value = null), 5000);
});
onBeforeUnmount(() => clearTimeout(hideTimer));
</script>

<template>
  <Transition name="demo-notice">
    <div v-if="notice" class="demo-notice" role="status">
      <span class="demo-tag">Demo</span>
      <span class="demo-text">{{ notice }}</span>
      <button class="demo-close" aria-label="Dismiss" @click="notice = null">×</button>
    </div>
  </Transition>
</template>

<style scoped>
.demo-notice {
  position: fixed;
  bottom: 24px; left: 50%;
  transform: translateX(-50%);
  z-index: 1000;
  display: flex; align-items: center; gap: 10px;
  max-width: min(560px, calc(100vw - 32px));
  padding: 10px 12px;
  background: var(--bg-2);
  border: 1px solid var(--accent-border);
  border-radius: var(--radius-md);
  box-shadow: 0 8px 24px rgb(0 0 0 / 0.25);
  color: var(--text-1);
  font-size: 12.5px;
  line-height: 1.4;
}
.demo-tag {
  flex-shrink: 0;
  padding: 2px 6px;
  border-radius: var(--radius-sm);
  background: var(--accent-bg);
  color: var(--accent);
  font-family: var(--font-mono);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.demo-close {
  flex-shrink: 0;
  background: none; border: 0;
  color: var(--text-3);
  font-size: 16px; line-height: 1;
  cursor: pointer;
}
.demo-close:hover { color: var(--text-0); }
.demo-notice-enter-active, .demo-notice-leave-active { transition: opacity 0.15s, transform 0.15s; }
.demo-notice-enter-from, .demo-notice-leave-to { opacity: 0; transform: translate(-50%, 8px); }
</style>
