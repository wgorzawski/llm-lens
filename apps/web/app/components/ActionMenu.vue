<script setup lang="ts">
export interface ActionMenuItem {
  id: string;
  label?: string;
  icon?: string;
  danger?: boolean;
  divider?: boolean;
}

const props = withDefaults(defineProps<{
  items: ActionMenuItem[];
  align?: "left" | "right";
  width?: number;
}>(), {
  align: "right",
});

const emit = defineEmits<{ select: [id: string] }>();

const open = ref(false);
const wrapRef = ref<HTMLElement | null>(null);

function toggle() { open.value = !open.value; }

function select(id: string) {
  emit("select", id);
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
  <div ref="wrapRef" class="am-wrap" @click.stop="toggle">
    <slot />
    <Transition name="am-menu">
      <div
        v-if="open"
        class="am-menu"
        :class="`am-${props.align}`"
        :style="props.width ? { minWidth: props.width + 'px' } : undefined"
        role="menu"
        @click.stop
      >
        <template v-for="it in items" :key="it.id">
          <div v-if="it.divider" class="am-divider" />
          <div
            v-else
            class="am-item"
            :class="{ danger: it.danger }"
            role="menuitem"
            @click="select(it.id)"
          >
            <AppIcon v-if="it.icon" :name="it.icon" :size="12" />
            <span>{{ it.label }}</span>
          </div>
        </template>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.am-wrap { position: relative; display: inline-flex; }

.am-menu {
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
  min-width: 150px;
  font-size: 12px;
}
[data-theme="light"] .am-menu {
  box-shadow:
    0 8px 24px -4px rgba(15,23,42,0.12),
    0 2px 6px -2px rgba(15,23,42,0.08);
}
.am-left  { left: 0; }
.am-right { right: 0; }

.am-menu-enter-active { transition: opacity 80ms ease-out, transform 80ms ease-out; }
.am-menu-enter-from  { opacity: 0; transform: translateY(-2px); }
.am-menu-leave-active { transition: opacity 60ms ease-in; }
.am-menu-leave-to    { opacity: 0; }

.am-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 8px;
  border-radius: 4px;
  color: var(--text-1);
  cursor: pointer;
  white-space: nowrap;
  user-select: none;
}
.am-item:hover { background: var(--bg-2); color: var(--text-0); }
.am-item.danger { color: var(--danger); }
.am-item.danger:hover { background: oklch(0.68 0.20 25 / 0.1); }

.am-divider {
  height: 1px;
  background: var(--border-0);
  margin: 4px 2px;
}
</style>
