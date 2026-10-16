"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { LayoutGrid, MoreVertical, Plus, RefreshCw, Rows3 } from "lucide-react"
import { toast } from "sonner"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  Table, InlineTextFilter, InlineSelectFilter, type TableColumn, type SortState,
} from "@muharremoz/pusula-ui"
import { PageContainer } from "@/components/layout/page-container"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Icon } from "@/components/shared/icon"
import type { IconName } from "@/components/shared/icon-registry"
import { ServerSheet } from "@/components/servers/server-sheet"
import { TerminalSheet } from "@/components/servers/terminal-sheet"
import type { Server } from "@/types"

/**
 * Sunucular — yeniden tasarım (16.10.2026).
 *
 * Üstte özet, altında rol gruplu kartlar (Terminaller / Altyapı) ya da tek
 * tablo. Veri /api/servers (agent son raporu + hub.servers); 10 sn'de bir,
 * sekme görünürken yenilenir. Oturum sayıları dashboard ile aynı kural
 * (Server.aktifOturum / kopukOturum).
 *
 * Eski sayfadaki "Yeniden Başlat" kaldırıldı: hiçbir şey yapmayan bir TODO'ydu.
 */

const YENILEME_MS = 10_000
type Gorunum = "kart" | "liste"

const ROL_ETIKET: Record<string, string> = { RDP: "Terminal", File: "Depo", General: "Genel" }
const rolAdi = (r: string) => ROL_ETIKET[r] ?? r
const terminalMi = (s: Server) => s.roles.includes("RDP" as Server["roles"][number])
const cevrimici = (s: Server) => s.status === "online"

const seviyeRenk = (p: number | null | undefined) =>
  p == null ? "bg-muted" : p >= 90 ? "bg-red-500" : p >= 75 ? "bg-amber-500" : "bg-emerald-500"
const seviyeMetin = (p: number | null | undefined) =>
  p == null ? "text-muted-foreground" : p >= 90 ? "font-semibold text-red-600 dark:text-red-400" : p >= 75 ? "font-semibold text-amber-700 dark:text-amber-400" : ""

const diskler = (s: Server) => s.disks?.length ? s.disks : [{ drive: "Disk", totalGB: 0, usedGB: 0, percent: s.disk }]
const enDoluDisk = (s: Server) => diskler(s).reduce((m, d) => (d.percent > m.percent ? d : m), diskler(s)[0])

function onceYaz(iso: string | undefined): string {
  if (!iso || iso === "—") return "—"
  const sn = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000))
  if (!Number.isFinite(sn)) return "—"
  return sn < 60 ? `${sn} sn önce` : sn < 3600 ? `${Math.floor(sn / 60)} dk önce` : sn < 86400 ? `${Math.floor(sn / 3600)} saat önce` : `${Math.floor(sn / 86400)} gün önce`
}

