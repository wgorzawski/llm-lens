export type AppTheme = "dark" | "light" | "auto";
export type AppDensity = "compact" | "dense" | "loose";

export function useAppearance() {
  const theme = useCookie<AppTheme>("llm-lens:theme", { default: () => "dark", sameSite: "lax" });
  const accent = useCookie<string>("llm-lens:accent", { default: () => "#5b8dff", sameSite: "lax" });
  const density = useCookie<AppDensity>("llm-lens:density", { default: () => "dense", sameSite: "lax" });
  const ligatures = useCookie<boolean>("llm-lens:ligatures", { default: () => true, sameSite: "lax" });
  const showKbd = useCookie<boolean>("llm-lens:show-kbd", { default: () => true, sameSite: "lax" });
  const vimNav = useCookie<boolean>("llm-lens:vim-nav", { default: () => false, sameSite: "lax" });

  function resolvedTheme(): "dark" | "light" {
    if (theme.value !== "auto") return theme.value as "dark" | "light";
    return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }

  function apply() {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    root.setAttribute("data-theme", resolvedTheme());
    root.setAttribute("data-density", density.value);
    root.setAttribute("data-ligatures", ligatures.value ? "1" : "0");
    root.style.setProperty("--accent", accent.value);
    root.style.setProperty("--accent-bg", `color-mix(in srgb, ${accent.value} 12%, transparent)`);
    root.style.setProperty("--accent-border", `color-mix(in srgb, ${accent.value} 35%, transparent)`);
  }

  if (import.meta.client) {
    watch([theme, accent, density, ligatures], apply);

    if (theme.value === "auto") {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      mq.addEventListener("change", apply);
    }
  }

  return { theme, accent, density, ligatures, showKbd, vimNav, apply };
}
