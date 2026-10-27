"use client"

/**
 * Firma detayı → Yedekler sekmesi. Firmanın veritabanlarının full/diff yedekleri gün gün listelenir.
 * Liste tek kaynak gösterir: Spare Cloud (FTP) ya da Cloudflare R2 — üstteki seçiciden değiştirilir.
 * Veri sekme ilk açıldığında iki kaynaktan bir kez çekilir (FTP'de tek `find`, R2'de veritabanı başına
 * önekli liste — bkz. lib/firma-yedekleri.ts); kaynak değiştirmek yeni istek atmaz.
 */

import { useEffect, useMemo, useState } from "react"
import { Download, RefreshCw, ListFilter, CloudOff, CalendarDays, ChevronDown } from "lucide-react"
import { tr } from "date-fns/locale"
import { Table, InlineSelectFilter, Popover, PopoverContent, PopoverTrigger, type TableColumn, type SortState } from "@muharremoz/pusula-ui"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import type { FirmaYedekleriDto } from "@/app/api/companies/[firkod]/yedekler/route"
import type { YedekDosyasi, KaynakDurumu } from "@/lib/firma-yedekleri"

type Kaynak = "ftp" | "r2"
const KAYNAK_ADI: Record<Kaynak, string> = { ftp: "Spare Cloud (FTP)", r2: "Cloudflare R2" }

const boyutYaz = (b: number) =>
  b >= 1024 ** 3 ? `${(b / 1024 ** 3).toFixed(2)} GB` : b >= 1024 ** 2 ? `${(b / 1024 ** 2).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`

/** "27-10-2026" → "27.10.2026" */
const gunYaz = (g: string) => g.replace(/-/g, ".")
/** GG-AA-YYYY sıralama anahtarı */
const gunAnahtar = (g: string) => g.split("-").reverse().join("")
/** "27-10-2026" ↔ Date (yerel gece yarısı) */
const gunTarih = (g: string) => { const [d, m, y] = g.split("-").map(Number); return new Date(y, m - 1, d) }
const tarihGun = (t: Date) => `${String(t.getDate()).padStart(2, "0")}-${String(t.getMonth() + 1).padStart(2, "0")}-${t.getFullYear()}`

type GunOzeti = { gun: string; full: number; diff: number }

/** Takvimli gün seçici — yalnız yedeği olan günler seçilebilir (CLAUDE.md: tarih seçimi Calendar + Popover) */
function GunSecici({ gunler, gun, onChange, disabled }: { gunler: GunOzeti[]; gun: string; onChange: (g: string) => void; disabled?: boolean }) {
  const [acik, setAcik] = useState(false)
  const secili = gunler.find((g) => g.gun === gun)
  const yedekli = useMemo(() => new Set(gunler.map((g) => g.gun)), [gunler])
  const tarihler = useMemo(() => gunler.map((g) => gunTarih(g.gun)), [gunler])
  const enEski = tarihler.at(-1), enYeni = tarihler[0]
  return (
    <Popover open={acik} onOpenChange={setAcik}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className="inline-flex h-8 w-[240px] items-center gap-2 rounded-[5px] border bg-card px-2.5 text-[12px] transition-colors hover:bg-muted disabled:opacity-50"
        >
          <CalendarDays className="size-3.5 text-muted-foreground" />
          <span className="flex-1 truncate text-left tabular-nums">
            {secili ? <>{gunYaz(secili.gun)} <span className="text-muted-foreground">· {secili.full} full, {secili.diff} diff</span></> : "Gün seçin"}
          </span>
          <ChevronDown className="size-3.5 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-auto p-2">
        <Calendar
          mode="single"
          selected={secili ? gunTarih(secili.gun) : undefined}
          onSelect={(t) => { if (t) { onChange(tarihGun(t)); setAcik(false) } }}
          disabled={(t) => !yedekli.has(tarihGun(t))}
          modifiers={{ yedekli: tarihler }}
          modifiersClassNames={{ yedekli: "font-semibold" }}
          defaultMonth={secili ? gunTarih(secili.gun) : enYeni}
          startMonth={enEski}
          endMonth={enYeni}
          locale={tr}
        />
        <p className="border-t px-1 pt-2 text-[11px] text-muted-foreground">
          {gunler.length} günde yedek var{enEski && enYeni ? ` · ${gunYaz(tarihGun(enEski))} – ${gunYaz(tarihGun(enYeni))}` : ""}
        </p>
      </PopoverContent>
    </Popover>
  )
}

