import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],

  server: {
    // Bound to IPv4 explicitly: left to itself vite resolves "localhost" to ::1 on Windows,
    // so http://127.0.0.1:5173 is refused and the dev server looks broken.
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    // The API and the stream are proxied so the browser sees one origin: no CORS, no second
    // base URL to configure, and `wss://` derives from the page in production.
    proxy: {
      "/api": { target: "http://127.0.0.1:8080", ws: true },
    },
  },

  test: {
    // Node by default: most of what is tested here is pure. The handful of files that
    // render declare `@vitest-environment happy-dom` at the top instead of paying for a DOM
    // in every suite.
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
