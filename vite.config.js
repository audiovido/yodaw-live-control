import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  base: "./",
  plugins: [react()],
  build: {
    outDir: "dist",
    sourcemap: false,
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        kodgar: resolve(__dirname, "kodgar.html"),
      },
    },
  },
  server: {
    port: 5173,
    strictPort: false,
  },
});