function KaynakUyarisi({ ad, d }: { ad: string; d: KaynakDurumu }) {
  if (d.durum === "ok") return null
  return (
    <p className="flex items-center gap-1.5 rounded-[5px] bg-amber-500/15 px-2.5 py-1.5 text-[12px] text-amber-700 dark:text-amber-400">
      <CloudOff className="size-3.5 shrink-0" />
      {ad}: {d.durum === "tanimsiz" ? "bağlantı tanımlı değil" : "okunamadı"}{d.mesaj ? ` — ${d.mesaj}` : ""}
    </p>
  )
}

export function FirmaYedekleriTab({ firkod }: { firkod: string }) {
  const [veri, setVeri] = useState<FirmaYedekleriDto | null>(null)
  const [yukleniyor, setYukleniyor] = useState(true)
  const [hata, setHata] = useState<string | null>(null)
  const [kaynak, setKaynak] = useState<Kaynak>("ftp")
  const [gun, setGun] = useState("")
  const [dbFiltre, setDbFiltre] = useState<string[]>([])
  const [turFiltre, setTurFiltre] = useState<("full" | "diff")[]>([])
  const [filtreAcik, setFiltreAcik] = useState(false)
  // null: sunucunun sırası (en yeni yedek üstte)
  const [sira, setSira] = useState<SortState | null>(null)

  const yukle = async () => {
    setYukleniyor(true); setHata(null)
    try {
      const r = await fetch(`/api/companies/${firkod}/yedekler`)
      const j = await r.json()
      if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`)
      setVeri(j as FirmaYedekleriDto)
    } catch (e) {
      setHata(e instanceof Error ? e.message : String(e))
    } finally {
      setYukleniyor(false)
    }
  }

  useEffect(() => { setVeri(null); setGun(""); setDbFiltre([]); setTurFiltre([]); void yukle() }, [firkod]) // eslint-disable-line react-hooks/exhaustive-deps

  /** Seçili kaynaktaki dosyalar */
  const kaynakDosyalari = useMemo(() => (veri?.dosyalar ?? []).filter((d) => d[kaynak]), [veri, kaynak])
  const gunSayisi = (k: Kaynak) => new Set((veri?.dosyalar ?? []).filter((d) => d[k]).map((d) => d.gun)).size

  /** Gün listesi: en yeniden eskiye, dosya sayısıyla */
  const gunler = useMemo(() => {
    const m = new Map<string, GunOzeti>()
    for (const d of kaynakDosyalari) {
      const g = m.get(d.gun) ?? { gun: d.gun, full: 0, diff: 0 }
      g[d.tur]++
      m.set(d.gun, g)
    }
    return [...m.values()].sort((a, b) => gunAnahtar(b.gun).localeCompare(gunAnahtar(a.gun)))
  }, [kaynakDosyalari])

  // Varsayılan gün: en yeni. Kaynak değişince seçili gün orada yoksa en yeniye döner.
  useEffect(() => {
    if (gunler.length && !gunler.some((g) => g.gun === gun)) setGun(gunler[0].gun)
  }, [gunler, gun])

  const liste = useMemo(() => kaynakDosyalari.filter((d) => {
    if (gun && d.gun !== gun) return false
    if (dbFiltre.length && !dbFiltre.includes(d.db)) return false
    if (turFiltre.length && !turFiltre.includes(d.tur)) return false
    return true
  }), [kaynakDosyalari, gun, dbFiltre, turFiltre])

  const filtreSayisi = (dbFiltre.length ? 1 : 0) + (turFiltre.length ? 1 : 0)
  const durum = veri ? veri[kaynak] : null

  const sutunlar: TableColumn<YedekDosyasi>[] = [
    {
      key: "zaman", header: "Yedek zamanı", sortable: true, width: "150px",
      cell: (d) => <span className="tabular-nums">{d.zaman.slice(8, 10)}.{d.zaman.slice(5, 7)}.{d.zaman.slice(0, 4)} {d.zaman.slice(11)}</span>,
    },
    {
      key: "db", header: "Veritabanı", sortable: true,
      filter: <InlineSelectFilter options={veri?.veritabanlari ?? []} selected={dbFiltre} onChange={setDbFiltre} getLabel={(o) => o} />,
      cell: (d) => <span className="block truncate" title={d.dosya}>{d.db}</span>,
    },
    {
      key: "tur", header: "Tür", sortable: true, align: "center", width: "80px",
      filter: <InlineSelectFilter options={["full", "diff"] as const} selected={turFiltre} onChange={setTurFiltre} getLabel={(o) => (o === "full" ? "Full" : "Diff")} />,
      cell: (d) => (
        <span className={`inline-flex rounded-[5px] px-2 py-0.5 text-[11px] font-medium ${d.tur === "full" ? "bg-sky-500/15 text-sky-700 dark:text-sky-400" : "bg-muted text-muted-foreground"}`}>
          {d.tur === "full" ? "Full" : "Diff"}
        </span>
      ),
    },
    {
      key: "boyut", header: "Boyut", sortable: true, align: "right", width: "100px",
      sortValue: (d) => d.boyut,
      cell: (d) => <span className="tabular-nums">{boyutYaz(d.boyut)}</span>,
    },
    {
      key: "indir", header: "", align: "center", width: "90px",
      cell: (d) => (
        <a
          href={`/api/companies/${firkod}/yedekler/indir?kaynak=${kaynak}&gun=${encodeURIComponent(d.gun)}&dosya=${encodeURIComponent(d.dosya)}`}
          title={`${KAYNAK_ADI[kaynak]}'dan indir`}
          className="inline-flex h-6 items-center gap-1 rounded-[5px] border bg-card px-2 text-[11px] font-medium transition-colors hover:bg-muted"
        >
          <Download className="size-3" /> İndir
        </a>
      ),
    },
  ]

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <ToggleGroup
            type="single"
            value={kaynak}
            onValueChange={(v) => v && setKaynak(v as Kaynak)}
            variant="outline"
            size="sm"
          >
            {(["ftp", "r2"] as const).map((k) => (
              <ToggleGroupItem key={k} value={k} className="h-8 gap-1.5 px-3 text-[12px]">
                {KAYNAK_ADI[k]}
                {veri && <span className="text-[11px] text-muted-foreground tabular-nums">{gunSayisi(k)} gün</span>}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <span className="text-[12px] text-muted-foreground tabular-nums">
            {yukleniyor || !veri ? "" : `${veri.veritabanlari.length} veritabanı`}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <GunSecici gunler={gunler} gun={gun} onChange={setGun} disabled={yukleniyor || gunler.length === 0} />
          {filtreSayisi > 0 && (
            <button type="button" onClick={() => { setDbFiltre([]); setTurFiltre([]) }} className="rounded-[5px] px-2 py-1 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
              Temizle
            </button>
          )}
          <button
            type="button"
            onClick={() => setFiltreAcik((v) => !v)}
            aria-pressed={filtreAcik}
            className={`inline-flex h-8 items-center gap-1.5 rounded-[5px] border px-3 text-[12px] font-medium transition-colors ${
              filtreAcik || filtreSayisi > 0 ? "border-primary/40 bg-primary/15 text-primary" : "bg-card text-foreground hover:bg-muted"
            }`}
          >
            <ListFilter className="size-3.5" /> Filtre
            {filtreSayisi > 0 && <span className="rounded-full bg-primary px-1.5 text-[10px] tabular-nums text-primary-foreground">{filtreSayisi}</span>}
          </button>
          <Button size="sm" variant="outline" onClick={() => void yukle()} disabled={yukleniyor} className="h-8 gap-1.5 rounded-[5px] text-[12px]">
            <RefreshCw className={`size-3.5 ${yukleniyor ? "animate-spin" : ""}`} /> {yukleniyor ? "Yükleniyor…" : "Yenile"}
          </Button>
        </div>
      </div>

      {durum && <KaynakUyarisi ad={KAYNAK_ADI[kaynak]} d={durum} />}
      {hata && <p className="rounded-[5px] bg-red-500/15 px-2.5 py-1.5 text-[12px] text-red-700 dark:text-red-400">Yedekler okunamadı: {hata}</p>}

      <Table<YedekDosyasi>
        data={liste}
        columns={sutunlar}
        getRowId={(d) => `${d.gun}/${d.dosya}`}
        sort={sira}
        onSortChange={setSira}
        filterRow={filtreAcik}
        columnDividers
        resizable
        rowHeight={36}
        headerHeight={30}
        height={Math.min(520, 30 + (filtreAcik ? 36 : 0) + (liste.length === 0 ? 180 : Math.max(liste.length, 3) * 36) + 2)}
        loading={yukleniyor}
        className="rounded-[8px] text-[13px]"
        emptyState={
          kaynakDosyalari.length === 0 ? (
            <div className="flex flex-col items-center gap-1 py-4 text-center text-muted-foreground">
              <p className="text-[13px]">
                {veri && veri.veritabanlari.length === 0
                  ? "Bu firmanın kayıtlı veritabanı yok."
                  : `Bu firmanın veritabanları için ${KAYNAK_ADI[kaynak]}'da yedek bulunamadı.`}
              </p>
              <p className="text-[12px]">Yedeklenmesi için veritabanının Veritabanları sekmesinde "Yedek al" işaretli olması gerekir.</p>
            </div>
          ) : "Filtreye uyan yedek yok."
        }
      />
      {gunler.length > 0 && !yukleniyor && (
        <p className="text-[11px] text-muted-foreground">
          Bir anı geri yüklemek için o günün full yedeği ile istenen saatteki diff birlikte gerekir.
        </p>
      )}
    </div>
  )
}
