import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Frontend runs standalone on its own dev server; API calls are proxied to FastAPI.
// `npm run build` emits straight into apps/api/static.
const API_PREFIXES = ["/auth", "/cameras", "/features", "/people", "/events", "/tenant", "/health", "/config", "/worker", "/stream"];

function isAppRoute(pathname) {
  return (
    pathname === "/" ||
    pathname === "/login" ||
    pathname === "/register" ||
    pathname === "/people" ||
    pathname === "/events" ||
    pathname === "/alerts" ||
    pathname === "/settings" ||
    pathname === "/cameras/add" ||
    pathname === "/cameras/live" ||
    pathname === "/features/add" ||
    pathname === "/features/manage" ||
    /^\/features\/[^/]+\/[^/]+$/.test(pathname)
  );
}

function spaFallbackForAppRoutes() {
  return {
    name: "guardvision-spa-route-fallback",
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        const acceptsHtml = req.headers.accept?.includes("text/html");
        const pathname = (req.url || "").split("?")[0];
        if (req.method === "GET" && acceptsHtml && isAppRoute(pathname)) {
          req.url = "/";
        }
        next();
      });
    },
  };
}

export default defineConfig({
  base: "/",
  plugins: [spaFallbackForAppRoutes(), react()],
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
