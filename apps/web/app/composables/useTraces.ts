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
  const { apiFetch } = useApiFetch();

  const page = ref<TracesPage>({ traces: [], total: 0, limit: 50, offset: 0 });
  const { pending, error, run } = useRequest();

  async function fetchTraces(offset = 0) {
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

    const result = await run(() => apiFetch<TracesPage>(`/traces?${params}`));
    if (result) page.value = result;
  }

  async function deleteOne(id: string) {
    await apiFetch(`/traces/${id}`, { method: "DELETE" });
  }

  async function deleteMany(ids: string[]): Promise<number> {
    const res = await apiFetch<{ deletedCount: number }>("/traces", {
      method: "DELETE",
      body: { ids },
    });
    return res.deletedCount;
  }

  async function setStarred(id: string, starred: boolean): Promise<UnifiedTrace> {
    return apiFetch<UnifiedTrace>(`/traces/${id}`, { method: "PATCH", body: { starred } });
  }

  return { page, pending, error, fetchTraces, deleteOne, deleteMany, setStarred };
}
