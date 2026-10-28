import { defineConfig } from "vite";

export default defineConfig({
  // GitHub Pages serves the site under /fingerprint-grips/; relative paths work there and locally
  base: "./",
  worker: { format: "es" },
  // the OpenCascade WASM loader must not be pre-bundled
  optimizeDeps: { exclude: ["replicad-opencascadejs"] },
  server: { port: 5173 },
});
