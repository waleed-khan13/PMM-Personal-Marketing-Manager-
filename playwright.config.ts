import { defineConfig, devices } from "@playwright/test";

const webPort = Number(process.env.LOCALGROWTH_E2E_WEB_PORT ?? "3100");
const baseURL = `http://127.0.0.1:${webPort}`;
const browserChannel = process.env.LOCALGROWTH_E2E_BROWSER_CHANNEL;

export default defineConfig({
  testDir: "./e2e",
  outputDir: "output/playwright/test-results",
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  expect: {
    timeout: 10_000,
  },
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "output/playwright/report" }],
  ],
  use: {
    baseURL,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        ...(browserChannel ? { channel: browserChannel } : {}),
      },
    },
  ],
  webServer: {
    command: "node scripts/e2e-server.mjs",
    env: {
      LOCALGROWTH_E2E_WEB_PORT: String(webPort),
    },
    reuseExistingServer: false,
    stderr: "pipe",
    stdout: "pipe",
    timeout: 180_000,
    url: `${baseURL}/api/health`,
  },
});
