"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { AlertTriangle, ArrowRight, RefreshCw, XCircle } from "lucide-react"
import { PageContainer } from "@/components/layout/page-container"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/shared/icon"
import type { IconName } from "@/components/shared/icon-registry"
import type { DashDurum, DashSunucu, DikkatOge } from "@/app/api/dashboard/durum/route"

/**
 * Dashboard — 1. aşama (16.10.2026): üstte özet, "Dikkat gerektirenler",
 * altında sunucu kartları. Veri /api/dashboard/durum (30 sn sunucu önbelleği);
 * sayfa 60 sn'de bir yeniler — proje kuralı: izleme aralığı 30–60 sn.
 */

const YENILEME_MS = 60_000
const ILK_GOSTERIM = 8

const seviyeRenk = (p: number | null) =>
  p == null ? "bg-muted" : p >= 90 ? "bg-red-500" : p >= 75 ? "bg-amber-500" : "bg-emerald-500"
const seviyeMetin = (p: number | null) =>
  p == null ? "text-muted-foreground" : p >= 90 ? "text-red-600 dark:text-red-400" : p >= 75 ? "text-amber-700 dark:text-amber-400" : "text-foreground"

export default function DashboardPage() {
  const [veri, setVeri] = useState<DashDurum | null>(null)
  const [hata, setHata] = useState<string | null>(null)
  const [yukleniyor, setYukleniyor] = useState(true)
  const [tumDikkat, setTumDikkat] = useState(false)

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

        {/* Dikkat gerektirenler */}
        <section className="rounded-[8px] bg-[var(--section-bg)] p-2">
          <div className="flex items-center gap-2 px-2 pb-2 pt-1">
            <h2 className="text-[13px] font-semibold">Dikkat gerektirenler</h2>
            {veri && veri.dikkat.length > 0 && (
              <span className="inline-flex rounded-[5px] bg-card px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground">{veri.dikkat.length}</span>
            )}
          </div>
          <div className="overflow-hidden rounded-[5px] bg-card" style={{ boxShadow: "var(--card-shadow)" }}>
            {ilkYukleme ? (
              <div className="divide-y">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                    <Skeleton className="size-4 rounded-full" />
                    <div className="flex-1 space-y-1.5"><Skeleton className="h-3.5 w-64 rounded-[5px]" /><Skeleton className="h-3 w-40 rounded-[5px]" /></div>
                  </div>
                ))}
              </div>
            ) : !veri || veri.dikkat.length === 0 ? (
              <div className="flex items-center gap-3 px-4 py-5">
                <span className="flex size-8 items-center justify-center rounded-[5px] bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">
                  <Icon name="circle-check" size={16} />
                </span>
                <div>
                  <p className="text-[13px] font-medium">{veri ? "Her şey yolunda" : "Durum alınamadı"}</p>
                  <p className="text-[12px] text-muted-foreground">
                    {veri ? "Sunucular, izleme, yedekler ve aktarımlarda bekleyen sorun yok." : "Yenile'ye basarak tekrar deneyin."}
                  </p>
                </div>
              </div>
            ) : (
              <>
                <ul className="divide-y">
                  {(tumDikkat ? veri.dikkat : veri.dikkat.slice(0, ILK_GOSTERIM)).map((d, i) => <DikkatSatiri key={`${d.tur}-${d.baslik}-${i}`} d={d} />)}
                </ul>
                {veri.dikkat.length > ILK_GOSTERIM && (
                  <button type="button" onClick={() => setTumDikkat((v) => !v)}
                    className="w-full border-t px-4 py-2 text-left text-[12px] font-medium text-primary hover:bg-muted/30">
                    {tumDikkat ? "Daha az göster" : `Tümünü göster (${veri.dikkat.length})`}
                  </button>
                )}
              </>
            )}
          </div>
          {veri && veri.kaynakHata.length > 0 && (
            <p className="px-2 pt-2 text-[11px] text-muted-foreground" title={veri.kaynakHata.join("\n")}>
              Okunamayan kaynak: {veri.kaynakHata.map((h) => h.split(":")[0]).join(", ")} — bu kaynaklardaki sorunlar listede görünmeyebilir.
            </p>
          )}
        </section>

        {/* Sunucular */}
        <section className="rounded-[8px] bg-[var(--section-bg)] p-2">
          <div className="flex items-baseline gap-2 px-2 pb-2 pt-1">
            <h2 className="text-[13px] font-semibold">Sunucular</h2>
            {veri && terminaller.length > 0 && (
              <span className="text-[12px] text-muted-foreground">
                Terminallerde {terminaller.reduce((t, s) => t + (s.aktifKullanici ?? 0), 0)} kişi çalışıyor
                {(() => {
                  const atanan = terminaller.reduce((t, s) => t + (s.atanmisKullanici ?? 0), 0)
                  return atanan > 0 ? ` · ${atanan} kayıtlı kullanıcı` : ""
                })()}
              </span>
            )}
          </div>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
            {ilkYukleme
              ? Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-[168px] rounded-[5px]" />)
              : sunucular.map((s) => <SunucuKarti key={s.id} s={s} />)}
          </div>
        </section>
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

