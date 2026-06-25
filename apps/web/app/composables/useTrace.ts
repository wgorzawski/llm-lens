import type { UnifiedTrace } from "@llm-lens/types";

export interface TraceNote {
  id: string;
  traceId: string;
  userId: string;
  body: string;
  createdAt: string;
}

export function useTrace(id: string) {
  const config = useRuntimeConfig();
  const apiBase = config.public.apiBase as string;

  const trace = ref<UnifiedTrace | null>(null);
  const pending = ref(false);
  const error = ref<string | null>(null);

  function authHeaders(): Record<string, string> {
    const { token } = useAuth();
    return token.value ? { Authorization: `Bearer ${token.value}` } : {};
  }

  async function fetchTrace() {
    pending.value = true;
    error.value = null;
    try {
      trace.value = await $fetch<UnifiedTrace>(`${apiBase}/traces/${id}`, {
        headers: authHeaders(),
      });
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err);
    } finally {
      pending.value = false;
    }
  }

  async function toggleStar() {
    if (!trace.value) return;
    const next = !trace.value.starred;
    trace.value = await $fetch<UnifiedTrace>(`${apiBase}/traces/${id}`, {
      method: "PATCH",
      headers: authHeaders(),
      body: { starred: next },
    });
  }

  async function remove() {
    await $fetch(`${apiBase}/traces/${id}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
  }

  async function replay(): Promise<UnifiedTrace> {
    return $fetch<UnifiedTrace>(`${apiBase}/traces/${id}/replay`, {
      method: "POST",
      headers: authHeaders(),
    });
  }

  async function fetchNotes(): Promise<TraceNote[]> {
    return $fetch<TraceNote[]>(`${apiBase}/traces/${id}/notes`, {
      headers: authHeaders(),
    });
  }

  async function addNote(body: string): Promise<TraceNote> {
    return $fetch<TraceNote>(`${apiBase}/traces/${id}/notes`, {
      method: "POST",
      headers: authHeaders(),
      body: { body },
    });
  }

  return { trace, pending, error, fetchTrace, toggleStar, remove, replay, fetchNotes, addNote };
}
