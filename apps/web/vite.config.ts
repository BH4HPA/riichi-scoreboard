import path from "node:path";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

const serverOrigin = process.env.SERVER_ORIGIN ?? "http://localhost:8787";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "./src") },
  },
  // onnxruntime-web 是运行时才动态 import 的大包，且自带 wasm 定位逻辑，不做依赖预构建
  optimizeDeps: { exclude: ["onnxruntime-web"] },
  server: {
    port: 5173,
    proxy: {
      "/api": { target: serverOrigin, changeOrigin: true },
      "/ws": { target: serverOrigin, ws: true },
    },
  },
});
