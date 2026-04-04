/* ══════════════════════════════════════════════════════════
   PusulaHub — WebSocket Bağlantı Yöneticisi
   Agent ↔ Hub arasındaki gerçek zamanlı iletişimi yönetir.
   Global singleton pattern (Next.js hot-reload korumalı).

   NOT: Circular dependency'den kaçınmak için bu modül
   agent-store'u doğrudan import etmez.
   Mesaj işleme handler'ı dışarıdan set edilir.
══════════════════════════════════════════════════════════ */

import type { WebSocket } from "ws"
import type { WsMessage } from "./agent-types"

/* ── Global singleton ── */
const g = global as typeof global & {
  _pusulaWsConnections?: Map<string, WebSocket>
  _pusulaWsPingTimers?: Map<string, ReturnType<typeof setInterval>>
  _pusulaWsOnMessage?: (agentId: string, msg: WsMessage) => void
}
if (!g._pusulaWsConnections) g._pusulaWsConnections = new Map()
if (!g._pusulaWsPingTimers) g._pusulaWsPingTimers = new Map()

const connections = g._pusulaWsConnections
const pingTimers  = g._pusulaWsPingTimers

const PING_INTERVAL_MS = 30_000
const PONG_TIMEOUT_MS  = 10_000

/* ══════════════════════════════════════════════
   MESAJ HANDLER (dışarıdan set edilir)
══════════════════════════════════════════════ */

/** server.ts tarafından çağrılır — gelen mesajları agent-store'a yönlendirir */
export function setOnMessage(handler: (agentId: string, msg: WsMessage) => void): void {
  g._pusulaWsOnMessage = handler
}

/* ══════════════════════════════════════════════
   BAĞLANTI YÖNETİMİ
══════════════════════════════════════════════ */

/** Yeni WebSocket bağlantısını kaydet ve mesaj dinleyicileri kur */
export function registerConnection(agentId: string, ws: WebSocket): void {
  // Varolan eski bağlantıyı kapat
  const old = connections.get(agentId)
  if (old && old.readyState <= 1) {
    old.close(1000, "Yeni bağlantı")
  }
  clearPingTimer(agentId)

  connections.set(agentId, ws)

  // Mesaj dinleyicisi
  ws.on("message", (raw: Buffer | string) => {
    try {
      const msg: WsMessage = JSON.parse(String(raw))
      g._pusulaWsOnMessage?.(agentId, msg)
    } catch {
      // Geçersiz JSON — yoksay
    }
  })

  // Bağlantı kapandığında temizle
  ws.on("close", () => {
    connections.delete(agentId)
    clearPingTimer(agentId)
  })

  ws.on("error", () => {
    connections.delete(agentId)
    clearPingTimer(agentId)
  })

  // Keepalive ping başlat
  startPingTimer(agentId, ws)
}

/** Agent'a JSON mesaj gönder */
export function sendToAgent(agentId: string, message: WsMessage): boolean {
  const ws = connections.get(agentId)
  if (!ws || ws.readyState !== 1) return false
  ws.send(JSON.stringify(message))
  return true
}

/** Agent'ın aktif WebSocket bağlantısı var mı? */
export function hasConnection(agentId: string): boolean {
  const ws = connections.get(agentId)
  return !!ws && ws.readyState === 1
}

/** Bağlantıyı kapat */
export function removeConnection(agentId: string): void {
  const ws = connections.get(agentId)
  if (ws) ws.close(1000, "Hub tarafından kapatıldı")
  connections.delete(agentId)
  clearPingTimer(agentId)
}

/** Aktif bağlantı sayısı */
export function connectionCount(): number {
  return connections.size
}

/* ══════════════════════════════════════════════
   KEEPALIVE (PING/PONG)
══════════════════════════════════════════════ */

function startPingTimer(agentId: string, ws: WebSocket): void {
  const timer = setInterval(() => {
    if (ws.readyState !== 1) {
      clearPingTimer(agentId)
      return
    }

    ws.send(JSON.stringify({ type: "ping" }))

    const pongTimeout = setTimeout(() => {
      if (ws.readyState === 1) {
        ws.close(1000, "Pong zaman aşımı")
      }
      connections.delete(agentId)
      clearPingTimer(agentId)
    }, PONG_TIMEOUT_MS)

    const onPong = (raw: Buffer | string) => {
      try {
        const m: WsMessage = JSON.parse(String(raw))
        if (m.type === "pong") {
          clearTimeout(pongTimeout)
          ws.off("message", onPong)
        }
      } catch { /* */ }
    }
    ws.on("message", onPong)
  }, PING_INTERVAL_MS)

  pingTimers.set(agentId, timer)
}

function clearPingTimer(agentId: string): void {
  const timer = pingTimers.get(agentId)
  if (timer) {
    clearInterval(timer)
    pingTimers.delete(agentId)
  }
}
