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
  <div class="min-h-screen bg-gray-50 flex items-center justify-center">
    <div class="w-8 h-8 border-3 border-blue-400 border-t-transparent rounded-full animate-spin" />
  </div>
</template>