export default function ServersPage() {
  const [sunucular, setSunucular] = useState<Server[]>([])
  const [yukleniyor, setYukleniyor] = useState(true)
  const [yenileniyor, setYenileniyor] = useState(false)
  const [sonGuncelleme, setSonGuncelleme] = useState<Date | null>(null)
  const [gorunum, setGorunum] = useState<Gorunum>("kart")

  const [sheetAcik, setSheetAcik] = useState(false)
  const [duzenleId, setDuzenleId] = useState<string | null>(null)
  const [terminal, setTerminal] = useState<{ id: string; ad: string } | null>(null)
  const [kaldir, setKaldir] = useState<Server | null>(null)
  const [kaldiriliyor, setKaldiriliyor] = useState(false)

  // Liste görünümü filtre / sıralama
  const [filtreAcik, setFiltreAcik] = useState(false)
  const [adFiltre, setAdFiltre] = useState("")
  const [rolFiltre, setRolFiltre] = useState<string[]>([])
  const [durumFiltre, setDurumFiltre] = useState<string[]>([])
  const [sira, setSira] = useState<SortState | null>({ key: "name", direction: "asc" } as SortState)

  // Görünüm tercihi bu tarayıcıda hatırlanır
  useEffect(() => {
    try { const g = localStorage.getItem("sunucular.gorunum"); if (g === "kart" || g === "liste") setGorunum(g) } catch { /* yok */ }
  }, [])
  const gorunumSec = (g: Gorunum) => { setGorunum(g); try { localStorage.setItem("sunucular.gorunum", g) } catch { /* yok */ } }

  const yukle = useCallback(async () => {
    try {
      const r = await fetch("/api/servers", { cache: "no-store" })
      const j = await r.json()
      if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`)
      setSunucular(Array.isArray(j) ? j : [])
      setSonGuncelleme(new Date())
    } catch (e) {
      toast.error("Sunucular alınamadı", { description: e instanceof Error ? e.message : String(e) })
    } finally {
      setYukleniyor(false)
    }
  }, [])

  useEffect(() => {
    void yukle()
    const t = setInterval(() => { if (document.visibilityState === "visible") void yukle() }, YENILEME_MS)
    return () => clearInterval(t)
  }, [yukle])

  const elleYenile = async () => { setYenileniyor(true); await yukle(); setYenileniyor(false) }

  const kaldirOnayla = async () => {
    if (!kaldir) return
    setKaldiriliyor(true)
    try {
      const r = await fetch(`/api/servers/${kaldir.id}`, { method: "DELETE" })
      if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error ?? `HTTP ${r.status}`)
      toast.success("Sunucu kaldırıldı", { description: kaldir.name })
      setSunucular((p) => p.filter((x) => x.id !== kaldir.id))
      setKaldir(null)
    } catch (e) {
      toast.error("Sunucu kaldırılamadı", { description: e instanceof Error ? e.message : String(e) })
    } finally {
      setKaldiriliyor(false)
    }
  }

  const islemler = {
    duzenle: (s: Server) => { setDuzenleId(s.id); setSheetAcik(true) },
    terminal: (s: Server) => setTerminal({ id: s.id, ad: s.name }),
    kaldir: (s: Server) => setKaldir(s),
  }

  // ── Özet ──────────────────────────────────────────────────
  const acik = sunucular.filter(cevrimici)
  const terminaller = sunucular.filter(terminalMi)
  const aktif = terminaller.reduce((t, s) => t + (s.aktifOturum ?? 0), 0)
  const kopuk = terminaller.reduce((t, s) => t + (s.kopukOturum ?? 0), 0)
  const ort = (f: (s: Server) => number) => (acik.length ? Math.round(acik.reduce((t, s) => t + f(s), 0) / acik.length) : null)
  const doluDisk = acik
    .flatMap((s) => diskler(s).map((d) => ({ sunucu: s.name, ...d })))
    .reduce<{ sunucu: string; drive: string; percent: number } | null>((m, d) => (!m || d.percent > m.percent ? d : m), null)

  return (
    <PageContainer title="Sunucular" description="Sunucuların anlık durumu ve yönetimi">
      <ServerSheet open={sheetAcik} onOpenChange={(o) => { setSheetAcik(o); if (!o) setDuzenleId(null) }} onSaved={() => void yukle()} editServerId={duzenleId} />
      <TerminalSheet open={terminal !== null} onOpenChange={(o) => { if (!o) setTerminal(null) }} serverId={terminal?.id ?? ""} serverName={terminal?.ad ?? ""} />

      <div className="space-y-3">
        {/* Araç şeridi */}
        <div className="flex flex-wrap items-center justify-end gap-2">
          {sonGuncelleme && <span className="mr-auto text-[12px] tabular-nums text-muted-foreground">Son güncelleme {sonGuncelleme.toLocaleTimeString("tr-TR")} · 10 sn'de bir yenilenir</span>}
          <ToggleGroup type="single" value={gorunum} onValueChange={(v) => v && gorunumSec(v as Gorunum)} className="h-8 rounded-[5px] bg-[var(--section-bg)] p-0.5">
            <ToggleGroupItem value="kart" aria-label="Kart görünümü" className="h-7 gap-1.5 rounded-[5px] px-2.5 text-[12px]"><LayoutGrid className="size-3.5" /> Kart</ToggleGroupItem>
            <ToggleGroupItem value="liste" aria-label="Liste görünümü" className="h-7 gap-1.5 rounded-[5px] px-2.5 text-[12px]"><Rows3 className="size-3.5" /> Liste</ToggleGroupItem>
          </ToggleGroup>
          <Button variant="outline" size="sm" className="h-8 gap-1.5 rounded-[5px] text-[12px]" onClick={() => void elleYenile()} disabled={yenileniyor}>
            <RefreshCw className={`size-3.5 ${yenileniyor ? "animate-spin" : ""}`} /> Yenile
          </Button>
          <Button size="sm" className="h-8 gap-1.5 rounded-[5px] text-[12px]" onClick={() => { setDuzenleId(null); setSheetAcik(true) }}>
            <Plus className="size-3.5" /> Sunucu ekle
          </Button>
        </div>

        {/* Özet */}
        <div className="grid grid-cols-2 gap-2 rounded-[8px] bg-[var(--section-bg)] p-2 md:grid-cols-3 xl:grid-cols-5">
          <Ozet ikon="monitor-check" baslik="Çevrimiçi" yukleniyor={yukleniyor}
            deger={`${acik.length} / ${sunucular.length}`} alt={acik.length === sunucular.length ? "hepsi çevrimiçi" : `${sunucular.length - acik.length} ulaşılamıyor`}
            vurgu={acik.length < sunucular.length ? "kritik" : "iyi"} />
          <Ozet ikon="users" baslik="Aktif oturum" yukleniyor={yukleniyor}
            deger={String(aktif)} alt={`${terminaller.length} terminal${kopuk ? ` · ${kopuk} kopuk` : ""}`} />
          <Ozet ikon="zap" baslik="Ortalama CPU" yukleniyor={yukleniyor}
            deger={ort((s) => s.cpu) == null ? "—" : `%${ort((s) => s.cpu)}`} alt="çevrimiçi sunucular" />
          <Ozet ikon="layers" baslik="Ortalama RAM" yukleniyor={yukleniyor}
            deger={ort((s) => s.ram) == null ? "—" : `%${ort((s) => s.ram)}`} alt="çevrimiçi sunucular" />
          <Ozet ikon="archive" baslik="En dolu disk" yukleniyor={yukleniyor}
            deger={doluDisk ? `%${Math.round(doluDisk.percent)}` : "—"} alt={doluDisk ? `${doluDisk.sunucu} · ${doluDisk.drive}` : "veri yok"}
            vurgu={!doluDisk ? undefined : doluDisk.percent >= 90 ? "kritik" : doluDisk.percent >= 75 ? "uyari" : undefined} />
        </div>

        {gorunum === "kart" ? (
          <>
            <Grup baslik="Terminaller" alt={`${terminaller.filter(cevrimici).length} / ${terminaller.length} çevrimiçi · ${aktif} aktif oturum`}
              sunucular={terminaller} yukleniyor={yukleniyor} islemler={islemler} />
            <Grup baslik="Altyapı" alt="Active Directory, SQL, IIS, Depo"
              sunucular={sunucular.filter((s) => !terminalMi(s))} yukleniyor={yukleniyor} islemler={islemler} />
          </>
        ) : (
          <Liste sunucular={sunucular} yukleniyor={yukleniyor} islemler={islemler}
            filtreAcik={filtreAcik} setFiltreAcik={setFiltreAcik}
            adFiltre={adFiltre} setAdFiltre={setAdFiltre} rolFiltre={rolFiltre} setRolFiltre={setRolFiltre}
            durumFiltre={durumFiltre} setDurumFiltre={setDurumFiltre} sira={sira} setSira={setSira} />
        )}
      </div>

      <AlertDialog open={kaldir !== null} onOpenChange={(o) => { if (!o && !kaldiriliyor) setKaldir(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sunucu kaldırılsın mı?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-medium text-foreground">{kaldir?.name}</span> ({kaldir?.ip}) Hub'dan kaldırılacak. Sunucunun kendisine
              dokunulmaz; yalnız Hub kaydı, rolleri ve izlemesi silinir. Bu işlem geri alınamaz.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={kaldiriliyor}>Vazgeç</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-white hover:bg-destructive/90" disabled={kaldiriliyor}
              onClick={(e) => { e.preventDefault(); void kaldirOnayla() }}>
              {kaldiriliyor ? "Kaldırılıyor…" : "Kaldır"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageContainer>
  )
}

type Islemler = { duzenle: (s: Server) => void; terminal: (s: Server) => void; kaldir: (s: Server) => void }

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
        <div className="mt-2 space-y-1.5"><Skeleton className="h-7 w-20 rounded-[5px]" /><Skeleton className="h-3 w-28 rounded-[5px]" /></div>
      ) : (
        <>
          <p className={`mt-1 text-2xl font-bold tabular-nums ${renk}`}>{deger}</p>
          <p className="truncate text-[12px] text-muted-foreground">{alt}</p>
        </>
      )}
    </div>
  )
}

function IslemMenusu({ s, islemler }: { s: Server; islemler: Islemler }) {
  const router = useRouter()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" onClick={(e) => e.preventDefault()} className="inline-flex size-7 shrink-0 items-center justify-center rounded-[5px] transition-colors hover:bg-muted/60" aria-label={`${s.name} işlemleri`}>
          <MoreVertical className="size-3.5 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem className="text-[12px]" onClick={() => router.push(`/servers/${s.slug ?? s.id}`)}>Detaylar</DropdownMenuItem>
        <DropdownMenuItem className="text-[12px]" onClick={() => islemler.terminal(s)}>Komut çalıştır</DropdownMenuItem>
        <DropdownMenuItem className="text-[12px]" onClick={() => islemler.duzenle(s)}>Düzenle</DropdownMenuItem>
        <DropdownMenuItem className="text-[12px] text-rose-600 focus:text-rose-600" onClick={() => islemler.kaldir(s)}>Kaldır</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function Grup({ baslik, alt, sunucular, yukleniyor, islemler }: { baslik: string; alt: string; sunucular: Server[]; yukleniyor: boolean; islemler: Islemler }) {
  if (!yukleniyor && sunucular.length === 0) return null
  return (
    <section className="rounded-[8px] bg-[var(--section-bg)] p-2">
      <div className="flex items-baseline gap-2 px-2 pb-2 pt-1">
        <h2 className="text-[13px] font-semibold">{baslik}</h2>
        {!yukleniyor && <span className="text-[12px] tabular-nums text-muted-foreground">{alt}</span>}
      </div>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
        {yukleniyor
          ? Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-[196px] rounded-[5px]" />)
          : [...sunucular].sort((a, b) => a.name.localeCompare(b.name, "tr", { numeric: true })).map((s) => <SunucuKarti key={s.id} s={s} islemler={islemler} />)}
      </div>
    </section>
  )
}

function Cubuk({ etiket, yuzde, ek }: { etiket: string; yuzde: number | null | undefined; ek?: string }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-[12px]">
        <span className="text-muted-foreground">{etiket}</span>
        <span className="truncate tabular-nums">
          {ek && <span className="text-muted-foreground">{ek} · </span>}
          <span className={seviyeMetin(yuzde)}>{yuzde == null ? "—" : `%${Math.round(yuzde)}`}</span>
        </span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
        <div className={`h-full rounded-full ${seviyeRenk(yuzde)}`} style={{ width: `${Math.min(100, yuzde ?? 0)}%` }} />
      </div>
    </div>
  )
}

function SunucuKarti({ s, islemler }: { s: Server; islemler: Islemler }) {
  const acik = cevrimici(s)
  const terminal = terminalMi(s)
  return (
    <div className="flex flex-col rounded-[5px] bg-card px-4 py-3" style={{ boxShadow: "var(--card-shadow)" }}>
      <div className="flex items-center gap-2">
        <span className={`size-2 shrink-0 rounded-full ${acik ? "bg-emerald-500" : "bg-red-500"}`} />
        <Link href={`/servers/${s.slug ?? s.id}`} className="truncate text-[14px] font-semibold hover:underline">{s.name}</Link>
        <span className="ml-auto"><IslemMenusu s={s} islemler={islemler} /></span>
      </div>
      <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
        <span className="text-[12px] tabular-nums text-muted-foreground">{s.ip}</span>
        {s.roles.map((r) => (
          <span key={r} className="inline-flex rounded-[5px] bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">{rolAdi(r)}</span>
        ))}
      </div>

      {acik ? (
        <div className="mt-3 space-y-2">
          <Cubuk etiket="CPU" yuzde={s.cpu} />
          <Cubuk etiket="RAM" yuzde={s.ram} ek={s.ramGB ? `${s.ramGB.kullanilan.toLocaleString("tr-TR")} / ${s.ramGB.toplam} GB` : undefined} />
          {diskler(s).map((d) => (
            <Cubuk key={d.drive} etiket={d.drive === "Disk" ? "Disk" : `Disk ${d.drive}`} yuzde={d.percent}
              ek={d.totalGB ? `${Math.round(d.totalGB - d.usedGB)} GB boş` : undefined} />
          ))}
        </div>
      ) : (
        <div className="mt-3 rounded-[5px] bg-red-500/10 px-3 py-2 text-[12px] text-red-700 dark:text-red-400">
          Agent'a ulaşılamıyor · son rapor {onceYaz(s.lastChecked)}
        </div>
      )}

      <div className="mt-auto pt-3">
        <div className="flex items-center justify-between gap-2 border-t pt-2 text-[12px] text-muted-foreground">
          {terminal && acik ? (
            <span className="tabular-nums">
              <span className="font-semibold text-foreground">{s.aktifOturum ?? "—"}</span> aktif
              {(s.kopukOturum ?? 0) > 0 && <span className="text-amber-700 dark:text-amber-400"> · {s.kopukOturum} kopuk</span>}
            </span>
          ) : (
            <span className="tabular-nums">{acik ? `${s.uptime} çalışıyor` : "—"}</span>
          )}
          <span className="tabular-nums" title={s.lastChecked}>{terminal && acik ? `${s.uptime} çalışıyor` : onceYaz(s.lastChecked)}</span>
        </div>
      </div>
    </div>
  )
}

function Liste({
  sunucular, yukleniyor, islemler, filtreAcik, setFiltreAcik, adFiltre, setAdFiltre, rolFiltre, setRolFiltre, durumFiltre, setDurumFiltre, sira, setSira,
}: {
  sunucular: Server[]; yukleniyor: boolean; islemler: Islemler
  filtreAcik: boolean; setFiltreAcik: (f: (v: boolean) => boolean) => void
  adFiltre: string; setAdFiltre: (v: string) => void
  rolFiltre: string[]; setRolFiltre: (v: string[]) => void
  durumFiltre: string[]; setDurumFiltre: (v: string[]) => void
  sira: SortState | null; setSira: (s: SortState | null) => void
}) {
  const roller = useMemo(() => [...new Set(sunucular.flatMap((s) => s.roles as string[]))].sort((a, b) => a.localeCompare(b, "tr")), [sunucular])
  const ad = adFiltre.trim().toLocaleLowerCase("tr-TR")
  const liste = sunucular.filter((s) => {
    if (ad && !`${s.name} ${s.ip} ${s.dns ?? ""}`.toLocaleLowerCase("tr-TR").includes(ad)) return false
    if (rolFiltre.length && !s.roles.some((r) => rolFiltre.includes(r))) return false
    if (durumFiltre.length && !durumFiltre.includes(cevrimici(s) ? "acik" : "kapali")) return false
    return true
  })
  const filtreSayisi = (ad ? 1 : 0) + (rolFiltre.length ? 1 : 0) + (durumFiltre.length ? 1 : 0)
  const yuzde = (v: number | null | undefined) => <span className={`tabular-nums ${seviyeMetin(v)}`}>{v == null ? "—" : `%${Math.round(v)}`}</span>

  const sutunlar: TableColumn<Server>[] = [
    {
      key: "name", header: "Sunucu", sortable: true,
      filter: <InlineTextFilter value={adFiltre} onChange={setAdFiltre} placeholder="Ad, IP ara…" />,
      cell: (s) => (
        <span className="flex min-w-0 items-center gap-2">
          <span className={`size-2 shrink-0 rounded-full ${cevrimici(s) ? "bg-emerald-500" : "bg-red-500"}`} />
          <Link href={`/servers/${s.slug ?? s.id}`} className="truncate hover:underline">{s.name}</Link>
        </span>
      ),
    },
    { key: "ip", header: "IP", sortable: true, width: "120px", cell: (s) => <span className="tabular-nums">{s.ip}</span> },
    {
      key: "roles", header: "Rol", width: "140px", sortValue: (s) => s.roles.join(","),
      filter: <InlineSelectFilter options={roller} selected={rolFiltre} onChange={setRolFiltre} getLabel={rolAdi} />,
      cell: (s) => <span className="block truncate">{s.roles.map(rolAdi).join(", ") || "—"}</span>,
    },
    { key: "cpu", header: "CPU", sortable: true, align: "right", width: "80px", sortValue: (s) => (cevrimici(s) ? s.cpu : -1), cell: (s) => (cevrimici(s) ? yuzde(s.cpu) : <span>—</span>) },
    { key: "ram", header: "RAM", sortable: true, align: "right", width: "80px", sortValue: (s) => (cevrimici(s) ? s.ram : -1), cell: (s) => (cevrimici(s) ? yuzde(s.ram) : <span>—</span>) },
    {
      key: "disk", header: "En dolu disk", sortable: true, align: "right", width: "120px",
      sortValue: (s) => (cevrimici(s) ? enDoluDisk(s).percent : -1),
      cell: (s) => {
        if (!cevrimici(s)) return <span>—</span>
        const d = enDoluDisk(s)
        return <span className="tabular-nums">{d.drive !== "Disk" && <span className="text-muted-foreground">{d.drive} </span>}{yuzde(d.percent)}</span>
      },
    },
    {
      key: "oturum", header: "Oturum", sortable: true, align: "right", width: "110px",
      sortValue: (s) => s.aktifOturum ?? -1,
      cell: (s) => (!terminalMi(s) || !cevrimici(s) ? <span>—</span> : (
        <span className="tabular-nums">
          {s.aktifOturum ?? "—"}
          {(s.kopukOturum ?? 0) > 0 && <span className="text-amber-700 dark:text-amber-400"> · {s.kopukOturum}</span>}
        </span>
      )),
    },
    { key: "uptime", header: "Çalışma", width: "100px", cell: (s) => <span className="tabular-nums">{cevrimici(s) ? s.uptime : "—"}</span> },
    {
      key: "status", header: "Durum", sortable: true, align: "center", width: "120px",
      sortValue: (s) => (cevrimici(s) ? 1 : 0),
      filter: <InlineSelectFilter options={["acik", "kapali"] as const} selected={durumFiltre} onChange={setDurumFiltre} getLabel={(o) => (o === "acik" ? "Çevrimiçi" : "Ulaşılamıyor")} />,
      cell: (s) => (
        <span className={`inline-flex rounded-[5px] px-2 py-0.5 text-[11px] font-medium ${cevrimici(s) ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" : "bg-red-500/15 text-red-700 dark:text-red-400"}`}>
          {cevrimici(s) ? "Çevrimiçi" : "Ulaşılamıyor"}
        </span>
      ),
    },
    { key: "islem", header: "", width: "64px", align: "center", cell: (s) => <IslemMenusu s={s} islemler={islemler} /> },
  ]

  return (
    <section className="rounded-[8px] bg-[var(--section-bg)] p-2">
      <div className="flex items-center gap-2 px-2 pb-2 pt-1">
        <h2 className="text-[13px] font-semibold">Tüm sunucular</h2>
        <span className="text-[12px] tabular-nums text-muted-foreground">{filtreSayisi ? `${liste.length} / ` : ""}{sunucular.length} sunucu</span>
        <span className="ml-auto flex items-center gap-2">
          {filtreSayisi > 0 && (
            <button type="button" className="text-[12px] font-medium text-primary hover:underline"
              onClick={() => { setAdFiltre(""); setRolFiltre([]); setDurumFiltre([]) }}>Filtreleri temizle</button>
          )}
          <Button variant="outline" size="sm" className="h-7 rounded-[5px] px-2.5 text-[12px]" onClick={() => setFiltreAcik((v) => !v)}>
            {filtreAcik ? "Filtreleri gizle" : "Filtrele"}
          </Button>
        </span>
      </div>
      <Table<Server>
        data={liste}
        columns={sutunlar}
        getRowId={(s) => s.id}
        sort={sira ?? undefined}
        onSortChange={setSira}
        filterRow={filtreAcik}
        columnDividers
        resizable
        rowHeight={36}
        headerHeight={30}
        height={`${30 + (filtreAcik ? 34 : 0) + Math.max(liste.length, 3) * 36 + 2}px`}
        loading={yukleniyor}
        className="rounded-[8px] text-[13px]"
        emptyState={sunucular.length === 0 ? "Henüz sunucu eklenmedi." : "Filtreye uyan sunucu yok."}
      />
    </section>
  )
}
