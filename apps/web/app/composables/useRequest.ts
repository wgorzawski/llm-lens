export function useRequest() {
  const pending = ref(false);
  const error = ref<string | null>(null);

  async function run<T>(fn: () => Promise<T>): Promise<T | undefined> {
    pending.value = true;
    error.value = null;
    try {
      return await fn();
    } catch (err) {
      error.value = getErrorMessage(err);
    } finally {
      pending.value = false;
    }
  }

  return { pending, error, run };
}
