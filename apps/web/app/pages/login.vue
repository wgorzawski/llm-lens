<script setup lang="ts">
definePageMeta({ layout: false })

useHead({ htmlAttrs: { 'data-theme': 'dark' } })

const { login, loginTwoFactor } = useAuth()
const config = useRuntimeConfig()
const apiBase = config.public.apiBase as string
const demoMode = config.public.demoMode as boolean

const DEMO_EMAIL = 'demo@llmlens.dev'
const DEMO_PASSWORD = 'demo1234'

function fillDemo() {
  email.value = DEMO_EMAIL
  password.value = DEMO_PASSWORD
}

const email = ref('')
const password = ref('')
const error = ref<string | null>(null)
const pending = ref(false)
const keepSignedIn = ref(true)

const pendingToken = ref<string | null>(null)
const twoFactorCode = ref('')

async function goHome() {
  await navigateTo((useRoute().query.redirect as string) || '/')
}

async function submit() {
  error.value = null
  pending.value = true
  try {
    const result = await login(email.value, password.value)
    if (result && "requiresTwoFactor" in result) {
      pendingToken.value = result.pendingToken
    } else {
      await goHome()
    }
  } catch (err: unknown) {
    const e = err as { data?: { error?: string }; message?: string }
    error.value = e.data?.error ?? e.message ?? 'Login failed'
  } finally {
    pending.value = false
  }
}

async function submitTwoFactor() {
  if (!pendingToken.value) return
  error.value = null
  pending.value = true
  try {
    await loginTwoFactor(pendingToken.value, twoFactorCode.value)
    await goHome()
  } catch (err: unknown) {
    const e = err as { data?: { error?: string }; message?: string }
    error.value = e.data?.error ?? e.message ?? 'Invalid code'
  } finally {
    pending.value = false
  }
}

function onKeydown(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
    if (pendingToken.value) submitTwoFactor(); else submit();
  }
}
</script>

