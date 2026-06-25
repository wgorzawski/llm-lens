export type MemberRole = "owner" | "admin" | "member" | "viewer";

export interface OrgMember {
  id: string;
  userId: string | null;
  email: string;
  displayName: string;
  role: MemberRole;
  status: "pending" | "active";
  inviteToken: string | null;
  invitedAt: number;
  joinedAt: number | null;
}

export function useOrgMembers() {
  const config = useRuntimeConfig();
  const apiBase = config.public.apiBase as string;
  const { token } = useAuth();

  const members = ref<OrgMember[]>([]);

  function authHeaders(): Record<string, string> {
    return token.value ? { Authorization: `Bearer ${token.value}` } : {};
  }

  async function fetchMembers() {
    members.value = await $fetch<OrgMember[]>(`${apiBase}/orgs/me/members`, { headers: authHeaders() });
  }

  async function inviteMember(email: string, role: MemberRole): Promise<{ inviteUrl: string }> {
    const result = await $fetch<{ id: string; token: string; inviteUrl: string }>(
      `${apiBase}/orgs/me/members/invite`,
      { method: "POST", headers: authHeaders(), body: { email, role } }
    );
    await fetchMembers();
    return result;
  }

  async function updateRole(id: string, role: MemberRole) {
    members.value = await $fetch<OrgMember[]>(`${apiBase}/orgs/me/members/${id}`, {
      method: "PATCH",
      headers: authHeaders(),
      body: { role },
    });
  }

  async function removeMember(id: string) {
    await $fetch(`${apiBase}/orgs/me/members/${id}`, { method: "DELETE", headers: authHeaders() });
    members.value = members.value.filter((m) => m.id !== id);
  }

  return { members, fetchMembers, inviteMember, updateRole, removeMember };
}
