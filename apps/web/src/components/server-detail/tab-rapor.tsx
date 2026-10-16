"use client"

import { useCallback, useEffect, useState } from "react"
import dynamic from "next/dynamic"
import { RefreshCw } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import type { Server } from "@/types"
import type { Donem, RaporYanit } from "@/app/api/servers/[id]/rapor/route"
import type { SaglikYanit } from "@/app/api/servers/[id]/saglik/route"

const RaporGrafik = dynamic(() => import("./rapor-grafik").then((m) => m.RaporGrafik), {
  ssr: false, loading: () => <Skeleton className="h-full w-full rounded-[5px]" />,
})

/**
 * Genel Bakış — sunucu kullanım raporu (16.10.2026).
 * Sol: dönem seçici, dönem özeti, CPU / RAM / oturum grafikleri (/api/servers/[id]/rapor).
 * Sağ: anlık kaynaklar (/api/servers verisi, sayfadan gelir) + sağlık kartı (/api/servers/[id]/saglik).
 */

export const DONEMLER: { deger: Donem; ad: string }[] = [
  { deger: "bugun", ad: "Bugün" },
  { deger: "7g", ad: "7 gün" },
  { deger: "30g", ad: "30 gün" },
]

export function DonemSecici({ donem, onChange }: { donem: Donem; onChange: (d: Donem) => void }) {
  return (
    <ToggleGroup type="single" value={donem} onValueChange={(v) => v && onChange(v as Donem)} className="h-8 rounded-[5px] bg-[var(--section-bg)] p-0.5">
      {DONEMLER.map((d) => (
        <ToggleGroupItem key={d.deger} value={d.deger} className="h-7 rounded-[5px] px-3 text-[12px]">{d.ad}</ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}

/** Dönem raporunu çeker — Genel Bakış ve Firma kullanımı aynı API'yi kullanır */
export function useRapor(serverId: string, donem: Donem) {
  const [veri, setVeri] = useState<RaporYanit | null>(null)
  const [yukleniyor, setYukleniyor] = useState(true)
  const [hata, setHata] = useState<string | null>(null)
  useEffect(() => {
    let iptal = false
    setYukleniyor(true)
    fetch(`/api/servers/${serverId}/rapor?donem=${donem}`, { cache: "no-store" })
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`); return j as RaporYanit })
      .then((j) => { if (!iptal) { setVeri(j); setHata(null) } })
      .catch((e) => { if (!iptal) setHata(e instanceof Error ? e.message : String(e)) })
      .finally(() => { if (!iptal) setYukleniyor(false) })
    return () => { iptal = true }
  }, [serverId, donem])
  return { veri, yukleniyor, hata }
}

const sayi = (v: number | null | undefined, b = 1) => (v == null ? "—" : v.toLocaleString("tr-TR", { maximumFractionDigits: b }))
const zamanYaz = (ts: string | null, donem: Donem) => {
  if (!ts) return ""
  const d = new Date(ts)
  return donem === "bugun"
    ? d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
}
const seviyeRenk = (p: number | null | undefined) =>
  p == null ? "bg-muted" : p >= 90 ? "bg-red-500" : p >= 75 ? "bg-amber-500" : "bg-emerald-500"
const seviyeMetin = (p: number | null | undefined) =>
  p == null ? "text-muted-foreground" : p >= 90 ? "text-red-600 dark:text-red-400" : p >= 75 ? "text-amber-700 dark:text-amber-400" : ""

const Kart = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <div className={`rounded-[5px] bg-card px-4 py-3 ${className}`} style={{ boxShadow: "var(--card-shadow)" }}>{children}</div>
)
const Bolum = ({ baslik, sag, children }: { baslik: string; sag?: React.ReactNode; children: React.ReactNode }) => (
  <section className="rounded-[8px] bg-[var(--section-bg)] p-2">
    <div className="flex min-h-7 items-center gap-2 px-2 pb-2 pt-1">
      <h2 className="text-[13px] font-semibold">{baslik}</h2>
      {sag && <div className="ml-auto flex items-center gap-2">{sag}</div>}
    </div>
    <div className="space-y-2">{children}</div>
  </section>
)

export function TabRapor({ server }: { server: Server }) {
  const [donem, setDonem] = useState<Donem>("bugun")
  const { veri, yukleniyor, hata } = useRapor(server.id, donem)
  const terminal = server.roles.includes("RDP" as Server["roles"][number])
  const o = veri?.ozet

  const OzetKutu = ({ baslik, deger, alt, renk = "" }: { baslik: string; deger: string; alt: string; renk?: string }) => (
    <Kart>
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{baslik}</p>
      {yukleniyor ? (
        <div className="mt-2 space-y-1.5"><Skeleton className="h-6 w-16 rounded-[5px]" /><Skeleton className="h-3 w-28 rounded-[5px]" /></div>
      ) : (
        <>
          <p className={`mt-1 text-xl font-bold tabular-nums ${renk}`}>{deger}</p>
          <p className="truncate text-[12px] tabular-nums text-muted-foreground" title={alt}>{alt}</p>
        </>
      )}
    </Kart>
  )

  const GrafikKart = ({ baslik, alt, tur }: { baslik: string; alt: string; tur: "cpu" | "ram" | "oturum" }) => (
    <Kart>
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[13px] font-medium">{baslik}</p>
        <p className="text-[12px] text-muted-foreground">{alt}</p>
      </div>
      <div className="mt-2 h-[180px]">
        {yukleniyor || !veri ? <Skeleton className="h-full w-full rounded-[5px]" /> : (
          <RaporGrafik seri={veri.seri} tur={tur} donem={donem} ramToplam={o?.ramGB.toplam} />
        )}
      </div>
    </Kart>
  )

  const diskDegisim = o && o.disk.basGB != null && o.disk.sonGB != null ? o.disk.sonGB - o.disk.basGB : null

  return (
    <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_340px]">
      <Bolum baslik="Kullanım raporu" sag={<DonemSecici donem={donem} onChange={setDonem} />}>
        {hata && <p className="px-2 text-[12px] text-red-600 dark:text-red-400">Rapor alınamadı: {hata}</p>}
        <div className={`grid grid-cols-2 gap-2 ${terminal ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}>
          <OzetKutu baslik="CPU" deger={o?.cpu.ort == null ? "—" : `%${sayi(o.cpu.ort)}`}
            alt={o?.cpu.zirve == null ? "ortalama" : `ortalama · zirve %${sayi(o.cpu.zirve)} ${zamanYaz(o.cpu.zirveTs, donem)}`}
            renk={seviyeMetin(o?.cpu.ort)} />
          <OzetKutu baslik="RAM" deger={o?.ramGB.ort == null ? "—" : `${sayi(o.ramGB.ort)} GB`}
            alt={`ortalama${o?.ramGB.toplam ? ` / ${sayi(o.ramGB.toplam, 0)} GB` : ""}${o?.ramGB.zirve != null ? ` · zirve ${sayi(o.ramGB.zirve)} GB ${zamanYaz(o.ramGB.zirveTs, donem)}` : ""}`} />
          {terminal && (
            <OzetKutu baslik="Oturum" deger={o?.oturum.zirve == null ? "—" : String(o.oturum.zirve)}
              alt={o?.oturum.zirve == null ? "ölçüm yok" : `zirve ${zamanYaz(o.oturum.zirveTs, donem)} · ortalama ${sayi(o.oturum.ort)}`} />
          )}
          <OzetKutu baslik="Sistem diski" deger={o?.disk.sonGB == null ? "—" : `${sayi(o.disk.sonGB, 0)} GB`}
            alt={o?.disk.sonGB == null ? "ölçüm yok" : `${o.disk.toplamGB ? `/ ${sayi(o.disk.toplamGB, 0)} GB · ` : ""}dönemde ${diskDegisim == null ? "—" : `${diskDegisim >= 0 ? "+" : "−"}${sayi(Math.abs(diskDegisim))} GB`}`} />
        </div>
        <GrafikKart baslik="CPU" alt="ortalama · kesikli çizgi zirve" tur="cpu" />
        <GrafikKart baslik="RAM" alt="kullanılan GB · kesikli çizgi zirve" tur="ram" />
        {terminal && <GrafikKart baslik="Aktif oturum" alt={donem === "bugun" ? "5 dakikalık" : "saatlik zirve"} tur="oturum" />}
      </Bolum>

      <div className="space-y-3">
        <AnlikKaynaklar server={server} />
        <SaglikKarti serverId={server.id} />
      </div>
    </div>
  )
}

function AnlikKaynaklar({ server: s }: { server: Server }) {
  const acik = s.status === "online"
  const diskler = s.disks?.length ? s.disks : [{ drive: "Disk", totalGB: 0, usedGB: 0, percent: s.disk }]
  const Kutu = ({ etiket, yuzde, alt }: { etiket: string; yuzde: number | null; alt?: string }) => (
    <div className="min-w-0 rounded-[5px] bg-[var(--section-bg)] px-2.5 py-2">
      <div className="flex items-baseline justify-between gap-2">
        <p className="shrink-0 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{etiket}</p>
        {alt && <p className="min-w-0 truncate text-[11px] tabular-nums text-muted-foreground">{alt}</p>}
      </div>
      <p className={`text-[18px] font-bold leading-tight tabular-nums ${seviyeMetin(yuzde)}`}>{yuzde == null ? "—" : `%${Math.round(yuzde)}`}</p>
      <div className="mt-1 h-1 overflow-hidden rounded-full bg-muted">
        <div className={`h-full rounded-full ${seviyeRenk(yuzde)}`} style={{ width: `${Math.min(100, yuzde ?? 0)}%` }} />
      </div>
    </div>
  )
  return (
    <Bolum baslik="Şu an">
      <Kart>
        {acik ? (
          <>
            <div className="grid grid-cols-2 gap-1.5">
              <Kutu etiket="CPU" yuzde={s.cpu} />
              <Kutu etiket="RAM" yuzde={s.ram} alt={s.ramGB ? `${s.ramGB.kullanilan.toLocaleString("tr-TR")} / ${s.ramGB.toplam} GB` : undefined} />
            </div>
            <div className="mt-2 space-y-1.5 rounded-[5px] bg-[var(--section-bg)] px-2.5 py-2">
              {diskler.map((d) => (
                <div key={d.drive} className="flex items-center gap-2 text-[12px]">
                  <span className="w-7 shrink-0 font-medium text-muted-foreground">{d.drive === "Disk" ? "Disk" : d.drive.replace(/\\$/, "")}</span>
                  <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
                    <div className={`h-full rounded-full ${seviyeRenk(d.percent)}`} style={{ width: `${Math.min(100, d.percent)}%` }} />
                  </div>
                  <span className={`w-9 shrink-0 text-right tabular-nums ${seviyeMetin(d.percent)}`}>%{Math.round(d.percent)}</span>
                  {d.totalGB > 0 && <span className="w-[74px] shrink-0 truncate text-right text-[11px] tabular-nums text-muted-foreground">{Math.round(d.totalGB - d.usedGB)} GB boş</span>}
                </div>
              ))}
            </div>
            {s.aktifOturum != null && s.roles.includes("RDP" as Server["roles"][number]) && (
              <p className="mt-2 text-[12px] tabular-nums">
                <span className="font-semibold">{s.aktifOturum}</span> <span className="text-muted-foreground">aktif oturum</span>
                {(s.kopukOturum ?? 0) > 0 && <span className="text-amber-700 dark:text-amber-400"> · {s.kopukOturum} disconnect</span>}
              </p>
            )}
          </>
        ) : (
          <p className="rounded-[5px] bg-red-500/10 px-3 py-2.5 text-[12px] text-red-700 dark:text-red-400">Agent'a ulaşılamıyor — anlık değer yok.</p>
        )}
      </Kart>
    </Bolum>
  )
}

function SaglikKarti({ serverId }: { serverId: string }) {
  const [veri, setVeri] = useState<SaglikYanit | null>(null)
  const [yukleniyor, setYukleniyor] = useState(true)
  const [hata, setHata] = useState<string | null>(null)

  const yukle = useCallback(async (yenile = false) => {
    setYukleniyor(true)
    try {
      const r = await fetch(`/api/servers/${serverId}/saglik${yenile ? "?yenile=1" : ""}`, { cache: "no-store" })
      const j = await r.json()
      if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`)
      setVeri(j as SaglikYanit); setHata(null)
    } catch (e) {
      setHata(e instanceof Error ? e.message : String(e))
    } finally {
      setYukleniyor(false)
    }
  }, [serverId])
  useEffect(() => { void yukle() }, [yukle])

  const tarih = (s: string | null | undefined) => (s ? new Date(s).toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—")
  const gunOnce = (s: string | null | undefined) => (s ? Math.floor((Date.now() - new Date(s).getTime()) / 86_400_000) : null)

  type Durum = "iyi" | "kotu" | "uyari" | "bilinmiyor"
  const Satir = ({ ad, durum, deger }: { ad: string; durum: Durum; deger: string }) => (
    <li className="flex items-center gap-2 py-1.5 text-[12px]">
      <span className={`size-1.5 shrink-0 rounded-full ${durum === "iyi" ? "bg-emerald-500" : durum === "kotu" ? "bg-red-500" : durum === "uyari" ? "bg-amber-500" : "bg-muted-foreground/40"}`} />
      <span className="text-muted-foreground">{ad}</span>
      <span className={`ml-auto truncate text-right font-medium tabular-nums ${durum === "kotu" ? "text-red-600 dark:text-red-400" : durum === "uyari" ? "text-amber-700 dark:text-amber-400" : ""}`}>{deger}</span>
    </li>
  )

  const v = veri
  const fwKapali = v?.guvenlikDuvari.filter((p) => !p.acik).map((p) => p.profil) ?? []
  const guncelGun = gunOnce(v?.sonGuncelleme?.tarih)
  const imzaGun = gunOnce(v?.defender?.imza)

  return (
    <Bolum baslik="Sağlık" sag={
      <Button variant="outline" size="sm" className="h-7 gap-1.5 rounded-[5px] px-2.5 text-[12px]" onClick={() => void yukle(true)} disabled={yukleniyor}
        title="Sunucuda salt okuma kontrolleri yeniden çalıştırır (10 dk önbellek)">
        <RefreshCw className={`size-3.5 ${yukleniyor ? "animate-spin" : ""}`} /> Yenile
      </Button>
    }>
      <Kart>
        {yukleniyor && !v ? (
          <div className="space-y-2">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-4 w-full rounded-[5px]" />)}</div>
        ) : hata && !v ? (
          <p className="text-[12px] text-red-600 dark:text-red-400">Kontrol edilemedi: {hata}</p>
        ) : v ? (
          <>
            <ul className="divide-y">
              <Satir ad="Defender gerçek zamanlı" durum={!v.defender ? "bilinmiyor" : v.defender.gercekZamanli ? "iyi" : "kotu"}
                deger={!v.defender ? "okunamadı" : v.defender.gercekZamanli ? "Açık" : "Kapalı"} />
              <Satir ad="Tamper Protection" durum={!v.defender ? "bilinmiyor" : v.defender.tamper ? "iyi" : "kotu"}
                deger={!v.defender ? "—" : v.defender.tamper ? "Açık" : "Kapalı"} />
              <Satir ad="Virüs imzası" durum={imzaGun == null ? "bilinmiyor" : imzaGun > 3 ? "uyari" : "iyi"}
                deger={v.defender?.imza ? `${tarih(v.defender.imza)}${imzaGun != null && imzaGun > 0 ? ` · ${imzaGun} gün` : ""}` : "—"} />
              <Satir ad="Güvenlik duvarı" durum={!v.guvenlikDuvari.length ? "bilinmiyor" : fwKapali.length ? "kotu" : "iyi"}
                deger={!v.guvenlikDuvari.length ? "—" : fwKapali.length ? `Kapalı: ${fwKapali.join(", ")}` : `Açık (${v.guvenlikDuvari.length} profil)`} />
              <Satir ad="NLA" durum={v.nla == null ? "bilinmiyor" : v.nla ? "iyi" : "kotu"} deger={v.nla == null ? "—" : v.nla ? "Açık" : "Kapalı"} />
              <Satir ad="Yeniden başlatma" durum={v.yenidenBaslatmaBekliyor ? "uyari" : "iyi"} deger={v.yenidenBaslatmaBekliyor ? "Bekliyor" : "Gerekmiyor"} />
              <Satir ad="Son güncelleme" durum={guncelGun == null ? "bilinmiyor" : guncelGun > 60 ? "uyari" : "iyi"}
                deger={v.sonGuncelleme ? `${v.sonGuncelleme.kb} · ${tarih(v.sonGuncelleme.tarih)}` : "—"} />
              <Satir ad="Son açılış" durum="bilinmiyor" deger={v.sonAcilis ? new Date(v.sonAcilis).toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"} />
            </ul>
            <p className="mt-3 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Kritik servisler</p>
            <ul className="mt-1 divide-y">
              {v.servisler.map((sv) => {
                const calisiyor = sv.durum === "Running"
                const yok = sv.durum === "Yok"
                return (
                  <li key={sv.ad} className="flex items-center gap-2 py-1.5 text-[12px]" title={sv.gorunenAd !== sv.ad ? sv.gorunenAd : undefined}>
                    <span className={`size-1.5 shrink-0 rounded-full ${calisiyor ? "bg-emerald-500" : yok ? "bg-muted-foreground/40" : "bg-red-500"}`} />
                    <span className="min-w-0 truncate">{sv.ad}</span>
                    <span className={`ml-auto shrink-0 font-medium ${calisiyor ? "text-emerald-700 dark:text-emerald-400" : yok ? "text-muted-foreground" : "text-red-600 dark:text-red-400"}`}>
                      {calisiyor ? "Çalışıyor" : yok ? "Kurulu değil" : sv.durum === "Stopped" ? "Durdu" : sv.durum}
                    </span>
                  </li>
                )
              })}
            </ul>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Kontrol {new Date(v.zaman).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })} · salt okuma
              {hata && <span className="text-red-600 dark:text-red-400"> · yenilenemedi</span>}
            </p>
          </>
        ) : null}
      </Kart>
    </Bolum>
  )
}
