// App-wide snackbars. Call `useToast()` anywhere and use success / error / info; the
// <AppToaster /> in app.vue renders them. Errors stay longer than confirmations.

export type ToastKind = "success" | "error" | "info";

export interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
  /** Short label shown before the message, e.g. "Demo". */
  tag?: string;
}

const DURATION_MS: Record<ToastKind, number> = { success: 3000, info: 5000, error: 6000 };
const MAX_VISIBLE = 3;

let nextId = 1;
const timers = new Map<number, ReturnType<typeof setTimeout>>();

export function useToast() {
  const toasts = useState<Toast[]>("toasts", () => []);

  function dismiss(id: number) {
    clearTimeout(timers.get(id));
    timers.delete(id);
    toasts.value = toasts.value.filter((t) => t.id !== id);
  }

  function show(kind: ToastKind, message: string, opts: { tag?: string; durationMs?: number } = {}) {
    if (import.meta.server) return;
    // the same message twice in a row (double click) just restarts its timer
    const same = toasts.value.find((t) => t.kind === kind && t.message === message);
    if (same) dismiss(same.id);

    const toast: Toast = { id: nextId++, kind, message, tag: opts.tag };
    toasts.value = [...toasts.value, toast].slice(-MAX_VISIBLE);
    timers.set(toast.id, setTimeout(() => dismiss(toast.id), opts.durationMs ?? DURATION_MS[kind]));
  }

  /** Remove all snackbars, e.g. stale errors once the user has signed in. */
  function clear() {
    for (const t of toasts.value) clearTimeout(timers.get(t.id));
    timers.clear();
    toasts.value = [];
  }

  return {
    toasts,
    dismiss,
    clear,
    success: (message: string) => show("success", message),
    info: (message: string, opts?: { tag?: string; durationMs?: number }) => show("info", message, opts),
    /** Accepts an Error / API error as well as a plain message. */
    error: (err: unknown, fallback = "Something went wrong") => {
      const message = typeof err === "string" ? err : getErrorMessage(err);
      show("error", message || fallback);
    },
  };
}

// navigator.clipboard only exists in secure contexts (https, localhost) - self-hosted
// instances on plain http need the old textarea + execCommand fallback.
function legacyCopy(text: string): boolean {
  const el = document.createElement("textarea");
  el.value = text;
  el.setAttribute("readonly", "");
  el.style.position = "fixed";
  el.style.opacity = "0";
  document.body.appendChild(el);
  el.select();
  try { return document.execCommand("copy"); }
  catch { return false; }
  finally { document.body.removeChild(el); }
}

/** Copy text and confirm it with a snackbar. */
export async function copyWithToast(text: string, what = "Copied to clipboard") {
  const toast = useToast();
  try {
    await navigator.clipboard.writeText(text);
    toast.success(what);
  } catch {
    if (legacyCopy(text)) toast.success(what);
    else toast.error("Couldn't access the clipboard");
  }
}
