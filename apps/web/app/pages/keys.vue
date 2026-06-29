<script setup lang="ts">
import type { ApiKey, CreatedApiKey } from "~/composables/useApiKeys";
definePageMeta({ layout: "app" });

const { keys: apiKeys, pending: keysPending, fetchKeys, createKey, updateKey, rotateKey, revokeKey, getWebhookSecret, rotateWebhookSecret, revealWebhookSecret } = useApiKeys();

await fetchKeys();

// ── constants ─────────────────────────────────────────────────────────────────
const ENVS = ["production", "staging", "ci", "dev"] as const;
const SCOPES = [
  { id: "read",   label: "read",   desc: "Read traces, runs, evaluations." },
  { id: "write",  label: "write",  desc: "Forward new traces to LLM Lens." },
  { id: "replay", label: "replay", desc: "Re-issue requests upstream." },
  { id: "export", label: "export", desc: "Bulk export traces via webhook." },
  { id: "delete", label: "delete", desc: "Delete traces or projects." },
] as const;

// ── filter ────────────────────────────────────────────────────────────────────
const query = ref("");
const envFilter = ref("all");
const statusFilter = ref("all");
const envOpen = ref(false);
const statusOpen = ref(false);

const filtered = computed(() => {
  let arr = apiKeys.value.slice();
  if (envFilter.value !== "all") arr = arr.filter((k) => k.env === envFilter.value);
  if (statusFilter.value !== "all") arr = arr.filter((k) => k.status === statusFilter.value);
  if (query.value.trim()) {
    const q = query.value.toLowerCase();
    arr = arr.filter((k) => k.name.toLowerCase().includes(q) || k.env.includes(q) || k.scopes.some((s) => s.includes(q)));
  }
  return arr;
});

const activeCount = computed(() => apiKeys.value.filter((k) => k.status === "active").length);

// ── create modal ──────────────────────────────────────────────────────────────
const createOpen = ref(false);
const createName = ref("");
const createEnv = ref<string>("production");
const createScopes = ref(new Set(["read", "write"]));
const createPending = ref(false);
const createError = ref<string | null>(null);
const createResult = ref<CreatedApiKey | null>(null);

function openCreate() { createOpen.value = true; }
function closeCreate() {
  createOpen.value = false;
  setTimeout(() => {
    createName.value = ""; createEnv.value = "production";
    createScopes.value = new Set(["read", "write"]);
    createError.value = null; createResult.value = null;
  }, 180);
}
function toggleScope(s: string) {
  const n = new Set(createScopes.value);
  if (n.has(s)) { n.delete(s); } else { n.add(s); }
  createScopes.value = n;
}
async function submitCreate() {
  if (!createName.value.trim() || createScopes.value.size === 0) return;
  createPending.value = true; createError.value = null;
  try {
    createResult.value = await createKey(createName.value.trim(), createEnv.value, [...createScopes.value]);
  } catch (err) {
    createError.value = getErrorMessage(err);
  } finally {
    createPending.value = false;
  }
}

// ── edit modal ────────────────────────────────────────────────────────────────
const editOpen = ref(false);
const editTarget = ref<ApiKey | null>(null);
const editName = ref("");
const editScopes = ref(new Set<string>());
const editPending = ref(false);
const editError = ref<string | null>(null);

function openEdit(k: ApiKey) {
  editTarget.value = k;
  editName.value = k.name;
  editScopes.value = new Set(k.scopes);
  editOpen.value = true;
}
function closeEdit() {
  editOpen.value = false;
  setTimeout(() => { editTarget.value = null; editError.value = null; }, 180);
}
function toggleEditScope(s: string) {
  const n = new Set(editScopes.value);
  if (n.has(s)) { n.delete(s); } else { n.add(s); }
  editScopes.value = n;
}
async function submitEdit() {
  if (!editTarget.value) return;
  editPending.value = true; editError.value = null;
  try {
    await updateKey(editTarget.value.id, { name: editName.value.trim(), scopes: [...editScopes.value] });
    closeEdit();
  } catch (err) {
    editError.value = getErrorMessage(err);
  } finally {
    editPending.value = false;
  }
}

// ── rotate modal ──────────────────────────────────────────────────────────────
const rotateOpen = ref(false);
const rotateTarget = ref<ApiKey | null>(null);
const rotateResult = ref<CreatedApiKey | null>(null);
const rotatePending = ref(false);

async function openRotate(k: ApiKey) {
  rotateTarget.value = k; rotateResult.value = null; rotateOpen.value = true;
  rotatePending.value = true;
  try { rotateResult.value = await rotateKey(k.id); }
  finally { rotatePending.value = false; }
}
function closeRotate() {
  rotateOpen.value = false;
  setTimeout(() => { rotateTarget.value = null; rotateResult.value = null; }, 180);
}

// ── revoke ────────────────────────────────────────────────────────────────────
const revokeError = ref<string | null>(null);
async function onRevoke(k: ApiKey) {
  if (!confirm(`Revoke "${k.name}"? This cannot be undone.`)) return;
  try { await revokeKey(k.id); }
  catch (err) { revokeError.value = getErrorMessage(err); }
}

