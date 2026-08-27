/* ══════════════════════════════════════════════════════════
   PusulaHub — Custom HTTP Server (Pull Model)
   Next.js App Router + Agent Poller aynı process'te çalışır.
   Hub, agent'ları periyodik olarak HTTP ile pollar.
══════════════════════════════════════════════════════════ */

import { config } from "dotenv"
import { resolve } from "path"

// Env yükle (Next.js API route'larından önce):
// 1) Önce .env.production (prod'da kaynak)
// 2) Sonra .env.local (local override, prod'da genelde yok)
// Convention: dotenv ilk yüklediği değerleri korur — .env.local override ediyorsa
// override:true kullanmak gerek. Şu an .env.local local-only override sayıyoruz.
config({ path: resolve(__dirname, ".env.production"), override: false })
config({ path: resolve(__dirname, ".env.local"),      override: true })

import { createServer } from "http"
import { parse } from "url"
import { networkInterfaces } from "os"
import next from "next"
import { startPolling } from "./src/lib/agent-poller"
import { startFirmaSync } from "./src/lib/firma-sync"

const dev  = process.env.NODE_ENV !== "production"
const port = 4242
const host = "0.0.0.0"  // tüm network interface'lerinde dinle (LAN erişimi için)
// NOT: hostname/port **zorunlu** — Next.js edge middleware adapter'ı
// (next-server.js runMiddleware) absolute URL kurarken bunları kullanıyor.
// Eksik bırakılırsa `http://localhost:undefined/...` oluşur ve NextURL
// "Invalid URL" atar (vercel/next.js#67277). fetchHostname "localhost".
const app  = next({ dev, hostname: "localhost", port })
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

    // ── Arka plan işleri (poller + firma sync) ──
    //
    // ⚠ Bunlar CANLI veritabanına YAZIYOR (agent metrikleri, günlük kullanım
    // istatistikleri, firma listesi). Lokal geliştirmede de çalışırlarsa aynı
    // veriye iki yerden yazılır: kullanım örneklem sayısı ve session_minutes
    // iki katına çıkar, günlük ortalamalar bozulur. (Yaşandı: dev sunucusu
    // açıkken bir gündeki örnek sayısı 10 saniyelik tavanı — 8640 — aştı;
    // 2026-07-24, 07-27, 07-31, 08-25 ve 08-26 satırları hâlâ şişik.)
    //
    // Bu yüzden yalnız production'da çalışır. Lokalde bilerek denemek için
    // .env.local'e ENABLE_POLLER=1 eklenir.
    const pollerEnabled = !dev || process.env.ENABLE_POLLER === "1"
    if (pollerEnabled) {
      startPolling()
      startFirmaSync()
    } else {
      console.log("  [Poller] dev modunda kapalı — açmak için .env.local'e ENABLE_POLLER=1 ekle")
    }
  })
})
