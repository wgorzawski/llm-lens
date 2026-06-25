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
  const { apiFetch } = useApiFetch();

  const members = ref<OrgMember[]>([]);

  async function fetchMembers() {
    members.value = await apiFetch<OrgMember[]>("/orgs/me/members");
  }

  async function inviteMember(email: string, role: MemberRole): Promise<{ inviteUrl: string }> {
    const result = await apiFetch<{ id: string; token: string; inviteUrl: string }>(
      "/orgs/me/members/invite",
      { method: "POST", body: { email, role } },
    );
    await fetchMembers();
    return result;
  }

  async function updateRole(id: string, role: MemberRole) {
    members.value = await apiFetch<OrgMember[]>(`/orgs/me/members/${id}`, {
      method: "PATCH",
      body: { role },
    });
  }

  async function removeMember(id: string) {
    await apiFetch(`/orgs/me/members/${id}`, { method: "DELETE" });
    members.value = members.value.filter((m) => m.id !== id);
  }

  return { members, fetchMembers, inviteMember, updateRole, removeMember };
}
