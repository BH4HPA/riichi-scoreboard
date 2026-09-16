import path from "node:path";
import react from "@vitejs/plugin-react";
import mkcert from "vite-plugin-mkcert";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

const serverOrigin = process.env.SERVER_ORIGIN ?? "http://localhost:8787";

export default defineConfig({
  // 产物里 Worker 用的是绝对路径（/assets/...），改子路径部署会 404 且极难查：显式钉死根部署
  base: "/",
  // mkcert 会在首次运行时 sudo 安装根证书，没装过的机器（CI、沙箱、新电脑）会直接起不来。
  // 取景框要 HTTPS 才能开，所以按需：`VITE_HTTPS=1 yarn dev`。
  plugins: [react(), tailwindcss(), ...(process.env.VITE_HTTPS ? [mkcert()] : [])],
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "./src") },
  },
  // onnxruntime-web 是运行时才动态 import 的大包，且自带 wasm 定位逻辑，不做依赖预构建
  optimizeDeps: { exclude: ["onnxruntime-web"] },
  // 推理 Worker 里还有一层动态 import("onnxruntime-web/wasm")，必须是 ES module worker
  worker: { format: "es" },
  server: {
    // getUserMedia 只在安全上下文可用：手机走局域网 IP 访问时必须是 HTTPS（vite-plugin-mkcert 自动签）
    host: true,
    port: 5173,
    proxy: {
      "/api": { target: serverOrigin, changeOrigin: true },
      "/ws": { target: serverOrigin, ws: true },
    },
  },
});
