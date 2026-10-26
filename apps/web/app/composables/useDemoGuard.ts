// Mirrors apps/api/src/services/demo-guard.ts: on the public demo the shared demo
// account can't run destructive actions. The buttons stay visible (they show what
// the app can do) - clicking one shows a notice instead of calling the API.
const DEMO_EMAIL = "demo@llmlens.dev";

export function useDemoGuard() {
  const demoMode = useRuntimeConfig().public.demoMode as boolean;
  const { me } = useMe();
  const notice = useState<string | null>("demo-notice", () => null);

  const isDemoAccount = computed(() => demoMode && me.value?.email.toLowerCase() === DEMO_EMAIL);

  // Returns true (and shows the notice) when the action must not run.
  function blockedInDemo(): boolean {
    if (!isDemoAccount.value) return false;
    notice.value = "This feature is disabled in the demo, so the data stays intact for everyone. Create your own account to try it.";
    return true;
  }

  return { isDemoAccount, notice, blockedInDemo };
}
