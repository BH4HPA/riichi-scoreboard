import { defineConfig } from "@playwright/test";

const PORT = 8799;

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    // 取景框要相机：用 Chromium 自带的测试图案喂 getUserMedia。
    // 不需要 y4m 素材——e2e 的假检测器是个 Constant 节点，输出与画面无关（ml/scripts/e2e_detector.py）。
    launchOptions: {
      args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
    },
    trace: "retain-on-failure",
    actionTimeout: 10_000,
  },
  webServer: {
    command: `rm -rf .e2e-data && yarn workspace @riichi/web build && PORT=${PORT} DATA_DIR=.e2e-data yarn workspace @riichi/server exec tsx src/index.ts`,
    url: `http://127.0.0.1:${PORT}/health`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
