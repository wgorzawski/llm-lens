<script setup lang="ts">
import { ref, reactive, onMounted } from "vue";
import { callAnthropic, callOpenAI, type Config } from "./llm";

const STORAGE_KEY = "llm-lens-playground-config";

const config = reactive<Config>({
  llmLensUrl: "http://localhost:3001",
  llmLensApiKey: "",
  anthropicApiKey: "",
  openaiApiKey: "",
});

onMounted(() => {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      Object.assign(config, JSON.parse(saved));
    } catch {}
  }
});

function saveConfig() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

const prompt = ref("");
const configOpen = ref(false);

type Status = "idle" | "loading" | "success" | "error";

const anthropic = reactive<{ status: Status; text: string; error: string }>({
  status: "idle",
  text: "",
  error: "",
});

const openai = reactive<{ status: Status; text: string; error: string }>({
  status: "idle",
  text: "",
  error: "",
});

const canSend = ref(true);

async function send() {
  if (!prompt.value.trim() || !canSend.value) return;

  saveConfig();
  canSend.value = false;
  anthropic.status = "loading";
  anthropic.text = "";
  anthropic.error = "";
  openai.status = "loading";
  openai.text = "";
  openai.error = "";

  await Promise.allSettled([
    callAnthropic(prompt.value, config).then((text) => {
      anthropic.status = "success";
      anthropic.text = text;
    }).catch((err: unknown) => {
      anthropic.status = "error";
      anthropic.error = err instanceof Error ? err.message : String(err);
    }),
    callOpenAI(prompt.value, config).then((text) => {
      openai.status = "success";
      openai.text = text;
    }).catch((err: unknown) => {
      openai.status = "error";
      openai.error = err instanceof Error ? err.message : String(err);
    }),
  ]);

  canSend.value = true;
}
</script>

<template>
  <div class="app">
    <header>
      <h1>LLM Lens <span class="tag">playground</span></h1>
      <button class="btn-ghost" @click="configOpen = !configOpen">
        {{ configOpen ? "Hide config" : "Config" }}
      </button>
    </header>

    <section v-if="configOpen" class="config-panel">
      <div class="config-grid">
        <label>
          LLM Lens URL
          <input v-model="config.llmLensUrl" placeholder="http://localhost:3001" />
        </label>
        <label>
          LLM Lens API Key
          <input v-model="config.llmLensApiKey" type="password" placeholder="llmlens_sk_..." />
        </label>
        <label>
          Anthropic API Key
          <input v-model="config.anthropicApiKey" type="password" placeholder="sk-ant-..." />
        </label>
        <label>
          OpenAI API Key
          <input v-model="config.openaiApiKey" type="password" placeholder="sk-..." />
        </label>
      </div>
      <button class="btn-primary" @click="saveConfig(); configOpen = false">Save & close</button>
    </section>

    <section class="prompt-section">
      <textarea
        v-model="prompt"
        placeholder="Enter your prompt…"
        rows="4"
        @keydown.meta.enter="send"
        @keydown.ctrl.enter="send"
      />
      <button class="btn-primary" :disabled="!canSend || !prompt.trim()" @click="send">
        Send to all providers
      </button>
    </section>

    <section class="results">
      <div class="result-card" :class="anthropic.status">
        <div class="result-header">
          <span class="provider-name">Anthropic</span>
          <span class="model-name">claude-haiku-4-5</span>
          <span v-if="anthropic.status === 'loading'" class="badge loading">sending…</span>
          <span v-else-if="anthropic.status === 'success'" class="badge success">logged</span>
          <span v-else-if="anthropic.status === 'error'" class="badge error">error</span>
        </div>
        <div v-if="anthropic.status === 'loading'" class="result-body placeholder">Waiting for response…</div>
        <div v-else-if="anthropic.status === 'success'" class="result-body">{{ anthropic.text }}</div>
        <div v-else-if="anthropic.status === 'error'" class="result-body error-text">{{ anthropic.error }}</div>
        <div v-else class="result-body placeholder">Response will appear here</div>
      </div>

      <div class="result-card" :class="openai.status">
        <div class="result-header">
          <span class="provider-name">OpenAI</span>
          <span class="model-name">gpt-4o-mini</span>
          <span v-if="openai.status === 'loading'" class="badge loading">sending…</span>
          <span v-else-if="openai.status === 'success'" class="badge success">logged</span>
          <span v-else-if="openai.status === 'error'" class="badge error">error</span>
        </div>
        <div v-if="openai.status === 'loading'" class="result-body placeholder">Waiting for response…</div>
        <div v-else-if="openai.status === 'success'" class="result-body">{{ openai.text }}</div>
        <div v-else-if="openai.status === 'error'" class="result-body error-text">{{ openai.error }}</div>
        <div v-else class="result-body placeholder">Response will appear here</div>
      </div>
    </section>
  </div>
