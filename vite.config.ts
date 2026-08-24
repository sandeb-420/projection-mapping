import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import basicSsl from "@vitejs/plugin-basic-ssl";
import typegpu from "unplugin-typegpu/vite";
import { fileURLToPath, URL } from "node:url";
import { sessionPlugin } from "./src/session/vitePlugin";

export default defineConfig({
  plugins: [react(), typegpu(), basicSsl(), sessionPlugin()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    host: true,
    port: 5173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8787",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
});
