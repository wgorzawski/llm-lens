<script setup lang="ts">
const props = defineProps<{ variant: 'login' | 'register' }>()

const activeTab = ref<'curl' | 'node' | 'python'>('curl')

const features = computed(() =>
  props.variant === 'login'
    ? [
        { strong: 'Three providers, one schema.', text: 'Anthropic, OpenAI, Vercel AI SDK — unified into a single trace format.' },
        { strong: 'Auto-instrumentation.', text: 'Drop in the SDK; LLM Lens captures every call with zero glue code.' },
        { strong: 'Diff, replay, annotate.', text: 'Compare two prompts side-by-side, replay against any model, drop a note on any message.' },
      ]
    : [
        { strong: 'Free for personal use.', text: 'Unlimited local traces. Self-host with Docker or use the hosted plan.' },
        { strong: 'Open source.', text: 'MIT licensed. Inspect the schema, fork the UI, run it on-prem.' },
        { strong: 'Built for teams.', text: 'Invite collaborators, share traces, annotate together.' },
      ],
)
</script>

<template>
  <div class="auth-left">
    <!-- Brand -->
    <div class="auth-brand">
      <div class="logo">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="7" cy="7" r="4.2" />
          <path d="M10.2 10.2 L13.5 13.5" stroke-linecap="round" />
          <circle cx="7" cy="7" r="1.5" fill="currentColor" stroke="none" opacity="0.4" />
        </svg>
      </div>
      <span>LLM Lens</span>
      <span class="env">v0.4.2</span>
    </div>

    <!-- Lead copy -->
    <div class="auth-lead">
      <h1 v-if="variant === 'login'">
        One inbox for every <span class="hl">LLM call</span> your app makes.
      </h1>
      <h1 v-else>
        Get end-to-end <span class="hl">observability</span> for your LLM stack in 90 seconds.
      </h1>
      <p v-if="variant === 'login'">
        Sign in to inspect traces from Anthropic, OpenAI and the Vercel AI SDK — captured automatically, queryable in one place.
      </p>
      <p v-else>
        Create an account, drop <code>instrumentOpenAI(client)</code> into your app, and watch traces stream in. No agent, no proxy.
      </p>
    </div>

    <!-- Feature bullets -->
    <div class="auth-features">
      <div v-for="(f, i) in features" :key="i" class="auth-feature">
        <div class="check">
          <svg width="9" height="9" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M6 4 L10 8 L6 12" />
          </svg>
        </div>
        <div><strong>{{ f.strong }}</strong> {{ f.text }}</div>
      </div>
    </div>

    <!-- Terminal -->
    <div class="auth-terminal">
      <div class="term-head">
        <div class="term-dots">
          <span /><span /><span />
        </div>
        <div class="term-title">~/your-app · zsh</div>
        <div class="term-tabs">
          <span class="term-tab" :class="{ active: activeTab === 'curl' }" @click="activeTab = 'curl'">curl</span>
          <span class="term-tab" :class="{ active: activeTab === 'node' }" @click="activeTab = 'node'">node</span>
          <span class="term-tab" :class="{ active: activeTab === 'python' }" @click="activeTab = 'python'">python</span>
        </div>
      </div>
      <div class="term-body">

        <!-- curl -->
        <pre v-if="activeTab === 'curl'" class="term-pre"><span class="com"># 1. Install the SDK</span>
<span class="prompt">$</span> <span class="cmd">npm i</span> <span class="str">@llm-lens/instrument</span>

<span class="com"># 2. Send a trace</span>
<span class="prompt">$</span> <span class="cmd">curl</span> <span class="flag">-X</span> POST http://localhost:3001/api/traces/openai \
     <span class="flag">-H</span> <span class="str">"Authorization: Bearer $LLMLENS_API_KEY"</span> \
     <span class="flag">-d</span> <span class="str">@trace.json</span>

<span class="arrow">→</span> <span class="out">trace ingested · id=</span><span class="str">tr_8f3a91</span><span class="out"> · 24ms</span></pre>

        <!-- node -->
        <pre v-else-if="activeTab === 'node'" class="term-pre"><span class="cmd">import</span> OpenAI <span class="cmd">from</span> <span class="str">"openai"</span>
<span class="cmd">import</span> { instrumentOpenAI } <span class="cmd">from</span> <span class="str">"@llm-lens/instrument"</span>

<span class="cmd">const</span> client = <span class="out">instrumentOpenAI</span>(<span class="cmd">new</span> OpenAI(), {
  apiUrl: <span class="str">"http://localhost:3001"</span>,
  apiKey: process.env.<span class="str">LLMLENS_API_KEY</span>,
}) <span class="com">// every call is now captured</span></pre>

        <!-- python -->
        <pre v-else class="term-pre"><span class="com"># pip install llm-lens (coming soon)</span>
<span class="cmd">import</span> requests, json

<span class="cmd">with</span> <span class="out">open</span>(<span class="str">"trace.json"</span>) <span class="cmd">as</span> f:
    data = json.<span class="out">load</span>(f)

