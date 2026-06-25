export interface TotpSetup {
  secret: string;
  uri: string;
  qrCode: string;
}

export function useTwoFactor() {
  const { apiFetch } = useApiFetch();

  async function setup(): Promise<TotpSetup> {
    return apiFetch<TotpSetup>("/users/me/2fa/setup", { method: "POST" });
  }

  async function verify(code: string): Promise<{ recoveryCodes: string[] }> {
    return apiFetch<{ recoveryCodes: string[] }>("/users/me/2fa/verify", {
      method: "POST",
      body: { code },
    });
  }

  async function disable(code: string): Promise<void> {
    await apiFetch("/users/me/2fa/disable", { method: "POST", body: { code } });
  }

  async function regenerateRecoveryCodes(code: string): Promise<{ recoveryCodes: string[] }> {
    return apiFetch<{ recoveryCodes: string[] }>("/users/me/2fa/recovery-codes/regenerate", {
      method: "POST",
      body: { code },
    });
  }

  return { setup, verify, disable, regenerateRecoveryCodes };
}
