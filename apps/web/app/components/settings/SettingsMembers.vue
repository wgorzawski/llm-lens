<script setup lang="ts">
import type { MemberRole, OrgMember } from "~/composables/useOrgMembers";

const { members, inviteMember, updateRole, removeMember } = useOrgMembers();

const memberRoles: MemberRole[] = ["admin", "member", "viewer"];
const inviteEmail = ref("");
const inviteRole = ref<MemberRole>("member");
const inviting = ref(false);
const inviteError = ref<string | null>(null);
const lastInviteUrl = ref<string | null>(null);


async function submitInvite() {
  if (!inviteEmail.value.trim()) return;
  inviting.value = true;
  inviteError.value = null;
  try {
    const result = await inviteMember(inviteEmail.value.trim(), inviteRole.value);
    lastInviteUrl.value = result.inviteUrl;
    inviteEmail.value = "";
  } catch (err) {
    inviteError.value = getErrorMessage(err);
  } finally {
    inviting.value = false;
  }
}

async function copyInviteLink() {
  if (!lastInviteUrl.value) return;
  await navigator.clipboard.writeText(lastInviteUrl.value);
}

function memberActions(m: OrgMember) {
  if (m.status === "pending") {
    return [
      { id: "copy", label: "Copy invite link", icon: "note" },
      { id: "remove", label: "Revoke invite", icon: "trash", danger: true },
    ];
  }
  return [
    ...memberRoles
      .filter((r) => r !== m.role)
      .map((r) => ({ id: `role:${r}`, label: `Make ${r}`, icon: "shield" })),
    { id: "remove", label: "Remove member", icon: "trash", danger: true },
  ];
}

async function onMemberAction(m: OrgMember, actionId: string) {
  if (actionId === "copy") {
    const frontendUrl = window.location.origin;
    await navigator.clipboard.writeText(`${frontendUrl}/invite/${m.inviteToken}`);
    return;
  }
  if (actionId === "remove") {
    await removeMember(m.id);
    return;
  }
  if (actionId.startsWith("role:")) {
    await updateRole(m.id, actionId.slice("role:".length) as MemberRole);
  }
}
</script>

<template>
  <section class="set-section">
    <div class="set-section-head">
      <div>
        <div class="set-section-title">Members</div>
        <div class="set-section-sub">
          {{ members.filter(m => m.status === 'active').length }} members ·
          {{ members.filter(m => m.status === 'pending').length }} pending
        </div>
      </div>
    </div>
    <div class="set-section-body">
      <div class="set-row">
        <div class="set-row-label">
          <div class="set-row-label-text">Invite by email</div>
          <div v-if="inviteError" class="set-error">{{ inviteError }}</div>
        </div>
        <div class="set-row-control" style="gap:8px">
          <div class="field-input"><input v-model="inviteEmail" type="email" placeholder="teammate@company.com" @keydown.enter="submitInvite" ></div>
          <select v-model="inviteRole" class="field-input">
            <option v-for="r in memberRoles" :key="r" :value="r">{{ r }}</option>
          </select>
          <button class="s-btn primary" :disabled="inviting" @click="submitInvite">{{ inviting ? "Inviting…" : "+ Invite" }}</button>
        </div>
      </div>
      <div v-if="lastInviteUrl" class="set-row">
        <div class="set-row-label"><div class="set-row-label-text">Invite link — share this with the invitee</div></div>
        <div class="set-row-control" style="gap:8px">
          <div class="field-input"><input :value="lastInviteUrl" readonly class="mono" ></div>
          <button class="s-btn" @click="copyInviteLink">Copy</button>
        </div>
      </div>
    </div>
  </section>

  <section class="set-section">
    <div class="set-section-body">
      <div class="member-table">
        <div class="member-head">
          <div>Member</div>
          <div>Role</div>
          <div>Invited</div>
          <div>Joined</div>
          <div />
        </div>
        <div v-for="m in members" :key="m.id" class="member-row" :class="{ pending: m.status === 'pending' }">
          <div class="member-cell member-who">
            <div class="member-avatar">{{ m.displayName.slice(0,1).toUpperCase() }}</div>
            <div>
              <div class="member-name">{{ m.status === "pending" ? "(invite pending)" : m.displayName }}</div>
              <div class="member-email mono">{{ m.email }}</div>
            </div>
          </div>
          <div class="member-cell">
            <span class="role-pill" :class="'role-' + m.role">{{ m.role }}</span>
          </div>
          <div class="member-cell mono">{{ new Date(m.invitedAt).toLocaleDateString() }}</div>
          <div class="member-cell mono">{{ m.joinedAt ? new Date(m.joinedAt).toLocaleDateString() : "—" }}</div>
          <div class="member-cell" style="justify-content:flex-end">
            <ActionMenu v-if="m.role !== 'owner'" :items="memberActions(m)" @select="(id) => onMemberAction(m, id)">
              <button class="icon-btn xs"><AppIcon name="more" :size="12" /></button>
            </ActionMenu>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
