export function useApiFetch() {
  const config = useRuntimeConfig();
  const apiBase = apiBaseFor(config);
  const { token } = useAuth();
  // Created up front: composables can't be called after an await during SSR.
  const sessionExpired = useCookie<string | null>("session_expired", { maxAge: 60 });

  function authHeaders(): Record<string, string> {
    return token.value ? { Authorization: `Bearer ${token.value}` } : {};
  }

  async function apiFetch<T>(
    path: string,
    options?: Parameters<typeof $fetch>[1],
  ): Promise<T> {
    // Whether this request carried a token - several requests can fail with 401 at
    // once, and only the first one sees token.value still set.
    const sentToken = !!token.value;
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
        // This can run during SSR and the auth middleware redirects again on the
        // client, so a query param would get lost - a short-lived cookie survives
        // both. The login page turns it into a snackbar.
        if (sentToken) sessionExpired.value = "1";
        await navigateTo("/login");
      }
      throw err;
    }
  }

  return { apiFetch };
}

/** API base URL: the server-side one during SSR when configured, the public one otherwise */
export function apiBaseFor(config: ReturnType<typeof useRuntimeConfig>): string {
  if (import.meta.server && config.apiBaseServer) return config.apiBaseServer as string;
  return config.public.apiBase as string;
}
