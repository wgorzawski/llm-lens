export function getErrorMessage(err: unknown): string {
  // $fetch's FetchError carries the API's { error } body in `data`; its `message`
  // is a technical "[METHOD] url: status" string not meant for users.
  const apiError = (err as { data?: { error?: unknown } } | null)?.data?.error;
  if (typeof apiError === "string" && apiError) return apiError;
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return String(err);
}
