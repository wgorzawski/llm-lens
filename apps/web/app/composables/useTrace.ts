import type { UnifiedTrace } from "@llm-lens/types";

export interface TraceNote {
  id: string;
  traceId: string;
  userId: string;
  body: string;
  createdAt: string;
}

export function useTrace(id: string) {
  const { apiFetch } = useApiFetch();

  const trace = ref<UnifiedTrace | null>(null);
  const pending = ref(false);
  const error = ref<string | null>(null);

  async function fetchTrace() {
    pending.value = true;
    error.value = null;
    try {
      trace.value = await apiFetch<UnifiedTrace>(`/traces/${id}`);
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err);
    } finally {
      pending.value = false;
    }
  }

  async function toggleStar() {
    if (!trace.value) return;
    trace.value = await apiFetch<UnifiedTrace>(`/traces/${id}`, {
      method: "PATCH",
      body: { starred: !trace.value.starred },
    });
  }

  async function remove() {
    await apiFetch(`/traces/${id}`, { method: "DELETE" });
  }

  async function replay(): Promise<UnifiedTrace> {
    return apiFetch<UnifiedTrace>(`/traces/${id}/replay`, { method: "POST" });
  }

  async function fetchNotes(): Promise<TraceNote[]> {
    return apiFetch<TraceNote[]>(`/traces/${id}/notes`);
  }

  async function addNote(body: string): Promise<TraceNote> {
    return apiFetch<TraceNote>(`/traces/${id}/notes`, { method: "POST", body: { body } });
  }

  return { trace, pending, error, fetchTrace, toggleStar, remove, replay, fetchNotes, addNote };
}
