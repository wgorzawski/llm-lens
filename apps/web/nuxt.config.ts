export default defineNuxtConfig({
  compatibilityDate: "2026-05-14",
  devtools: { enabled: true },
  modules: ["@unocss/nuxt", "@vueuse/nuxt", "@nuxt/eslint", "@nuxt/hints"],
  typescript: { strict: true },
  css: ["~/assets/css/tokens.css", "~/assets/css/settings.css", "~/assets/css/traces.css", "~/assets/css/dashboard.css"],
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
    // NUXT_API_BASE_SERVER: how the web server itself reaches the API during server-side
    // rendering, when that differs from the browser's URL (e.g. http://api:3001/api in Docker).
    apiBaseServer: "",
    public: {
      apiBase: process.env.NUXT_PUBLIC_API_BASE ?? "http://localhost:3001/api",
      demoMode: process.env.NUXT_PUBLIC_DEMO_MODE === "true",
      // NUXT_PUBLIC_REGISTRATION_ENABLED=false hides sign-up links (the API enforces it)
      registrationEnabled: process.env.NUXT_PUBLIC_REGISTRATION_ENABLED !== "false",
    },
  },
});
