"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { RefreshCw } from "lucide-react"
import { PageContainer } from "@/components/layout/page-container"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/shared/icon"
import type { IconName } from "@/components/shared/icon-registry"
import type { DashDurum } from "@/app/api/dashboard/durum/route"
import type { DashFirmalar, DashFirmaSatir } from "@/app/api/dashboard/firmalar/route"
import dynamic from "next/dynamic"

const OturumGrafik = dynamic(() => import("@/components/dashboard/oturum-grafik").then((m) => m.OturumGrafik), {
  ssr: false, loading: () => <Skeleton className="h-full w-full rounded-[5px]" />,
})

/**
 * Dashboard — 1. aşama (16.10.2026): üstte özet, "Dikkat gerektirenler",
 * altında sunucu kartları. Veri /api/dashboard/durum (30 sn sunucu önbelleği);
 * sayfa 60 sn'de bir yeniler — proje kuralı: izleme aralığı 30–60 sn.
 */

const YENILEME_MS = 60_000

const seviyeRenk = (p: number | null) =>
  p == null ? "bg-muted" : p >= 90 ? "bg-red-500" : p >= 75 ? "bg-amber-500" : "bg-emerald-500"

export default function DashboardPage() {
  const [veri, setVeri] = useState<DashDurum | null>(null)
  const [hata, setHata] = useState<string | null>(null)
  const [yukleniyor, setYukleniyor] = useState(true)
  const [firma, setFirma] = useState<DashFirmalar | null>(null)
  const [firmaYukleniyor, setFirmaYukleniyor] = useState(true)

  // Firmalar + hareket: sunucu tarafı 5 dk önbellekli, aynı 60 sn döngüde yenilenir
  const firmaYukle = useCallback(async () => {
    try {
      const r = await fetch("/api/dashboard/firmalar", { cache: "no-store" })
      if (r.ok) setFirma((await r.json()) as DashFirmalar)
    } catch { /* bölüm boş kalır, üst kısım etkilenmez */ }
    finally { setFirmaYukleniyor(false) }
  }, [])

  useEffect(() => {
    void firmaYukle()
    const t = setInterval(() => { if (document.visibilityState === "visible") void firmaYukle() }, YENILEME_MS)
    return () => clearInterval(t)
  }, [firmaYukle])

  const yukle = useCallback(async () => {
    setYukleniyor(true)
    try {
      const r = await fetch("/api/dashboard/durum", { cache: "no-store" })
      const j = await r.json()
      if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`)
      setVeri(j as DashDurum); setHata(null)
    } catch (e) {
      setHata(e instanceof Error ? e.message : "Durum alınamadı")
    } finally {
      setYukleniyor(false)
    }
  }, [])

  useEffect(() => {
    void yukle()
    const t = setInterval(() => { if (document.visibilityState === "visible") void yukle() }, YENILEME_MS)
    return () => clearInterval(t)
  }, [yukle])

  const sunucular = veri?.sunucular ?? []
  const cevrimici = sunucular.filter((s) => s.cevrimici).length
  const aktifKisi = sunucular.reduce((t, s) => t + (s.aktifKullanici ?? 0), 0)
  const terminaller = sunucular.filter((s) => s.roller.includes("RDP"))
  const kritik = veri?.dikkat.filter((d) => d.seviye === "kritik").length ?? 0
  const uyari = (veri?.dikkat.length ?? 0) - kritik
  const ilkYukleme = !veri && yukleniyor

  return (
    <PageContainer title="Dashboard" description="Sunucuların ve firmaların anlık durumu">
      <div className="space-y-3">
        {/* Yenileme şeridi */}
        <div className="flex items-center justify-end gap-2 text-[12px] text-muted-foreground">
          {hata && <span className="text-red-600 dark:text-red-400">Yenilenemedi: {hata}</span>}
          {veri && <span className="tabular-nums">Son güncelleme {new Date(veri.zaman).toLocaleTimeString("tr-TR")}</span>}
          <Button variant="outline" size="sm" className="h-7 gap-1.5 rounded-[5px] px-2.5 text-[12px]" onClick={() => void yukle()} disabled={yukleniyor}>
            <RefreshCw className={`size-3.5 ${yukleniyor ? "animate-spin" : ""}`} /> Yenile
          </Button>
        </div>

        {/* Özet */}
        <div className="grid grid-cols-2 gap-2 rounded-[8px] bg-[var(--section-bg)] p-2 lg:grid-cols-4">
          <Ozet ikon="monitor-check" baslik="Sunucular" yukleniyor={ilkYukleme}
            deger={`${cevrimici} / ${sunucular.length}`} alt={cevrimici === sunucular.length ? "hepsi çevrimiçi" : `${sunucular.length - cevrimici} ulaşılamıyor`}
            vurgu={cevrimici < sunucular.length ? "kritik" : "iyi"} />
          <Ozet ikon="users" baslik="Çalışan kişi" yukleniyor={ilkYukleme}
            deger={String(aktifKisi)} alt={`${terminaller.length} terminalde aktif oturum`} />
          <Ozet ikon="shield-check" baslik="Yedek" yukleniyor={ilkYukleme}
            deger={!veri?.yedek ? "—" : veri.yedek.sorunlu > 0 ? `${veri.yedek.sorunlu} sorunlu` : veri.yedek.gecikmis > 0 ? `${veri.yedek.gecikmis} gecikmiş` : "Sağlıklı"}
            alt={veri?.yedek ? `${veri.yedek.saglikli} / ${veri.yedek.toplam} veritabanı güncel` : "okunamadı"}
            vurgu={!veri?.yedek ? undefined : veri.yedek.sorunlu > 0 ? "kritik" : veri.yedek.gecikmis > 0 ? "uyari" : "iyi"} />
          <Ozet ikon="badge-alert" baslik="Dikkat" yukleniyor={ilkYukleme}
            deger={kritik + uyari === 0 ? "Yok" : String(kritik + uyari)}
            alt={kritik + uyari === 0 ? "her şey yolunda" : `${kritik} kritik · ${uyari} uyarı`}
            vurgu={kritik > 0 ? "kritik" : uyari > 0 ? "uyari" : "iyi"} />
        </div>

        {/* Firmalar + bugün */}
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          <section className="rounded-[8px] bg-[var(--section-bg)] p-2">
            <h2 className="px-2 pb-2 pt-1 text-[13px] font-semibold">Firmalar</h2>
            <div className="space-y-2">
              <FirmaListesi baslik="Lisansı dolan" yukleniyor={firmaYukleniyor}
                bos="Önümüzdeki 30 günde lisansı dolan firma yok."
                satirlar={[
                  ...(firma?.lisans.dolmus ?? []).map((x) => ({ ...x, kritik: true })),
                  ...(firma?.lisans.yaklasan ?? []).map((x) => ({ ...x, kritik: (x.deger ?? 99) <= 7 })),
                ]}
                not={firma ? `${firma.lisans.dolmus.length} dolmuş · ${firma.lisans.yaklasan.length} yaklaşan` : undefined} />
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                <FirmaListesi baslik="Kullanıcı hakkını aşanlar" yukleniyor={firmaYukleniyor}
                  bos="Açık hesap sayısı hakkını aşan firma yok."
                  satirlar={(firma?.hakAsan ?? []).map((x) => ({ ...x, rozet: `+${x.deger}` }))} />
                <FirmaListesi baslik="En yoğun 5 firma" yukleniyor={firmaYukleniyor}
                  bos="Yoğunluk verisi yok."
                  satirlar={(firma?.yogun ?? []).map((x) => ({ ...x, skor: x.deger }))} />
              </div>
            </div>
          </section>

          <section className="rounded-[8px] bg-[var(--section-bg)] p-2">
            <h2 className="px-2 pb-2 pt-1 text-[13px] font-semibold">Bugün</h2>
            <div className="space-y-2">
              <div className="rounded-[5px] bg-card px-4 py-3" style={{ boxShadow: "var(--card-shadow)" }}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[13px] font-medium">Terminal oturumları</p>
                    <p className="text-[12px] text-muted-foreground">Tüm terminallerin aktif oturum toplamı · 5 dk</p>
                  </div>
                  <div className="flex gap-4 text-right">
                    <div>
                      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Şimdi</p>
                      <p className="text-[15px] font-semibold tabular-nums">{firma?.oturum.simdi ?? "—"}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Zirve</p>
                      <p className="text-[15px] font-semibold tabular-nums">
                        {firma?.oturum.zirve ? (
                          <>
                            {firma.oturum.zirve.kisi}
                            <span className="text-[12px] font-medium text-muted-foreground">
                              {" · "}{new Date(firma.oturum.zirve.ts).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}
                            </span>
                          </>
                        ) : "—"}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="mt-2 h-[160px]">
                  {firmaYukleniyor ? <Skeleton className="h-full w-full rounded-[5px]" /> : <OturumGrafik seri={firma?.oturum.seri ?? []} />}
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </PageContainer>
  )
}

function Ozet({ ikon, baslik, deger, alt, vurgu, yukleniyor }: {
  ikon: IconName; baslik: string; deger: string; alt: string; vurgu?: "iyi" | "uyari" | "kritik"; yukleniyor: boolean
}) {
  const renk = vurgu === "kritik" ? "text-red-600 dark:text-red-400" : vurgu === "uyari" ? "text-amber-700 dark:text-amber-400" : vurgu === "iyi" ? "text-emerald-700 dark:text-emerald-400" : "text-foreground"
  return (
    <div className="rounded-[5px] bg-card px-4 py-3" style={{ boxShadow: "var(--card-shadow)" }}>
      <p className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        <Icon name={ikon} size={13} /> {baslik}
      </p>
      {yukleniyor ? (
        <div className="mt-2 space-y-1.5"><Skeleton className="h-7 w-24 rounded-[5px]" /><Skeleton className="h-3 w-32 rounded-[5px]" /></div>
      ) : (
        <>
          <p className={`mt-1 text-2xl font-bold tabular-nums ${renk}`}>{deger}</p>
          <p className="truncate text-[12px] text-muted-foreground">{alt}</p>
        </>
      )}
    </div>
  )
}

type FirmaSatiri = DashFirmaSatir & { kritik?: boolean; rozet?: string; skor?: number }

function FirmaListesi({ baslik, satirlar, bos, not, yukleniyor }: {
  baslik: string; satirlar: FirmaSatiri[]; bos: string; not?: string; yukleniyor: boolean
}) {
  const [tumu, setTumu] = useState(false)
  const gorunen = tumu ? satirlar : satirlar.slice(0, 5)
  return (
    <div className="overflow-hidden rounded-[5px] bg-card" style={{ boxShadow: "var(--card-shadow)" }}>
      <div className="flex items-baseline gap-2 border-b px-4 py-2">
        <p className="text-[13px] font-medium">{baslik}</p>
        {!yukleniyor && satirlar.length > 0 && <span className="text-[12px] tabular-nums text-muted-foreground">{not ?? satirlar.length}</span>}
      </div>
      {yukleniyor ? (
        <div className="space-y-2 px-4 py-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-4 w-full rounded-[5px]" />)}</div>
      ) : satirlar.length === 0 ? (
        <p className="px-4 py-3 text-[12px] text-muted-foreground">{bos}</p>
      ) : (
        <>
          <ul className="divide-y">
            {gorunen.map((x) => (
              <li key={x.firkod}>
                <Link href={`/companies?firkod=${x.firkod}`} className="flex items-center gap-3 px-4 py-2 transition-colors hover:bg-muted/30">
                  <span className="w-12 shrink-0 text-[12px] tabular-nums text-muted-foreground">{x.firkod}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium">{x.ad}</p>
                    <p className={`truncate text-[12px] ${x.kritik ? "text-red-600 dark:text-red-400" : "text-muted-foreground"}`}>{x.detay}</p>
                  </div>
                  {x.rozet && (
                    <span className="inline-flex shrink-0 rounded-[5px] bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium tabular-nums text-amber-700 dark:text-amber-400">{x.rozet}</span>
                  )}
                  {x.skor != null && (
                    <div className="flex w-24 shrink-0 items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                        <div className={`h-full rounded-full ${seviyeRenk(x.skor)}`} style={{ width: `${x.skor}%` }} />
                      </div>
                      <span className="w-9 text-right text-[12px] font-semibold tabular-nums">%{x.skor}</span>
                    </div>
                  )}
                </Link>
              </li>
            ))}
          </ul>
          {satirlar.length > 5 && (
            <button type="button" onClick={() => setTumu((v) => !v)}
              className="w-full border-t px-4 py-1.5 text-left text-[12px] font-medium text-primary hover:bg-muted/30">
              {tumu ? "Daha az göster" : `Tümünü göster (${satirlar.length})`}
            </button>
          )}
        </>
      )}
    </div>
  )
}
