import "server-only"
import { io, type Socket } from "socket.io-client"

/**
 * Kuma admin Socket.IO client — monitor CRUD için.
 *
 * Kuma 1.23 Prometheus /metrics sadece oku; yazma için resmi REST yok.
 * Gerçek admin API'si dashboard ile aynı socket.io kanalı. Auth için
 * admin user/pass lazım (bir kere login, response'ta token gelir ama
 * her istekte yeni bağlantı açıp password ile login ediyoruz — sunucuda
 * Hub kaç defa sunucu eklerse o kadar).
 *
 * Env (apps/web/.env.local):
 *   UPTIME_KUMA_URL=http://10.15.2.6:3001
 *   KUMA_ADMIN_USER=...
 *   KUMA_ADMIN_PASSWORD=...
 *
 * Telegram bildirimi tüm monitörlerde açık olsun diye id=1 bağlanıyor
 * (Kuma'da tek notification tanımlı, id'si 1. Değişirse bu sabit güncellenmeli).
 */

const TELEGRAM_NOTIFICATION_ID = 1

interface KumaAck {
  ok:        boolean
  msg?:      string
  monitorID?: number
  monitors?: Record<string, KumaMonitorDb>
  token?:    string
}

interface KumaMonitorDb {
  id:       number
  name:     string
  type:     string
  hostname: string | null
  url:      string | null
  [k: string]: unknown
}

/* ── Socket helper'ları ─────────────────────────────────── */

function emitWithAck<T = KumaAck>(s: Socket, event: string, payload?: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`Kuma ack timeout: ${event}`)), 10_000)
    const cb = (ack: T) => { clearTimeout(t); resolve(ack) }
    if (payload === undefined) s.emit(event, cb)
    else s.emit(event, payload, cb)
  })
}

async function connectAndAuth(): Promise<Socket> {
  const url  = process.env.UPTIME_KUMA_URL
  const user = process.env.KUMA_ADMIN_USER
  const pass = process.env.KUMA_ADMIN_PASSWORD
  if (!url || !user || !pass) {
    throw new Error("Kuma admin env eksik (UPTIME_KUMA_URL / KUMA_ADMIN_USER / KUMA_ADMIN_PASSWORD).")
  }

  const socket = io(url, {
    transports:  ["websocket", "polling"],
    timeout:     10_000,
    reconnection: false,
    forceNew:    true,
  })

  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("Kuma connect timeout")), 10_000)
    socket.once("connect",       () => { clearTimeout(t); resolve() })
    socket.once("connect_error", (e) => { clearTimeout(t); reject(e) })
  })

  const ack = await emitWithAck<KumaAck>(socket, "login", {
    username: user,
    password: pass,
    token:    "",
  })
  if (!ack.ok) {
    socket.disconnect()
    throw new Error(ack.msg ?? "Kuma login başarısız")
  }
  return socket
}

/* ── Public API ─────────────────────────────────────────── */

export interface CreateMonitorInput {
  /** Görünür ad, Kuma UI'da. Hub sunucu adını önerir. */
  name:     string
  /** Ping için: IP veya hostname. */
  hostname: string
  /** Varsayılan: "ping". */
  type?:    "ping"
}

/**
 * Yeni ping monitor'ü oluşturur. Dönüş: Kuma'daki monitor id'si.
 */
export async function createKumaMonitor(input: CreateMonitorInput): Promise<number | null> {
  let socket: Socket | null = null
  try {
    socket = await connectAndAuth()
    const monitor = {
      type:                input.type ?? "ping",
      name:                input.name,
      hostname:            input.hostname,
      interval:            60,
      retryInterval:       60,
      maxretries:          0,
      notificationIDList:  { [TELEGRAM_NOTIFICATION_ID]: true },
      upsideDown:          false,
      packetSize:          56,
      // Aşağıdakiler Kuma'nın add handler'ına default ile geçer; boş gönderebiliriz.
      accepted_statuscodes_json: JSON.stringify(["200-299"]),
    }
    const ack = await emitWithAck<KumaAck>(socket, "add", monitor)
    if (!ack.ok) throw new Error(ack.msg ?? "Kuma add başarısız")
    return ack.monitorID ?? null
  } finally {
    socket?.disconnect()
  }
}

/**
 * Ada göre monitor siler. Bulunamazsa false döner (hata değil).
 */
export async function deleteKumaMonitorByName(name: string): Promise<boolean> {
  let socket: Socket | null = null
  try {
    socket = await connectAndAuth()
    const list = await emitWithAck<KumaAck>(socket, "getMonitorList")
    if (!list.ok || !list.monitors) return false
    const entry = Object.values(list.monitors).find((m) => m.name === name)
    if (!entry) return false
    const ack = await emitWithAck<KumaAck>(socket, "deleteMonitor", entry.id)
    return ack.ok === true
  } finally {
    socket?.disconnect()
  }
}

/**
 * Ada göre monitor'ü bulup ad+hostname günceller. Bulunamazsa false.
 */
export async function updateKumaMonitorByName(oldName: string, input: CreateMonitorInput): Promise<boolean> {
  let socket: Socket | null = null
  try {
    socket = await connectAndAuth()
    const list = await emitWithAck<KumaAck>(socket, "getMonitorList")
    if (!list.ok || !list.monitors) return false
    const entry = Object.values(list.monitors).find((m) => m.name === oldName)
    if (!entry) return false
    // Kuma editMonitor tüm alanları ister — mevcut monitor'ü mergeleyip gönder.
    const updated = { ...entry, name: input.name, hostname: input.hostname }
    const ack = await emitWithAck<KumaAck>(socket, "editMonitor", updated)
    return ack.ok === true
  } finally {
    socket?.disconnect()
  }
}

/**
 * Fire-and-forget wrapper: Kuma hatası Hub akışını bozmasın.
 * Hub route'ları bunu kullanır; hata sadece console'a düşer.
 */
export function kumaSafeCall<T>(label: string, fn: () => Promise<T>): Promise<T | null> {
  return fn().catch((e) => {
    console.error(`[kuma] ${label} failed:`, e instanceof Error ? e.message : e)
    return null
  })
}
