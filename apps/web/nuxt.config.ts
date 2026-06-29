export default defineNuxtConfig({
  compatibilityDate: "2026-05-14",
  devtools: { enabled: true },
  modules: ["@unocss/nuxt", "@vueuse/nuxt", "@nuxt/eslint", "@nuxt/hints"],
  typescript: { strict: true },
  css: ["~/assets/css/tokens.css", "~/assets/css/settings.css", "~/assets/css/traces.css"],
  app: {
    head: {
      link: [
        { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
        { rel: "preconnect", href: "https://fonts.googleapis.com" },
        { rel: "preconnect", href: "https://fonts.gstatic.com", crossorigin: "" },
        {
          rel: "stylesheet",
          href: "https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&family=Geist+Mono:wght@400;500&display=swap",
        },
      ],
    },
  },
  runtimeConfig: {
    public: {
      apiBase: process.env.NUXT_PUBLIC_API_BASE ?? "http://localhost:3001/api",
      demoMode: process.env.NUXT_PUBLIC_DEMO_MODE === "true",
    },
  },
});