</template>

<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  background: #0f0f11;
  color: #e2e2e6;
  min-height: 100vh;
}

.app {
  max-width: 900px;
  margin: 0 auto;
  padding: 2rem 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

h1 {
  font-size: 1.4rem;
  font-weight: 600;
  color: #fff;
}

.tag {
  font-size: 0.75rem;
  font-weight: 500;
  background: #2a2a35;
  color: #888;
  padding: 2px 8px;
  border-radius: 99px;
  margin-left: 8px;
  vertical-align: middle;
}

.config-panel {
  background: #16161e;
  border: 1px solid #2a2a35;
  border-radius: 10px;
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.config-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
}

label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 0.8rem;
  color: #888;
}

input, textarea {
  background: #0f0f11;
  border: 1px solid #2a2a35;
  border-radius: 6px;
  color: #e2e2e6;
  font-size: 0.9rem;
  padding: 8px 10px;
  outline: none;
  width: 100%;
  transition: border-color 0.15s;
}

input:focus, textarea:focus {
  border-color: #5555ee;
}

textarea {
  resize: vertical;
  font-family: inherit;
  line-height: 1.5;
}

.btn-primary {
  background: #5555ee;
  color: #fff;
  border: none;
  border-radius: 6px;
  padding: 9px 18px;
  font-size: 0.9rem;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s, opacity 0.15s;
  align-self: flex-start;
}

.btn-primary:hover:not(:disabled) { background: #4444cc; }
.btn-primary:disabled { opacity: 0.4; cursor: not-allowed; }

.btn-ghost {
  background: transparent;
  border: 1px solid #2a2a35;
  color: #888;
  border-radius: 6px;
  padding: 6px 14px;
  font-size: 0.85rem;
  cursor: pointer;
  transition: border-color 0.15s, color 0.15s;
}

.btn-ghost:hover { border-color: #555; color: #ccc; }

.prompt-section {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.results {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
}

.result-card {
  background: #16161e;
  border: 1px solid #2a2a35;
  border-radius: 10px;
  overflow: hidden;
  transition: border-color 0.2s;
}

.result-card.success { border-color: #1a3a2a; }
.result-card.error { border-color: #3a1a1a; }

.result-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-bottom: 1px solid #2a2a35;
  background: #12121a;
}

.provider-name {
  font-weight: 600;
  font-size: 0.9rem;
  color: #fff;
}

.model-name {
  font-size: 0.75rem;
  color: #555;
  flex: 1;
}

.badge {
  font-size: 0.7rem;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 99px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.badge.loading { background: #2a2a35; color: #888; }
.badge.success { background: #1a3a2a; color: #4ade80; }
.badge.error { background: #3a1a1a; color: #f87171; }

.result-body {
  padding: 14px;
  font-size: 0.88rem;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
  min-height: 120px;
}

.result-body.placeholder { color: #444; font-style: italic; }
.result-body.error-text { color: #f87171; }

@media (max-width: 600px) {
  .results { grid-template-columns: 1fr; }
  .config-grid { grid-template-columns: 1fr; }
}
</style>
