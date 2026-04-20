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
import { networkInterfaces } from "os"
import next from "next"
import { startPolling } from "./src/lib/agent-poller"
import { startFirmaSync } from "./src/lib/firma-sync"

const dev  = process.env.NODE_ENV !== "production"
const port = 4242
const host = "0.0.0.0"  // tüm network interface'lerinde dinle (LAN erişimi için)
const app  = next({ dev })
const handle = app.getRequestHandler()

/** LAN'daki IPv4 adreslerini bul — kullanıcı hangi adresten bağlanacağını bilsin. */
function getLanAddresses(): string[] {
  const ifs = networkInterfaces()
  const out: string[] = []
  for (const name of Object.keys(ifs)) {
    for (const addr of ifs[name] ?? []) {
      if (addr.family === "IPv4" && !addr.internal) out.push(addr.address)
    }
  }
  return out
}

app.prepare().then(() => {
  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url ?? "/", true)
    handle(req, res, parsedUrl)
  })

  server.listen(port, host, () => {
    console.log(`> PusulaHub ${dev ? "dev" : "production"} — http://localhost:${port}`)
    const lan = getLanAddresses()
    if (lan.length) {
      console.log(`  LAN erişimi:`)
      for (const ip of lan) console.log(`    http://${ip}:${port}`)
    }

    // Agent polling başlat
    startPolling()
    // Firma cache sync başlat
    startFirmaSync()
  })
})
