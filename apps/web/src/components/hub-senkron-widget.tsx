"use client"

/**
 * Arka planda süren Hub senkronu kartı (30.10.2026).
 *
 * Kurulum sihirbazı (ve firma detayından kullanıcı/hizmet ekleme) bitince
 * Hub senkronu `lib/hub-senkron-isi.ts`'te arka planda sürer. Bu kart sağ
 * altta durumunu gösterir. KENDİLİĞİNDEN KAPANMAZ — kullanıcı kapatır.
 *
 * İş kimlikleri localStorage'da tutulur: sayfa değişse ya da yenilense de
 * kart geri gelir. Kart açıkken 3 sn'de bir yoklar, bütün işler bitince
 * yoklama durur. Bir iş bitince `hub-senkron-bitti` olayı yayılır; firma
 * ekranı listeleri bununla tazeler.
 */

import { useCallback, useEffect, useState } from "react"
import { Check, Loader2, RefreshCw, X, XCircle, AlertTriangle } from "lucide-react"
import { cn } from "@/lib/utils"
import type { SenkronIsi } from "@/lib/hub-senkron-isi"

const ANAHTAR = "hub-senkron-isleri"
const OLAY_EKLE = "hub-senkron-ekle"
export const OLAY_BITTI = "hub-senkron-bitti"
const YOKLA_MS = 3_000

interface Kayit { id: string; firmaId: string; firmaAdi: string }

function oku(): Kayit[] {
  try { const v = JSON.parse(localStorage.getItem(ANAHTAR) ?? "[]"); return Array.isArray(v) ? v : [] } catch { return [] }
}
function yaz(l: Kayit[]) {
  try { localStorage.setItem(ANAHTAR, JSON.stringify(l)) } catch { /* depolama kapalı — kart yine bu sayfada görünür */ }
}

/** Kurulum bitince çağrılır: kartı açar ve işi izlemeye başlar. */
export function hubSenkronIzle(k: Kayit) {
  yaz([...oku().filter((x) => x.id !== k.id), k])
  window.dispatchEvent(new CustomEvent(OLAY_EKLE, { detail: k }))
}

export function HubSenkronWidget() {
  const [kayitlar, setKayitlar] = useState<Kayit[]>([])
  /** undefined = henüz sorulmadı, null = sunucu bu işi bilmiyor (yeniden başlamış) */
  const [isler, setIsler] = useState<Record<string, SenkronIsi | null | undefined>>({})

  useEffect(() => {
    setKayitlar(oku())
    const ekle = (e: Event) => {
      const k = (e as CustomEvent<Kayit>).detail
      setKayitlar((l) => [...l.filter((x) => x.id !== k.id), k])
    }
    window.addEventListener(OLAY_EKLE, ekle)
    return () => window.removeEventListener(OLAY_EKLE, ekle)
  }, [])

  const bitmis = (id: string) => isler[id] === null || !!isler[id]?.bitis
  const surenler = kayitlar.filter((k) => !bitmis(k.id)).map((k) => k.id)
  const surenAnahtar = surenler.join(",")

  useEffect(() => {
    if (!surenAnahtar) return
    let iptal = false
    const yokla = async () => {
      try {
        const r = await fetch(`/api/setup/senkron?id=${encodeURIComponent(surenAnahtar)}`, { cache: "no-store" })
        if (!r.ok || iptal) return
        const j = (await r.json()) as { isler: Record<string, SenkronIsi | null> }
        setIsler((onceki) => {
          for (const [id, is] of Object.entries(j.isler)) {
            const ilkKezBitti = is?.bitis && !onceki[id]?.bitis
            if (ilkKezBitti) window.dispatchEvent(new CustomEvent(OLAY_BITTI, { detail: { firmaId: is.firmaId } }))
          }
          return { ...onceki, ...j.isler }
        })
      } catch { /* ağ hatası — sonraki turda */ }
    }
    void yokla()
    const t = setInterval(() => void yokla(), YOKLA_MS)
    return () => { iptal = true; clearInterval(t) }
  }, [surenAnahtar])

  const kapat = useCallback((id: string) => {
    setKayitlar((l) => { const y = l.filter((x) => x.id !== id); yaz(y); return y })
  }, [])

  if (kayitlar.length === 0) return null

  return (
    <div
      className="fixed right-4 z-50 flex w-[340px] max-w-[calc(100vw-32px)] flex-col gap-2"
      style={{ bottom: "max(16px, env(safe-area-inset-bottom, 0px))" }}
      role="status"
      aria-live="polite"
    >
      {kayitlar.map((k) => <SenkronKarti key={k.id} kayit={k} is={isler[k.id]} onKapat={() => kapat(k.id)} />)}
    </div>
  )
}

