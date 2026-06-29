export function useApiFetch() {
  const config = useRuntimeConfig();
  const apiBase = config.public.apiBase as string;
  const { token } = useAuth();

  function authHeaders(): Record<string, string> {
    return token.value ? { Authorization: `Bearer ${token.value}` } : {};
  }

  async function apiFetch<T>(
    path: string,
    options?: Parameters<typeof $fetch>[1],
  ): Promise<T> {
    try {
      return await $fetch<T>(`${apiBase}${path}`, {
        ...options,
        headers: { ...authHeaders(), ...(options?.headers as Record<string, string> ?? {}) },
      });
    } catch (err: unknown) {
      const status = (err as { status?: number; statusCode?: number })?.status
        ?? (err as { status?: number; statusCode?: number })?.statusCode;
      // 401 = token expired/invalid, 404 on /users/me = user wiped from DB
      if (status === 401 || (status === 404 && path === "/users/me")) {
        token.value = null;
        await navigateTo("/login");
      }
      throw err;
    }
  }

  return { apiFetch };
}
