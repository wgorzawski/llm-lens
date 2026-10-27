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
  name?: string;
  env?: string;
  sessionId?: string;
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
    if (opts?.name) params.set("name", opts.name);
    if (opts?.env) params.set("env", opts.env);
    if (opts?.sessionId) params.set("sessionId", opts.sessionId);

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

export interface TraceFacets {
  names: Array<{ name: string; count: number }>;
  envs: Array<{ env: string; count: number }>;
  models: Array<{ model: string; count: number }>;
}

/** Distinct names, environments and models of the user's traces, for the filter chips */
export function useTraceFacets() {
  const { apiFetch } = useApiFetch();
  const facets = ref<TraceFacets>({ names: [], envs: [], models: [] });
  async function fetchFacets() {
    try {
      facets.value = await apiFetch<TraceFacets>("/traces/facets");
    } catch {
      /* filters just stay empty */
    }
  }
  return { facets, fetchFacets };
}
