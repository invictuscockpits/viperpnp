import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async ({ mode }) => ({
  plugins: [react()],

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    // ViperPNP: `--mode stable` (npm run dev:stable) disables hot-reload so
    // code edits can't reload the page mid-machine-operation and wipe error
    // banners / UI state. Refresh the browser manually to pick up changes.
    hmr:
      mode === "stable"
        ? false
        : host
          ? {
              protocol: "ws",
              host,
              port: 1421,
            }
          : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
    // 4. ViperPNP: proxy API calls to the embedded Java backend so the
    //    frontend can use same-origin /api/* paths (no CORS) in dev.
    proxy: {
      "/api": {
        target: "http://localhost:8077",
        changeOrigin: true,
      },
      "/ws": {
        target: "http://localhost:8077",
        ws: true,
        changeOrigin: true,
      },
    },
  },
}));
