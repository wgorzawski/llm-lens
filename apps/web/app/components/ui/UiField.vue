<script setup lang="ts">
interface Props {
  label?: string
  type?: string
  placeholder?: string
  error?: boolean
  errorMsg?: string
  autoFocus?: boolean
}

const props = withDefaults(defineProps<Props>(), { type: 'text' })
const model = defineModel<string>()

const showPassword = ref(false)
const isPassword = computed(() => props.type === 'password')
const inputType = computed(() => (isPassword.value && showPassword.value ? 'text' : props.type))
</script>

<template>
  <div class="field">
    <div class="field-label">
      <span>{{ label }}</span>
      <span v-if="$slots.hint" class="hint"><slot name="hint" /></span>
    </div>
    <div class="field-input" :class="{ error }">
      <span v-if="$slots.lead" class="lead"><slot name="lead" /></span>
      <input
        :type="inputType"
        :placeholder="placeholder"
        :autofocus="autoFocus"
        :value="model"
        autocomplete="off"
        spellcheck="false"
        @input="model = ($event.target as HTMLInputElement).value"
      />
      <span v-if="isPassword" class="trail">
        <button type="button" :title="showPassword ? 'Hide' : 'Show'" @click="showPassword = !showPassword">
          <svg v-if="showPassword" width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="8" cy="8" r="2.5" />
            <path d="M1.5 8 Q4.5 3 8 3 Q11.5 3 14.5 8 Q11.5 13 8 13 Q4.5 13 1.5 8 Z" />
          </svg>
          <svg v-else width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M1.5 8 Q4.5 3 8 3 Q11.5 3 14.5 8 Q11.5 13 8 13 Q4.5 13 1.5 8 Z" />
            <circle cx="8" cy="8" r="2.5" />
            <line x1="2" y1="2" x2="14" y2="14" />
          </svg>
        </button>
      </span>
    </div>
    <div v-if="error && errorMsg" class="field-msg error">
      <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
        <path d="M4 4 L12 12 M12 4 L4 12" />
      </svg>
      {{ errorMsg }}
    </div>
  </div>
</template>

<style scoped>
.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 12px;
}

.field-label {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  font-size: 11px;
  font-weight: 500;
  color: var(--text-1);
}

.hint {
  font-size: 10px;
  color: var(--text-3);
  font-weight: 400;
  font-family: var(--font-mono);
}

.hint :deep(a) {
  color: var(--accent);
}

.hint :deep(a:hover) {
  text-decoration: underline;
}

.field-input {
  display: flex;
  align-items: center;
  height: 36px;
  border: 1px solid var(--border-1);
  background: var(--bg-2);
  border-radius: var(--radius-md);
  padding: 0 10px;
  transition: border-color 0.1s, background 0.1s, box-shadow 0.1s;
}

.field-input:focus-within {
  border-color: var(--accent);
  background: var(--bg-1);
  box-shadow: 0 0 0 3px var(--accent-bg);
}

.field-input.error {
  border-color: var(--danger);
  background: oklch(0.68 0.20 25 / 0.06);
}

.field-input.error:focus-within {
  box-shadow: 0 0 0 3px oklch(0.68 0.20 25 / 0.18);
}

.field-input input {
  flex: 1;
  height: 100%;
  font-size: 13px;
  color: var(--text-0);
  background: transparent;
  border: 0;
  outline: 0;
  font-family: var(--font-sans);
}

.field-input input::placeholder {
  color: var(--text-3);
}

.lead,
.trail {
  color: var(--text-2);
  font-family: var(--font-mono);
  font-size: 12px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.lead { margin-right: 8px; }
.trail { margin-left: 8px; }

.trail button {
  width: 22px;
  height: 22px;
  display: grid;
  place-items: center;
  border-radius: 3px;
  color: var(--text-2);
  transition: color 0.1s, background 0.1s;
}

.trail button:hover {
  color: var(--text-0);
  background: var(--bg-3);
}

.field-msg {
  font-size: 11px;
  color: var(--text-2);
  display: flex;
  align-items: center;
  gap: 5px;
}

.field-msg.error { color: var(--danger); }
.field-msg.ok    { color: var(--success); }
</style>