// ── disable / enable ──────────────────────────────────────────────────────────
async function toggleStatus(k: ApiKey) {
  const next = k.status === "active" ? "disabled" : "active";
  try { await updateKey(k.id, { status: next }); }
  catch (err) { revokeError.value = getErrorMessage(err); }
}

// ── context menu ──────────────────────────────────────────────────────────────
const openMenu = ref<string | null>(null);
const keysWrap = useTemplateRef("keysWrap");
onClickOutside(keysWrap, () => { openMenu.value = null; });
function toggleMenu(id: string) { openMenu.value = openMenu.value === id ? null : id; }

// ── reveal / copy ─────────────────────────────────────────────────────────────
const revealed = ref(new Set<string>());
function toggleReveal(id: string) {
  const s = new Set(revealed.value);
  if (s.has(id)) { s.delete(id); } else { s.add(id); }
  revealed.value = s;
}
function copyText(text: string) { navigator.clipboard?.writeText(text); }

// ── quickstart ────────────────────────────────────────────────────────────────
const qsTab = ref<"curl" | "node" | "python">("curl");
const QS = {
  curl: `curl -X POST https://api.llmlens.dev/v1/traces \\\n  -H "Authorization: Bearer $LLMLENS_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d @trace.json`,
  node: `import { LLMLens } from "@llmlens/sdk";\n\nconst lens = new LLMLens({\n  apiKey: process.env.LLMLENS_API_KEY,\n  env:    "production",\n});\n\nawait lens.trace(response, { name: "my-trace" });`,
  python: `from llmlens import LLMLens\n\nlens = LLMLens(\n    api_key=os.environ["LLMLENS_API_KEY"],\n)\n\nlens.trace(response, name="my-trace")`,
};

// ── webhook secret ────────────────────────────────────────────────────────────
const whSecret = ref<{ masked: string; prefix: string; tail: string } | null>(null);
const whRevealed = ref(false);
const whFull = ref<string | null>(null);
const whRotating = ref(false);

onMounted(async () => {
  try { whSecret.value = await getWebhookSecret(); } catch { /* skip if org not set up */ }
});

async function onRevealWebhook() {
  if (whRevealed.value) { whRevealed.value = false; whFull.value = null; return; }
  try {
    const r = await revealWebhookSecret();
    whFull.value = r.key;
    whRevealed.value = true;
  } catch { /* ignore */ }
}

async function onRotateWebhook() {
  if (!confirm("Rotate the webhook signing secret? All existing webhook signatures will be invalidated.")) return;
  whRotating.value = true;
  try {
    const r = await rotateWebhookSecret();
    whFull.value = r.key;
    whRevealed.value = true;
    whSecret.value = { masked: `whsec_${"•".repeat(20)}`, prefix: "whsec_", tail: r.key.slice(-4) };
  } finally {
    whRotating.value = false;
  }
}

// ── utils ─────────────────────────────────────────────────────────────────────
function fmtDate(ts: number | null) {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}
function fmtRelative(ts: number | null): { label: string; cls: string } {
  if (!ts) return { label: "never", cls: "stale" };
  const mins = Math.round((Date.now() - ts) / 60_000);
  if (mins < 5)  return { label: "just now", cls: "fresh" };
  if (mins < 60) return { label: `${mins} min ago`, cls: "fresh" };
  const hrs = Math.round(mins / 60);
  if (hrs < 24)  return { label: `${hrs}h ago`, cls: "fresh" };
  const days = Math.round(hrs / 24);
  if (days === 1) return { label: "yesterday", cls: "ok" };
  if (days <= 7)  return { label: `${days} days ago`, cls: "ok" };
  return { label: `${days} days ago`, cls: "stale" };
}

// keyboard shortcut N = open create
onMounted(() => {
  const h = (e: KeyboardEvent) => {
    if (e.key.toLowerCase() === "n" && !createOpen.value && !editOpen.value && (e.target as HTMLElement).tagName !== "INPUT") {
      openCreate();
    }
  };
  window.addEventListener("keydown", h);
  onUnmounted(() => window.removeEventListener("keydown", h));
});
</script>