<template>
  <div class="auth-page" @keydown="onKeydown">
    <AuthLeft variant="login" />

    <div class="auth-right">
      <!-- Top nav -->
      <div class="auth-topnav">
        <span>No account? <NuxtLink to="/register">Sign up</NuxtLink></span>
      </div>

      <!-- 2FA step -->
      <form v-if="pendingToken" class="auth-card" @submit.prevent="submitTwoFactor">
        <div class="auth-card-mobile-brand">
          <div class="logo">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
              <circle cx="7" cy="7" r="4.2" />
              <path d="M10.2 10.2 L13.5 13.5" stroke-linecap="round" />
              <circle cx="7" cy="7" r="1.5" fill="currentColor" stroke="none" opacity="0.4" />
            </svg>
          </div>
          <span>LLM Lens</span>
        </div>

        <h2 class="auth-h">Two-factor authentication</h2>
        <p class="auth-sub">Enter the 6-digit code from your authenticator app, or a recovery code.</p>

        <UiField
          v-model="twoFactorCode"
          label="Code"
          placeholder="123456"
          :auto-focus="true"
          :error="!!error"
          :error-msg="error ?? undefined"
        />

        <button type="submit" class="btn-submit" :disabled="pending">
          {{ pending ? 'Verifying…' : 'Verify' }}
          <span class="kbd">⌘ ↵</span>
        </button>

        <button type="button" class="btn-back" @click="pendingToken = null">← Back to sign in</button>
      </form>

      <!-- Form -->
      <form v-else class="auth-card" @submit.prevent="submit">
        <!-- Mobile brand (hidden on desktop) -->
        <div class="auth-card-mobile-brand">
          <div class="logo">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
              <circle cx="7" cy="7" r="4.2" />
              <path d="M10.2 10.2 L13.5 13.5" stroke-linecap="round" />
              <circle cx="7" cy="7" r="1.5" fill="currentColor" stroke="none" opacity="0.4" />
            </svg>
          </div>
          <span>LLM Lens</span>
        </div>

        <div v-if="demoMode" class="demo-banner" @click="fillDemo">
          <span class="demo-label">demo</span>
          <span class="demo-cred"><span class="demo-k">email</span> {{ DEMO_EMAIL }}</span>
          <span class="demo-sep">·</span>
          <span class="demo-cred"><span class="demo-k">pass</span> {{ DEMO_PASSWORD }}</span>
          <span class="demo-hint">click to fill</span>
        </div>

        <h2 class="auth-h">Sign in</h2>
        <p class="auth-sub">Welcome back. <NuxtLink to="/register">Create an account →</NuxtLink></p>

        <!-- SSO -->
        <div class="sso-grid">
          <a :href="`${apiBase}/auth/github`" class="sso-btn">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <path fill-rule="evenodd" d="M8 0C3.58 0 0 3.58 0 8a8 8 0 0 0 5.47 7.59c.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
            </svg>
            GitHub
          </a>
          <a :href="`${apiBase}/auth/google`" class="sso-btn">
            <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
              <path fill="#4285F4" d="M15.6 8.2c0-.5 0-1-.1-1.5H8v2.8h4.3a3.7 3.7 0 0 1-1.6 2.4v2h2.6c1.5-1.4 2.3-3.5 2.3-5.7z" />
              <path fill="#34A853" d="M8 16c2.2 0 4-.7 5.3-2l-2.6-2c-.7.5-1.6.8-2.7.8-2 0-3.8-1.4-4.4-3.3H1V11.6A8 8 0 0 0 8 16z" />
              <path fill="#FBBC04" d="M3.6 9.5a4.8 4.8 0 0 1 0-3V4.4H1A8 8 0 0 0 1 11.6l2.6-2z" />
              <path fill="#EA4335" d="M8 3.2c1.2 0 2.2.4 3 1.2l2.3-2.3A8 8 0 0 0 1 4.4l2.6 2C4.2 4.6 6 3.2 8 3.2z" />
            </svg>
            Google
          </a>
        </div>

        <div class="sep-or">or with email</div>

        <!-- Fields -->
        <UiField
          v-model="email"
          label="Email"
          type="email"
          placeholder="you@company.com"
          :auto-focus="true"
          :error="!!error"
        >
          <template #lead>
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="7" cy="7" r="4.5" />
              <path d="M10.5 10.5 L14 14" />
            </svg>
          </template>
        </UiField>

        <UiField
          v-model="password"
          label="Password"
          type="password"
          placeholder="••••••••••••"
          :error="!!error"
          :error-msg="error ?? undefined"
        >
          <template #hint>
            <a href="#">Forgot password?</a>
          </template>
        </UiField>

        <!-- Keep signed in -->
        <label class="cbox-row" @click.prevent="keepSignedIn = !keepSignedIn">
          <span class="cbox" :class="{ on: keepSignedIn }" />
          Keep me signed in for 30 days
        </label>

        <!-- Submit -->
        <button type="submit" class="btn-submit" :disabled="pending">
          {{ pending ? 'Signing in…' : 'Sign in' }}
          <span class="kbd">⌘ ↵</span>
        </button>

        <!-- JWT chip (decorative) -->
        <div class="jwt-chip">
          <span class="comment">// on success → JWT</span>
          &nbsp;&nbsp;<span class="b1">eyJhbGciOiJIUzI1NiI…</span><span class="sep">.</span><span class="b2">eyJzdWIiOiJ1c3JfMmEx…</span><span class="sep">.</span><span class="b3">XwQv7K2…</span>
        </div>

        <!-- Legal -->
        <div class="auth-legal">
          <a href="#">Privacy</a>
          <a href="#">Terms</a>
          <a href="#">Status</a>
          <a href="#">Docs</a>
        </div>
      </form>
    </div>
  </div>
</template>

<style scoped>
.auth-page {
  min-height: 100vh;
  display: grid;
  grid-template-columns: minmax(0, 1.05fr) minmax(0, 1fr);
  background: var(--bg-0);
}

@media (max-width: 900px) {
  .auth-page {
    grid-template-columns: 1fr;
  }
}

/* Right column */
.auth-right {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 28px;
  position: relative;
}

.auth-topnav {
  position: absolute;
  top: 24px;
  right: 28px;
  display: flex;
  gap: 8px;
  align-items: center;
  font-size: 12px;
  color: var(--text-2);
}

.auth-topnav a {
  color: var(--accent);
  font-weight: 500;
}

.auth-topnav a:hover { text-decoration: underline; }

/* Form card */
.auth-card {
  width: 100%;
  max-width: 380px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

/* Mobile brand (hidden on desktop, shown on mobile when left panel hides) */
.auth-card-mobile-brand {
  display: none;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 16px;
  color: var(--text-0);
}

@media (max-width: 900px) {
  .auth-card-mobile-brand { display: flex; }
}

.auth-card-mobile-brand .logo {
  width: 24px;
  height: 24px;
  display: grid;
  place-items: center;
  background: var(--accent-bg);
  border: 1px solid var(--accent-border);
  border-radius: var(--radius-sm);
  color: var(--accent);
}

.auth-h {
  font-size: 22px;
  font-weight: 600;
  letter-spacing: -0.02em;
  color: var(--text-0);
  margin: 0 0 4px;
}

.auth-sub {
  font-size: 13px;
  color: var(--text-1);
  margin: 0 0 20px;
}

.auth-sub a {
  color: var(--accent);
  font-weight: 500;
}

.auth-sub a:hover { text-decoration: underline; }

/* SSO */
.sso-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-bottom: 16px;
}

