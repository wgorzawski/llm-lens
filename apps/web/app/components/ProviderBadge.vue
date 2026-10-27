<script setup lang="ts">
import { providerLabel } from "@llm-lens/types";

const props = defineProps<{ provider: string }>();
</script>

<template>
  <span class="prov" :class="`prov-${props.provider}`">{{ providerLabel(props.provider) }}</span>
</template>
