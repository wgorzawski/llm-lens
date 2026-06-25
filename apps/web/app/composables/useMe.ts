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
  const { apiFetch } = useApiFetch();
  const { token } = useAuth();

  const me = useState<Me | null>("me", () => null);

  async function fetchMe() {
    if (!token.value) return;
    try {
      me.value = await apiFetch<Me>("/users/me");
    } catch {
      me.value = null;
    }
  }

  async function updateProfile(update: ProfileUpdate): Promise<Me> {
    const updated = await apiFetch<Me>("/users/me", { method: "PATCH", body: update });
    me.value = { ...me.value, ...updated } as Me;
    return updated;
  }

  async function updatePassword(currentPassword: string, newPassword: string): Promise<void> {
    await apiFetch("/users/me/password", { method: "PATCH", body: { currentPassword, newPassword } });
  }

  async function updatePreferences(preferences: Record<string, unknown>): Promise<Record<string, unknown>> {
    const res = await apiFetch<{ preferences: Record<string, unknown> }>("/users/me/preferences", {
      method: "PATCH",
      body: preferences,
    });
    if (me.value) me.value.preferences = res.preferences;
    return res.preferences;
  }

  return { me, fetchMe, updateProfile, updatePassword, updatePreferences };
}
