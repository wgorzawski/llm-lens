import { defineConfig, presetUno, presetTypography } from "unocss";

export default defineConfig({
  presets: [presetUno(), presetTypography()],
  theme: {
    colors: {
      anthropic: "#d97706",
      openai: "#10b981",
      "vercel-ai": "#6366f1",
    },
  },
});
