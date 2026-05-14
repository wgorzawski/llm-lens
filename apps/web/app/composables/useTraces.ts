import type { UnifiedTrace, TraceProvider } from "@llm-lens/types";

export interface TracesPage {
  traces: UnifiedTrace[];
  total: number;
  limit: number;
  offset: number;
}

export function useTraces(opts?: { provider?: TraceProvider; limit?: number }) {
  const config = useRuntimeConfig();
  const apiBase = config.public.apiBase as string;

  const page = ref<TracesPage>({ traces: [], total: 0, limit: 50, offset: 0 });
  const pending = ref(false);
  const error = ref<string | null>(null);

  async function fetchTraces(offset = 0) {
    pending.value = true;
    error.value = null;
    const params = new URLSearchParams({
      limit: String(opts?.limit ?? 50),
      offset: String(offset),
    });
    if (opts?.provider) params.set("provider", opts.provider);
    try {
      const data = await $fetch<TracesPage>(`${apiBase}/traces?${params}`);
      page.value = data;
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err);
    } finally {
      pending.value = false;
    }
  }

  return { page, pending, error, fetchTraces };
}
