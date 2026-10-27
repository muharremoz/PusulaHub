"use client"

/**
 * Firma detayı → Yedekler sekmesi. Firmanın veritabanlarının Spare Cloud (FTP) ve Cloudflare R2'deki
 * full/diff yedekleri gün gün listelenir, iki yerden de indirilebilir. Veri sekme ilk açıldığında bir kez
 * çekilir (FTP'de tek `find`, R2'de veritabanı başına önekli liste — bkz. lib/firma-yedekleri.ts).
 */

import { useEffect, useMemo, useState } from "react"
import { Download, RefreshCw, ListFilter, CloudOff } from "lucide-react"
import { Table, InlineSelectFilter, type TableColumn, type SortState } from "@muharremoz/pusula-ui"
import { Button } from "@/components/ui/button"
import { Combobox } from "@/components/ui/combobox"
import type { FirmaYedekleriDto } from "@/app/api/companies/[firkod]/yedekler/route"
import type { YedekDosyasi, KaynakDurumu } from "@/lib/firma-yedekleri"

const boyutYaz = (b: number) =>
  b >= 1024 ** 3 ? `${(b / 1024 ** 3).toFixed(2)} GB` : b >= 1024 ** 2 ? `${(b / 1024 ** 2).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`

/** "27-10-2026" → "27.10.2026" */
const gunYaz = (g: string) => g.replace(/-/g, ".")
/** GG-AA-YYYY sıralama anahtarı */
const gunAnahtar = (g: string) => g.split("-").reverse().join("")

function KaynakUyarisi({ ad, d }: { ad: string; d: KaynakDurumu }) {
  if (d.durum === "ok") return null
  return (
    <p className="flex items-center gap-1.5 rounded-[5px] bg-amber-500/15 px-2.5 py-1.5 text-[12px] text-amber-700 dark:text-amber-400">
      <CloudOff className="size-3.5 shrink-0" />
      {ad}: {d.durum === "tanimsiz" ? "bağlantı tanımlı değil" : "okunamadı"}{d.mesaj ? ` — ${d.mesaj}` : ""}
    </p>
  )
}

function IndirDugmesi({ firkod, d, kaynak }: { firkod: string; d: YedekDosyasi; kaynak: "ftp" | "r2" }) {
  const var_ = kaynak === "ftp" ? d.ftp : d.r2
  if (!var_) return <span className="inline-flex h-6 w-10 items-center justify-center text-[11px] text-muted-foreground/50">—</span>
  const href = `/api/companies/${firkod}/yedekler/indir?kaynak=${kaynak}&gun=${encodeURIComponent(d.gun)}&dosya=${encodeURIComponent(d.dosya)}`
  return (
    <a
      href={href}
      title={`${kaynak === "ftp" ? "Spare Cloud" : "Cloudflare R2"}'den indir`}
      className="inline-flex h-6 items-center gap-1 rounded-[5px] border bg-card px-2 text-[11px] font-medium transition-colors hover:bg-muted"
    >
      <Download className="size-3" /> {kaynak === "ftp" ? "FTP" : "R2"}
    </a>
  )
}

export function FirmaYedekleriTab({ firkod }: { firkod: string }) {
  const [veri, setVeri] = useState<FirmaYedekleriDto | null>(null)
  const [yukleniyor, setYukleniyor] = useState(true)
  const [hata, setHata] = useState<string | null>(null)
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

  /** Gün listesi: en yeniden eskiye, dosya sayısıyla */
  const gunler = useMemo(() => {
    const m = new Map<string, { gun: string; full: number; diff: number; ftp: boolean; r2: boolean }>()
    for (const d of veri?.dosyalar ?? []) {
      const g = m.get(d.gun) ?? { gun: d.gun, full: 0, diff: 0, ftp: false, r2: false }
      g[d.tur]++; g.ftp ||= d.ftp; g.r2 ||= d.r2
      m.set(d.gun, g)
    }
    return [...m.values()].sort((a, b) => gunAnahtar(b.gun).localeCompare(gunAnahtar(a.gun)))
  }, [veri])

  // Varsayılan gün: en yeni
  useEffect(() => { if (!gun && gunler.length) setGun(gunler[0].gun) }, [gunler, gun])

  const liste = useMemo(() => (veri?.dosyalar ?? []).filter((d) => {
    if (gun && d.gun !== gun) return false
    if (dbFiltre.length && !dbFiltre.includes(d.db)) return false
    if (turFiltre.length && !turFiltre.includes(d.tur)) return false
    return true
  }), [veri, gun, dbFiltre, turFiltre])

  const filtreSayisi = (dbFiltre.length ? 1 : 0) + (turFiltre.length ? 1 : 0)

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
      key: "indir", header: "İndir", align: "center", width: "150px",
      cell: (d) => (
        <span className="inline-flex items-center gap-1.5">
          <IndirDugmesi firkod={firkod} d={d} kaynak="ftp" />
          <IndirDugmesi firkod={firkod} d={d} kaynak="r2" />
        </span>
      ),
    },
  ]

  const secili = gunler.find((g) => g.gun === gun)
  const toplamFtp = new Set((veri?.dosyalar ?? []).filter((d) => d.ftp).map((d) => d.gun)).size
  const toplamR2 = new Set((veri?.dosyalar ?? []).filter((d) => d.r2).map((d) => d.gun)).size

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[12px] text-muted-foreground tabular-nums">
          {yukleniyor ? "" : veri ? `${veri.veritabanlari.length} veritabanı · FTP ${toplamFtp} gün · R2 ${toplamR2} gün` : ""}
        </span>
        <div className="flex items-center gap-2">
          <Combobox
            items={gunler}
            getKey={(g) => g.gun}
            getLabel={(g) => gunYaz(g.gun)}
            value={gun}
            onChange={setGun}
            disabled={yukleniyor || gunler.length === 0}
            placeholder="Gün seçin"
            className="h-8 w-[230px] text-[12px]"
            renderItem={(g) => (
              <span className="flex w-full items-center justify-between gap-2">
                <span className="tabular-nums">{gunYaz(g.gun)}</span>
                <span className="text-[11px] text-muted-foreground">
                  {g.full} full · {g.diff} diff{g.r2 ? " · R2" : ""}
                </span>
              </span>
            )}
            renderValue={(g) => <span className="tabular-nums">{gunYaz(g.gun)} · {g.full} full, {g.diff} diff</span>}
          />
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

      {veri && <KaynakUyarisi ad="Spare Cloud (FTP)" d={veri.ftp} />}
      {veri && <KaynakUyarisi ad="Cloudflare R2" d={veri.r2} />}
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
          (veri?.dosyalar.length ?? 0) === 0 ? (
            <div className="flex flex-col items-center gap-1 py-4 text-center text-muted-foreground">
              <p className="text-[13px]">
                {veri && veri.veritabanlari.length === 0
                  ? "Bu firmanın kayıtlı veritabanı yok."
                  : "Bu firmanın veritabanları için Spare Cloud ve R2'de yedek bulunamadı."}
              </p>
              <p className="text-[12px]">Yedeklenmesi için veritabanının Veritabanları sekmesinde "Yedek al" işaretli olması gerekir.</p>
            </div>
          ) : "Filtreye uyan yedek yok."
        }
      />
      {secili && !yukleniyor && (
        <p className="text-[11px] text-muted-foreground">
          Bir anı geri yüklemek için o günün full yedeği ile istenen saatteki diff birlikte gerekir.
        </p>
      )}
    </div>
  )
}
