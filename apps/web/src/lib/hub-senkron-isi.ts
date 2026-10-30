/**
 * Kurulum sonrası Hub senkronu — arka plan işi (30.10.2026).
 *
 * Sihirbazın son grubu ("Hub kaydı") ilgili agent'ları force ile yoklayıp
 * firma sayaçlarını yeniden hesaplıyor; force'ta agent her şeyi baştan
 * topladığı için ~30 sn+ sürüyor ve kurulum ekranı bu sürede "çalışıyor"
 * görünüyordu. Kurulumun kendisi bitmiş olduğundan bu iş artık akıştan
 * ayrılıyor: kurulum hemen biter, senkron burada sürer, ekrandaki
 * `HubSenkronWidget` durumunu `/api/setup/senkron` üzerinden okur.
 *
 * Bellek içi: Hub tek süreç (Coolify, tek konteyner). Süreç yeniden
 * başlarsa iş kaybolur — widget bunu "durum bilinmiyor" diye gösterir;
 * poller zaten 10 dk içinde aynı veriyi yazar. İşler 6 saat sonra silinir.
 */

import { pollSingleAgent, refreshCompanyStats } from "./agent-poller"

export type SenkronDurum = "running" | "done" | "error"

export interface SenkronAdim {
  id:     string
  label:  string
  status: SenkronDurum
  error?: string
}

export interface SenkronIsi {
  id:        string
  firmaId:   string
  firmaAdi:  string
  baslangic: number
  bitis:     number | null
  adimlar:   SenkronAdim[]
}

const SAKLA_MS = 6 * 3600_000

const g = globalThis as unknown as { __hubSenkronIsleri?: Map<string, SenkronIsi> }
const isler = (g.__hubSenkronIsleri ??= new Map())

function temizle() {
  const sinir = Date.now() - SAKLA_MS
  for (const [id, is] of isler) if (is.baslangic < sinir) isler.delete(id)
}

/** Senkronu başlatır, beklemeden iş kimliğini döner. Hedef yoksa null. */
export function hubSenkronuBaslat(firmaId: string, firmaAdi: string, hedefler: { id: string; etiket: string }[]): string | null {
  if (hedefler.length === 0) return null
  temizle()
  const id = `${firmaId}-${Date.now().toString(36)}`
  const is: SenkronIsi = {
    id, firmaId, firmaAdi, baslangic: Date.now(), bitis: null,
    adimlar: [
      ...hedefler.map((h) => ({ id: `sync_${h.id}`, label: `Hub senkronu: ${h.etiket}`, status: "running" as const })),
      { id: "sync_stats", label: "Firma istatistikleri", status: "running" as const },
    ],
  }
  isler.set(id, is)

  const guncelle = (adimId: string, durum: Partial<SenkronAdim>) => {
    const a = is.adimlar.find((x) => x.id === adimId)
    if (a) Object.assign(a, durum)
  }

  void (async () => {
    /*  Sunucular PARALEL yoklanır: force'ta agent her şeyi baştan topluyor
     *  (ölçülen 2026-09-29: AD 30 sn, Terminal 21 sn, SQL 8 sn).          */
    await Promise.all(hedefler.map(async (h) => {
      try {
        const ok = await pollSingleAgent(h.id, true)
        guncelle(`sync_${h.id}`, ok ? { status: "done" } : { status: "error", error: "Agent'a ulaşılamadı — poller 10 dk içinde yakalar" })
      } catch (err) {
        guncelle(`sync_${h.id}`, { status: "error", error: err instanceof Error ? err.message : String(err) })
      }
    }))
    try {
      await refreshCompanyStats({ dosyaBoyutu: false })
      guncelle("sync_stats", { status: "done" })
    } catch (err) {
      guncelle("sync_stats", { status: "error", error: err instanceof Error ? err.message : String(err) })
    }
    is.bitis = Date.now()
  })()

  return id
}

export function hubSenkronIsi(id: string): SenkronIsi | null {
  return isler.get(id) ?? null
}
