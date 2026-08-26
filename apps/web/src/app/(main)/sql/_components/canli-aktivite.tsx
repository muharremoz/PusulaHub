"use client"

/**
 * SQL Server — Canlı Aktivite
 *
 * "Kim bağlı, ne kadar yoğun" sorusunun ekrandaki karşılığı.
 *
 * İki şeyi bilerek ayırıyoruz:
 *   • TOPLAM OTURUM yük ölçüsü DEĞİLDİR. Uygulama bağlantı havuzu kullandığı
 *     için yüzlerce oturum açık ama boşta durabilir (ölçüldü: 332 oturum / 3
 *     çalışan). Yükün ölçüsü AKTİF sayısıdır; kart da bunu vurguluyor.
 *   • Kırılım kullanıcı değil VERİTABANI bazında. Uygulama SQL'e tek ortak
 *     kimlikle (sa) ve tek makineden bağlandığı için kullanıcı ayrımı SQL
 *     tarafında yapılamıyor; ayırt edilebilir en ince birim veritabanı = firma.
 *
 * Yenileme 30 sn (CLAUDE.md #2 — bağlı sunucularda yoğun polling yasak) ve
 * sekme görünmezken duruyor.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import { Activity, AlertTriangle, Database, Gauge, RefreshCw, Users } from "lucide-react"
import { ListeKarti, ListeThead, ListeBosSatir } from "@/components/shared/liste-karti"
import { StatsCard } from "@/components/shared/stats-card"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/combobox-select"
import { cn } from "@/lib/utils"
import type { SqlServerItem } from "@/app/api/setup/sql-servers/route"
import type { SqlActivityResponse } from "@/app/api/sql/activity/route"

const YENILEME_MS = 30_000

/** Uzun süren istek görsel olarak öne çıksın — takılan sorgu aranmadan görünsün. */
function sureRengi(sn: number): string {
  if (sn >= 30) return "text-rose-600 dark:text-rose-400"
  if (sn >= 5)  return "text-amber-600 dark:text-amber-400"
  return "text-muted-foreground"
}

