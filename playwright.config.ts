import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 60_000,
  use: {
    baseURL: "http://localhost:5173",
    headless: !process.env.HEADED,
    viewport: { width: 1280, height: 720 },
    launchOptions: {
      args: ["--enable-gpu", "--use-gl=angle"],
    },
  },
  webServer: {
    command: "npm run dev",
    port: 5173,
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
