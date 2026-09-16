import { NextResponse } from "next/server"
import { getSupabaseServer } from "@/lib/supabase/server"
import { getAllAgents } from "@/lib/agent-store"
import { requirePermission } from "@/lib/require-permission"
import { firmaTemsilcileri } from "@/lib/crm-temsilciler"

/**
 * GET /api/dashboard/bilkar
 *
 * Bilkar (iş ortağı) portföyünün tek bakışta özeti — kontrol panelindeki
 * Bilkar bölümü için.
 *
 * Bilkar firması = CRM'de müşteri temsilcisi BILKAR olan firma. Portföy
 * büyük (764) ama çoğu Hub'da kurulu değil; ekranda ikisi de gösterilir:
 * "kurulu" olanlar bizim sunucularımızda yer kaplayan gerçek yüktür.
 *
 * Kullanıcı sayımı dashboard özetiyle AYNI tanım: firma OU'sundaki ad_users.
 */

export const dynamic = "force-dynamic"

export interface BilkarFirma {
  firkod:    string
  firma:     string
  /** AD'deki kullanıcı sayısı (OU altı) */
  kullanici: number
  /** Lisans hakkı (companies.user_count) */
  lisans:    number
  /** Şu an açık oturum (agent raporundan) */
  aktif:     number
  sunucu:    string | null
  lisansBitis: string | null
}

export interface BilkarOzet {
  ok: boolean
  /** CRM'de BILKAR temsilcili toplam firma (portföy) */
  portfoy:   number
  /** Hub'da kurulu (AD sunucusu atanmış) firma */
  kurulu:    number
  kullanici: number
  lisans:    number
  /** Şu an açık oturum sayısı */
  aktifOturum: number
  /** Terminal sunucusu bazında dağılım */
  sunucular: { id: string; ad: string; firma: number; kullanici: number; aktif: number; online: boolean; cpu: number; ram: number; disk: number }[]
  /** Kurulu firmalar — kullanıcı sayısına göre azalan */
  firmalar:  BilkarFirma[]
  /** 30 gün içinde lisansı dolacak/dolmuş kurulu firmalar */
  lisansUyari: { firkod: string; firma: string; lisansBitis: string; gun: number }[]
}

/** "2101.karunig1" → "2101" · OU alanı zaten firma kodu ama isim de kullanılıyor. */
function ouFirma(ou: string): string {
  return (ou ?? "").trim()
}

