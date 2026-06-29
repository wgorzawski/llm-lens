export interface ApiKey {
  id: string;
  name: string;
  env: string;
  scopes: string[];
  status: string;
  prefix: string;
  tail: string;
  lastUsedAt: number | null;
  createdAt: number;
}

export interface CreatedApiKey extends ApiKey {
  key: string;
}

export interface WebhookSecret {
  prefix: string;
  tail: string;
  masked: string;
}

export function useApiKeys() {
  const { apiFetch } = useApiFetch();

  const keys = ref<ApiKey[]>([]);
  const { pending, error, run } = useRequest();

  async function fetchKeys() {
    const result = await run(() => apiFetch<ApiKey[]>("/keys"));
    if (result) keys.value = result;
  }

  async function createKey(name: string, env = "production", scopes = ["read", "write"]): Promise<CreatedApiKey> {
    const result = await apiFetch<CreatedApiKey>("/keys", { method: "POST", body: { name, env, scopes } });
    keys.value = [result, ...keys.value];
    return result;
  }

  async function updateKey(id: string, patch: { name?: string; scopes?: string[]; status?: string }): Promise<ApiKey> {
    const result = await apiFetch<ApiKey>(`/keys/${id}`, { method: "PATCH", body: patch });
    keys.value = keys.value.map((k) => (k.id === id ? result : k));
    return result;
  }

  async function rotateKey(id: string): Promise<CreatedApiKey> {
    return apiFetch<CreatedApiKey>(`/keys/${id}/rotate`, { method: "POST" });
  }

  async function revokeKey(id: string) {
    await apiFetch(`/keys/${id}`, { method: "DELETE" });
    keys.value = keys.value.filter((k) => k.id !== id);
  }

  async function getWebhookSecret(): Promise<WebhookSecret> {
    return apiFetch<WebhookSecret>("/keys/webhook-secret");
  }

  async function rotateWebhookSecret(): Promise<{ key: string }> {
    return apiFetch<{ key: string }>("/keys/webhook-secret/rotate", { method: "POST" });
  }

  async function revealWebhookSecret(): Promise<{ key: string }> {
    return apiFetch<{ key: string }>("/keys/webhook-secret/reveal", { method: "POST" });
  }

  return { keys, pending, error, fetchKeys, createKey, updateKey, rotateKey, revokeKey, getWebhookSecret, rotateWebhookSecret, revealWebhookSecret };
}
