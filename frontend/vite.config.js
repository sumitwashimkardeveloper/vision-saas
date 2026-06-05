import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The app is served by FastAPI under /ui, so assets resolve from that base.
// `npm run build` emits straight into apps/api/static (what FastAPI mounts).
const API_PREFIXES = ["/auth", "/cameras", "/people", "/events", "/tenant", "/health", "/config"];

export default defineConfig({
  base: "/ui/",
  plugins: [react()],
  server: {
    port: 5173,
    // During `npm run dev`, proxy API calls to the FastAPI backend on :8000.
    proxy: Object.fromEntries(
      API_PREFIXES.map((p) => [p, { target: "http://127.0.0.1:8000", changeOrigin: true }])
    ),
  },
  build: {
    outDir: "../apps/api/static",
    emptyOutDir: true,
  },
});
