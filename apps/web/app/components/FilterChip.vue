<script setup lang="ts">
export interface FilterOption {
  id: string;
  label?: string;
  divider?: boolean;
  swatch?: string;
  dot?: "ok" | "warn" | "err";
  hint?: string;
}

const props = withDefaults(defineProps<{
  label?: string;
  icon?: string;
  value: string;
  defaultValue: string;
  options: FilterOption[];
  align?: "left" | "right";
  width?: number;
}>(), {
  align: "left",
});

const emit = defineEmits<{ change: [value: string] }>();

const open = ref(false);
const wrapRef = ref<HTMLElement | null>(null);

const current = computed(() => props.options.find(o => o.id === props.value) ?? props.options[0]);
const active = computed(() => props.value !== props.defaultValue);

function select(id: string) {
  emit("change", id);
  open.value = false;
}

function onDoc(e: MouseEvent) {
  if (wrapRef.value && !wrapRef.value.contains(e.target as Node)) open.value = false;
}
function onKey(e: KeyboardEvent) {
  if (e.key === "Escape") open.value = false;
}

watch(open, (v) => {
  if (v) {
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
  } else {
    document.removeEventListener("mousedown", onDoc);
    document.removeEventListener("keydown", onKey);
  }
});

onUnmounted(() => {
  document.removeEventListener("mousedown", onDoc);
  document.removeEventListener("keydown", onKey);
});
</script>

<template>
  <div class="chip-wrap" ref="wrapRef">
    <button
      type="button"
      class="chip"
      :class="{ active, open }"
      :aria-haspopup="true"
      :aria-expanded="open"
      @click="open = !open"
    >
      <AppIcon v-if="icon" :name="icon" :size="11" />
      <span v-if="label" style="color:var(--text-2)">{{ label }}:</span>
      <span>{{ current?.label }}</span>
      <span class="chip-caret"><AppIcon name="chevron-down" :size="10" /></span>
    </button>

    <Transition name="menu">
      <div
        v-if="open"
        class="menu"
        :class="`menu-${align}`"
        :style="width ? { minWidth: width + 'px' } : undefined"
        role="listbox"
      >
        <template v-for="opt in options" :key="opt.id">
          <div v-if="opt.divider" class="menu-divider" />
          <div
            v-else
            class="menu-item"
            :class="{ selected: opt.id === value }"
            role="option"
            :aria-selected="opt.id === value"
            @click="select(opt.id)"
          >
            <span v-if="opt.swatch" :class="`menu-swatch prov prov-${opt.swatch}`" />
            <span v-else-if="opt.dot" :class="`menu-dot ${opt.dot}`" />
            <span v-else class="menu-spacer" />
            <span class="menu-label">{{ opt.label }}</span>
            <span v-if="opt.hint" class="menu-hint">{{ opt.hint }}</span>
            <span class="menu-check">
              <AppIcon v-if="opt.id === value" name="x" :size="11" style="color:var(--accent)" />
            </span>
          </div>
        </template>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.chip-wrap {
  position: relative;
  display: inline-flex;
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 8px;
  border-radius: 4px;
  background: var(--bg-2);
  border: 1px solid var(--border-1);
  color: var(--text-1);
  font-size: 12px;
  cursor: pointer;
  height: 24px;
  white-space: nowrap;
}
.chip :deep(svg) { opacity: 0.7; }
.chip:hover { color: var(--text-0); border-color: var(--border-2); }
.chip.active { background: var(--accent-bg); border-color: var(--accent-border); color: var(--accent); }
.chip.open { background: var(--bg-3); border-color: var(--border-2); color: var(--text-0); }

.chip-caret {
  display: inline-flex;
  margin-left: 1px;
  color: var(--text-3);
  transition: transform 120ms ease;
}
.chip.open .chip-caret { transform: rotate(180deg); color: var(--text-1); }

.menu {
  position: absolute;
  top: calc(100% + 4px);
  z-index: 50;
  background: var(--bg-1);
  border: 1px solid var(--border-2);
  border-radius: var(--radius-md);
  box-shadow:
    0 1px 0 0 rgba(255,255,255,0.04) inset,
    0 8px 24px -4px rgba(0,0,0,0.45),
    0 2px 6px -2px rgba(0,0,0,0.35);
  padding: 4px;
  min-width: 160px;
  font-size: 12px;
}
[data-theme="light"] .menu {
  box-shadow:
    0 8px 24px -4px rgba(15,23,42,0.12),
    0 2px 6px -2px rgba(15,23,42,0.08);
}
.menu-left  { left: 0; }
.menu-right { right: 0; }

.menu-enter-active { transition: opacity 80ms ease-out, transform 80ms ease-out; }
.menu-enter-from  { opacity: 0; transform: translateY(-2px); }
.menu-leave-active { transition: opacity 60ms ease-in; }
.menu-leave-to    { opacity: 0; }

.menu-item {
  display: grid;
  grid-template-columns: 14px 1fr auto 14px;
  align-items: center;
  gap: 8px;
  padding: 5px 8px;
  border-radius: 4px;
  color: var(--text-1);
  cursor: pointer;
  white-space: nowrap;
  user-select: none;
}
.menu-item:hover { background: var(--bg-2); color: var(--text-0); }
.menu-item.selected { color: var(--text-0); }
.menu-item.selected .menu-label { color: var(--accent); }

.menu-spacer { width: 8px; }

.menu-swatch {
  width: 8px !important;
  height: 8px !important;
  border-radius: 2px !important;
  padding: 0 !important;
  border: 0 !important;
  display: inline-block;
  flex-shrink: 0;
}
.menu-swatch::before { display: none; }

.menu-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--text-3);
  flex-shrink: 0;
}
.menu-dot.ok   { background: oklch(0.72 0.14 155); }
.menu-dot.warn { background: oklch(0.78 0.15 70); }
.menu-dot.err  { background: oklch(0.68 0.18 25); }

.menu-label { grid-column: 2; }
.menu-hint {
  color: var(--text-3);
  font-size: 11px;
  font-family: var(--font-mono);
}
.menu-check {
  width: 14px;
  display: inline-flex;
  justify-content: flex-end;
}

.menu-divider {
  height: 1px;
  background: var(--border-0);
  margin: 4px 2px;
}
</style>
