export interface ApiKey {
  id: string;
  name: string;
  lastUsedAt: string | null;
  createdAt: number;
}

export interface CreatedApiKey extends ApiKey {
  key: string;
}

export function useApiKeys() {
  const config = useRuntimeConfig();
  const apiBase = config.public.apiBase as string;
  const { token } = useAuth();

  const keys = ref<ApiKey[]>([]);
  const pending = ref(false);
  const error = ref<string | null>(null);

  function authHeaders(): Record<string, string> {
    return token.value ? { Authorization: `Bearer ${token.value}` } : {};
  }

  async function fetchKeys() {
    pending.value = true;
    error.value = null;
    try {
      keys.value = await $fetch<ApiKey[]>(`${apiBase}/keys`, {
        headers: authHeaders(),
      });
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err);
    } finally {
      pending.value = false;
    }
  }

  async function createKey(name: string): Promise<CreatedApiKey> {
    const result = await $fetch<CreatedApiKey>(`${apiBase}/keys`, {
      method: "POST",
      headers: authHeaders(),
      body: { name },
    });
    keys.value = [result, ...keys.value];
    return result;
  }

  async function revokeKey(id: string) {
    await $fetch(`${apiBase}/keys/${id}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    keys.value = keys.value.filter((k) => k.id !== id);
  }

  return { keys, pending, error, fetchKeys, createKey, revokeKey };
}
