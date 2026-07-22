/* ══════════════════════════════════════════════════════════
   PusulaHub — Firma Cache Sync
   Firma API'yi 5 dakikada bir çeker, hub.companies'e senkronize eder
   (firkod bazlı partial upsert — hub.sync_firmalar RPC).
   Poller/sync Coolify'da çalışır (session yok) → service-role.
══════════════════════════════════════════════════════════ */

import { getSupabaseAdmin } from "./supabase/admin"

const SYNC_INTERVAL_MS = 5 * 60 * 1000 // 5 dakika

interface FirmaApiItem {
  Firkod:    number
  Firma:     string
  EMail:     string
  Mobile:    string
  UserCount: number
  Lisans:    string
}

interface FirmaApiResponse {
  IsSuccess: boolean
  Message:   string
  Param:     FirmaApiItem[]
}

export async function syncFirmalarNow(): Promise<void> {
  return syncFirmalar()
}

async function syncFirmalar(): Promise<void> {
  const baseUrl  = process.env.FIRMA_API_URL      ?? ""
  const username = process.env.FIRMA_API_USERNAME ?? ""
  const password = process.env.FIRMA_API_PASSWORD ?? ""

  if (!baseUrl) return

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 15000)

    // API 2026-06'da değişti: POST /Server/List → GET /Account/ServerList.
    const res = await fetch(`${baseUrl}/Account/ServerList`, {
      method: "GET",
      headers: {
        Authorization: "Basic " + Buffer.from(`${username}:${password}`).toString("base64"),
      },
      signal: controller.signal,
      cache: "no-store",
    })
    clearTimeout(timer)

    if (!res.ok) {
      console.log(`[FirmaSync] API hatası: HTTP ${res.status}`)
      return
    }

    const json: FirmaApiResponse = await res.json()
    if (!json.IsSuccess || !Array.isArray(json.Param)) {
      console.log(`[FirmaSync] API başarısız: ${json.Message}`)
      return
    }

    // API çıktısını normalize et → tek RPC çağrısı (hub.sync_firmalar)
    const payload = json.Param.map((item) => ({
      firkod:    String(item.Firkod),
      firma:     item.Firma?.trim() ?? "",
      email:     item.EMail === "X" ? "" : (item.EMail ?? ""),
      phone:     item.Mobile === "X" ? "" : (item.Mobile ?? ""),
      userCount: item.UserCount ?? 0,
      lisans:    item.Lisans ?? "",
    }))

    const { error } = await getSupabaseAdmin().schema("hub").rpc("sync_firmalar", { p: payload })
    if (error) {
      console.log(`[FirmaSync] RPC hatası: ${error.message}`)
      return
    }

    console.log(`[FirmaSync] ${payload.length} firma senkronize edildi.`)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    if (!msg.includes("abort")) {
      console.log(`[FirmaSync] Hata: ${msg}`)
    }
  }
}

let _timer: ReturnType<typeof setInterval> | null = null

export function startFirmaSync(): void {
  if (_timer) return
  console.log("[FirmaSync] Başlatıldı — 5 dk aralıkla")
  setTimeout(syncFirmalar, 10000)
  _timer = setInterval(syncFirmalar, SYNC_INTERVAL_MS)
}

export function stopFirmaSync(): void {
  if (_timer) {
    clearInterval(_timer)
    _timer = null
  }
}
