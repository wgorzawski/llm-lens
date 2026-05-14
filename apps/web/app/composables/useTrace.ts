import type { UnifiedTrace } from "@llm-lens/types";

export function useTrace(id: string) {
  const config = useRuntimeConfig();
  const apiBase = config.public.apiBase as string;

  const trace = ref<UnifiedTrace | null>(null);
  const pending = ref(false);
  const error = ref<string | null>(null);

  async function fetchTrace() {
    pending.value = true;
    error.value = null;
    try {
      trace.value = await $fetch<UnifiedTrace>(`${apiBase}/traces/${id}`);
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err);
    } finally {
      pending.value = false;
    }
  }

  return { trace, pending, error, fetchTrace };
}
