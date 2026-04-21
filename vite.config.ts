import fs from "node:fs";
import path from "node:path";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

function normalizeProxyTarget(value: string | undefined): string {
  const raw = (value || "http://127.0.0.1:8000").trim();
  return raw.replace(/\/+$/, "");
}

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const backendTarget = normalizeProxyTarget(env.VITE_BACKEND_TARGET);
  const rootDir = process.cwd();
  const httpsEnabled = command === "serve" && env.VITE_DEV_HTTPS !== "0" && env.VITE_DEV_HTTPS !== "false";
  const keyPath = (env.VITE_DEV_SSL_KEY_PATH || path.join(rootDir, "192.168.18.137+2-key.pem")).trim();
  const certPath = (env.VITE_DEV_SSL_CERT_PATH || path.join(rootDir, "192.168.18.137+2.pem")).trim();

  const httpsConfig =
    httpsEnabled && keyPath && certPath
      ? {
          key: fs.readFileSync(keyPath),
          cert: fs.readFileSync(certPath),
        }
      : undefined;

  return {
    plugins: [react()],
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url)),
      },
    },
    server: {
      host: "0.0.0.0",
      port: 5173,
      strictPort: true,
      https: httpsConfig,
      proxy: {
        "/api": {
          target: backendTarget,
          changeOrigin: true,
        },
        "/uploads": {
          target: backendTarget,
          changeOrigin: true,
        },
      },
    },
  };
});
