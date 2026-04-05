/* ══════════════════════════════════════════════════════════
   PusulaHub — Custom HTTP Server (Pull Model)
   Next.js App Router + Agent Poller aynı process'te çalışır.
   Hub, agent'ları periyodik olarak HTTP ile pollar.
══════════════════════════════════════════════════════════ */

import { config } from "dotenv"
import { resolve } from "path"

// .env.local'ı yükle (Next.js API route'larından önce)
config({ path: resolve(__dirname, ".env.local") })

import { createServer } from "http"
import { parse } from "url"
import next from "next"
import { startPolling } from "./src/lib/agent-poller"
import { startFirmaSync } from "./src/lib/firma-sync"

const dev  = process.env.NODE_ENV !== "production"
const port = parseInt(process.env.PORT ?? "4242", 10)
const app  = next({ dev })
const handle = app.getRequestHandler()

app.prepare().then(() => {
  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url ?? "/", true)
    handle(req, res, parsedUrl)
  })

  server.listen(port, () => {
    console.log(`> PusulaHub ${dev ? "dev" : "production"} — http://localhost:${port}`)

    // Agent polling başlat
    startPolling()
    // Firma cache sync başlat
    startFirmaSync()
  })
})