requests.<span class="out">post</span>(
    <span class="str">"http://localhost:3001/api/traces/openai"</span>,
    json=data,
    headers={<span class="str">"Authorization"</span>: <span class="str">f"Bearer {apiKey}"</span>}
)</pre>

      </div>
    </div>

    <!-- Footer -->
    <div class="auth-foot">
      <span class="stat"><span class="dot ok" /> Status <span class="v">operational</span></span>
      <span class="stat">v<span class="v">0.4.2</span></span>
      <span class="stat">last deploy <span class="v">26.05 14:02</span></span>
      <span class="spacer" />
      <span class="stat">⭐ <span class="v">1.4k</span></span>
    </div>
  </div>
</template>

<style scoped>
.auth-left {
  background: var(--bg-1);
  border-right: 1px solid var(--border-0);
  display: flex;
  flex-direction: column;
  padding: 28px 32px;
  overflow: hidden;
}

/* Brand row */
.auth-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 14px;
  font-weight: 600;
  letter-spacing: -0.01em;
  color: var(--text-0);
}

.logo {
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  background: var(--accent-bg);
  border: 1px solid var(--accent-border);
  border-radius: var(--radius-sm);
  color: var(--accent);
}

.env {
  margin-left: auto;
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-2);
  background: var(--bg-2);
  padding: 2px 7px;
  border-radius: 3px;
  border: 1px solid var(--border-1);
}

/* Lead copy */
.auth-lead {
  margin-top: 36px;
  max-width: 480px;
}

.auth-lead h1 {
  font-size: 28px;
  line-height: 1.15;
  letter-spacing: -0.025em;
  font-weight: 600;
  margin: 0 0 12px;
  color: var(--text-0);
}

.hl {
  background: linear-gradient(180deg, transparent 60%, var(--accent-bg) 60%);
  padding: 0 2px;
}

.auth-lead p {
  font-size: 14px;
  line-height: 1.55;
  color: var(--text-1);
  margin: 0;
}

.auth-lead p code {
  font-family: var(--font-mono);
  font-size: 12px;
  background: var(--bg-3);
  border: 1px solid var(--border-1);
  border-radius: 3px;
  padding: 1px 4px;
  color: var(--text-0);
}

/* Feature bullets */
.auth-features {
  margin-top: 28px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.auth-feature {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  font-size: 13px;
  color: var(--text-1);
  line-height: 1.45;
}

.check {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--accent-bg);
  border: 1px solid var(--accent-border);
  color: var(--accent);
  display: grid;
  place-items: center;
  flex-shrink: 0;
  margin-top: 1px;
}

.auth-feature strong {
  color: var(--text-0);
  font-weight: 500;
}

/* Terminal */
.auth-terminal {
  margin-top: auto;
  background: var(--bg-2);
  border: 1px solid var(--border-1);
  border-radius: var(--radius-lg);
  font-family: var(--font-mono);
  font-size: 11.5px;
  line-height: 1.55;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.term-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: var(--bg-3);
  border-bottom: 1px solid var(--border-1);
  font-size: 11px;
  color: var(--text-2);
}

.term-dots {
  display: flex;
  gap: 5px;
}

.term-dots span {
  width: 9px;
  height: 9px;
  border-radius: 50%;
}

.term-dots span:nth-child(1) { background: oklch(0.68 0.20 25); }
.term-dots span:nth-child(2) { background: oklch(0.78 0.14 75); }
.term-dots span:nth-child(3) { background: oklch(0.74 0.14 155); }

.term-title { color: var(--text-2); }

.term-tabs {
  margin-left: auto;
  display: flex;
  gap: 8px;
}

.term-tab {
  font-size: 10px;
  color: var(--text-3);
  padding: 1px 6px;
  border-radius: 3px;
  cursor: pointer;
  transition: color 0.1s;
}

.term-tab.active {
  color: var(--text-0);
  background: var(--bg-1);
  border: 1px solid var(--border-1);
}

.term-body {
  padding: 12px 14px;
  max-height: 180px;
  overflow: auto;
  color: var(--text-1);
}

.term-pre {
  margin: 0;
  font: inherit;
  white-space: pre-wrap;
  word-break: break-word;
}

.term-body :deep(.prompt) { color: var(--accent); user-select: none; }
.term-body :deep(.cmd)    { color: var(--text-0); }
.term-body :deep(.flag)   { color: var(--warn); }
.term-body :deep(.str)    { color: var(--success); }
.term-body :deep(.com)    { color: var(--text-3); }
.term-body :deep(.out)    { color: var(--text-1); }
.term-body :deep(.arrow)  { color: var(--accent); }

/* Footer */
.auth-foot {
  display: flex;
  gap: 14px;
  align-items: center;
  margin-top: 18px;
  padding-top: 14px;
  border-top: 1px solid var(--border-0);
  font-size: 11px;
  color: var(--text-2);
}

.stat {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-family: var(--font-mono);
  font-size: 11px;
}

.stat .v { color: var(--text-0); }

.spacer { flex: 1; }
</style>
