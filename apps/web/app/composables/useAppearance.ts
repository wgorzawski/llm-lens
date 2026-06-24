export type AppTheme = "dark" | "light";
export type AppDensity = "compact" | "dense" | "loose";

export function useAppearance() {
  const theme = useCookie<AppTheme>("llm-lens:theme", { default: () => "dark", sameSite: "lax" });
  const accent = useCookie<string>("llm-lens:accent", { default: () => "#5b8dff", sameSite: "lax" });
  const density = useCookie<AppDensity>("llm-lens:density", { default: () => "dense", sameSite: "lax" });

  function apply() {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    root.setAttribute("data-theme", theme.value);
    root.setAttribute("data-density", density.value);
    root.style.setProperty("--accent", accent.value);
    root.style.setProperty("--accent-bg", `color-mix(in srgb, ${accent.value} 12%, transparent)`);
    root.style.setProperty("--accent-border", `color-mix(in srgb, ${accent.value} 35%, transparent)`);
  }

  if (import.meta.client) {
    watch([theme, accent, density], apply);
  }

  return { theme, accent, density, apply };
}
