import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";
const executablePath =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ||
  (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined);
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 45000,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:4175/apps/",
    headless: true,
    launchOptions: { executablePath, args: ["--no-sandbox"] },
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", testIgnore: /auth\.spec/, use: { viewport: { width: 1440, height: 1000 } } },
    {
      name: "mobile",
      testIgnore: /auth\.spec/,
      use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
    },
    {
      name: "auth-contract",
      testMatch: /auth\.spec/,
      use: { baseURL: "http://127.0.0.1:4176/apps/", viewport: { width: 1440, height: 1000 } },
    },
  ],
  webServer: [
    {
      command:
        "npm run build -- --base=/apps/ && npm run preview -- --port 4175 --strictPort --base=/apps/",
      url: "http://127.0.0.1:4175/apps/",
      timeout: 120000,
    },
    {
      command: "npm run dev -- --port 4176 --strictPort --base=/apps/",
      url: "http://127.0.0.1:4176/apps/",
      env: {
        VITE_SUPABASE_URL: "https://onda-e2e.supabase.co",
        VITE_SUPABASE_ANON_KEY: "sb_publishable_onda_e2e_not_a_credential",
      },
      timeout: 60000,
    },
  ],
});
