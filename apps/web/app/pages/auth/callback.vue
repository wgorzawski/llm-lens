<script setup lang="ts">
definePageMeta({ layout: false });

const route = useRoute();
const { token } = useAuth();

const urlToken = route.query.token as string | undefined;
if (urlToken) {
  token.value = urlToken;
  await navigateTo("/");
} else {
  await navigateTo("/login?error=oauth_failed");
}
</script>

<template>
  <div class="cb-wrap">
    <div class="cb-spinner" />
  </div>
</template>

<style scoped>
.cb-wrap {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-0);
}

.cb-spinner {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 2px solid var(--border-1);
  border-top-color: var(--accent);
  animation: spin 0.7s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