export function CanliAktivite({
  servers,
  loading: serversLoading,
}: {
  servers: SqlServerItem[]
  loading: boolean
}) {
  const [serverId, setServerId] = useState<string>("")
  const [veri,     setVeri]     = useState<SqlActivityResponse | null>(null)
  const [hata,     setHata]     = useState<string | null>(null)
  const [ilkYukleme, setIlkYukleme] = useState(true)
  const [yenileniyor, setYenileniyor] = useState(false)

  /* Çevrimiçi ilk sunucuyu seç */
  useEffect(() => {
    if (serverId || servers.length === 0) return
    const ilk = servers.find((s) => s.isOnline) ?? servers[0]
    if (ilk) setServerId(ilk.id)
  }, [servers, serverId])

  const yukle = useCallback(async (id: string) => {
    if (!id) return
    setYenileniyor(true)
    try {
      const r = await fetch(`/api/sql/activity?serverId=${encodeURIComponent(id)}`, { cache: "no-store" })
      const d = await r.json()
      if (!r.ok) { setHata((d as { error?: string }).error ?? "Aktivite alınamadı"); setVeri(null) }
      else { setVeri(d as SqlActivityResponse); setHata(null) }
    } catch {
      setHata("Sunucuya ulaşılamadı")
    } finally {
      setYenileniyor(false)
      setIlkYukleme(false)
    }
  }, [])

  /* Otomatik yenileme — sekme görünmezken durur, geri gelince hemen tazeler. */
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  useEffect(() => {
    if (!serverId) return
    setIlkYukleme(true)
    yukle(serverId)

    const basla = () => {
      if (timerRef.current) return
      timerRef.current = setInterval(() => yukle(serverId), YENILEME_MS)
    }
    const dur = () => {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    }
    const gorunurluk = () => {
      if (document.hidden) dur()
      else { yukle(serverId); basla() }
    }

    basla()
    document.addEventListener("visibilitychange", gorunurluk)
    return () => { dur(); document.removeEventListener("visibilitychange", gorunurluk) }
  }, [serverId, yukle])

  const o = veri?.ozet

  return (
    <div className="space-y-4">

      {/* ── Üst şerit: sunucu seçimi + yenileme ── */}
      <div className="flex items-center gap-2">
        {serversLoading ? (
          <Skeleton className="h-8 w-56 rounded-[5px]" />
        ) : (
          <Select value={serverId} onValueChange={setServerId}>
            <SelectTrigger className="h-8 w-56 text-[13px]">
              <SelectValue placeholder="SQL sunucusu seç" />
            </SelectTrigger>
            <SelectContent>
              {servers.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}{!s.isOnline && " (çevrimdışı)"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <button
          onClick={() => yukle(serverId)}
          disabled={!serverId || yenileniyor}
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-[12px] transition-colors disabled:opacity-50"
        >
          <RefreshCw className={cn("size-3.5", yenileniyor && "animate-spin")} />
          Yenile
        </button>

        <span className="text-muted-foreground/70 ml-auto text-[11px] tabular-nums">
          {veri ? `${new Date(veri.alindi).toLocaleTimeString("tr-TR")} · 30 sn'de bir` : "—"}
        </span>
      </div>

      {hata && (
        <div className="rounded-[8px] border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-[13px] text-rose-700 dark:text-rose-400">
          {hata}
        </div>
      )}

      {/* ── KPI ── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatsCard
          title="ŞU AN ÇALIŞAN"
          value={ilkYukleme ? "—" : (o?.aktif ?? 0)}
          icon={<Activity className="h-4 w-4" />}
          subtitle="Gerçek yük göstergesi"
        />
        <StatsCard
          title="AÇIK OTURUM"
          value={ilkYukleme ? "—" : (o?.toplamOturum ?? 0)}
          icon={<Users className="h-4 w-4" />}
          subtitle={o ? `${o.makine} makine · ${o.veritabani} veritabanı` : "Çoğu havuzda boşta"}
        />
        <StatsCard
          title="BLOKLANAN"
          value={ilkYukleme ? "—" : (o?.bloklanan ?? 0)}
          icon={<AlertTriangle className="h-4 w-4" />}
          trend={o && o.bloklanan > 0 ? { value: "Bekleyen sorgu var", positive: false } : undefined}
          subtitle="Kilit bekleyen"
        />
        <StatsCard
          title="CPU"
          value={ilkYukleme || o?.cpuYuzde == null ? "—" : `%${o.cpuYuzde}`}
          icon={<Gauge className="h-4 w-4" />}
          subtitle={o?.bellekMB ? `${(o.bellekMB / 1024).toFixed(1)} GB bellek` : "SQL Server süreci"}
        />
      </div>

      {/* ── Firma (veritabanı) kırılımı ── */}
      <ListeKarti
        baslik="Veritabanı Yoğunluğu"
        ikon={<Database className="size-3.5" />}
        toplam={veri?.dbYuk.length}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-[14px] font-medium leading-[20px]">
            <ListeThead>
              <th className="px-4 py-1.5 text-left font-medium">Veritabanı</th>
              <th className="px-4 py-1.5 text-right font-medium">Çalışan</th>
              <th className="px-4 py-1.5 text-right font-medium">Oturum</th>
              <th className="px-4 py-1.5 text-right font-medium">CPU (sn)</th>
              <th className="px-4 py-1.5 text-right font-medium">I/O</th>
            </ListeThead>
            <tbody>
              {ilkYukleme ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 5 }).map((_, j) => (
                      <td key={j} className="px-4 py-1.5"><Skeleton className="h-3 w-full rounded-[5px]" /></td>
                    ))}
                  </tr>
                ))
              ) : !veri || veri.dbYuk.length === 0 ? (
                <ListeBosSatir sutunSayisi={5} toplam={0} bosMesaj="Açık oturum yok." />
              ) : veri.dbYuk.map((d) => (
                <tr key={d.db ?? "—"} className="hover:bg-muted/20">
                  <td className="px-4 py-1.5 font-mono text-[13px] whitespace-nowrap">{d.db ?? "—"}</td>
                  <td className={cn("px-4 py-1.5 text-right tabular-nums", d.aktif > 0 && "text-foreground font-semibold")}>
                    {d.aktif > 0 ? d.aktif : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="text-muted-foreground px-4 py-1.5 text-right tabular-nums">{d.oturum}</td>
                  <td className="text-muted-foreground px-4 py-1.5 text-right tabular-nums">{d.cpuSn}</td>
                  <td className="text-muted-foreground px-4 py-1.5 text-right tabular-nums">{d.io.toLocaleString("tr-TR")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ListeKarti>

      {/* ── Şu an çalışan sorgular ── */}
      <ListeKarti
        baslik="Şu An Çalışanlar"
        ikon={<Activity className="size-3.5" />}
        toplam={veri?.istekler.length}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-[14px] font-medium leading-[20px]">
            <ListeThead>
              <th className="px-4 py-1.5 text-left font-medium">SPID</th>
              <th className="px-4 py-1.5 text-left font-medium">Veritabanı</th>
              <th className="px-4 py-1.5 text-right font-medium">Süre</th>
              <th className="px-4 py-1.5 text-left font-medium">Durum</th>
              <th className="px-4 py-1.5 text-left font-medium">Bekleme</th>
              <th className="px-4 py-1.5 text-left font-medium">Sorgu</th>
            </ListeThead>
            <tbody>
              {ilkYukleme ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 6 }).map((_, j) => (
                      <td key={j} className="px-4 py-1.5"><Skeleton className="h-3 w-full rounded-[5px]" /></td>
                    ))}
                  </tr>
                ))
              ) : !veri || veri.istekler.length === 0 ? (
                <ListeBosSatir
                  sutunSayisi={6}
                  toplam={0}
                  bosMesaj="Şu an çalışan sorgu yok — sunucu boşta."
                />
              ) : veri.istekler.map((i) => (
                <tr key={i.spid} className="hover:bg-muted/20">
                  <td className="px-4 py-1.5 font-mono text-[13px]">{i.spid}</td>
                  <td className="px-4 py-1.5 font-mono text-[13px] whitespace-nowrap">{i.db ?? "—"}</td>
                  <td className={cn("px-4 py-1.5 text-right tabular-nums", sureRengi(i.saniye))}>
                    {i.saniye} sn
                  </td>
                  <td className="text-muted-foreground px-4 py-1.5 text-[12px]">
                    {i.durum}
                    {i.bloklayan != null && (
                      <span className="ml-1.5 inline-flex rounded-[5px] bg-rose-500/15 px-2 py-0.5 text-[11px] font-medium text-rose-700 dark:text-rose-400">
                        {i.bloklayan} bekletiyor
                      </span>
                    )}
                  </td>
                  <td className="text-muted-foreground px-4 py-1.5 font-mono text-[11px]">{i.bekleme ?? "—"}</td>
                  <td className="text-muted-foreground max-w-[420px] truncate px-4 py-1.5 font-mono text-[11px]" title={i.sorgu}>
                    {i.sorgu || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ListeKarti>
    </div>
  )
}
