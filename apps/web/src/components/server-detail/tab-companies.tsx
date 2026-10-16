"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Table, InlineTextFilter, type TableColumn, type SortState } from "@muharremoz/pusula-ui";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import type { AgentReport } from "@/lib/agent-types";

/**
 * Sunucu detay — Firmalar (salt okunur liste). AD sunucusunun firma OU'ları.
 *
 * Satıra tıklayınca firmanın kullanıcıları yan panelde. Eski sekmedeki
 * "Şifre değiştir" hiçbir şey göndermeden başarı bildirimi veriyordu,
 * "Devre dışı bırak" da boştu — kaldırıldı; gerçek işlemler firma detayında.
 */

type Company = NonNullable<NonNullable<AgentReport["ad"]>["companies"]>[number];
type Satir = Company & { ad: string | null; aktif: number; sonGiris: string | null };

interface Props {
  companies: Company[];
  firmaMap: Record<string, string>;
}

/** AD lastLogin "dd.MM.yyyy HH:mm" / ISO — sıralama için sayıya çevir */
const zaman = (s: string | null | undefined) => {
  if (!s) return 0
  const m = /^(\d{2})\.(\d{2})\.(\d{4})(?:\s+(\d{2}):(\d{2}))?/.exec(s)
  if (m) return new Date(+m[3], +m[2] - 1, +m[1], +(m[4] ?? 0), +(m[5] ?? 0)).getTime()
  const t = Date.parse(s)
  return Number.isNaN(t) ? 0 : t
}

export function TabCompanies({ companies, firmaMap }: Props) {
  const [filtreAcik, setFiltreAcik] = useState(false);
  const [adFiltre, setAdFiltre] = useState("");
  const [sira, setSira] = useState<SortState | null>({ key: "firmaNo", direction: "asc" });
  const [secili, setSecili] = useState<Satir | null>(null);

  const satirlar: Satir[] = companies.map((c) => {
    const son = c.users.reduce<string | null>((m, u) => (zaman(u.lastLogin) > zaman(m) ? u.lastLogin : m), null);
    return { ...c, ad: firmaMap[c.firmaNo] ?? null, aktif: c.users.filter((u) => u.enabled).length, sonGiris: son };
  });
  const q = adFiltre.trim().toLocaleLowerCase("tr-TR");
  const liste = q ? satirlar.filter((c) => `${c.firmaNo} ${c.ad ?? ""}`.toLocaleLowerCase("tr-TR").includes(q)) : satirlar;
  const toplamKullanici = satirlar.reduce((t, c) => t + c.userCount, 0);

  const sutunlar: TableColumn<Satir>[] = [
    {
      key: "firmaNo", header: "Kod", sortable: true, width: "90px",
      sortValue: (c) => Number(c.firmaNo) || 0,
      filter: <InlineTextFilter value={adFiltre} onChange={setAdFiltre} placeholder="Kod, firma…" />,
      cell: (c) => <span className="tabular-nums text-muted-foreground">{c.firmaNo}</span>,
    },
    { key: "ad", header: "Firma", sortable: true, sortValue: (c) => c.ad ?? c.firmaNo, cell: (c) => <span className="block truncate font-medium">{c.ad ?? "—"}</span> },
    { key: "userCount", header: "Kullanıcı", sortable: true, align: "right", width: "110px", cell: (c) => <span className="tabular-nums">{c.userCount}</span> },
    {
      key: "aktif", header: "Aktif", sortable: true, align: "right", width: "90px",
      cell: (c) => <span className={`tabular-nums ${c.aktif < c.userCount ? "text-muted-foreground" : ""}`}>{c.aktif}</span>,
    },
    { key: "sonGiris", header: "Son giriş", sortable: true, width: "170px", sortValue: (c) => zaman(c.sonGiris), cell: (c) => <span className="tabular-nums">{c.sonGiris || "—"}</span> },
  ];

  return (
    <>
      <section className="rounded-[8px] bg-[var(--section-bg)] p-2">
        <div className="flex items-center gap-2 px-2 pb-2 pt-1">
          <h2 className="text-[13px] font-semibold">Firmalar</h2>
          <span className="text-[12px] tabular-nums text-muted-foreground">
            {q ? `${liste.length} / ` : ""}{satirlar.length} firma · {toplamKullanici} kullanıcı
          </span>
          <span className="ml-auto flex items-center gap-2">
            {q && <button type="button" className="text-[12px] font-medium text-primary hover:underline" onClick={() => setAdFiltre("")}>Filtreyi temizle</button>}
            <Button variant="outline" size="sm" className="h-7 rounded-[5px] px-2.5 text-[12px]" onClick={() => setFiltreAcik((v) => !v)}>
              {filtreAcik ? "Filtreleri gizle" : "Filtrele"}
            </Button>
          </span>
        </div>
        <Table<Satir>
          data={liste}
          columns={sutunlar}
          getRowId={(c) => c.firmaNo}
          sort={sira ?? undefined}
          onSortChange={setSira}
          onRowClick={(c) => setSecili(c)}
          filterRow={filtreAcik}
          columnDividers
          resizable
          rowHeight={36}
          headerHeight={30}
          height={`${30 + (filtreAcik ? 34 : 0) + Math.min(Math.max(liste.length, 3), 16) * 36 + 2}px`}
          className="rounded-[8px] text-[13px]"
          emptyState={satirlar.length === 0 ? "Bu sunucuda firma OU'su yok." : "Filtreye uyan firma yok."}
        />
        <p className="px-2 pt-2 text-[11px] text-muted-foreground">Kullanıcıları görmek için bir firmaya tıklayın.</p>
      </section>

      <Sheet open={secili !== null} onOpenChange={(o) => { if (!o) setSecili(null); }}>
        <SheetContent className="!w-[560px] !max-w-[560px]">
          <SheetHeader>
            <SheetTitle>{secili?.ad ?? secili?.firmaNo}</SheetTitle>
            <SheetDescription>{secili ? `${secili.firmaNo} · ${secili.userCount} kullanıcı · ${secili.aktif} aktif` : ""}</SheetDescription>
          </SheetHeader>
          <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
            <div className="overflow-hidden rounded-[5px] border">
              <ul className="divide-y">
                {(secili?.users ?? []).map((u) => (
                  <li key={u.username} className="flex items-center gap-3 px-3 py-2 text-[13px]">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{u.username}</p>
                      <p className="truncate text-[12px] text-muted-foreground">{u.displayName || "—"}</p>
                    </div>
                    <span className="shrink-0 text-[12px] tabular-nums text-muted-foreground">{u.lastLogin || "—"}</span>
                    <span className={`inline-flex shrink-0 rounded-[5px] px-2 py-0.5 text-[11px] font-medium ${u.enabled ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" : "bg-muted text-muted-foreground"}`}>
                      {u.enabled ? "Aktif" : "Pasif"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            {secili && (
              <Button asChild variant="outline" className="gap-1.5">
                <Link href={`/companies?firkod=${secili.firmaNo}`}>Firma detayına git (şifre, durum işlemleri) <ArrowRight className="size-3.5" /></Link>
              </Button>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
