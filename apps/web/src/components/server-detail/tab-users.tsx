"use client";

import { useState } from "react";
import Link from "next/link";
import { Info } from "lucide-react";
import { Table, InlineTextFilter, InlineSelectFilter, type TableColumn, type SortState } from "@muharremoz/pusula-ui";
import { Button } from "@/components/ui/button";
import type { AgentReport } from "@/lib/agent-types";

/**
 * Sunucu detay — Kullanıcılar (salt okunur liste).
 *
 * AD rolündeki sunucuda AD kullanıcıları, değilse yerel kullanıcılar.
 * Eski sekmedeki "Şifre Sıfırla / Devre Dışı Bırak" hiçbir şey yapmıyordu;
 * kaldırıldı — bu işlemler firma detayında (Firmalar → Kullanıcılar) çalışır,
 * firma koduna tıklayınca oraya gidilir.
 */

type ADUser = NonNullable<AgentReport["ad"]>["users"][number];
type LocalUser = NonNullable<AgentReport["localUsers"]>[number];
type Satir = { username: string; displayName: string; firkod: string | null; aciklama: string; enabled: boolean; lastLogin: string };

interface Props {
  users: ADUser[];
  localUsers: AgentReport["localUsers"] | null;
  firmaMap: Record<string, string>;
}

export function TabUsers({ users, localUsers, firmaMap }: Props) {
  const [filtreAcik, setFiltreAcik] = useState(false);
  const [adFiltre, setAdFiltre] = useState("");
  const [durumFiltre, setDurumFiltre] = useState<string[]>([]);
  const [sira, setSira] = useState<SortState | null>({ key: "username", direction: "asc" });

  const isAD = users.length > 0;
  const satirlar: Satir[] = isAD
    ? users.map((u) => ({ username: u.username, displayName: u.displayName, firkod: u.ou?.trim() || null, aciklama: "", enabled: u.enabled, lastLogin: u.lastLogin }))
    : (localUsers ?? []).map((u: LocalUser) => ({ username: u.username, displayName: u.displayName, firkod: null, aciklama: u.description, enabled: u.enabled, lastLogin: u.lastLogin }));

  const q = adFiltre.trim().toLocaleLowerCase("tr-TR");
  const liste = satirlar.filter((u) => {
    if (q && !`${u.username} ${u.displayName} ${u.firkod ?? ""} ${u.firkod ? firmaMap[u.firkod] ?? "" : ""} ${u.aciklama}`.toLocaleLowerCase("tr-TR").includes(q)) return false;
    if (durumFiltre.length && !durumFiltre.includes(u.enabled ? "aktif" : "pasif")) return false;
    return true;
  });
  const aktif = satirlar.filter((u) => u.enabled).length;
  const filtreSayisi = (q ? 1 : 0) + (durumFiltre.length ? 1 : 0);

  const sutunlar: TableColumn<Satir>[] = [
    {
      key: "username", header: "Kullanıcı", sortable: true, width: "200px",
      filter: <InlineTextFilter value={adFiltre} onChange={setAdFiltre} placeholder="Kullanıcı, ad, firma…" />,
      cell: (u) => <span className="block truncate font-medium">{u.username}</span>,
    },
    { key: "displayName", header: "Ad soyad", sortable: true, cell: (u) => <span className="block truncate">{u.displayName || "—"}</span> },
    isAD
      ? {
          key: "firma", header: "Firma", sortable: true, sortValue: (u) => (u.firkod ? firmaMap[u.firkod] ?? u.firkod : ""),
          cell: (u) => u.firkod
            ? (
              <Link href={`/companies?firkod=${u.firkod}`} className="flex min-w-0 items-center gap-2 hover:underline">
                <span className="shrink-0 tabular-nums text-muted-foreground">{u.firkod}</span>
                <span className="truncate">{firmaMap[u.firkod] ?? "—"}</span>
              </Link>
            )
            : <span className="text-muted-foreground">—</span>,
        }
      : { key: "aciklama", header: "Açıklama", cell: (u) => <span className="block truncate text-muted-foreground">{u.aciklama || "—"}</span> },
    { key: "lastLogin", header: "Son giriş", sortable: true, width: "170px", cell: (u) => <span className="tabular-nums">{u.lastLogin || "—"}</span> },
    {
      key: "enabled", header: "Durum", sortable: true, align: "center", width: "110px", sortValue: (u) => (u.enabled ? 1 : 0),
      filter: <InlineSelectFilter options={["aktif", "pasif"] as const} selected={durumFiltre} onChange={setDurumFiltre} getLabel={(o) => (o === "aktif" ? "Aktif" : "Pasif")} />,
      cell: (u) => (
        <span className={`inline-flex rounded-[5px] px-2 py-0.5 text-[11px] font-medium ${u.enabled ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" : "bg-muted text-muted-foreground"}`}>
          {u.enabled ? "Aktif" : "Pasif"}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-2">
      {!isAD && satirlar.length > 0 && (
        <div className="flex items-center gap-2 rounded-[5px] bg-amber-500/15 px-3 py-2 text-[12px] text-amber-800 dark:text-amber-400">
          <Info className="size-3.5 shrink-0" />
          Bu sunucu Active Directory rolü taşımıyor; yerel kullanıcılar listeleniyor.
        </div>
      )}
      <section className="rounded-[8px] bg-[var(--section-bg)] p-2">
        <div className="flex items-center gap-2 px-2 pb-2 pt-1">
          <h2 className="text-[13px] font-semibold">{isAD ? "AD kullanıcıları" : "Yerel kullanıcılar"}</h2>
          <span className="text-[12px] tabular-nums text-muted-foreground">
            {filtreSayisi ? `${liste.length} / ` : ""}{satirlar.length} kullanıcı · {aktif} aktif · {satirlar.length - aktif} pasif
          </span>
          <span className="ml-auto flex items-center gap-2">
            {filtreSayisi > 0 && (
              <button type="button" className="text-[12px] font-medium text-primary hover:underline" onClick={() => { setAdFiltre(""); setDurumFiltre([]); }}>
                Filtreleri temizle
              </button>
            )}
            <Button variant="outline" size="sm" className="h-7 rounded-[5px] px-2.5 text-[12px]" onClick={() => setFiltreAcik((v) => !v)}>
              {filtreAcik ? "Filtreleri gizle" : "Filtrele"}
            </Button>
          </span>
        </div>
        <Table<Satir>
          data={liste}
          columns={sutunlar}
          getRowId={(u) => u.username}
          sort={sira ?? undefined}
          onSortChange={setSira}
          filterRow={filtreAcik}
          columnDividers
          resizable
          rowHeight={36}
          headerHeight={30}
          height={`${30 + (filtreAcik ? 34 : 0) + Math.min(Math.max(liste.length, 3), 16) * 36 + 2}px`}
          className="rounded-[8px] text-[13px]"
          emptyState={satirlar.length === 0 ? "Kullanıcı verisi henüz alınamadı." : "Filtreye uyan kullanıcı yok."}
        />
      </section>
    </div>
  );
}
