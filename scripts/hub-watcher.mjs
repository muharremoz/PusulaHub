/**
 * Hub prod-mode dosya izleyici.
 * apps/web/src altında değişiklik olursa DEBOUNCE ms sonra:
 *   pm2 stop hub  →  pnpm build  →  pm2 start hub  →  port readiness bekle
 * çalıştırır.
 *
 * NEDEN BUILD ÖNCESİ STOP:
 *   next build `.next/` dizinini yerine yazıyor. Hub hâlâ eski chunk'ları
 *   serve ederken yeni manifest devreye girince hash uyuşmazlığı → process
 *   crash → PM2 restart loop → kullanıcıya 500. Build öncesi stop ile tek
 *   seferlik temiz ~15sn kesinti alırız.
 *
 * PM2 altında "hub-watcher" adıyla koşar (ecosystem.config.js).
 */
import { watch } from "node:fs"
import { spawn } from "node:child_process"
import { resolve } from "node:path"
import { createConnection } from "node:net"

const WEB_DIR    = resolve("C:/GitHub/Pusula Yazılım/PusulaHub/apps/web")
const WATCH_DIRS = ["src", "public"]
const DEBOUNCE   = 3000   // 3sn — arka arkaya kaydedilen dosyalar tek build'de toplanır
const COOLDOWN   = 5000   // cycle bitişinden sonra 5sn boyunca yeni trigger yok sayılır
const HUB_PORT   = 4242
const READY_TIMEOUT_MS = 30000

// Yok sayılacak dosya uzantıları / pattern'lar — build sırasında Next/Turbopack
// .next, tsbuildinfo, tmp swap dosyaları oluşturuyor. Bunları dinlemek sonsuz
// döngüye yol açıyordu (build → dosya yaz → trigger → build → ...).
const IGNORE_RX = /(^|[\\/])(\.next|node_modules|\.turbo|\.git)([\\/]|$)|\.tsbuildinfo$|\.tmp\b|~$/i

let running    = false
let cooldownTs = 0
let timer      = null

function log(msg) {
  const t = new Date().toISOString().slice(11, 19)
  console.log(`[hub-watcher ${t}] ${msg}`)
}

function runCmd(cmd, args, opts = {}) {
  return new Promise((res) => {
    const p = spawn(cmd, args, { cwd: WEB_DIR, stdio: "inherit", shell: true, ...opts })
    p.on("exit", (code) => res(code ?? 1))
  })
}

function probePort(port) {
  return new Promise((res) => {
    const s = createConnection({ host: "127.0.0.1", port })
    s.once("connect", () => { s.destroy(); res(true) })
    s.once("error",   () => { s.destroy(); res(false) })
    setTimeout(() => { try { s.destroy() } catch {} ; res(false) }, 800)
  })
}

async function waitForPort(port, timeoutMs) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (await probePort(port)) return true
    await new Promise(r => setTimeout(r, 500))
  }
  return false
}

async function rebuildAndRestart() {
  // Aynı cycle koşarken gelen triggerlar yok sayılır. `pending` kuyruğu yok —
  // aksi halde cycle içinde oluşan dosya olayları (start sırasında Next .next/
  // yazımı) sonsuz döngüye girip hub'ı açıp kapatıyordu.
  if (running) return
  // Son cycle'dan hemen sonra gelen gürültüyü yok say.
  if (Date.now() < cooldownTs) return
  running = true
  try {
    // 1) Build başlamadan hub'ı durdur — .next yeniden yazılırken crash olmasın.
    log("değişiklik algılandı → hub stop (build için)")
    await runCmd("pm2", ["stop", "hub"])

    log("pnpm build")
    const build = await runCmd("pnpm", ["build"])
    if (build !== 0) {
      log(`build HATA (exit ${build}) — hub'ı eski .next ile tekrar başlat`)
      await runCmd("pm2", ["start", "hub"])
      return
    }

    log("build OK → hub start")
    await runCmd("pm2", ["start", "hub"])

    // 2) Port dinleyene kadar bekle — kullanıcıya "hazır" dediğimizde gerçekten hazır olsun.
    const ready = await waitForPort(HUB_PORT, READY_TIMEOUT_MS)
    log(ready ? `hazır (${HUB_PORT} dinleniyor)` : `UYARI: ${READY_TIMEOUT_MS}ms içinde port açılmadı`)
  } finally {
    running    = false
    cooldownTs = Date.now() + COOLDOWN
  }
}

function trigger() {
  if (running) return                  // cycle koşuyorsa bile bekletme — drop
  if (Date.now() < cooldownTs) return  // cooldown içindeysek drop
  clearTimeout(timer)
  timer = setTimeout(rebuildAndRestart, DEBOUNCE)
}

for (const dir of WATCH_DIRS) {
  const full = resolve(WEB_DIR, dir)
  try {
    watch(full, { recursive: true }, (_type, filename) => {
      if (!filename) return
      const f = filename.toString()
      if (IGNORE_RX.test(f)) return
      // Cycle içindeyken ekstra log spam'i yapma.
      if (running) return
      if (Date.now() < cooldownTs) return
      log(`değişti: ${dir}/${f}`)
      trigger()
    })
    log(`izleniyor: ${full}`)
  } catch (e) {
    log(`watch hata ${full}: ${e?.message ?? e}`)
  }
}

log("hazır — src/public altında değişiklik bekleniyor")
