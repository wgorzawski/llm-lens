/**
 * Shared fetch wrapper used by all composables.
 * Injects the auth token and base URL so each composable
 * doesn't have to repeat that boilerplate.
 *
 * Usage:
 *   const { apiFetch } = useApiFetch()
 *   const data = await apiFetch<MyType>("/traces")
 *   await apiFetch("/traces/123", { method: "DELETE" })
 */
export function useApiFetch() {
  const config = useRuntimeConfig();
  const apiBase = config.public.apiBase as string;
  const { token } = useAuth();

  function authHeaders(): Record<string, string> {
    return token.value ? { Authorization: `Bearer ${token.value}` } : {};
  }

  function apiFetch<T>(
    path: string,
    options?: Parameters<typeof $fetch>[1],
  ): Promise<T> {
    return $fetch<T>(`${apiBase}${path}`, {
      ...options,
      headers: { ...authHeaders(), ...(options?.headers as Record<string, string> ?? {}) },
    });
  }

  return { apiFetch };
}