<template>
  <div ref="keysWrap" style="display:flex;flex-direction:column;flex:1;overflow:hidden">
    <div class="ak-page">

      <!-- ── header ─────────────────────────────────────────────────────────── -->
      <div class="ak-hdr">
        <div class="ak-hdr-left">
          <div class="ak-title">API keys</div>
          <div class="ak-sub">Forward LLM traces from your servers. Use one key per environment.</div>
        </div>
        <div class="ak-stats">
          <div class="stat-box">
            <div class="stat-label">Active keys</div>
            <div class="stat-val">{{ activeCount }} <span class="stat-unit">/ {{ apiKeys.length }}</span></div>
          </div>
          <div class="stat-box">
            <div class="stat-label">Free tier limit</div>
            <div class="stat-val">10 <span class="stat-unit">keys</span></div>
          </div>
          <button class="btn primary" @click="openCreate">
            <AppIcon name="plus" :size="12" /> Create new key <kbd class="kbd">N</kbd>
          </button>
        </div>
      </div>

      <!-- ── search bar ──────────────────────────────────────────────────────── -->
      <div class="subbar">
        <div class="ak-search">
          <AppIcon name="search" :size="11" />
          <input v-model="query" placeholder="Filter by name, scope, environment…" >
          <button v-if="query" class="ak-clear" @click="query = ''"><AppIcon name="x" :size="10" /></button>
        </div>

        <!-- env filter -->
        <div style="position:relative">
          <button class="chip" :class="{ active: envFilter !== 'all' }" @click="envOpen = !envOpen; statusOpen = false">
            Env: {{ envFilter === 'all' ? 'All' : envFilter }} <span class="chip-caret">▾</span>
          </button>
          <div v-if="envOpen" class="chip-menu">
            <div class="chip-menu-item" :class="{ selected: envFilter === 'all' }" @click="envFilter = 'all'; envOpen = false">All envs</div>
            <div v-for="e in ENVS" :key="e" class="chip-menu-item" :class="{ selected: envFilter === e }" @click="envFilter = e; envOpen = false">
              <span class="env-dot" :class="`env-${e === 'production' ? 'prod' : e === 'staging' ? 'stg' : e}`" />{{ e }}
            </div>
          </div>
        </div>

        <!-- status filter -->
        <div style="position:relative">
          <button class="chip" :class="{ active: statusFilter !== 'all' }" @click="statusOpen = !statusOpen; envOpen = false">
            Status: {{ statusFilter === 'all' ? 'All' : statusFilter }} <span class="chip-caret">▾</span>
          </button>
          <div v-if="statusOpen" class="chip-menu">
            <div class="chip-menu-item" :class="{ selected: statusFilter === 'all' }" @click="statusFilter = 'all'; statusOpen = false">All statuses</div>
            <div class="chip-menu-item" :class="{ selected: statusFilter === 'active' }" @click="statusFilter = 'active'; statusOpen = false"><span class="dot ok" /> Active</div>
            <div class="chip-menu-item" :class="{ selected: statusFilter === 'disabled' }" @click="statusFilter = 'disabled'; statusOpen = false">Disabled</div>
          </div>
        </div>

        <div style="flex:1" />
        <button class="chip" @click="fetchKeys"><AppIcon name="refresh" :size="11" /> Refresh</button>
        <button class="chip" style="color:var(--text-2)"><AppIcon name="docs" :size="11" /> Audit log</button>
      </div>

      <!-- error -->
      <div v-if="revokeError" class="ak-err">{{ revokeError }}</div>

      <!-- ── keys table ──────────────────────────────────────────────────────── -->
      <div class="ak-table">
        <div class="ak-head">
          <div>Name</div>
          <div>Token</div>
          <div>Scopes</div>
          <div>Last used</div>
          <div>Status</div>
          <div />
        </div>

        <div v-if="keysPending" class="ak-empty-row"><span style="color:var(--text-3)">Loading…</span></div>
        <div v-else-if="filtered.length === 0" class="ak-empty-row">
          <AppIcon name="key" :size="18" style="color:var(--text-3)" />
          <div style="display:flex;flex-direction:column;gap:2px;align-items:center">
            <span style="color:var(--text-1);font-size:.8rem">No matching keys</span>
            <span style="color:var(--text-3);font-size:.72rem">Try a different filter, or create a new key.</span>
          </div>
        </div>

        <template v-else>
          <div v-for="k in filtered" :key="k.id" style="position:relative">
            <div class="ak-row" :class="{ disabled: k.status === 'disabled' }">
              <!-- Name -->
              <div class="ak-cell" style="flex-direction:column;align-items:flex-start;gap:3px">
                <div style="display:flex;align-items:center;gap:6px">
                  <span style="font-weight:500;color:var(--text-0);font-size:.80rem">{{ k.name }}</span>
                  <span class="env-badge" :class="`env-${k.env === 'production' ? 'prod' : k.env === 'staging' ? 'stg' : k.env}`">{{ k.env }}</span>
                </div>
                <span class="mono" style="font-size:.65rem;color:var(--text-3)">Created {{ fmtDate(k.createdAt) }}</span>
              </div>
              <!-- Token -->
              <div class="ak-cell" style="gap:6px">
                <code class="ak-token mono">
                  <span class="prefix">{{ k.prefix }}</span>
                  <span v-if="revealed.has(k.id)" class="dots">{{ "•".repeat(12) }}</span>
                  <span v-else class="dots">••••••••</span>
                  <span class="tail">{{ k.tail }}</span>
                </code>
                <div style="display:flex;gap:3px">
                  <button class="icon-btn xs" :title="revealed.has(k.id) ? 'Hide' : 'Reveal'" @click="toggleReveal(k.id)">
                    <AppIcon :name="revealed.has(k.id) ? 'x' : 'eye'" :size="12" />
                  </button>
                  <button class="icon-btn xs" title="Copy" @click="copyText(k.prefix + '•••' + k.tail)">
                    <AppIcon name="copy" :size="12" />
                  </button>
                </div>
              </div>
              <!-- Scopes -->
              <div class="ak-cell" style="flex-wrap:wrap;gap:3px">
                <span v-for="s in k.scopes" :key="s" class="scope" :class="`scope-${s}`">{{ s }}</span>
              </div>
              <!-- Last used -->
              <div class="ak-cell" style="flex-direction:column;align-items:flex-start;gap:2px">
                <span class="mono" style="font-size:.72rem" :class="fmtRelative(k.lastUsedAt).cls + '-text'">{{ fmtRelative(k.lastUsedAt).label }}</span>
              </div>
              <!-- Status -->
              <div class="ak-cell">
                <span class="kpill" :class="k.status === 'active' ? 'ok' : 'mute'">
                  <span class="dot" :class="k.status === 'active' ? 'ok' : ''" />{{ k.status }}
                </span>
              </div>
              <!-- Actions -->
              <div class="ak-cell" style="justify-content:flex-end;gap:4px">
                <button class="icon-btn xs" title="Rotate token…" @click="openRotate(k)">
                  <AppIcon name="refresh" :size="12" />
                </button>
                <button class="icon-btn xs" title="More" @click="toggleMenu(k.id)">
                  <AppIcon name="more" :size="12" />
                </button>
              </div>
            </div>
            <!-- context menu -->
            <div v-if="openMenu === k.id" class="ctx-menu">
              <div class="ctx-item" @click="openEdit(k); openMenu = null">
                <AppIcon name="note" :size="12" /><span>Edit name &amp; scopes</span>
              </div>
              <div class="ctx-item" @click="openRotate(k); openMenu = null">
                <AppIcon name="refresh" :size="12" /><span>Rotate token…</span>
              </div>
              <div class="ctx-item" @click="toggleStatus(k); openMenu = null">
                <AppIcon :name="k.status === 'active' ? 'x' : 'check'" :size="12" />
                <span>{{ k.status === 'active' ? 'Disable' : 'Enable' }}</span>
              </div>
              <div class="ctx-divider" />
              <div class="ctx-item danger" @click="onRevoke(k); openMenu = null">
                <AppIcon name="trash" :size="12" /><span>Revoke key…</span>
              </div>
            </div>
          </div>
        </template>
      </div>

      <!-- ── quickstart card ─────────────────────────────────────────────────── -->
      <div class="qs-card">
        <div class="qs-head">
          <div>
            <div class="qs-title">Forward your first trace</div>
            <div class="qs-sub">Pick a runtime — copy and paste into your server.</div>
          </div>
          <div class="segmented">
            <button :class="{ active: qsTab === 'curl' }" @click="qsTab = 'curl'">cURL</button>
            <button :class="{ active: qsTab === 'node' }" @click="qsTab = 'node'">Node</button>
            <button :class="{ active: qsTab === 'python' }" @click="qsTab = 'python'">Python</button>
          </div>
        </div>
        <pre class="qs-code mono"><code>{{ QS[qsTab] }}</code></pre>
        <div class="qs-foot">
          <span style="color:var(--text-2)">Endpoint:</span>
          <code class="mono" style="color:var(--text-0)">https://api.llmlens.dev/v1</code>
        </div>
      </div>

      <!-- ── webhook signing secret ──────────────────────────────────────────── -->
      <div class="wh-card">
        <div class="wh-head">
          <div>
            <div class="wh-title">Webhook signing secret</div>
            <div class="wh-sub">Verify the integrity of webhook deliveries to your endpoint.</div>
          </div>
          <button class="btn" :disabled="whRotating" @click="onRotateWebhook">
            <AppIcon name="refresh" :size="12" /> Rotate secret
          </button>
        </div>
        <div class="wh-row">
          <code class="ak-token mono" style="flex:1">
            <template v-if="whRevealed && whFull">
              <span style="color:var(--text-0)">{{ whFull }}</span>
            </template>
            <template v-else-if="whSecret">
              <span class="prefix">{{ whSecret.prefix }}</span>
              <span class="dots">{{ "•".repeat(20) }}</span>
              <span class="tail">{{ whSecret.tail }}</span>
            </template>
            <template v-else>
              <span class="dots" style="color:var(--text-3)">Generating…</span>
            </template>
          </code>
          <button class="icon-btn xs" :title="whRevealed ? 'Hide' : 'Reveal'" @click="onRevealWebhook">
            <AppIcon :name="whRevealed ? 'x' : 'eye'" :size="12" />
          </button>
          <button class="icon-btn xs" title="Copy" @click="whFull ? copyText(whFull) : undefined">
            <AppIcon name="copy" :size="12" />
          </button>
        </div>
      </div>

    </div>

    <!-- ══════════ CREATE KEY MODAL ══════════ -->
    <Teleport to="body">
      <Transition name="modal">
        <div v-if="createOpen" class="modal-scrim" @click.self="closeCreate">
          <div class="modal">
            <div class="modal-head">
              <div class="modal-title">{{ createResult ? "Key created" : "Create new API key" }}</div>
              <button class="icon-btn" @click="closeCreate"><AppIcon name="x" :size="12" /></button>
            </div>

            <!-- form -->
            <div v-if="!createResult" class="modal-body">
              <div class="field">
                <div class="field-label">Name <span class="hint">Short, descriptive — e.g. <code class="mono">server-prod</code></span></div>
                <input v-model="createName" class="field-input" placeholder="server-prod" @keydown.enter="submitCreate" >
              </div>
              <div class="field">
                <div class="field-label">Environment</div>
                <div class="env-grid">
                  <label v-for="e in ENVS" :key="e" class="env-card" :class="{ selected: createEnv === e }">
                    <input v-model="createEnv" type="radio" :value="e" style="display:none" >
                    <span class="env-badge" :class="`env-${e === 'production' ? 'prod' : e === 'staging' ? 'stg' : e}`">{{ e }}</span>
                    <span class="env-card-desc">{{ { production: "Live customer traffic.", staging: "Pre-prod environment.", ci: "CI / regression runs.", dev: "Local development." }[e] }}</span>
                  </label>
                </div>
              </div>
              <div class="field">
                <div class="field-label">Scopes <span class="hint">Pick the minimum needed.</span></div>
                <div class="scope-grid">
                  <label v-for="s in SCOPES" :key="s.id" class="scope-row" :class="{ on: createScopes.has(s.id) }" @click.prevent="toggleScope(s.id)">
                    <span class="cbox" :class="{ on: createScopes.has(s.id) }"><AppIcon v-if="createScopes.has(s.id)" name="check" :size="9" /></span>
                    <span class="scope" :class="`scope-${s.id}`">{{ s.label }}</span>
                    <span class="scope-desc">{{ s.desc }}</span>
                  </label>
                </div>
              </div>
              <div v-if="createError" class="ak-err">{{ createError }}</div>
            </div>

            <!-- token reveal -->
            <div v-if="createResult" class="modal-body">
              <div class="created-warn">
                <AppIcon name="warn" :size="12" style="flex-shrink:0;color:var(--warn)" />
                <span>This is the only time you'll see the full token. Copy it now and store it somewhere safe.</span>
              </div>
              <div class="created-token">
                <code class="mono">{{ createResult.key }}</code>
                <button class="btn" @click="copyText(createResult!.key)"><AppIcon name="copy" :size="12" /> Copy</button>
              </div>
              <div class="created-meta">
                <div><span class="ml">Name</span><span class="mv mono">{{ createResult.name }}</span></div>
                <div><span class="ml">Environment</span><span class="mv"><span class="env-badge" :class="`env-${createResult.env === 'production' ? 'prod' : createResult.env === 'staging' ? 'stg' : createResult.env}`">{{ createResult.env }}</span></span></div>
                <div><span class="ml">Scopes</span><span class="mv" style="display:flex;gap:4px;flex-wrap:wrap">
                  <span v-for="s in createResult.scopes" :key="s" class="scope" :class="`scope-${s}`">{{ s }}</span>
                </span></div>
              </div>
            </div>

            <div class="modal-foot">
              <template v-if="!createResult">
                <button class="btn" @click="closeCreate">Cancel</button>
                <button class="btn primary" :disabled="!createName.trim() || createScopes.size === 0 || createPending" @click="submitCreate">
                  {{ createPending ? "Generating…" : "Generate key" }}
                </button>
              </template>
              <template v-else>
                <button class="btn" @click="createResult = null; createName = ''">Create another</button>
                <button class="btn primary" @click="closeCreate">Done</button>
              </template>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- ══════════ EDIT MODAL ══════════ -->
    <Teleport to="body">
      <Transition name="modal">
        <div v-if="editOpen" class="modal-scrim" @click.self="closeEdit">
          <div class="modal">
            <div class="modal-head">
              <div class="modal-title">Edit key</div>
              <button class="icon-btn" @click="closeEdit"><AppIcon name="x" :size="12" /></button>
            </div>
            <div class="modal-body">
              <div class="field">
                <div class="field-label">Name</div>
                <input v-model="editName" class="field-input" @keydown.enter="submitEdit" >
              </div>
              <div class="field">
                <div class="field-label">Scopes</div>
                <div class="scope-grid">
                  <label v-for="s in SCOPES" :key="s.id" class="scope-row" :class="{ on: editScopes.has(s.id) }" @click.prevent="toggleEditScope(s.id)">
                    <span class="cbox" :class="{ on: editScopes.has(s.id) }"><AppIcon v-if="editScopes.has(s.id)" name="check" :size="9" /></span>
                    <span class="scope" :class="`scope-${s.id}`">{{ s.label }}</span>
                    <span class="scope-desc">{{ s.desc }}</span>
                  </label>
                </div>
              </div>
              <div v-if="editError" class="ak-err">{{ editError }}</div>
            </div>
            <div class="modal-foot">
              <button class="btn" @click="closeEdit">Cancel</button>
              <button class="btn primary" :disabled="!editName.trim() || editScopes.size === 0 || editPending" @click="submitEdit">
                {{ editPending ? "Saving…" : "Save changes" }}
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- ══════════ ROTATE MODAL ══════════ -->
    <Teleport to="body">
      <Transition name="modal">
        <div v-if="rotateOpen" class="modal-scrim" @click.self="closeRotate">
          <div class="modal">
            <div class="modal-head">
              <div class="modal-title">Token rotated — {{ rotateTarget?.name }}</div>
              <button class="icon-btn" @click="closeRotate"><AppIcon name="x" :size="12" /></button>
            </div>
            <div class="modal-body">
              <div v-if="rotatePending" style="color:var(--text-2);font-size:.8rem">Generating new token…</div>
              <template v-else-if="rotateResult">
                <div class="created-warn">
                  <AppIcon name="warn" :size="12" style="flex-shrink:0;color:var(--warn)" />
                  <span>The old token is immediately invalidated. Copy the new one now.</span>
                </div>
                <div class="created-token">
                  <code class="mono">{{ rotateResult.key }}</code>
                  <button class="btn" @click="copyText(rotateResult!.key)"><AppIcon name="copy" :size="12" /> Copy</button>
                </div>
              </template>
            </div>
            <div class="modal-foot">
              <button class="btn primary" @click="closeRotate">Done</button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