.sso-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 36px;
  padding: 0 12px;
  border: 1px solid var(--border-1);
  border-radius: var(--radius-md);
  background: var(--bg-2);
  color: var(--text-0);
  font-size: 12px;
  font-weight: 500;
  transition: border-color 0.1s, background 0.1s;
}

.sso-btn:hover {
  border-color: var(--border-2);
  background: var(--bg-3);
}

.sep-or {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 4px 0 16px;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-3);
  font-weight: 500;
}

.sep-or::before,
.sep-or::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--border-1);
}

/* Checkbox */
.cbox-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--text-1);
  cursor: pointer;
  user-select: none;
  margin-bottom: 12px;
}

.cbox {
  width: 14px;
  height: 14px;
  border: 1px solid var(--border-2);
  border-radius: 3px;
  background: var(--bg-2);
  display: inline-grid;
  place-items: center;
  flex-shrink: 0;
  transition: background 0.1s, border-color 0.1s;
}

.cbox.on {
  background: var(--accent);
  border-color: var(--accent);
  color: white;
}

.cbox.on::after {
  content: '✓';
  font-size: 9px;
  line-height: 1;
}

/* Submit */
.btn-submit {
  width: 100%;
  height: 38px;
  font-size: 13px;
  font-weight: 500;
  border-radius: var(--radius-md);
  background: var(--accent);
  color: white;
  border: 0;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: filter 0.1s;
}

.btn-submit:hover:not(:disabled) { filter: brightness(1.08); }
.btn-submit:active:not(:disabled) { filter: brightness(0.95); }
.btn-submit:disabled { opacity: 0.6; cursor: not-allowed; }

.btn-back {
  margin-top: 12px;
  font-size: 12px;
  color: var(--text-2);
  background: none;
  border: 0;
  cursor: pointer;
  text-align: center;
  width: 100%;
}
.btn-back:hover { color: var(--text-0); }

.kbd {
  font-family: var(--font-mono);
  font-size: 10px;
  background: rgba(255, 255, 255, 0.18);
  color: rgba(255, 255, 255, 0.95);
  padding: 1px 5px;
  border-radius: 3px;
  margin-left: 2px;
}

/* JWT chip */
.jwt-chip {
  margin-top: 12px;
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-3);
  background: var(--bg-2);
  border: 1px dashed var(--border-1);
  border-radius: var(--radius-sm);
  padding: 6px 8px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.jwt-chip .comment { color: var(--text-3); }
.jwt-chip .b1 { color: oklch(0.74 0.14 230); }
.jwt-chip .b2 { color: var(--warn); }
.jwt-chip .b3 { color: var(--success); }
.jwt-chip .sep { color: var(--text-3); }

/* Demo banner */
.demo-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  margin-bottom: 16px;
  background: oklch(0.28 0.06 230 / 0.5);
  border: 1px solid oklch(0.55 0.14 230 / 0.4);
  border-radius: var(--radius-md);
  font-size: 12px;
  font-family: var(--font-mono);
  color: var(--text-1);
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
}
.demo-banner:hover {
  border-color: oklch(0.65 0.16 230 / 0.7);
  background: oklch(0.32 0.07 230 / 0.5);
}
.demo-label {
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-weight: 600;
  color: oklch(0.72 0.14 230);
  background: oklch(0.55 0.14 230 / 0.2);
  border: 1px solid oklch(0.55 0.14 230 / 0.35);
  padding: 1px 5px;
  border-radius: 3px;
  flex-shrink: 0;
}
.demo-cred { color: var(--text-0); }
.demo-k { color: var(--text-3); margin-right: 3px; }
.demo-sep { color: var(--text-3); }
.demo-hint {
  margin-left: auto;
  font-size: 10px;
  color: var(--text-3);
  flex-shrink: 0;
}

/* Legal */
.auth-legal {
  margin-top: 28px;
  text-align: center;
  font-size: 10px;
  color: var(--text-3);
  font-family: var(--font-mono);
  display: flex;
  justify-content: center;
  gap: 14px;
}

.auth-legal a { color: var(--text-2); }
.auth-legal a:hover { color: var(--text-0); }
</style>
