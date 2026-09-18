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
    // 构建期配置给假值：静态桶域名由 e2e/helpers.ts 统一拦截，页脚要有署名与备案号可断言
    command: [
      "rm -rf .e2e-data",
      "VITE_STATIC_BASE_URL=https://static.example.test/riichi VITE_SITE_URL=http://127.0.0.1:8799 VITE_SITE_AUTHOR=E2E VITE_SITE_AUTHOR_URL=https://example.test VITE_SITE_SINCE=2020 VITE_ICP_NUMBER=测ICP备00000000号-1 yarn workspace @riichi/web build",
      `PORT=${PORT} DATA_DIR=.e2e-data yarn workspace @riichi/server exec tsx src/index.ts`,
    ].join(" && "),
    url: `http://127.0.0.1:${PORT}/health`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
