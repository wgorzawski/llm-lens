import type { UnifiedTrace, TraceProvider } from "@llm-lens/types";

export interface TracesPage {
  traces: UnifiedTrace[];
  total: number;
  limit: number;
  offset: number;
}

export function useTraces(opts?: {
  provider?: TraceProvider;
  model?: string;
  status?: string;
  latency?: string;
  from?: string;
  to?: string;
  q?: string;
  sort?: string;
  limit?: number;
}) {
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
    if (opts?.model) params.set("model", opts.model);
    if (opts?.status) params.set("status", opts.status);
    if (opts?.latency) params.set("latency", opts.latency);
    if (opts?.from) params.set("from", opts.from);
    if (opts?.to) params.set("to", opts.to);
    if (opts?.q) params.set("q", opts.q);
    if (opts?.sort) params.set("sort", opts.sort);
    try {
      const data = await $fetch<TracesPage>(`${apiBase}/traces?${params}`, {
        headers: authHeaders(),
      });
      page.value = data;
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err);
    } finally {
      pending.value = false;
    }
  }

  function authHeaders(): Record<string, string> {
    const { token } = useAuth();
    return token.value ? { Authorization: `Bearer ${token.value}` } : {};
  }

  async function deleteOne(id: string) {
    await $fetch(`${apiBase}/traces/${id}`, { method: "DELETE", headers: authHeaders() });
  }

  async function deleteMany(ids: string[]): Promise<number> {
    const res = await $fetch<{ deletedCount: number }>(`${apiBase}/traces`, {
      method: "DELETE",
      headers: authHeaders(),
      body: { ids },
    });
    return res.deletedCount;
  }

  async function setStarred(id: string, starred: boolean): Promise<UnifiedTrace> {
    return $fetch<UnifiedTrace>(`${apiBase}/traces/${id}`, {
      method: "PATCH",
      headers: authHeaders(),
      body: { starred },
    });
  }

  return { page, pending, error, fetchTraces, deleteOne, deleteMany, setStarred };
}