/* ── layout ── */
.ak-page { flex: 1; overflow-y: auto; padding: 24px 28px; display: flex; flex-direction: column; gap: 18px; }

/* ── header ── */
.ak-hdr { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; flex-wrap: wrap; }
.ak-hdr-left { display: flex; flex-direction: column; gap: 4px; }
.ak-title { font-size: 1rem; font-weight: 600; color: var(--text-0); }
.ak-sub { font-size: .72rem; color: var(--text-2); }
.ak-stats { display: flex; align-items: flex-end; gap: 20px; }
.stat-box { display: flex; flex-direction: column; gap: 3px; }
.stat-label { font-size: .68rem; color: var(--text-2); text-transform: uppercase; letter-spacing: .04em; }
.stat-val { font-size: 1.1rem; font-weight: 600; color: var(--text-0); font-variant-numeric: tabular-nums; }
.stat-unit { font-size: .72rem; font-weight: 400; color: var(--text-2); }

/* ── subbar ── */
.subbar { display: flex; align-items: center; gap: 6px; padding: 7px 12px; background: var(--bg-2); border: 1px solid var(--border-0); border-radius: var(--radius-md); flex-wrap: wrap; }
.ak-search { display: flex; align-items: center; gap: 6px; flex: 1; min-width: 180px; color: var(--text-3); }
.ak-search input { flex: 1; background: none; border: none; outline: none; font-size: .75rem; color: var(--text-0); }
.ak-search input::placeholder { color: var(--text-3); }
.ak-clear { display: flex; align-items: center; color: var(--text-3); background: none; border: none; cursor: pointer; padding: 0; }
.chip { display: inline-flex; align-items: center; gap: 5px; padding: 4px 10px; border-radius: var(--radius-sm); background: var(--bg-3); border: 1px solid var(--border-1); font-size: .72rem; color: var(--text-1); cursor: pointer; white-space: nowrap; }
.chip:hover { background: var(--bg-4); color: var(--text-0); }
.chip.active { background: var(--accent-bg); border-color: var(--accent-border); color: var(--accent); }
.chip-caret { color: var(--text-3); }
.chip-menu { position: absolute; top: calc(100% + 4px); left: 0; z-index: 200; background: var(--bg-2); border: 1px solid var(--border-1); border-radius: var(--radius-md); padding: 4px; min-width: 160px; box-shadow: 0 8px 24px #00000040; }
.chip-menu-item { display: flex; align-items: center; gap: 6px; padding: 6px 8px; border-radius: var(--radius-sm); font-size: .75rem; color: var(--text-1); cursor: pointer; }
.chip-menu-item:hover { background: var(--bg-3); color: var(--text-0); }
.chip-menu-item.selected { color: var(--accent); }
.env-dot { display: inline-block; width: 6px; height: 6px; border-radius: 50%; }
.env-prod.env-dot, .env-prod { background: color-mix(in srgb, var(--success) 15%, transparent); color: var(--success); }
.env-stg.env-dot,  .env-stg  { background: color-mix(in srgb, var(--warn) 15%, transparent);    color: var(--warn); }
.env-ci.env-dot,   .env-ci   { background: var(--bg-4); color: var(--text-2); }
.env-dev.env-dot,  .env-dev  { background: var(--bg-4); color: var(--text-2); }

/* ── table ── */
.ak-table { border: 1px solid var(--border-0); border-radius: var(--radius-md); overflow: hidden; background: var(--bg-2); }
.ak-head { display: grid; grid-template-columns: 2fr 2.5fr 1.5fr 120px 90px 80px; gap: 8px; padding: 8px 16px; font-size: .62rem; color: var(--text-3); text-transform: uppercase; letter-spacing: .05em; border-bottom: 1px solid var(--border-0); }
.ak-row { display: grid; grid-template-columns: 2fr 2.5fr 1.5fr 120px 90px 80px; gap: 8px; padding: 11px 16px; align-items: center; border-bottom: 1px solid var(--border-0); transition: background .1s; }
.ak-row:last-child { border-bottom: none; }
.ak-row:hover { background: var(--bg-3); }
.ak-row.disabled { opacity: .55; }
.ak-cell { display: flex; align-items: center; min-width: 0; overflow: hidden; }
.ak-empty-row { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 48px 16px; text-align: center; border-bottom: 1px solid var(--border-0); }
.ak-token { display: flex; align-items: center; gap: 2px; font-size: .70rem; }
.ak-token .prefix { color: var(--text-2); }
.ak-token .dots   { color: var(--text-3); letter-spacing: .08em; }
.ak-token .tail   { color: var(--text-2); }

/* ── env badge ── */
.env-badge { display: inline-flex; align-items: center; font-size: .62rem; font-weight: 500; padding: 1px 5px; border-radius: 3px; white-space: nowrap; flex-shrink: 0; }

/* ── status pill ── */
.kpill { display: inline-flex; align-items: center; gap: 5px; font-size: .68rem; padding: 2px 8px; border-radius: 20px; background: var(--bg-3); border: 1px solid var(--border-0); color: var(--text-2); white-space: nowrap; }
.kpill.ok   { background: color-mix(in srgb, var(--success) 10%, transparent); border-color: color-mix(in srgb, var(--success) 25%, transparent); color: var(--success); }
.kpill.mute { background: var(--bg-3); color: var(--text-3); }
.dot { display: inline-block; width: 5px; height: 5px; border-radius: 50%; background: var(--text-3); flex-shrink: 0; }
.dot.ok { background: var(--success); }

/* ── scope badges ── */
.scope { display: inline-flex; align-items: center; font-size: .62rem; font-weight: 500; padding: 1px 5px; border-radius: 3px; white-space: nowrap; background: var(--bg-4); color: var(--text-2); }
.scope-read   { background: color-mix(in srgb, var(--accent) 12%, transparent);   color: var(--accent); }
.scope-write  { background: color-mix(in srgb, var(--success) 12%, transparent);  color: var(--success); }
.scope-replay { background: color-mix(in srgb, var(--warn) 12%, transparent);     color: var(--warn); }
.scope-export { background: var(--bg-4); color: var(--text-2); }
.scope-delete { background: color-mix(in srgb, var(--danger) 12%, transparent);   color: var(--danger); }

/* ── last-used colors ── */
.fresh-text { color: var(--success); }
.ok-text    { color: var(--text-1); }
.stale-text { color: var(--text-3); }

/* ── context menu ── */
.ctx-menu { position: absolute; z-index: 200; right: 12px; top: 100%; background: var(--bg-2); border: 1px solid var(--border-1); border-radius: var(--radius-md); padding: 4px; min-width: 180px; box-shadow: 0 8px 24px #00000050; }
.ctx-item { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-radius: var(--radius-sm); font-size: .75rem; color: var(--text-1); cursor: pointer; }
.ctx-item:hover { background: var(--bg-3); color: var(--text-0); }
.ctx-item.danger { color: var(--danger); }
.ctx-item.danger:hover { background: color-mix(in srgb, var(--danger) 10%, transparent); }
.ctx-divider { height: 1px; background: var(--border-0); margin: 4px 0; }

/* ── error ── */
.ak-err { font-size: .75rem; color: var(--danger); padding: 8px 12px; background: color-mix(in srgb, var(--danger) 8%, transparent); border: 1px solid color-mix(in srgb, var(--danger) 20%, transparent); border-radius: var(--radius-md); }

/* ── quickstart ── */
.qs-card { background: var(--bg-2); border: 1px solid var(--border-0); border-radius: var(--radius-md); overflow: hidden; }
.qs-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 14px 18px; border-bottom: 1px solid var(--border-0); }
.qs-title { font-size: .82rem; font-weight: 500; color: var(--text-0); }
.qs-sub { font-size: .70rem; color: var(--text-2); margin-top: 2px; }
.qs-code { margin: 0; padding: 14px 18px; font-size: .72rem; color: var(--text-1); line-height: 1.6; background: var(--bg-1); overflow-x: auto; white-space: pre; }
.qs-foot { display: flex; align-items: center; gap: 8px; padding: 9px 18px; border-top: 1px solid var(--border-0); font-size: .70rem; }

.segmented { display: flex; gap: 1px; background: var(--bg-4); border-radius: var(--radius-sm); padding: 2px; flex-shrink: 0; }
.segmented button { font-size: .70rem; padding: 3px 9px; border-radius: 3px; color: var(--text-2); background: none; border: none; cursor: pointer; font-family: inherit; transition: background .1s, color .1s; }
.segmented button.active { background: var(--bg-2); color: var(--text-0); }

/* ── webhook ── */
.wh-card { background: var(--bg-2); border: 1px solid var(--border-0); border-radius: var(--radius-md); padding: 14px 18px; display: flex; flex-direction: column; gap: 12px; }
.wh-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.wh-title { font-size: .82rem; font-weight: 500; color: var(--text-0); }
.wh-sub { font-size: .70rem; color: var(--text-2); margin-top: 2px; }
.wh-row { display: flex; align-items: center; gap: 8px; background: var(--bg-3); border: 1px solid var(--border-0); border-radius: var(--radius-md); padding: 8px 12px; }

/* ── buttons ── */
.btn { display: inline-flex; align-items: center; gap: 5px; padding: 6px 12px; border-radius: var(--radius-md); font-size: .75rem; font-weight: 500; cursor: pointer; background: var(--bg-3); border: 1px solid var(--border-1); color: var(--text-1); font-family: inherit; }
.btn:hover:not(:disabled) { background: var(--bg-4); color: var(--text-0); }
.btn:disabled { opacity: .45; cursor: not-allowed; }
.btn.primary { background: var(--accent-bg); border-color: var(--accent-border); color: var(--accent); }
.btn.primary:hover:not(:disabled) { filter: brightness(1.12); }
.kbd { font-size: .65rem; padding: 1px 4px; border-radius: 3px; background: var(--bg-4); color: var(--text-3); border: 1px solid var(--border-1); font-family: inherit; }

/* ── icon-btn ── */
.icon-btn { display: inline-flex; align-items: center; justify-content: center; padding: 5px; border-radius: var(--radius-sm); background: none; border: none; cursor: pointer; color: var(--text-2); }
.icon-btn:hover { background: var(--bg-4); color: var(--text-0); }
.icon-btn.xs { padding: 3px; }

/* ── modal ── */
.modal-scrim { position: fixed; inset: 0; z-index: 1000; background: #00000060; backdrop-filter: blur(3px); display: flex; align-items: center; justify-content: center; padding: 20px; }
.modal { background: var(--bg-2); border: 1px solid var(--border-1); border-radius: var(--radius-lg); width: 460px; max-width: 100%; box-shadow: 0 24px 64px #00000060; display: flex; flex-direction: column; max-height: 90vh; overflow: hidden; }
.modal-head { display: flex; align-items: center; justify-content: space-between; padding: 14px 18px; border-bottom: 1px solid var(--border-0); flex-shrink: 0; }
.modal-title { font-size: .88rem; font-weight: 600; color: var(--text-0); }
.modal-body { padding: 18px; display: flex; flex-direction: column; gap: 16px; overflow-y: auto; }
.modal-foot { display: flex; justify-content: flex-end; gap: 8px; padding: 12px 18px; border-top: 1px solid var(--border-0); flex-shrink: 0; }

.field { display: flex; flex-direction: column; gap: 6px; }
.field-label { font-size: .75rem; font-weight: 500; color: var(--text-0); display: flex; align-items: baseline; gap: 6px; flex-wrap: wrap; }
.hint { font-size: .68rem; color: var(--text-3); font-weight: 400; }
.field-input { width: 100%; padding: 7px 10px; background: var(--bg-3); border: 1px solid var(--border-1); border-radius: var(--radius-md); color: var(--text-0); font-size: .80rem; outline: none; box-sizing: border-box; font-family: inherit; }
.field-input:focus { border-color: var(--accent); }

.env-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.env-card { display: flex; flex-direction: column; gap: 4px; padding: 10px; border-radius: var(--radius-md); border: 1px solid var(--border-1); cursor: pointer; background: var(--bg-3); transition: border-color .1s; }
.env-card:hover { border-color: var(--border-2); }
.env-card.selected { border-color: var(--accent-border); background: var(--accent-bg); }
.env-card-desc { font-size: .68rem; color: var(--text-2); }

.scope-grid { display: flex; flex-direction: column; gap: 2px; }
.scope-row { display: grid; grid-template-columns: 16px auto 1fr; gap: 8px; align-items: center; padding: 7px 8px; border-radius: var(--radius-sm); cursor: pointer; }
.scope-row:hover { background: var(--bg-3); }
.scope-row.on { background: var(--bg-3); }
.cbox { width: 14px; height: 14px; border-radius: 3px; border: 1px solid var(--border-2); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.cbox.on { background: var(--accent); border-color: var(--accent); color: #fff; }
.scope-desc { font-size: .68rem; color: var(--text-3); }

.created-warn { display: flex; align-items: flex-start; gap: 8px; padding: 10px 12px; background: color-mix(in srgb, var(--warn) 8%, transparent); border: 1px solid color-mix(in srgb, var(--warn) 20%, transparent); border-radius: var(--radius-md); font-size: .75rem; color: var(--text-1); line-height: 1.5; }
.created-token { display: flex; align-items: center; gap: 8px; background: var(--bg-3); border: 1px solid var(--border-1); border-radius: var(--radius-md); padding: 10px 12px; }
.created-token code { flex: 1; font-size: .70rem; color: var(--text-0); word-break: break-all; }
.created-meta { display: flex; flex-direction: column; gap: 6px; font-size: .75rem; }
.created-meta > div { display: flex; align-items: center; gap: 12px; }
.ml { color: var(--text-2); min-width: 90px; flex-shrink: 0; }
.mv { color: var(--text-0); display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }

.modal-enter-active, .modal-leave-active { transition: opacity .18s; }
.modal-enter-from, .modal-leave-to { opacity: 0; }
.modal-enter-active .modal { transition: transform .18s; }
.modal-enter-from .modal { transform: scale(.97) translateY(-8px); }
</style>
