import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: new URL(".", import.meta.url).pathname,
  plugins: [react()],
  server: {
    port: 5400,
    proxy: { "/api": { target: `http://localhost:${process.env.API_PORT ?? 4400}`, changeOrigin: true } },
  },
  build: { outDir: "../dist", emptyOutDir: true },
});
