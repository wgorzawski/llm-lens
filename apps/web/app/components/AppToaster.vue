<script setup lang="ts">
const { toasts, dismiss } = useToast();

const ICONS: Record<string, string> = { success: "✓", error: "!", info: "i" };
</script>

<template>
  <div class="toaster" aria-live="polite">
    <TransitionGroup name="toast">
      <div
        v-for="t in toasts"
        :key="t.id"
        class="toast"
        :class="t.kind"
        :role="t.kind === 'error' ? 'alert' : 'status'"
      >
        <span v-if="t.tag" class="toast-tag">{{ t.tag }}</span>
        <span v-else class="toast-icon">{{ ICONS[t.kind] }}</span>
        <span class="toast-text">{{ t.message }}</span>
        <button class="toast-close" aria-label="Dismiss" @click="dismiss(t.id)">×</button>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.toaster {
  position: fixed;
  right: 20px; bottom: 20px;
  z-index: 1000;
  display: flex; flex-direction: column; align-items: flex-end; gap: 8px;
  pointer-events: none;
}
.toast {
  pointer-events: auto;
  display: flex; align-items: center; gap: 10px;
  max-width: min(420px, calc(100vw - 32px));
  padding: 9px 10px 9px 12px;
  background: var(--bg-2);
  border: 1px solid var(--border-1);
  border-left-width: 3px;
  border-radius: var(--radius-md);
  box-shadow: 0 8px 24px rgb(0 0 0 / 0.25);
  color: var(--text-0);
  font-size: 12.5px;
  line-height: 1.4;
}
.toast.success { border-left-color: var(--success); }
.toast.error   { border-left-color: var(--danger); }
.toast.info    { border-left-color: var(--accent); }

.toast-icon {
  flex-shrink: 0;
  width: 16px; height: 16px;
  display: grid; place-items: center;
  border-radius: 50%;
  font-size: 10px; font-weight: 700;
  color: #fff;
}
.success .toast-icon { background: var(--success); }
.error .toast-icon   { background: var(--danger); }
.info .toast-icon    { background: var(--accent); font-family: var(--font-mono); }

.toast-tag {
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
.toast-text { flex: 1; min-width: 0; }
.toast-close {
  flex-shrink: 0;
  background: none; border: 0;
  color: var(--text-3);
  font-size: 16px; line-height: 1;
  cursor: pointer;
}
.toast-close:hover { color: var(--text-0); }

.toast-enter-active, .toast-leave-active { transition: opacity 0.15s, transform 0.15s; }
.toast-enter-from, .toast-leave-to { opacity: 0; transform: translateY(8px); }
.toast-move { transition: transform 0.15s; }

@media (max-width: 640px) {
  .toaster { left: 16px; right: 16px; bottom: 16px; align-items: stretch; }
  .toast { max-width: none; }
}
</style>
