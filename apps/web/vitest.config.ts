import { defineConfig } from "vitest/config";

/** web 只有纯函数单测（设备分流等），不需要 DOM 环境。 */
export default defineConfig({
  test: { include: ["src/**/*.test.ts"], environment: "node" },
});
