const HEARTBEAT_INTERVAL_MS = 20_000;

function getOrCreate(storage: Storage, key: string): string {
  const existing = storage.getItem(key);
  if (existing) return existing;
  const id = crypto.randomUUID();
  storage.setItem(key, id);
  return id;
}

export default defineNuxtPlugin(() => {
  const config = useRuntimeConfig();
  const apiBase = config.public.apiBase as string;

  const visitorId = getOrCreate(localStorage, "llmlens_visitor_id");
  const sessionId = getOrCreate(sessionStorage, "llmlens_session_id");

  function ping(path: string, view: boolean) {
    void $fetch(`${apiBase}/analytics/ping`, {
      method: "POST",
      body: { path, visitorId, sessionId, view },
    }).catch(() => { /* analytics is best-effort */ });
  }

  const route = useRoute();
  watch(() => route.fullPath, (path) => ping(path, true), { immediate: true });

  setInterval(() => {
    if (document.visibilityState === "visible") ping(route.fullPath, false);
  }, HEARTBEAT_INTERVAL_MS);
});
