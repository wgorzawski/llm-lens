export interface Me {
  id: string;
  email: string;
  org: string;
  plan: string;
}

export function useMe() {
  const config = useRuntimeConfig();
  const apiBase = config.public.apiBase as string;
  const { token } = useAuth();

  const me = useState<Me | null>("me", () => null);

  async function fetchMe() {
    if (!token.value) return;
    try {
      me.value = await $fetch<Me>(`${apiBase}/me`, {
        headers: { Authorization: `Bearer ${token.value}` },
      });
    } catch {
      me.value = null;
    }
  }

  return { me, fetchMe };
}
