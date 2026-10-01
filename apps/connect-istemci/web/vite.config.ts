import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import fs from "node:fs";

// Geliştirme (`npm run dev`): açık exe'ye proxy (SQL Konsol'daki düzen). Port ve
// anahtar her istekte exe'nin yazdığı adres dosyasından okunur; anahtarı proxy ekler.
function calisanExe(): { port: string; anahtar: string } | null {
  try {
    const yol = path.join(process.env.LOCALAPPDATA ?? "", "PusulaConnect2", "web-adres.txt");
    const m = /127\.0\.0\.1:(\d+)\/#anahtar=([^\s&]+)/.exec(fs.readFileSync(yol, "utf8"));
    return m ? { port: m[1], anahtar: m[2] } : null;
  } catch {
    return null;
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  base: "/",
  build: { outDir: "dist", emptyOutDir: true, sourcemap: false, chunkSizeWarningLimit: 2000 },
  server: {
    proxy: {
      "/api": {
        target: "http://127.0.0.1:1",
        changeOrigin: true,
        configure: (proxy) => {
          const web = proxy.web.bind(proxy);
          proxy.web = (req, res, opts, cb) => {
            const exe = calisanExe();
            if (!exe) {
              res.writeHead(503, { "Content-Type": "application/json; charset=utf-8" });
              res.end(JSON.stringify({ hata: "Connect exe'si çalışmıyor — önce exe'yi açın." }));
              return;
            }
            req.headers["x-connect-anahtar"] = exe.anahtar;
            const ayar = { ...opts, target: `http://127.0.0.1:${exe.port}` };
            return cb ? web(req, res, ayar, cb) : web(req, res, ayar);
          };
          proxy.on("proxyReq", (r) => r.removeHeader("origin"));
        },
      },
    },
  },
});
