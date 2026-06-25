export function useAuth() {
  const token = useCookie<string | null>("auth_token", { default: () => null, maxAge: 60 * 60 * 24 * 30 });
  const config = useRuntimeConfig();
  const apiBase = config.public.apiBase as string;

  const isAuthenticated = computed(() => !!token.value);

  async function login(email: string, password: string) {
    const data = await $fetch<
      | { requiresTwoFactor: true; pendingToken: string }
      | { token: string; user: { id: string; email: string } }
    >(`${apiBase}/auth/login`, { method: "POST", body: { email, password } });
    if ("requiresTwoFactor" in data) return data;
    token.value = data.token;
    return data.user;
  }

  async function loginTwoFactor(pendingToken: string, code: string) {
    const data = await $fetch<{ token: string; user: { id: string; email: string } }>(
      `${apiBase}/auth/login/2fa`,
      { method: "POST", body: { pendingToken, code } }
    );
    token.value = data.token;
    return data.user;
  }

  async function register(email: string, password: string) {
    const data = await $fetch<{ token: string; user: { id: string; email: string } }>(
      `${apiBase}/auth/register`,
      { method: "POST", body: { email, password } }
    );
    token.value = data.token;
    return data.user;
  }

  function logout() {
    token.value = null;
    return navigateTo("/login");
  }

  return { token, isAuthenticated, login, loginTwoFactor, register, logout };
}