const TUR_ETIKET: Record<DikkatOge["tur"], string> = {
  sunucu: "Sunucu", izleme: "İzleme", disk: "Disk", yedek: "Yedek", spare: "SpareBackup", aktarim: "Aktarım",
}

function DikkatSatiri({ d }: { d: DikkatOge }) {
  const icerik = (
    <>
      <span className={`mt-0.5 shrink-0 ${d.seviye === "kritik" ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400"}`}>
        {d.seviye === "kritik" ? <XCircle className="size-4" /> : <AlertTriangle className="size-4" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium">{d.baslik}</p>
        <p className="truncate text-[12px] text-muted-foreground">{d.detay}</p>
      </div>
      <span className="inline-flex shrink-0 rounded-[5px] bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">{TUR_ETIKET[d.tur]}</span>
      {d.link && <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" />}
    </>
  )
  return (
    <li>
      {d.link
        ? <Link href={d.link} className="flex items-start gap-3 px-4 py-2.5 transition-colors hover:bg-muted/30">{icerik}</Link>
        : <div className="flex items-start gap-3 px-4 py-2.5">{icerik}</div>}
    </li>
  )
}

function Cubuk({ etiket, yuzde, ek }: { etiket: string; yuzde: number | null; ek?: string }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-[12px]">
        <span className="text-muted-foreground">{etiket}</span>
        <span className="truncate tabular-nums">
          {ek && <span className="text-muted-foreground">{ek} · </span>}
          <span className={`font-medium ${seviyeMetin(yuzde)}`}>{yuzde == null ? "—" : `%${yuzde}`}</span>
        </span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
        <div className={`h-full rounded-full ${seviyeRenk(yuzde)}`} style={{ width: `${Math.min(100, yuzde ?? 0)}%` }} />
      </div>
    </div>
  )
}

function SunucuKarti({ s }: { s: DashSunucu }) {
  const terminal = s.roller.includes("RDP")
  return (
    <Link href={`/servers/${s.slug}`} className="block rounded-[5px] bg-card px-4 py-3 transition-colors hover:bg-muted/20" style={{ boxShadow: "var(--card-shadow)" }}>
      <div className="flex items-center gap-2">
        <span className={`size-2 shrink-0 rounded-full ${s.cevrimici ? "bg-emerald-500" : "bg-red-500"}`} />
        <span className="truncate text-[14px] font-semibold">{s.ad}</span>
        <span className="ml-auto flex shrink-0 gap-1">
          {s.roller.map((r) => (
            <span key={r} className="inline-flex rounded-[5px] bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">{r === "RDP" ? "Terminal" : r}</span>
          ))}
        </span>
      </div>
      <p className="mt-0.5 text-[12px] tabular-nums text-muted-foreground">
        {s.ip}{s.calisma ? ` · ${s.calisma} çalışıyor` : ""}
      </p>

      {s.cevrimici ? (
        <div className="mt-3 space-y-2">
          <Cubuk etiket="CPU" yuzde={s.cpu} />
          <Cubuk etiket="RAM" yuzde={s.ram} ek={s.ramGB ? `${s.ramGB.kullanilan.toLocaleString("tr-TR")} / ${s.ramGB.toplam} GB` : undefined} />
          {s.diskler.map((d) => <Cubuk key={d.surucu} etiket={`Disk ${d.surucu}`} yuzde={d.yuzde} ek={`${d.bosGB} GB boş`} />)}
        </div>
      ) : (
        <div className="mt-3 rounded-[5px] bg-red-500/10 px-3 py-2 text-[12px] text-red-700 dark:text-red-400">
          Agent'a ulaşılamıyor{s.sonGorulme ? ` — son rapor ${new Date(s.sonGorulme).toLocaleString("tr-TR")}` : ""}
        </div>
      )}

      {terminal && s.cevrimici && (
        <div className="mt-3 flex items-center justify-between border-t pt-2 text-[12px]">
          <span className="text-muted-foreground">Aktif oturum</span>
          <span className="tabular-nums">
            <span className="font-semibold">{s.aktifKullanici ?? "—"}</span>
            {s.atanmisKullanici != null && <span className="text-muted-foreground"> / {s.atanmisKullanici} kayıtlı</span>}
          </span>
        </div>
      )}
    </Link>
  )
}
