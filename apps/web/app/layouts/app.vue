<script setup lang="ts">
const { logout, token } = useAuth();
const { me, fetchMe } = useMe();
if (!me.value) await fetchMe();
const route = useRoute();

const collapsed = useState('sidebar-collapsed', () => false);
const traceCount = useState("trace-count", () => 0);

const userName = computed<string>(() => {
  if (!token.value) return "user";
  try {
    const payload = JSON.parse(atob(token.value.split(".")[1]!));
    return (payload.email as string).split("@")[0] ?? "user";
  } catch { return "user"; }
});

const activeItem = computed(() => {
  if (route.path === "/keys") return "keys";
  if (route.path === "/settings") return "settings";
  if (route.path === "/traces/diff") return "compare";
  return "traces";
});

function fmtN(n: number) {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

const sidebarItems1 = [
  { id: "traces",  label: "Traces",         icon: "activity", to: "/" },
  { id: "compare", label: "Compare & diff", icon: "diff",     to: "/traces/diff" },
] as const;

const sidebarItems2 = [
  { id: "keys",     label: "API keys", icon: "key",      to: "/keys" },
  { id: "settings", label: "Settings", icon: "settings", to: "/settings" },
] as const;

function onItemClick(to: string | null) {
  if (to) navigateTo(to);
}
</script>

<template>
  <div class="app" :class="{ collapsed }">

    <!-- ══════════════════════ SIDEBAR ══════════════════════ -->
    <aside class="sidebar">
      <div class="sb-brand">
        <div class="sb-logo"><AppIcon name="logo" :size="14" /></div>
        <template v-if="!collapsed">
          <div class="sb-name">LLM Lens</div>
          <div class="sb-env">prod</div>
        </template>
      </div>

      <div class="sb-section">
        <div v-if="!collapsed" class="sb-section-label">Observe</div>
        <div
          v-for="it in sidebarItems1" :key="it.id"
          class="sb-item"
          :class="{ active: activeItem === it.id, stub: !it.to }"
          :title="collapsed ? it.label : undefined"
          @click="onItemClick(it.to)"
        >
          <AppIcon :name="it.icon" :size="14" />
          <template v-if="!collapsed">
            <span>{{ it.label }}</span>
            <span v-if="it.id === 'traces'" class="sb-item-badge">{{ fmtN(traceCount) }}</span>
          </template>
        </div>
      </div>

      <div class="sb-section">
        <div v-if="!collapsed" class="sb-section-label">Configure</div>
        <div
          v-for="it in sidebarItems2" :key="it.id"
          class="sb-item"
          :class="{ active: activeItem === it.id, stub: !it.to }"
          :title="collapsed ? it.label : undefined"
          @click="onItemClick(it.to)"
        >
          <AppIcon :name="it.icon" :size="14" />
          <span v-if="!collapsed">{{ it.label }}</span>
        </div>
      </div>

      <div class="sb-spacer" />

      <div class="sb-footer">
        <div class="sb-user" :title="collapsed ? userName : undefined" @click="logout()">
          <div class="sb-avatar">{{ userName[0]?.toUpperCase() }}</div>
          <template v-if="!collapsed">
            <div style="display:flex;flex-direction:column;line-height:1.2;flex:1;min-width:0">
              <span class="sb-user-name">{{ userName }}</span>
              <span class="sb-user-org">{{ me?.org ?? "personal" }} · {{ me?.plan ?? "free" }}</span>
            </div>
            <AppIcon name="logout" :size="12" style="color:var(--text-3)" />
          </template>
        </div>
        <button class="sb-toggle" :title="collapsed ? 'Expand sidebar' : 'Collapse sidebar'" @click="collapsed = !collapsed">
          <AppIcon :name="collapsed ? 'chevron-right' : 'chevron-left'" :size="12" />
          <span v-if="!collapsed">Collapse</span>
        </button>
      </div>
    </aside>

    <!-- ══════════════════════ MAIN COLUMN ══════════════════════ -->
    <div class="main-col">
      <slot />
    </div>

  </div>
</template>

<style scoped>
/* ── App shell ── */
.app {
  display: grid;
  grid-template-columns: var(--sidebar-w) 1fr;
  height: 100vh;
  background: var(--bg-1);
  overflow: hidden;
  font-family: var(--font-sans);
  font-size: 13px;
  color: var(--text-0);
  transition: grid-template-columns 0.18s ease;
}
.app.collapsed {
  grid-template-columns: 48px 1fr;
}

/* ── Sidebar ── */
.sidebar {
  background: var(--bg-0);
  border-right: 1px solid var(--border-0);
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  overflow-y: auto;
}
.sb-brand {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 14px 12px;
  border-bottom: 1px solid var(--border-0);
  height: var(--topbar-h);
  flex-shrink: 0;
}
.collapsed .sb-brand {
  justify-content: center;
  padding: 14px 0 12px;
}
.sb-logo {
  width: 22px; height: 22px;
  display: grid; place-items: center;
  background: var(--accent-bg);
  border: 1px solid var(--accent-border);
  border-radius: var(--radius-sm);
  color: var(--accent);
  flex-shrink: 0;
}
.sb-name { font-weight: 600; font-size: 13px; letter-spacing: -0.01em; white-space: nowrap; }
.sb-env {
  margin-left: auto;
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-2);
  background: var(--bg-2);
  padding: 2px 6px;
  border-radius: 3px;
  border: 1px solid var(--border-1);
  white-space: nowrap;
}
.sb-section { padding: 10px 8px 4px; }
.collapsed .sb-section { padding: 10px 4px 4px; }
.sb-section-label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-2);
  padding: 4px 8px;
  font-weight: 500;
  white-space: nowrap;
}
.sb-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: var(--radius-sm);
  color: var(--text-1);
  font-size: 13px;
  cursor: pointer;
  position: relative;
  white-space: nowrap;
}
.collapsed .sb-item {
  justify-content: center;
  padding: 8px 4px;
  gap: 0;
}
.sb-item > span:first-of-type { overflow: hidden; text-overflow: ellipsis; flex: 1; min-width: 0; }
.sb-item:hover { background: var(--bg-2); color: var(--text-0); }
.sb-item.stub { opacity: 0.45; cursor: default; }
.sb-item.stub:hover { background: none; color: var(--text-1); }
.sb-item.active { background: var(--bg-3); color: var(--text-0); }
.sb-item.active::before {
  content: "";
  position: absolute;
  left: -8px; top: 50%;
  transform: translateY(-50%);
  width: 2px; height: 14px;
  background: var(--accent);
  border-radius: 0 2px 2px 0;
}
.collapsed .sb-item.active::before { left: -4px; }
.sb-item :deep(svg) { color: var(--text-2); flex-shrink: 0; }
.sb-item.active :deep(svg), .sb-item:hover:not(.stub) :deep(svg) { color: var(--text-0); }
.sb-item-badge {
  margin-left: auto;
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-2);
  background: var(--bg-2);
  padding: 1px 5px;
  border-radius: 3px;
  border: 1px solid var(--border-1);
}
.sb-spacer { flex: 1; }
.sb-footer { padding: 8px; border-top: 1px solid var(--border-0); flex-shrink: 0; }
.collapsed .sb-footer { padding: 8px 4px; }
.sb-user {
  display: flex; align-items: center; gap: 8px;
  padding: 6px 8px;
  border-radius: var(--radius-sm);
  cursor: pointer;
}
.collapsed .sb-user { justify-content: center; padding: 8px 4px; }
.sb-user:hover { background: var(--bg-2); }
.sb-avatar {
  width: 22px; height: 22px;
  border-radius: 50%;
  background: var(--accent-bg);
  border: 1px solid var(--accent-border);
  color: var(--accent);
  display: grid; place-items: center;
  font-size: 11px; font-weight: 600;
  flex-shrink: 0;
}
.sb-user-name { font-size: 12px; }
.sb-user-org  { font-size: 10px; color: var(--text-2); }

/* ── Collapse toggle ── */
.sb-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 5px 8px;
  margin-top: 2px;
  border: none;
  border-radius: var(--radius-sm);
  background: none;
  color: var(--text-2);
  font-family: var(--font-sans);
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
}
.sb-toggle:hover { background: var(--bg-2); color: var(--text-1); }
.collapsed .sb-toggle { justify-content: center; padding: 8px 4px; }

/* ── Main col ── */
.main-col {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  height: 100vh;
  overflow: hidden;
}
</style>
