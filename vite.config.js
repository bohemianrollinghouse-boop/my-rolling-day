import { defineConfig } from "vite";

export default defineConfig({
  publicDir: "public",
  server: {
    port: Number(process.env.PORT) || 5173,
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