function SenkronKarti({ kayit, is, onKapat }: { kayit: Kayit; is: SenkronIsi | null | undefined; onKapat: () => void }) {
  const bilinmiyor = is === null
  const bitti = !!is?.bitis
  const hatali = !!is?.adimlar.some((a) => a.status === "error")
  const tamam = is?.adimlar.filter((a) => a.status !== "running").length ?? 0
  const toplam = is?.adimlar.length ?? 0

  const [simdi, setSimdi] = useState(() => Date.now())
  useEffect(() => {
    if (bitti || bilinmiyor) return
    const t = setInterval(() => setSimdi(Date.now()), 1000)
    return () => clearInterval(t)
  }, [bitti, bilinmiyor])
  const sn = is ? Math.max(0, Math.round(((is.bitis ?? simdi) - is.baslangic) / 1000)) : 0

  const baslik = bilinmiyor ? "Senkron durumu bilinmiyor"
    : !bitti ? "Hub kaydı arka planda sürüyor"
    : hatali ? "Hub kaydı kısmen tamamlandı"
    : "Hub kaydı tamamlandı"

  return (
    <div className="overflow-hidden rounded-[10px] border bg-popover text-popover-foreground" style={{ boxShadow: "var(--card-shadow)" }}>
      <div className="flex items-center gap-3 border-b bg-[var(--section-bg)] px-3 py-2.5">
        <span className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-[5px] ring-1",
          !bitti && !bilinmiyor ? "bg-primary/10 text-primary ring-primary/20"
          : hatali || bilinmiyor ? "bg-amber-500/15 text-amber-700 ring-amber-500/25 dark:text-amber-400"
          : "bg-emerald-500/15 text-emerald-700 ring-emerald-500/25 dark:text-emerald-400",
        )}>
          {!bitti && !bilinmiyor ? <RefreshCw className="size-4 animate-spin [animation-duration:2s]" />
            : hatali || bilinmiyor ? <AlertTriangle className="size-4" />
            : <Check className="size-4" strokeWidth={2.5} />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold">{baslik}</p>
          <p className="truncate text-[12px] text-muted-foreground">
            {kayit.firmaId} · {kayit.firmaAdi}
            {is && <> · {toplam ? `${tamam}/${toplam}` : ""} · {sn} sn</>}
          </p>
        </div>
        <button
          type="button"
          onClick={onKapat}
          className="flex size-7 shrink-0 items-center justify-center rounded-[5px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Kartı kapat"
          title={bitti || bilinmiyor ? "Kapat" : "Kartı kapat — senkron arka planda sürer"}
        >
          <X className="size-4" />
        </button>
      </div>

      <ul className="flex flex-col gap-1 px-3 py-2">
        {bilinmiyor && (
          <li className="text-[12px] text-muted-foreground">
            Hub yeniden başlatıldığı için bu işin durumu kayboldu. Veriler en geç 10 dakika içinde otomatik yoklamayla güncellenir.
          </li>
        )}
        {is === undefined && (
          <li className="flex items-center gap-2 text-[12px] text-muted-foreground"><Loader2 className="size-3.5 animate-spin" />Durum alınıyor…</li>
        )}
        {is?.adimlar.map((a) => (
          <li key={a.id} className="flex items-start gap-2">
            <span className="mt-[2px]">
              {a.status === "running" ? <Loader2 className="size-3.5 animate-spin text-foreground" />
                : a.status === "error" ? <XCircle className="size-3.5 text-red-600 dark:text-red-400" />
                : <span className="flex size-3.5 items-center justify-center rounded-full bg-emerald-500"><Check className="size-2.5 text-white" strokeWidth={3} /></span>}
            </span>
            <div className="min-w-0 flex-1">
              <p className={cn("text-[12px]", a.status === "running" ? "font-medium" : "text-muted-foreground")}>{a.label}</p>
              {a.error && <p className="mt-0.5 rounded-[5px] bg-red-500/15 px-1.5 py-1 text-[11px] text-red-700 dark:text-red-400">{a.error}</p>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
