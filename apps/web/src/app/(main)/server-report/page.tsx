"use client"

/**
 * Sunucu Raporu — sunucuların CPU / RAM / disk / oturum geçmişi ve terminallerin
 * günlük kullanıcı yoğunluğu.
 *
 * Ölçüm geçmişi hub.server_metrics'ten (poller 5 dk'lık özet yazar, 02.10.2026'da
 * başladı). Günlük kullanıcı grafikleri hub.user_daily_usage'dan; o kayıt daha
 * eski olduğu için ölçüm geçmişi dolana kadar asıl geçmiş görünümü orası.
 */

import { useCallback, useEffect, useMemo, useState } from "react"
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"
import { RefreshCw, Server, Activity } from "lucide-react"
import { PageContainer } from "@/components/layout/page-container"
import { ListeKarti, ListeThead } from "@/components/shared/liste-karti"
import { ComboboxMulti } from "@/components/ui/combobox"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig,
} from "@/components/ui/chart"
import { cn } from "@/lib/utils"
import type { GunlukSatir, SeriSatiri, SunucuRaporu } from "@/app/api/server-report/route"

// ------------------------------------------------------------ sabitler

const ARALIKLAR = [
  { deger: "1", ad: "24 saat" },
  { deger: "7", ad: "7 gün" },
  { deger: "14", ad: "14 gün" },
  { deger: "30", ad: "30 gün" },
]

/** Sunucu başına sabit renk (açık / koyu tema). Seçim sırasına göre dağıtılır. */
const RENKLER = [
  { light: "#2563EB", dark: "#60A5FA" },
  { light: "#D97706", dark: "#FBBF24" },
  { light: "#059669", dark: "#34D399" },
  { light: "#7C3AED", dark: "#A78BFA" },
  { light: "#DB2777", dark: "#F472B6" },
  { light: "#0891B2", dark: "#22D3EE" },
  { light: "#65A30D", dark: "#A3E635" },
  { light: "#DC2626", dark: "#F87171" },
]

