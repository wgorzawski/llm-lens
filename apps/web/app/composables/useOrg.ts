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
  const { apiFetch } = useApiFetch();

  const org = ref<Org | null>(null);

  async function fetchOrg() {
    org.value = await apiFetch<Org>("/orgs/me");
  }

  async function updateOrg(update: OrgUpdate): Promise<Org> {
    const updated = await apiFetch<Org>("/orgs/me", { method: "PATCH", body: update });
    org.value = updated;
    return updated;
  }

  return { org, fetchOrg, updateOrg };
}
