<script setup lang="ts">
definePageMeta({ layout: false });

const { login } = useAuth();

const email = ref("");
const password = ref("");
const error = ref<string | null>(null);
const pending = ref(false);

async function submit() {
  error.value = null;
  pending.value = true;
  try {
    await login(email.value, password.value);
    await navigateTo("/");
  } catch (err: unknown) {
    const e = err as { data?: { error?: string }; message?: string };
    error.value = e.data?.error ?? e.message ?? "Login failed";
  } finally {
    pending.value = false;
  }
}
</script>

<template>
  <div class="min-h-screen bg-gray-50 flex items-center justify-center px-4">
    <div class="w-full max-w-sm">
      <div class="text-center mb-8">
        <h1 class="text-2xl font-bold text-gray-900">🔍 LLM Lens</h1>
        <p class="text-sm text-gray-500 mt-1">Sign in to your account</p>
      </div>

      <form class="bg-white rounded-2xl border border-gray-200 p-6 flex flex-col gap-4" @submit.prevent="submit">
        <div
          v-if="error"
          class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {{ error }}
        </div>

        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium text-gray-700">Email</label>
          <input
            v-model="email"
            type="email"
            required
            autocomplete="email"
            placeholder="you@example.com"
            class="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>

        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium text-gray-700">Password</label>
          <input
            v-model="password"
            type="password"
            required
            autocomplete="current-password"
            placeholder="••••••••"
            class="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>

        <button
          type="submit"
          :disabled="pending"
          class="mt-1 w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg px-4 py-2 transition-colors"
        >
          {{ pending ? "Signing in…" : "Sign in" }}
        </button>

        <p class="text-center text-sm text-gray-500">
          No account?
          <NuxtLink to="/register" class="text-blue-600 hover:underline">Create one</NuxtLink>
        </p>
      </form>
    </div>
  </div>
</template>
