"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { Table, InlineTextFilter, type TableColumn, type SortState } from "@muharremoz/pusula-ui"
import type { Donem, RaporFirma, RaporKullanici } from "@/app/api/servers/[id]/rapor/route"
import { DonemSecici, useRapor } from "./tab-rapor"

/**
 * Firma kullanımı — seçilen dönemde bu terminali kullanan firmalar
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
    { key: "firma", header: "Kod", sortable: true, width: "80px", cell: (f) => <span className="tabular-nums text-muted-foreground">{f.firma}</span> },
    {
      key: "ad", header: "Firma", sortable: true, sortValue: (f) => f.ad ?? f.firma,
      filter: <InlineTextFilter value={adFiltre} onChange={setAdFiltre} placeholder="Firma ara…" />,
      cell: (f) => f.firma === "—" ? <span className="text-muted-foreground">Firmasız kullanıcı</span>
        : <Link href={`/companies?firkod=${f.firma}`} onClick={(e) => e.stopPropagation()} className="block truncate hover:underline">{f.ad ?? f.firma}</Link>,
    },
    { key: "kisi", header: "Kişi", sortable: true, align: "right", width: "80px", cell: (f) => <span className="tabular-nums">{f.kisi}</span> },
    {
      key: "saat", header: "Toplam saat", sortable: true, align: "right", width: "180px",
      cell: (f) => {
        const enCok = veri?.firmalar[0]?.saat || 1
        return (
          <span className="flex items-center justify-end gap-2">
            <span className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
              <span className="block h-full rounded-full bg-primary/70" style={{ width: `${Math.min(100, (f.saat / enCok) * 100)}%` }} />
            </span>
            <span className="w-14 text-right font-medium tabular-nums">{sayi(f.saat)}</span>
          </span>
        )
      },
    },
    { key: "kisiBasiSaat", header: "Kişi başı", sortable: true, align: "right", width: "100px", cell: (f) => <span className="tabular-nums">{sayi(f.kisiBasiSaat)} sa</span> },
    { key: "cpu", header: "Ort. CPU", sortable: true, align: "right", width: "100px", cell: (f) => <span className="tabular-nums">%{sayi(f.cpu, 2)}</span> },
    { key: "ramMB", header: "Ort. RAM", sortable: true, align: "right", width: "100px", cell: (f) => <span className="tabular-nums">{ram(f.ramMB)}</span> },
  ]

  const kSutunlar: TableColumn<RaporKullanici>[] = [
    { key: "kullanici", header: "Kullanıcı", sortable: true, cell: (u) => <span className="block truncate">{u.kullanici}</span> },
    { key: "gun", header: "Gün", sortable: true, align: "right", width: "80px", cell: (u) => <span className="tabular-nums">{u.gun}</span> },
    { key: "saat", header: "Saat", sortable: true, align: "right", width: "100px", cell: (u) => <span className="font-medium tabular-nums">{sayi(u.saat)}</span> },
    { key: "cpu", header: "Ort. CPU", sortable: true, align: "right", width: "100px", cell: (u) => <span className="tabular-nums">%{sayi(u.cpu, 2)}</span> },
    { key: "ramMB", header: "Ort. RAM", sortable: true, align: "right", width: "100px", cell: (u) => <span className="tabular-nums">{ram(u.ramMB)}</span> },
    { key: "sonGun", header: "Son gün", sortable: true, width: "110px", cell: (u) => <span className="tabular-nums">{tarih(u.sonGun)}</span> },
  ]

  return (
    <div className="space-y-3">
      <section className="rounded-[8px] bg-[var(--section-bg)] p-2">
        <div className="flex min-h-7 flex-wrap items-center gap-2 px-2 pb-2 pt-1">
          <h2 className="text-[13px] font-semibold">Firma kullanımı</h2>
          {veri && !yukleniyor && (
            <span className="text-[12px] tabular-nums text-muted-foreground">
              {veri.firmalar.length} firma · {veri.toplam.kisi} kişi · {sayi(veri.toplam.saat)} saat
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
          emptyState={(veri?.firmalar.length ?? 0) === 0 ? "Bu dönemde bu sunucuyu kullanan firma yok." : "Filtreye uyan firma yok."}
        />
        {!yukleniyor && firmalar.length > 0 && !seciliFirma && (
          <p className="px-2 pt-2 text-[11px] text-muted-foreground">Kullanıcı kırılımı için bir firmaya tıklayın. Süre: oturumun açık olduğu süre (10 sn örnekleme).</p>
        )}
      </section>

      {seciliFirma && (
        <section className="rounded-[8px] bg-[var(--section-bg)] p-2">
          <div className="flex min-h-7 items-center gap-2 px-2 pb-2 pt-1">
            <h2 className="truncate text-[13px] font-semibold">{seciliFirma.ad ?? seciliFirma.firma} · kullanıcılar</h2>
            <span className="text-[12px] tabular-nums text-muted-foreground">{seciliFirma.kisi} kişi · {sayi(seciliFirma.saat)} saat</span>
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
