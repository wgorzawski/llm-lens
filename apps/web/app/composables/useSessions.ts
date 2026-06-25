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
  const config = useRuntimeConfig();
  const apiBase = config.public.apiBase as string;
  const { token } = useAuth();

  const sessions = ref<Session[]>([]);
  const pending = ref(false);

  function authHeaders(): Record<string, string> {
    return token.value ? { Authorization: `Bearer ${token.value}` } : {};
  }

  async function fetchSessions() {
    pending.value = true;
    try {
      sessions.value = await $fetch<Session[]>(`${apiBase}/sessions`, { headers: authHeaders() });
    } finally {
      pending.value = false;
    }
  }

  async function revoke(id: string) {
    await $fetch(`${apiBase}/sessions/${id}`, { method: "DELETE", headers: authHeaders() });
    sessions.value = sessions.value.filter((s) => s.id !== id);
  }

  return { sessions, pending, fetchSessions, revoke };
}
