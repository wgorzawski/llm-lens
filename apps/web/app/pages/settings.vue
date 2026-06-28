<script setup lang="ts">
definePageMeta({ layout: "app" });

const { me, fetchMe } = useMe();
if (!me.value) await fetchMe();

const { fetchOrg } = useOrg();
await fetchOrg();

const { fetchMembers } = useOrgMembers();
await fetchMembers();

const navSection = ref("profile");
const navGroups = [
  {
    label: "Personal",
    items: [
      { id: "profile",       label: "Profile",            icon: "user" },
      { id: "account",       label: "Account & security", icon: "shield" },
      { id: "notifications", label: "Notifications",      icon: "bell" },
      { id: "appearance",    label: "Appearance",         icon: "sun" },
    ],
  },
  {
    label: "Organization",
    items: [
      { id: "org",     label: "Organization",   icon: "building" },
      { id: "members", label: "Members",        icon: "users" },
      { id: "billing", label: "Billing",        icon: "card" },
      { id: "data",    label: "Data retention", icon: "database" },
    ],
  },
  {
    label: "Advanced",
    items: [
      { id: "domain", label: "Custom domain", icon: "globe" },
      { id: "danger", label: "Danger zone",   icon: "warn", danger: true },
    ],
  },
];
</script>

<template>
  <div class="set-topbar">
    <div class="set-crumbs">
      <NuxtLink to="/" class="set-crumb-link">Traces</NuxtLink>
      <span class="set-crumb-sep">/</span>
      <span class="set-crumb-cur">Settings</span>
    </div>
  </div>

  <div class="set-layout">

    <!-- settings sub-nav -->
    <nav class="set-nav">
      <div v-for="g in navGroups" :key="g.label" class="set-nav-group">
        <div class="set-nav-label">{{ g.label }}</div>
        <button
          v-for="it in g.items" :key="it.id"
          class="set-nav-item"
          :class="{ active: navSection === it.id, danger: it.danger }"
          @click="navSection = it.id"
        >
          <AppIcon :name="it.icon" :size="12" />
          <span>{{ it.label }}</span>
        </button>
      </div>
    </nav>

    <!-- settings body -->
    <div class="set-body">
      <SettingsProfile       v-if="navSection === 'profile'" />
      <SettingsAccount       v-else-if="navSection === 'account'" />
      <SettingsNotifications v-else-if="navSection === 'notifications'" />
      <SettingsAppearance    v-else-if="navSection === 'appearance'" />
      <SettingsOrg           v-else-if="navSection === 'org'" />
      <SettingsMembers       v-else-if="navSection === 'members'" />
      <SettingsBilling       v-else-if="navSection === 'billing'" />
      <SettingsData          v-else-if="navSection === 'data'" />
      <SettingsDomain        v-else-if="navSection === 'domain'" />
      <SettingsDanger        v-else-if="navSection === 'danger'" />
    </div>

  </div>
</template>
