export interface ApiKey {
  id: string;
  name: string;
  lastUsedAt: number | null;
  createdAt: number;
}

export interface CreatedApiKey extends ApiKey {
  key: string;
}

export function useApiKeys() {
  const { apiFetch } = useApiFetch();

  const keys = ref<ApiKey[]>([]);
  const { pending, error, run } = useRequest();

  async function fetchKeys() {
    const result = await run(() => apiFetch<ApiKey[]>("/keys"));
    if (result) keys.value = result;
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
