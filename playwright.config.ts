import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 60_000,
  retries: process.env.CI ? 2 : 1,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI
    ? [["html", { open: "never" }], ["github"]]
    : [["list"]],
  use: {
    baseURL: "http://localhost:5173",
    headless: !process.env.HEADED,
    viewport: { width: 1280, height: 720 },
    launchOptions: {
      args: ["--enable-gpu", "--use-gl=angle"],
    },
    screenshot: "only-on-failure",
    trace: "on-first-retry",
  },
  webServer: {
    command: "npx vite --port 5173 --strictPort",
    port: 5173,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
