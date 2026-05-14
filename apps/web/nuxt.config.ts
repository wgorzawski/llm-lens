export default defineNuxtConfig({
  compatibilityDate: "2026-05-14",
  devtools: { enabled: true },
  modules: ["@unocss/nuxt"],
  typescript: { strict: true },
  runtimeConfig: {
    public: {
      apiBase: process.env.NUXT_PUBLIC_API_BASE ?? "http://localhost:3001/api",
    },
  },
});
