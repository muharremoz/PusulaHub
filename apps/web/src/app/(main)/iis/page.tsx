"use client"

import { useEffect, useState, useCallback, useMemo } from "react"
import { PageContainer } from "@/components/layout/page-container"
import { Skeleton } from "@/components/ui/skeleton"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@muharremoz/pusula-ui"
import { cn } from "@/lib/utils"
import {
  MoreVertical,
  Globe,
  Plus,
  RefreshCw,
  AlertTriangle,
} from "lucide-react"
import { ListeKarti, ListeAksiyonButonu, ListeThead, ListeBosSatir } from "@/components/shared/liste-karti"
import { MetinFiltre, SecimFiltre } from "@/components/shared/liste-filtreleri"
import { IISSiteSheet } from "@/components/iis/iis-site-sheet"
import type { IISSiteDto } from "@/app/api/iis/sites/route"

/* ── Tipler ── */
type SortKey = "name" | "server" | "appPool" | "status"
type SortDir = "asc" | "desc"

/* ── Durum renkleri ── */
const SITE_STATUS_BADGE: Record<string, string> = {
  Started: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/25",
  Stopped: "bg-muted text-muted-foreground border-border",
  Unknown: "bg-muted text-muted-foreground border-border",
}
const SITE_STATUS_DOT: Record<string, string> = {
  Started: "bg-emerald-500",
  Stopped: "bg-slate-300",
  Unknown: "bg-slate-300",
}
const SITE_STATUS_LABEL: Record<string, string> = {
  Started: "Çalışıyor",
  Stopped: "Durduruldu",
  Unknown: "Bilinmiyor",
}

