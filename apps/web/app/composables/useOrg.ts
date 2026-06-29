export interface Org {
  slug: string;
  name: string;
  defaultEnv: string;
  retentionDays: number;
  logoUrl: string | null;
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

  async function uploadLogo(file: File): Promise<string> {
    const form = new FormData();
    form.append("file", file);
    const res = await apiFetch<{ logoUrl: string }>("/orgs/me/logo", { method: "POST", body: form });
    if (org.value) org.value.logoUrl = res.logoUrl;
    return res.logoUrl;
  }

  async function removeLogo(): Promise<void> {
    await apiFetch("/orgs/me/logo", { method: "DELETE" });
    if (org.value) org.value.logoUrl = null;
  }

  return { org, fetchOrg, updateOrg, uploadLogo, removeLogo };
}
