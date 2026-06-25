export interface TotpSetup {
  secret: string;
  uri: string;
  qrCode: string;
}

export function useTwoFactor() {
  const config = useRuntimeConfig();
  const apiBase = config.public.apiBase as string;
  const { token } = useAuth();

  function authHeaders(): Record<string, string> {
    return token.value ? { Authorization: `Bearer ${token.value}` } : {};
  }

  async function setup(): Promise<TotpSetup> {
    return $fetch<TotpSetup>(`${apiBase}/users/me/2fa/setup`, { method: "POST", headers: authHeaders() });
  }

  async function verify(code: string): Promise<{ recoveryCodes: string[] }> {
    return $fetch<{ recoveryCodes: string[] }>(`${apiBase}/users/me/2fa/verify`, {
      method: "POST",
      headers: authHeaders(),
      body: { code },
    });
  }

  async function disable(code: string): Promise<void> {
    await $fetch(`${apiBase}/users/me/2fa/disable`, { method: "POST", headers: authHeaders(), body: { code } });
  }

  async function regenerateRecoveryCodes(code: string): Promise<{ recoveryCodes: string[] }> {
    return $fetch<{ recoveryCodes: string[] }>(`${apiBase}/users/me/2fa/recovery-codes/regenerate`, {
      method: "POST",
      headers: authHeaders(),
      body: { code },
    });
  }

  return { setup, verify, disable, regenerateRecoveryCodes };
}
