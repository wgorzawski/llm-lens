// What an API key (`llmlens_sk_...`) may call. Keys live in application configs and
// CI secrets, so they only get the trace endpoints: "write" sends traces, "read" reads
// them. Everything else (account, org, keys, deletes) needs a signed-in user.

const INGEST_ROUTES = new Set([
  "POST /api/traces/openai",
  "POST /api/traces/groq",
  "POST /api/traces/anthropic",
  "POST /api/traces/vercel-ai",
]);

const READ_ROUTES = new Set([
  "GET /api/traces",
  "GET /api/traces/:id",
  "GET /api/traces/:id/notes",
  "GET /api/orgs/me/stats",
]);

const EXPORT_ROUTES = new Set(["GET /api/export/traces", "GET /api/export/usage"]);

/** Returns an error message when the key may not call this route, null when it may */
export function apiKeyRouteAllowed(method: string, routeUrl: string | undefined, scopes: string[]): string | null {
  const route = `${method} ${(routeUrl ?? "").replace(/\/$/, "")}`;
  if (INGEST_ROUTES.has(route)) return scopes.includes("write") ? null : "This API key has no write scope";
  if (READ_ROUTES.has(route)) return scopes.includes("read") ? null : "This API key has no read scope";
  if (EXPORT_ROUTES.has(route)) {
    return scopes.includes("export") || scopes.includes("read") ? null : "This API key has no export scope";
  }
  return "API keys can only send and read traces - sign in to use this endpoint";
}
