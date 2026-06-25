import { defineConfig, devices } from "@playwright/test";
import path from "path";

const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3002";
const API_URL = process.env.E2E_API_URL ?? "http://localhost:3001";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]],
  use: {
    baseURL: BASE_URL,
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    trace: "retain-on-failure",
    acceptDownloads: true,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: [
    {
      command: "pnpm exec tsx src/index.ts",
      url: `${API_URL}/health`,
      reuseExistingServer: true,
      cwd: path.resolve(__dirname, "../api"),
      timeout: 30_000,
    },
    {
      command: "NUXT_IGNORE_LOCK=1 pnpm exec nuxt dev --port 3002",
      url: BASE_URL,
      reuseExistingServer: true,
      cwd: path.resolve(__dirname, "../web"),
      timeout: 60_000,
      env: {
        NUXT_PUBLIC_API_BASE: `${API_URL}/api`,
        NUXT_IGNORE_LOCK: "1",
      },
    },
  ],
});

export { BASE_URL, API_URL };
