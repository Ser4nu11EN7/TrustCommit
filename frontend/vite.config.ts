import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const runtimeTarget = process.env.VITE_RUNTIME_PROXY_TARGET ?? "http://127.0.0.1:3000";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": {
        target: runtimeTarget,
        changeOrigin: true
      }
    }
  }
});