export async function GET() {
  const gate = await requirePermission("dashboard", "read")
  if (gate) return gate
  try {
    const sb = await getSupabaseServer()
    const temsilciler = await firmaTemsilcileri()
    const bilkarKodlari = new Set(
      [...temsilciler.entries()]
        .filter(([, t]) => /bilkar/i.test(t.ad ?? ""))
        .map(([firkod]) => firkod),
    )
    if (bilkarKodlari.size === 0) {
      return NextResponse.json({ ok: false, error: "CRM'den temsilci listesi alınamadı" }, { status: 503 })
    }

    // Kurulu firmalar: AD sunucusu atanmış olanlar (dashboard özetiyle aynı tanım)
    const { data: comps } = await sb.schema("hub").from("companies")
      .select("company_id, name, user_count, windows_server_id, contract_end")
      .not("ad_server_id", "is", null)
      .limit(10_000)
    const kurulu = ((comps ?? []) as { company_id: string; name: string; user_count: number | null; windows_server_id: string | null; contract_end: string | null }[])
      .filter((c) => bilkarKodlari.has(String(c.company_id)))

    // OU başına kullanıcı
    const ouList = kurulu.map((c) => c.company_id)
    const kullaniciByOu = new Map<string, number>()
    if (ouList.length > 0) {
      const { data: ouRows } = await sb.schema("hub").from("ad_users").select("ou").in("ou", ouList).limit(10_000)
      for (const r of ((ouRows ?? []) as { ou: string }[])) {
        const k = ouFirma(r.ou)
        kullaniciByOu.set(k, (kullaniciByOu.get(k) ?? 0) + 1)
      }
    }

    // Sunucular + canlı oturumlar (agent raporu)
    const { data: srvRows } = await sb.schema("hub").from("servers").select("id, name, ip")
    const srvById = new Map(((srvRows ?? []) as { id: string; name: string; ip: string }[]).map((s) => [s.id, s]))
    const agents = getAllAgents()

    /** firma kodu → o an açık oturum sayısı (kullanıcı adı "<firkod>.xxx") */
    const aktifByFirma = new Map<string, number>()
    const aktifBySrv   = new Map<string, number>()
    for (const a of agents) {
      const srv = ((srvRows ?? []) as { id: string; name: string; ip: string }[])
        .find((s) => s.id === a.agentId || s.name === a.hostname || s.ip === a.ip)
      for (const s of (a.lastReport?.sessions ?? [])) {
        if (s.state !== "Active") continue
        const kullanici = (s.username ?? "").split("\\").pop() ?? ""
        const kod = kullanici.split(".")[0]
        if (!kod || !bilkarKodlari.has(kod)) continue
        aktifByFirma.set(kod, (aktifByFirma.get(kod) ?? 0) + 1)
        if (srv) aktifBySrv.set(srv.id, (aktifBySrv.get(srv.id) ?? 0) + 1)
      }
    }

    const firmalar: BilkarFirma[] = kurulu.map((c) => ({
      firkod:      c.company_id,
      firma:       c.name,
      kullanici:   kullaniciByOu.get(c.company_id) ?? 0,
      lisans:      c.user_count ?? 0,
      aktif:       aktifByFirma.get(c.company_id) ?? 0,
      sunucu:      c.windows_server_id ? (srvById.get(c.windows_server_id)?.name ?? null) : null,
      lisansBitis: c.contract_end ? c.contract_end.slice(0, 10) : null,
    })).sort((a, b) => b.kullanici - a.kullanici || a.firma.localeCompare(b.firma, "tr"))

    // Sunucu bazında dağılım + canlı metrikler
    const srvOzet = new Map<string, { firma: number; kullanici: number }>()
    for (const c of kurulu) {
      if (!c.windows_server_id) continue
      const o = srvOzet.get(c.windows_server_id) ?? { firma: 0, kullanici: 0 }
      o.firma++
      o.kullanici += kullaniciByOu.get(c.company_id) ?? 0
      srvOzet.set(c.windows_server_id, o)
    }
    const sunucular = [...srvOzet.entries()].map(([id, o]) => {
      const s = srvById.get(id)
      const a = agents.find((x) => x.agentId === id || x.hostname === s?.name || x.ip === s?.ip)
      const m = a?.lastReport?.metrics
      return {
        id,
        ad:        s?.name ?? id,
        firma:     o.firma,
        kullanici: o.kullanici,
        aktif:     aktifBySrv.get(id) ?? 0,
        online:    a?.status === "online",
        cpu:       m?.cpu ?? 0,
        ram:       m ? Math.round((m.ram.usedMB / m.ram.totalMB) * 100) : 0,
        disk:      m?.disks?.[0]?.percent ?? 0,
      }
    }).sort((a, b) => b.firma - a.firma)

    const bugun = Date.now()
    const lisansUyari = firmalar
      .filter((f) => f.lisansBitis)
      .map((f) => ({
        firkod: f.firkod, firma: f.firma, lisansBitis: f.lisansBitis!,
        gun: Math.round((new Date(f.lisansBitis!).getTime() - bugun) / 86_400_000),
      }))
      .filter((f) => Number.isFinite(f.gun) && f.gun <= 30)
      .sort((a, b) => a.gun - b.gun)

    const ozet: BilkarOzet = {
      ok:          true,
      portfoy:     bilkarKodlari.size,
      kurulu:      kurulu.length,
      kullanici:   firmalar.reduce((t, f) => t + f.kullanici, 0),
      lisans:      firmalar.reduce((t, f) => t + f.lisans, 0),
      aktifOturum: [...aktifByFirma.values()].reduce((t, n) => t + n, 0),
      sunucular,
      firmalar,
      lisansUyari,
    }
    return NextResponse.json(ozet)
  } catch (err) {
    console.error("[GET /api/dashboard/bilkar]", err)
    return NextResponse.json({ ok: false, error: "Bilkar özeti alınamadı" }, { status: 500 })
  }
}
