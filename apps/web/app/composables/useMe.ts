export interface Me {
  id: string;
  email: string;
  org: string;
  plan: string;
  displayName: string;
  handle: string | null;
  timezone: string;
  locale: string;
  dateFormat: string;
  preferences: Record<string, unknown>;
  totpEnabled: boolean;
}

export interface ProfileUpdate {
  displayName?: string;
  handle?: string;
  timezone?: string;
  locale?: string;
  dateFormat?: string;
}

export function useMe() {
  const config = useRuntimeConfig();
  const apiBase = config.public.apiBase as string;
  const { token } = useAuth();

  const me = useState<Me | null>("me", () => null);

  function authHeaders(): Record<string, string> {
    return token.value ? { Authorization: `Bearer ${token.value}` } : {};
  }

  async function fetchMe() {
    if (!token.value) return;
    try {
      me.value = await $fetch<Me>(`${apiBase}/me`, { headers: authHeaders() });
    } catch {
      me.value = null;
    }
  }

  async function updateProfile(update: ProfileUpdate): Promise<Me> {
    const updated = await $fetch<Me>(`${apiBase}/users/me`, {
      method: "PATCH",
      headers: authHeaders(),
      body: update,
    });
    me.value = { ...me.value, ...updated } as Me;
    return updated;
  }

  async function updatePassword(currentPassword: string, newPassword: string): Promise<void> {
    await $fetch(`${apiBase}/users/me/password`, {
      method: "PATCH",
      headers: authHeaders(),
      body: { currentPassword, newPassword },
    });
  }

  async function updatePreferences(preferences: Record<string, unknown>): Promise<Record<string, unknown>> {
    const res = await $fetch<{ preferences: Record<string, unknown> }>(`${apiBase}/users/me/preferences`, {
      method: "PATCH",
      headers: authHeaders(),
      body: preferences,
    });
    if (me.value) me.value.preferences = res.preferences;
    return res.preferences;
  }

  return { me, fetchMe, updateProfile, updatePassword, updatePreferences };
}
