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
  const { apiFetch } = useApiFetch();

  const keys = ref<ApiKey[]>([]);
  const pending = ref(false);
  const error = ref<string | null>(null);

  async function fetchKeys() {
    pending.value = true;
    error.value = null;
    try {
      keys.value = await apiFetch<ApiKey[]>("/keys");
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err);
    } finally {
      pending.value = false;
    }
  }

  async function createKey(name: string): Promise<CreatedApiKey> {
    const result = await apiFetch<CreatedApiKey>("/keys", { method: "POST", body: { name } });
    keys.value = [result, ...keys.value];
    return result;
  }

  async function revokeKey(id: string) {
    await apiFetch(`/keys/${id}`, { method: "DELETE" });
    keys.value = keys.value.filter((k) => k.id !== id);
  }

  return { keys, pending, error, fetchKeys, createKey, revokeKey };
}
