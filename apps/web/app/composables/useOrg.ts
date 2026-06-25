export interface Org {
  slug: string;
  name: string;
  defaultEnv: string;
  retentionDays: number;
}

export interface OrgUpdate {
  slug?: string;
  name?: string;
  defaultEnv?: string;
  retentionDays?: number;
}

export function useOrg() {
  const config = useRuntimeConfig();
  const apiBase = config.public.apiBase as string;
  const { token } = useAuth();

  const org = ref<Org | null>(null);

  function authHeaders(): Record<string, string> {
    return token.value ? { Authorization: `Bearer ${token.value}` } : {};
  }

  async function fetchOrg() {
    org.value = await $fetch<Org>(`${apiBase}/orgs/me`, { headers: authHeaders() });
  }

  async function updateOrg(update: OrgUpdate): Promise<Org> {
    const updated = await $fetch<Org>(`${apiBase}/orgs/me`, {
      method: "PATCH",
      headers: authHeaders(),
      body: update,
    });
    org.value = updated;
    return updated;
  }

  return { org, fetchOrg, updateOrg };
}