/* ── Ana Bileşen ── */
export default function IISPage() {
  const [sites,   setSites]   = useState<IISSiteDto[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  const [sortKey, setSortKey] = useState<SortKey>("name")
  const [sortDir, setSortDir] = useState<SortDir>("asc")
  const [sheetOpen, setSheetOpen] = useState(false)

  const fetchSites = useCallback(() => {
    setLoading(true)
    setError(null)
    fetch("/api/iis/sites")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setSites(data as IISSiteDto[])
        else setError((data as { error?: string }).error ?? "IIS siteleri alınamadı")
      })
      .catch(() => setError("API bağlantı hatası"))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { fetchSites() }, [fetchSites])

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    else { setSortKey(key); setSortDir("asc") }
  }

  /* Sütun başlığı filtreleri — liste tasarım deseni standardı. */
  const [adFiltre,      setAdFiltre]      = useState("")
  const [sunucuFiltre,  setSunucuFiltre]  = useState<string[]>([])
  const [firmaFiltre,   setFirmaFiltre]   = useState("")
  const [durumFiltre,   setDurumFiltre]   = useState<string[]>([])

  const sunucular = useMemo(
    () => [...new Set(sites.map((s) => s.server).filter(Boolean))].sort((a, b) => a.localeCompare(b, "tr")),
    [sites],
  )
  const durumlar = useMemo(
    () => [...new Set(sites.map((s) => s.status).filter(Boolean))].sort(),
    [sites],
  )

  const sorted = useMemo(() => {
    const ad = adFiltre.trim().toLocaleLowerCase("tr-TR")
    const fr = firmaFiltre.trim().toLocaleLowerCase("tr-TR")
    return [...sites]
      .filter((x) => {
        if (ad && !x.name.toLocaleLowerCase("tr-TR").includes(ad)) return false
        if (fr && !(x.firma ?? "").toLocaleLowerCase("tr-TR").includes(fr)) return false
        if (sunucuFiltre.length && !sunucuFiltre.includes(x.server)) return false
        if (durumFiltre.length && !durumFiltre.includes(x.status)) return false
        return true
      })
      .sort((a, b) => {
        const mul = sortDir === "asc" ? 1 : -1
        return String(a[sortKey]).localeCompare(String(b[sortKey]), "tr") * mul
      })
  }, [sites, adFiltre, firmaFiltre, sunucuFiltre, durumFiltre, sortKey, sortDir])

  return (
    <PageContainer title="IIS Yönetimi" description="Web siteleri ve uygulama havuzları">

      <ListeKarti
        baslik="Web Siteleri"
        ikon={<Globe className="size-3.5" />}
        toplam={sites.length}
        filtreli={sorted.length}
        aksiyon={
          <>
            <button
              onClick={fetchSites}
              disabled={loading}
              className="text-muted-foreground hover:text-foreground hover:bg-muted/40 border-border/60 inline-flex items-center gap-1.5 rounded-[5px] border px-2.5 py-1 text-[12px] font-medium transition-colors disabled:opacity-40"
            >
              <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
              Yenile
            </button>
            <ListeAksiyonButonu onClick={() => setSheetOpen(true)}>
              <Plus className="size-3.5" />Yeni Site
            </ListeAksiyonButonu>
          </>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full text-[14px] font-medium leading-[20px]">
            <ListeThead>
              <th className="px-4 py-1.5 text-left font-medium">
                <MetinFiltre label="Site Adı" value={adFiltre} onChange={setAdFiltre} />
              </th>
              <th className="px-4 py-1.5 text-left font-medium">
                <SecimFiltre
                  label="Sunucu"
                  options={sunucular}
                  getLabel={(o) => o}
                  selected={sunucuFiltre}
                  onChange={(v) => setSunucuFiltre(v as string[])}
                  aranabilir
                />
              </th>
              <th className="px-4 py-1.5 text-left font-medium">
                <MetinFiltre label="Firma" value={firmaFiltre} onChange={setFirmaFiltre} />
              </th>
              <th className="px-4 py-1.5 text-left font-medium">Hizmet</th>
              <th className="px-4 py-1.5 text-left font-medium">Binding</th>
              <th className="px-4 py-1.5 text-left font-medium">
                <SecimFiltre
                  label="Durum"
                  options={durumlar}
                  getLabel={(o) => SITE_STATUS_LABEL[o] ?? o}
                  selected={durumFiltre}
                  onChange={(v) => setDurumFiltre(v as string[])}
                />
              </th>
              <th className="px-4 py-1.5 text-right font-medium">İşlem</th>
            </ListeThead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 6 }).map((_, j) => (
                      <td key={j} className="px-4 py-1.5"><Skeleton className="h-3 w-full rounded-[5px]" /></td>
                    ))}
                    <td />
                  </tr>
                ))
              ) : error ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-[13px] text-red-600 dark:text-red-400">
                    <span className="inline-flex items-center gap-2">
                      <AlertTriangle className="size-3.5 shrink-0" />{error}
                    </span>
                  </td>
                </tr>
              ) : sorted.length === 0 ? (
                <ListeBosSatir
                  sutunSayisi={7}
                  toplam={sites.length}
                  bosMesaj="IIS sitesi bulunamadı — IIS rolündeki sunuculardan henüz veri gelmedi."
                />
              ) : sorted.map((site) => (
                <tr key={site.id} className="hover:bg-muted/70 transition-colors">
                  <td className="px-4 py-1.5 whitespace-nowrap">
                    <span className="flex items-center gap-2">
                      <span className={cn("size-1.5 shrink-0 rounded-full", SITE_STATUS_DOT[site.status] ?? "bg-slate-300")} />
                      <span className="font-medium">{site.name}</span>
                    </span>
                  </td>
                  <td className="text-muted-foreground px-4 py-1.5 whitespace-nowrap font-mono text-[12px]">{site.server}</td>
                  <td className="text-muted-foreground px-4 py-1.5 whitespace-nowrap font-mono text-[12px]">{site.firma || "—"}</td>
                  <td className="px-4 py-1.5">
                    {site.hizmet
                      ? <span className="text-muted-foreground inline-flex rounded-[5px] bg-muted px-1.5 py-0.5 text-[11px] font-medium">{site.hizmet}</span>
                      : <span className="text-muted-foreground/40 text-[12px]">—</span>}
                  </td>
                  <td className="text-muted-foreground px-4 py-1.5 font-mono text-[12px] max-w-64 truncate">{site.binding || "—"}</td>
                  <td className="px-4 py-1.5 whitespace-nowrap">
                    <span className={cn(
                      "inline-flex rounded-[5px] px-2 py-0.5 text-[11px] font-medium",
                      SITE_STATUS_BADGE[site.status] ?? "bg-muted text-muted-foreground",
                    )}>
                      {SITE_STATUS_LABEL[site.status] ?? site.status}
                    </span>
                  </td>
                  <td className="px-4 py-1.5 text-right whitespace-nowrap">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="text-muted-foreground hover:bg-muted/60 rounded-[5px] p-1 transition-colors">
                          <MoreVertical className="size-4" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" sideOffset={4} className="w-44 text-[12px]">
                        {site.status === "Stopped"
                          ? <DropdownMenuItem className="gap-2 text-emerald-600 dark:text-emerald-400">Başlat</DropdownMenuItem>
                          : <DropdownMenuItem className="gap-2 text-amber-600 dark:text-amber-400">Durdur</DropdownMenuItem>}
                        <DropdownMenuItem className="gap-2">Yeniden Başlat</DropdownMenuItem>
                        <DropdownMenuItem className="text-muted-foreground gap-2" disabled>
                          Log Dosyaları (yakında)
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ListeKarti>

      <IISSiteSheet open={sheetOpen} onOpenChange={setSheetOpen} onSaved={fetchSites} />

    </PageContainer>
  )
}