const TZ = "Europe/Istanbul"
const saatMetni = (iso: string) => new Date(iso).toLocaleTimeString("tr-TR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" })
const gunMetni = (iso: string) => new Date(iso).toLocaleDateString("tr-TR", { timeZone: TZ, day: "2-digit", month: "2-digit" })
const tamMetin = (iso: string) => new Date(iso).toLocaleString("tr-TR", { timeZone: TZ, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
const gunAdi = (d: string) => {
  const t = new Date(d + "T12:00:00")
  return `${String(t.getDate()).padStart(2, "0")}.${String(t.getMonth() + 1).padStart(2, "0")} ${["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"][t.getDay()]}`
}
const yuzde = (a: number | null | undefined, b: number | null | undefined) => (a != null && b ? Math.round((a / b) * 1000) / 10 : null)

type Nokta = Record<string, number | string | null>

// ------------------------------------------------------------ sayfa

export default function SunucuRaporuSayfasi() {
  const [gun, setGun] = useState("14")
  const [veri, setVeri] = useState<SunucuRaporu | null>(null)
  const [hata, setHata] = useState<string | null>(null)
  const [yukleniyor, setYukleniyor] = useState(false)
  const [secili, setSecili] = useState<string[] | null>(null)

  const yukle = useCallback(async () => {
    setYukleniyor(true); setHata(null)
    try {
      const r = await fetch(`/api/server-report?gun=${gun}`, { cache: "no-store" })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error ?? "Rapor alınamadı")
      setVeri(d as SunucuRaporu)
    } catch (e) {
      setHata(e instanceof Error ? e.message : String(e))
    } finally {
      setYukleniyor(false)
    }
  }, [gun])

  useEffect(() => { void yukle() }, [yukle])
  // 5 dakikada bir tazele — yeni kova yazıldıkça
  useEffect(() => { const t = setInterval(() => void yukle(), 5 * 60_000); return () => clearInterval(t) }, [yukle])

  // Varsayılan seçim: terminaller (yoksa hepsi)
  useEffect(() => {
    if (!veri || secili !== null) return
    const t = veri.sunucular.filter((s) => /terminal/i.test(s.name)).map((s) => s.id)
    setSecili(t.length ? t : veri.sunucular.map((s) => s.id))
  }, [veri, secili])

  const seciliSunucular = useMemo(
    () => (veri?.sunucular ?? []).filter((s) => (secili ?? []).includes(s.id)),
    [veri, secili],
  )

  const config = useMemo<ChartConfig>(() => Object.fromEntries(
    seciliSunucular.map((s, i) => [`s${i}`, { label: s.name, theme: RENKLER[i % RENKLER.length] }]),
  ), [seciliSunucular])

  /** Ölçüm serisini zaman ekseninde sunucu başına sütunlara çevirir. */
  const pivot = useCallback((deger: (r: SeriSatiri) => number | null) => {
    const anahtar = new Map(seciliSunucular.map((s, i) => [s.id, `s${i}`]))
    const satir = new Map<string, Nokta>()
    for (const r of veri?.seri ?? []) {
      const k = anahtar.get(r.server_id)
      if (!k) continue
      const n = satir.get(r.ts) ?? { ts: r.ts }
      n[k] = deger(r)
      satir.set(r.ts, n)
    }
    return [...satir.values()].sort((a, b) => String(a.ts).localeCompare(String(b.ts)))
  }, [veri, seciliSunucular])

  const cpu = useMemo(() => pivot((r) => r.cpu_avg), [pivot])
  const ram = useMemo(() => pivot((r) => yuzde(r.ram_used_mb, r.ram_total_mb)), [pivot])
  const oturum = useMemo(() => pivot((r) => r.sessions_active), [pivot])
  const disk = useMemo(() => pivot((r) => r.disk_used_gb), [pivot])

  const gunlukPivot = useCallback((alan: keyof Pick<GunlukSatir, "kullanici" | "saat" | "cpu" | "ramGb">) => {
    const anahtar = new Map(seciliSunucular.map((s, i) => [s.name, `s${i}`]))
    const satir = new Map<string, Nokta>()
    for (const r of veri?.gunluk ?? []) {
      const k = anahtar.get(r.server)
      if (!k) continue
      const n = satir.get(r.date) ?? { ts: r.date }
      n[k] = r[alan]
      satir.set(r.date, n)
    }
    return [...satir.values()].sort((a, b) => String(a.ts).localeCompare(String(b.ts)))
  }, [veri, seciliSunucular])
  const gunlukKullanici = useMemo(() => gunlukPivot("kullanici"), [gunlukPivot])
  const gunlukSaat = useMemo(() => gunlukPivot("saat"), [gunlukPivot])

  /** Özet: sunucunun son kovası + aralıktaki tepe değerler. */
  const ozet = useMemo(() => seciliSunucular.map((s, i) => {
    const r = (veri?.seri ?? []).filter((x) => x.server_id === s.id)
    const son = r[r.length - 1]
    return {
      ...s, renk: i,
      son,
      cpuTepe: r.reduce((m, x) => Math.max(m, x.cpu_max ?? 0), 0),
      ramTepe: r.reduce((m, x) => Math.max(m, yuzde(x.ram_max_mb, x.ram_total_mb) ?? 0), 0),
      oturumTepe: r.reduce((m, x) => Math.max(m, x.sessions_active ?? 0), 0),
    }
  }), [veri, seciliSunucular])

  const kisa = Number(gun) <= 1
  const xEtiket = (v: string) => (kisa ? saatMetni(v) : gunMetni(v))
  const olcumVar = (veri?.seri.length ?? 0) > 0

  return (
    <PageContainer title="Sunucu Raporu" description="CPU, RAM, disk ve oturum geçmişi · terminallerin günlük kullanıcı yoğunluğu">
      <div className="flex flex-col gap-4">
        {/* Kontroller */}
        <div className="flex flex-wrap items-center gap-2">
          <ToggleGroup type="single" value={gun} onValueChange={(v) => v && setGun(v)} variant="outline" size="sm">
            {ARALIKLAR.map((a) => (
              <ToggleGroupItem key={a.deger} value={a.deger} className="h-8 px-3 text-[12px]">{a.ad}</ToggleGroupItem>
            ))}
          </ToggleGroup>
          <div className="w-72">
            <ComboboxMulti
              items={veri?.sunucular ?? []}
              getKey={(s) => s.id}
              getLabel={(s) => s.name}
              values={secili ?? []}
              onValuesChange={setSecili}
              placeholder="Sunucu seç…"
              renderSummary={(xs) => (xs.length ? `${xs.length} sunucu` : "Sunucu seç…")}
              loading={!veri && !hata}
            />
          </div>
          <Button variant="ghost" size="sm" className="ml-auto h-8 text-[12px]" disabled={yukleniyor} onClick={() => void yukle()}>
            <RefreshCw className={cn("size-3.5", yukleniyor && "animate-spin")} /> Yenile
          </Button>
        </div>

        {hata && (
          <div className="rounded-[5px] border border-red-500/25 bg-red-500/15 px-3 py-2 text-[12px] text-red-700 dark:text-red-400">{hata}</div>
        )}

        {/* Özet tablo */}
        <ListeKarti baslik="Sunucular" ikon={<Server className="size-3.5" />} toplam={seciliSunucular.length}>
          <div className="overflow-x-auto">
            <table className="w-full text-[14px] font-medium leading-[20px]">
              <ListeThead>
                <th className="px-4 py-1.5 text-left font-medium">Sunucu</th>
                <th className="px-4 py-1.5 text-right font-medium">CPU</th>
                <th className="px-4 py-1.5 text-right font-medium">RAM</th>
                <th className="px-4 py-1.5 text-right font-medium">Disk</th>
                <th className="px-4 py-1.5 text-right font-medium">Oturum</th>
                <th className="px-4 py-1.5 text-right font-medium">Tepe CPU</th>
                <th className="px-4 py-1.5 text-right font-medium">Tepe RAM</th>
                <th className="px-4 py-1.5 text-right font-medium">Tepe oturum</th>
                <th className="px-4 py-1.5 text-right font-medium">Son ölçüm</th>
              </ListeThead>
              <tbody>
                {!veri && !hata ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i}><td colSpan={9} className="px-4 py-1.5"><Skeleton className="h-5 w-full" /></td></tr>
                  ))
                ) : ozet.length === 0 ? (
                  <tr><td colSpan={9} className="text-muted-foreground px-4 py-10 text-center text-[13px]">Yukarıdan en az bir sunucu seçin.</td></tr>
                ) : ozet.map((o) => (
                  <tr key={o.id} className="hover:bg-muted/20">
                    <td className="px-4 py-1.5 whitespace-nowrap">
                      <span className="inline-flex items-center gap-2">
                        <span className="size-2.5 rounded-full" style={{ background: `var(--color-s${o.renk})` }} />
                        {o.name}
                      </span>
                    </td>
                    <td className="px-4 py-1.5 text-right tabular-nums"><Deger v={o.son?.cpu_avg} birim="%" esik={[70, 90]} /></td>
                    <td className="px-4 py-1.5 text-right tabular-nums whitespace-nowrap">
                      <Deger v={yuzde(o.son?.ram_used_mb, o.son?.ram_total_mb)} birim="%" esik={[80, 92]} />
                      {o.son?.ram_total_mb ? <span className="text-muted-foreground ml-1.5 text-[12px]">{Math.round((o.son.ram_used_mb ?? 0) / 1024)}/{Math.round(o.son.ram_total_mb / 1024)} GB</span> : null}
                    </td>
                    <td className="px-4 py-1.5 text-right tabular-nums whitespace-nowrap">
                      <Deger v={yuzde(o.son?.disk_used_gb, o.son?.disk_total_gb)} birim="%" esik={[80, 90]} />
                      {o.son?.disk_total_gb ? <span className="text-muted-foreground ml-1.5 text-[12px]">{Math.round(o.son.disk_used_gb ?? 0)}/{Math.round(o.son.disk_total_gb)} GB</span> : null}
                    </td>
                    <td className="px-4 py-1.5 text-right tabular-nums whitespace-nowrap">
                      {o.son ? <>{o.son.sessions_active ?? 0}<span className="text-muted-foreground text-[12px]"> / {o.son.sessions_total ?? 0}</span></> : "—"}
                    </td>
                    <td className="px-4 py-1.5 text-right tabular-nums">{o.son ? `${Math.round(o.cpuTepe)}%` : "—"}</td>
                    <td className="px-4 py-1.5 text-right tabular-nums">{o.son ? `${Math.round(o.ramTepe)}%` : "—"}</td>
                    <td className="px-4 py-1.5 text-right tabular-nums">{o.son ? o.oturumTepe : "—"}</td>
                    <td className="text-muted-foreground px-4 py-1.5 text-right text-[12px] whitespace-nowrap">{o.son ? tamMetin(o.son.ts) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ListeKarti>

        {veri && !olcumVar && (
          <div className="text-muted-foreground rounded-[8px] bg-[var(--section-bg)] px-4 py-3 text-[13px]">
            Ölçüm geçmişi henüz boş. Hub her sunucu için 5 dakikada bir CPU, RAM, disk ve oturum değerini kaydediyor;
            ilk noktalar birkaç dakika içinde görünür. Aşağıdaki günlük kullanıcı grafikleri eski kayıtlardan geliyor.
          </div>
        )}

        {/* Ölçüm grafikleri */}
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <Grafik baslik="CPU kullanımı" aciklama={`Ortalama · ${veri?.kovaDk ?? 0} dk aralıklarla`} data={cpu} config={config} birim="%" xEtiket={xEtiket} yMax={100} yukleniyor={!veri && !hata} />
          <Grafik baslik="RAM kullanımı" aciklama="Uygulama + sistem, önbellek hariç" data={ram} config={config} birim="%" xEtiket={xEtiket} yMax={100} yukleniyor={!veri && !hata} />
          <Grafik baslik="Aktif oturum" aciklama="Aralıktaki en yüksek aktif RDP oturumu" data={oturum} config={config} birim="" xEtiket={xEtiket} yukleniyor={!veri && !hata} />
          <Grafik baslik="Disk (sistem sürücüsü)" aciklama="Kullanılan alan" data={disk} config={config} birim=" GB" xEtiket={xEtiket} yukleniyor={!veri && !hata} />
        </div>

        {/* Günlük kullanıcı yoğunluğu */}
        <div className="flex items-center gap-1.5 pt-2">
          <Activity className="text-muted-foreground size-3.5" />
          <span className="text-muted-foreground text-[13px] font-medium">Günlük kullanıcı yoğunluğu</span>
        </div>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <Grafik baslik="Aktif kullanıcı" aciklama="O gün en az 5 dk oturum açan farklı kullanıcı · yöneticiler hariç" data={gunlukKullanici} config={config} birim="" xEtiket={gunAdi} tooltipEtiket={gunAdi} yukleniyor={!veri && !hata} />
          <Grafik baslik="Toplam oturum süresi" aciklama="Kullanıcıların o günkü oturum saatleri toplamı" data={gunlukSaat} config={config} birim=" sa" xEtiket={gunAdi} tooltipEtiket={gunAdi} yukleniyor={!veri && !hata} />
        </div>
      </div>
    </PageContainer>
  )
}

// ------------------------------------------------------------ parçalar

/** Değer + eşik rengi (uyarı / kritik). */
function Deger({ v, birim, esik }: { v: number | null | undefined; birim: string; esik: [number, number] }) {
  if (v == null) return <span className="text-muted-foreground">—</span>
  const ton = v >= esik[1] ? "text-red-700 dark:text-red-400" : v >= esik[0] ? "text-amber-700 dark:text-amber-400" : ""
  return <span className={ton}>{Math.round(v)}{birim}</span>
}

function Grafik({
  baslik, aciklama, data, config, birim, xEtiket, tooltipEtiket, yMax, yukleniyor,
}: {
  baslik: string
  aciklama: string
  data: Nokta[]
  config: ChartConfig
  birim: string
  xEtiket: (v: string) => string
  tooltipEtiket?: (v: string) => string
  yMax?: number
  yukleniyor: boolean
}) {
  const seriler = Object.keys(config)
  return (
    <div className="bg-[var(--section-bg)] rounded-[8px] p-2">
      <div className="px-3 py-1.5">
        <div className="text-[13px] font-medium">{baslik}</div>
        <div className="text-muted-foreground text-[12px]">{aciklama}</div>
      </div>
      <div className="bg-card rounded-[5px] p-3" style={{ boxShadow: "var(--card-shadow)" }}>
        {yukleniyor ? (
          <Skeleton className="h-[240px] w-full" />
        ) : data.length === 0 ? (
          <div className="text-muted-foreground flex h-[240px] items-center justify-center text-[13px]">Bu aralıkta kayıt yok.</div>
        ) : (
          <ChartContainer config={config} className="h-[240px] w-full">
            <LineChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="ts" tickLine={false} axisLine={false} minTickGap={28} tickFormatter={xEtiket} />
              <YAxis tickLine={false} axisLine={false} width={44} domain={[0, yMax ?? "auto"]} tickFormatter={(v) => `${v}${birim.trim() === "%" ? "%" : ""}`} />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    labelFormatter={(_, p) => {
                      const ts = String(p?.[0]?.payload?.ts ?? "")
                      return tooltipEtiket ? tooltipEtiket(ts) : tamMetin(ts)
                    }}
                    formatter={(v, ad) => (
                      <div className="flex w-full items-center justify-between gap-3">
                        <span className="text-muted-foreground">{config[String(ad)]?.label}</span>
                        <span className="font-mono tabular-nums">{v}{birim}</span>
                      </div>
                    )}
                  />
                }
              />
              <ChartLegend content={<ChartLegendContent />} />
              {seriler.map((k) => (
                <Line key={k} dataKey={k} type="monotone" stroke={`var(--color-${k})`} strokeWidth={1.75} dot={false} connectNulls={false} isAnimationActive={false} />
              ))}
            </LineChart>
          </ChartContainer>
        )}
      </div>
    </div>
  )
}
