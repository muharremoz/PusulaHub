"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { Table, InlineTextFilter, type TableColumn, type SortState } from "@muharremoz/pusula-ui"
import type { Donem, RaporFirma, RaporKullanici } from "@/app/api/servers/[id]/rapor/route"
import { DonemSecici, useRapor } from "./tab-rapor"

/**
 * Firmalar (terminal) — bu terminale atanmış firmalar + seçilen dönemde kullananlar
 * (/api/servers/[id]/rapor, user_daily_usage). Satıra tıklayınca altında
 * o firmanın kullanıcı kırılımı açılır.
 */

const sayi = (v: number, b = 1) => v.toLocaleString("tr-TR", { maximumFractionDigits: b })
const ram = (mb: number) => (mb >= 1024 ? `${sayi(mb / 1024)} GB` : `${Math.round(mb)} MB`)
const tarih = (iso: string) => { const [y, a, g] = iso.split("-"); return `${g}.${a}.${y}` }
const tabloBoyu = (n: number, ust = 0) => `${30 + ust + (n > 0 ? n * 36 : 120) + 2}px`

export function TabFirmaKullanim({ serverId }: { serverId: string }) {
  const [donem, setDonem] = useState<Donem>("7g")
  const { veri, yukleniyor, hata } = useRapor(serverId, donem)
  const [secili, setSecili] = useState<string | null>(null)
  const [filtreAcik, setFiltreAcik] = useState(false)
  const [adFiltre, setAdFiltre] = useState("")
  const [sira, setSira] = useState<SortState | null>({ key: "saat", direction: "desc" })
  const [kSira, setKSira] = useState<SortState | null>({ key: "saat", direction: "desc" })

  const ad = adFiltre.trim().toLocaleLowerCase("tr-TR")
  const firmalar = useMemo(
    () => (veri?.firmalar ?? []).filter((f) => !ad || `${f.firma} ${f.ad ?? ""}`.toLocaleLowerCase("tr-TR").includes(ad)),
    [veri, ad],
  )
  const seciliFirma = veri?.firmalar.find((f) => f.firma === secili) ?? null

  const sutunlar: TableColumn<RaporFirma>[] = [
    { key: "firma", header: "Kod", sortable: true, width: "90px", cell: (f) => <span className="tabular-nums text-muted-foreground">{f.firma}</span> },
    {
      key: "ad", header: "Firma", sortable: true, sortValue: (f) => f.ad ?? f.firma,
      filter: <InlineTextFilter value={adFiltre} onChange={setAdFiltre} placeholder="Firma ara…" />,
      cell: (f) => f.firma === "—" ? <span className="text-muted-foreground">Firmasız kullanıcı</span> : (
        <span className="flex min-w-0 items-center gap-1.5">
          <Link href={`/companies?firkod=${f.firma}`} onClick={(e) => e.stopPropagation()} className={`truncate hover:underline ${f.saat === 0 ? "text-muted-foreground" : ""}`}>{f.ad ?? f.firma}</Link>
          {!f.atanmis && (
            <span className="inline-flex shrink-0 rounded-[5px] bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground" title="Firma kaydında bu sunucu atanmış değil — kullanıcıları başka terminalden de giriyor olabilir">atanmamış</span>
          )}
        </span>
      ),
    },
    {
      key: "kayitli", header: "Kayıtlı", sortable: true, align: "right", width: "100px",
      cell: (f) => <span className="tabular-nums text-muted-foreground" title="Firmanın AD'deki açık hesap sayısı">{f.kayitli || "—"}</span>,
    },
    {
      key: "kisi", header: "Kullanan", sortable: true, align: "right", width: "110px",
      cell: (f) => <span className={`tabular-nums ${f.kisi === 0 ? "text-muted-foreground" : ""}`}>{f.kisi}</span>,
    },
    { key: "saat", header: "Toplam saat", sortable: true, align: "right", width: "130px", cell: (f) => (f.saat === 0 ? <span className="text-muted-foreground">kullanılmadı</span> : <span className="font-medium tabular-nums">{sayi(f.saat)} sa</span>) },
    { key: "kisiBasiSaat", header: "Kişi başı", sortable: true, align: "right", width: "120px", cell: (f) => (f.saat === 0 ? <span className="text-muted-foreground">—</span> : <span className="tabular-nums">{sayi(f.kisiBasiSaat)} sa</span>) },
    { key: "cpu", header: "Ort. CPU", sortable: true, align: "right", width: "120px", cell: (f) => (f.saat === 0 ? <span className="text-muted-foreground">—</span> : <span className="tabular-nums">%{sayi(f.cpu, 2)}</span>) },
    { key: "ramMB", header: "Ort. RAM", sortable: true, align: "right", width: "120px", cell: (f) => (f.saat === 0 ? <span className="text-muted-foreground">—</span> : <span className="tabular-nums">{ram(f.ramMB)}</span>) },
  ]

  const kSutunlar: TableColumn<RaporKullanici>[] = [
    {
      key: "kullanici", header: "Kullanıcı", sortable: true,
      cell: (u) => (
        <span className="flex min-w-0 items-center gap-1.5">
          <span className={`truncate ${u.kullanmadi ? "text-muted-foreground" : ""}`}>{u.kullanici}</span>
          {u.pasif && <span className="inline-flex shrink-0 rounded-[5px] bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">pasif</span>}
        </span>
      ),
    },
    { key: "gun", header: "Gün", sortable: true, align: "right", width: "90px", cell: (u) => <span className={`tabular-nums ${u.kullanmadi ? "text-muted-foreground" : ""}`}>{u.gun}</span> },
    { key: "saat", header: "Saat", sortable: true, align: "right", width: "100px", cell: (u) => (u.kullanmadi ? <span className="text-muted-foreground">girmedi</span> : <span className="font-medium tabular-nums">{sayi(u.saat)}</span>) },
    { key: "cpu", header: "Ort. CPU", sortable: true, align: "right", width: "120px", cell: (u) => (u.kullanmadi ? <span className="text-muted-foreground">—</span> : <span className="tabular-nums">%{sayi(u.cpu, 2)}</span>) },
    { key: "ramMB", header: "Ort. RAM", sortable: true, align: "right", width: "120px", cell: (u) => (u.kullanmadi ? <span className="text-muted-foreground">—</span> : <span className="tabular-nums">{ram(u.ramMB)}</span>) },
    { key: "sonGun", header: "Son gün", sortable: true, width: "120px", cell: (u) => <span className="tabular-nums">{u.sonGun ? tarih(u.sonGun) : "—"}</span> },
  ]

  return (
    <div className="space-y-3">
      <section className="rounded-[8px] bg-[var(--section-bg)] p-2">
        <div className="flex min-h-7 flex-wrap items-center gap-2 px-2 pb-2 pt-1">
          <h2 className="text-[13px] font-semibold">Firmalar</h2>
          {veri && !yukleniyor && (
            <span className="text-[12px] tabular-nums text-muted-foreground">
              {veri.firmalar.length} firma · {veri.firmalar.filter((f) => f.saat > 0).length} kullandı · {veri.toplam.kisi} kişi · {sayi(veri.toplam.saat)} saat
            </span>
          )}
          <div className="ml-auto flex items-center gap-2">
            <button type="button" className="text-[12px] font-medium text-primary hover:underline" onClick={() => setFiltreAcik((v) => !v)}>
              {filtreAcik ? "Filtreyi gizle" : "Filtrele"}
            </button>
            <DonemSecici donem={donem} onChange={(d) => { setDonem(d); setSecili(null) }} />
          </div>
        </div>
        {hata && <p className="px-2 pb-2 text-[12px] text-red-600 dark:text-red-400">Rapor alınamadı: {hata}</p>}
        <Table<RaporFirma>
          data={firmalar}
          columns={sutunlar}
          getRowId={(f) => f.firma}
          sort={sira ?? undefined}
          onSortChange={setSira}
          filterRow={filtreAcik}
          onRowClick={(f) => setSecili((s) => (s === f.firma ? null : f.firma))}
          columnDividers
          rowHeight={36}
          headerHeight={30}
          height={tabloBoyu(Math.min(firmalar.length, 15), filtreAcik ? 34 : 0)}
          loading={yukleniyor}
          className="rounded-[8px] text-[13px]"
          emptyState={(veri?.firmalar.length ?? 0) === 0 ? "Bu sunucuya atanmış ya da dönemde kullanan firma yok." : "Filtreye uyan firma yok."}
        />
        {!yukleniyor && firmalar.length > 0 && !seciliFirma && (
          <p className="px-2 pt-2 text-[11px] text-muted-foreground">Kullanıcı kırılımı için bir firmaya tıklayın. Süre: oturumun açık olduğu süre (10 sn örnekleme).</p>
        )}
      </section>

      {seciliFirma && (
        <section className="rounded-[8px] bg-[var(--section-bg)] p-2">
          <div className="flex min-h-7 items-center gap-2 px-2 pb-2 pt-1">
            <h2 className="truncate text-[13px] font-semibold">{seciliFirma.ad ?? seciliFirma.firma} · kullanıcılar</h2>
            <span className="text-[12px] tabular-nums text-muted-foreground">{seciliFirma.kisi} / {seciliFirma.kullanicilar.length} kişi girdi · {sayi(seciliFirma.saat)} saat</span>
            <button type="button" className="ml-auto text-[12px] font-medium text-primary hover:underline" onClick={() => setSecili(null)}>Kapat</button>
          </div>
          <Table<RaporKullanici>
            data={seciliFirma.kullanicilar}
            columns={kSutunlar}
            getRowId={(u) => u.kullanici}
            sort={kSira ?? undefined}
            onSortChange={setKSira}
            columnDividers
            rowHeight={36}
            headerHeight={30}
            height={tabloBoyu(Math.min(seciliFirma.kullanicilar.length, 12))}
            className="rounded-[8px] text-[13px]"
            emptyState="Kullanıcı yok."
          />
        </section>
      )}
    </div>
  )
}
