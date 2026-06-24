<script setup lang="ts">
const { theme, apply } = useAppearance();
useHead({ htmlAttrs: { "data-theme": theme } });
onMounted(apply);
</script>

<template>
  <NuxtPage />
</template>
