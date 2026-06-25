export interface Session {
  id: string;
  userId: string;
  device: string;
  ip: string;
  userAgent: string;
  createdAt: string;
  lastActiveAt: string;
}

export function useSessions() {
  const { apiFetch } = useApiFetch();

  const sessions = ref<Session[]>([]);
  const pending = ref(false);

  async function fetchSessions() {
    pending.value = true;
    try {
      sessions.value = await apiFetch<Session[]>("/sessions");
    } finally {
      pending.value = false;
    }
  }

  async function revoke(id: string) {
    await apiFetch(`/sessions/${id}`, { method: "DELETE" });
    sessions.value = sessions.value.filter((s) => s.id !== id);
  }

  return { sessions, pending, fetchSessions, revoke };
}
