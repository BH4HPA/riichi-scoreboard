import fs from "node:fs";
import path from "node:path";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, loadEnv, type Plugin } from "vite";

const serverOrigin = process.env.SERVER_ORIGIN ?? "http://localhost:8787";

const CERTS = path.resolve(import.meta.dirname, "../../ci/dev-tls/certs");
const devCert =
  fs.existsSync(`${CERTS}/cert.pem`) && fs.existsSync(`${CERTS}/key.pem`)
    ? { cert: fs.readFileSync(`${CERTS}/cert.pem`), key: fs.readFileSync(`${CERTS}/key.pem`) }
    : null;

/**
 * 站点地址与署名只在配置了才写进 <head>。不能用 index.html 的 %VITE_*% 占位：变量为空时
 * canonical 会变成 href="/"，Vite 的 HTML 插件把它当资源去读目录，构建直接失败（EISDIR）。
 */
function siteMeta(env: Record<string, string>): Plugin {
  const site = env.VITE_SITE_URL?.replace(/\/$/, "");
  const author = env.VITE_SITE_AUTHOR;
  return {
    name: "riichi:site-meta",
    transformIndexHtml: () => [
      ...(author ? [{ tag: "meta", attrs: { name: "author", content: author } }] : []),
      ...(site
        ? [
            { tag: "link", attrs: { rel: "canonical", href: `${site}/` } },
            { tag: "meta", attrs: { property: "og:url", content: `${site}/` } },
            { tag: "meta", attrs: { property: "og:image", content: `${site}/icon-512.png` } },
          ]
        : []),
    ],
  };
}

export default defineConfig(({ mode }) => ({
  // 产物里 Worker 用的是绝对路径（/assets/...），改子路径部署会 404 且极难查：显式钉死根部署
  base: "/",
  plugins: [react(), tailwindcss(), siteMeta(loadEnv(mode, import.meta.dirname, "VITE_"))],
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "./src") },
  },
  // onnxruntime-web 是运行时才动态 import 的大包，且自带 wasm 定位逻辑，不做依赖预构建
  optimizeDeps: { exclude: ["onnxruntime-web"] },
  // 推理 Worker 里还有一层动态 import("onnxruntime-web/wasm")，必须是 ES module worker
  worker: { format: "es" },
  server: {
    // getUserMedia 只在安全上下文可用，手机走局域网 IP 访问必须是 HTTPS。
    // 证书就用开发机那一套（ci/dev-tls/certs，不入库）：一张证书同时覆盖本机与开发机，
    // 手机只装一次根证书。没有证书就退回 HTTP —— CI、沙箱、新电脑照样能 yarn dev，
    // 只是取景框打不开（入口会自己隐藏并提示）。
    host: true,
    ...(devCert ? { https: devCert } : {}),
    port: 5173,
    proxy: {
      "/api": { target: serverOrigin, changeOrigin: true },
      "/ws": { target: serverOrigin, ws: true },
    },
  },
}));
