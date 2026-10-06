import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

// base "./": exe dist klasörünü WebView2'de sanal bir alan adına eşleyip açar,
// mutlak yol (/assets/...) yerine göreli yol gerekir.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  base: "./",
  build: { outDir: "dist", emptyOutDir: true, sourcemap: false },
});
