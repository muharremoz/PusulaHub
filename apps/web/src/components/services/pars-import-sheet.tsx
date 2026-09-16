"use client"

import { useEffect, useMemo, useState } from "react"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "@/components/ui/sheet"
import { Combobox } from "@/components/ui/combobox"
import { Checkbox } from "@/components/shared/form"
import { Skeleton } from "@/components/ui/skeleton"
import { AlertTriangle, Loader2, Building2, Search, X, Download } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import type { WizardServiceDto } from "@/app/api/services/route"
import type { ParsMevcutSatir } from "@/app/api/setup/pars/mevcut/route"
import type { ParsBaglanti } from "@/lib/pars-katalog"

/**
 * Pars'ta (Ayar.mdb) var olan kullanıcıları Hub'a aktarma paneli.
 *
 * Pars yıllardır kullanılıyor ama Hub yalnız kendi yazdığı kullanıcıları
 * biliyordu; firma detayında "Pars" hizmeti görünmüyordu. Burada her kullanıcı
 * gördüğü datanın adından (`3745_SEYIDOGLU26` → 3745) firmaya eşlenir,
 * eşleşmeyende firma elle seçilir. Ayar.mdb'ye hiçbir şey yazılmaz.
 */

interface FirmaSecenek { firkod: string; firma: string }

interface Props {
  open:         boolean
  onOpenChange: (open: boolean) => void
  service:      WizardServiceDto | null
  onImported?:  () => void
}

export function ParsImportSheet({ open, onOpenChange, service, onImported }: Props) {
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [rows, setRows]         = useState<ParsMevcutSatir[]>([])
  const [baglanti, setBaglanti] = useState<ParsBaglanti | null>(null)
  const [firmalar, setFirmalar] = useState<FirmaSecenek[]>([])
  const [secili, setSecili]     = useState<Set<number>>(new Set())
  /** parsUserId → elle seçilen firma kodu (tespit edileni de ezer) */
  const [firmaSecim, setFirmaSecim] = useState<Record<number, string>>({})
  const [arama, setArama]       = useState("")
  const [aktariliyor, setAktariliyor] = useState(false)

  useEffect(() => {
    if (!open || !service) return
    setLoading(true); setError(null); setRows([]); setSecili(new Set()); setFirmaSecim({}); setArama("")
    Promise.all([
      fetch(`/api/setup/pars/mevcut?serviceId=${service.id}`, { cache: "no-store" }).then(async (r) => {
        const d = await r.json()
        if (!r.ok || d?.error) throw new Error(d?.error ?? "Pars kullanıcıları alınamadı")
        return d as { baglanti: ParsBaglanti; users: ParsMevcutSatir[] }
      }),
      fetch("/api/firma/companies?all=true", { cache: "no-store" }).then((r) => r.ok ? r.json() : []),
    ])
      .then(([d, f]) => {
        setRows(d.users)
        setBaglanti(d.baglanti)
        setFirmalar(Array.isArray(f) ? (f as FirmaSecenek[]) : [])
        // Firması tespit edilmiş ve Hub'da kayıtlı olmayanlar varsayılan seçili
        setSecili(new Set(d.users.filter((u) => !u.hubFirmaId && u.firmaVar).map((u) => u.parsUserId)))
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false))
  }, [open, service])

  /** Elle seçim > datadan/addan tespit > ad benzerliği tahmini */
  const firmaKoduOf = (r: ParsMevcutSatir) => firmaSecim[r.parsUserId] ?? r.firmaKodlari[0] ?? r.firmaTahmini?.kod ?? ""
  /** Satır yalnız tahmine mi dayanıyor — otomatik seçilmez, operatör onaylar */
  const tahminMi = (r: ParsMevcutSatir) => !firmaSecim[r.parsUserId] && r.firmaKodlari.length === 0 && !!r.firmaTahmini
  const firmaAdiOf  = (r: ParsMevcutSatir) => {
    const kod = firmaKoduOf(r)
    if (!kod) return null
    return firmalar.find((f) => f.firkod === kod)?.firma ?? (kod === r.firmaKodlari[0] ? r.firmaAdi : null)
  }

  const filtreli = useMemo(() => {
    const q = arama.trim().toLocaleLowerCase("tr-TR")
    if (!q) return rows
    return rows.filter((r) =>
      r.username.toLocaleLowerCase("tr-TR").includes(q) ||
      r.datalar.join(" ").toLocaleLowerCase("tr-TR").includes(q) ||
      firmaKoduOf(r).includes(q) ||
      (firmaAdiOf(r) ?? "").toLocaleLowerCase("tr-TR").includes(q))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, arama, firmaSecim, firmalar])

  const aktarilabilir = rows.filter((r) => !r.hubFirmaId && !!firmaKoduOf(r))
  const seciliGecerli = aktarilabilir.filter((r) => secili.has(r.parsUserId))
  const zatenVar      = rows.filter((r) => r.hubFirmaId).length
  const firmasiz      = rows.filter((r) => !r.hubFirmaId && !firmaKoduOf(r)).length

  const topluSec = (sec: boolean) =>
    setSecili(sec ? new Set(aktarilabilir.map((r) => r.parsUserId)) : new Set())

  const aktar = async () => {
    if (!service || seciliGecerli.length === 0) return
    setAktariliyor(true)
    try {
      const r = await fetch("/api/setup/pars/mevcut", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceId: service.id,
          kayitlar: seciliGecerli.map((u) => ({
            parsUserId: u.parsUserId, username: u.username, tipi: u.tipi,
            companyId: firmaKoduOf(u), datalar: u.datalar,
          })),
        }),
      })
      const d = await r.json()
      if (!r.ok || d?.error) throw new Error(d?.error ?? "Aktarım başarısız")
      toast.success(`${d.eklenen} kullanıcı Hub'a aktarıldı`, {
        description: d.atlanan ? `${d.atlanan} kayıt zaten vardı, atlandı` : "Firma detayında Hizmetler sekmesinde görünür",
      })
      onImported?.()
      onOpenChange(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setAktariliyor(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="!w-[900px] !max-w-[900px]">
        <SheetHeader>
          <span className="bg-primary/10 text-primary ring-primary/20 flex size-9 shrink-0 items-center justify-center rounded-[5px] ring-1">
            <Download className="size-[18px]" />
          </span>
          <SheetTitle>Pars Kullanıcılarını Hub&apos;a Aktar</SheetTitle>
          <SheetDescription>
            Ayar.mdb&apos;deki kullanıcılar gördükleri veritabanının adından firmaya eşlendi. Ayar.mdb&apos;ye hiçbir şey yazılmaz.
            {baglanti?.adres && <> · <span className="font-mono">{baglanti.adres}</span></>}
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
          {error && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-[5px] border border-red-500/25 bg-red-500/15 text-[11px] text-red-600 dark:text-red-400">
              <AlertTriangle className="size-3.5 shrink-0" />
              {error}
            </div>
          )}

          {loading ? (
            <div className="rounded-[5px] border border-border/50 overflow-hidden divide-y divide-border/40">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-3 py-2">
                  <Skeleton className="size-4 rounded-[4px]" />
                  <Skeleton className="h-3 w-32 rounded-[5px]" />
                  <Skeleton className="h-3 flex-1 rounded-[5px]" />
                  <Skeleton className="h-3 w-40 rounded-[5px]" />
                </div>
              ))}
            </div>
          ) : rows.length === 0 && !error ? (
            <p className="text-[12px] text-muted-foreground text-center py-8">Pars&apos;ta kullanıcı bulunamadı.</p>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3">
                <span className="text-[11px] text-muted-foreground">
                  <span className="font-semibold text-foreground">{rows.length}</span> kullanıcı ·{" "}
                  <span className="font-semibold text-foreground">{seciliGecerli.length}</span> seçili
                  {zatenVar > 0 && <> · {zatenVar} zaten Hub&apos;da</>}
                  {firmasiz > 0 && <> · <span className="text-amber-600 dark:text-amber-400">{firmasiz} firma seçilmeli</span></>}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => topluSec(seciliGecerli.length !== aktarilabilir.length)}
                    className="text-[10px] font-medium text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {seciliGecerli.length === aktarilabilir.length ? "Tümünü Kaldır" : "Tümünü Seç"}
                  </button>
                  <div className="relative w-56">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3 text-muted-foreground pointer-events-none" />
                    <input
                      value={arama}
                      onChange={(e) => setArama(e.target.value)}
                      placeholder="Kullanıcı, firma, data ara…"
                      className="w-full h-7 pl-6 pr-6 text-[11px] rounded-[5px] border border-border bg-background outline-none focus:border-foreground/60 transition-colors"
                    />
                    {arama && (
                      <button type="button" onClick={() => setArama("")} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                        <X className="size-3" />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="rounded-[5px] border border-border/50 overflow-hidden">
                <div className="grid grid-cols-[28px_170px_1fr_230px_90px] gap-2 px-3 py-1.5 bg-muted/20 border-b border-border text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                  <span /><span>Kullanıcı</span><span>Gördüğü veritabanları</span><span>Firma</span><span>Durum</span>
                </div>
                <div className="divide-y divide-border/40">
                  {filtreli.map((r) => {
                    const kod = firmaKoduOf(r)
                    const ad  = firmaAdiOf(r)
                    const kayitli = !!r.hubFirmaId
                    const isSel = secili.has(r.parsUserId)
                    return (
                      <div key={r.parsUserId} className={cn("grid grid-cols-[28px_170px_1fr_230px_90px] gap-2 px-3 py-2 items-center", isSel && !kayitli && "bg-foreground/[0.03]")}>
                        <Checkbox
                          checked={isSel && !kayitli}
                          disabled={kayitli || !kod}
                          onCheckedChange={() => setSecili((p) => {
                            const n = new Set(p)
                            if (n.has(r.parsUserId)) n.delete(r.parsUserId); else n.add(r.parsUserId)
                            return n
                          })}
                        />
                        <span className="min-w-0">
                          <span className="block text-[12px] font-mono truncate">{r.username}</span>
                          <span className="text-[10px] text-muted-foreground">{r.tipi === 1 ? "admin" : "kullanıcı"} · #{r.parsUserId}</span>
                        </span>
                        <span className="text-[11px] text-muted-foreground font-mono truncate" title={r.datalar.join(", ")}>
                          {r.datalar.length ? r.datalar.join(", ") : <span className="text-amber-600 dark:text-amber-400">data yok</span>}
                        </span>
                        <span className="min-w-0">
                          {kayitli ? (
                            <span className="text-[11px] font-mono">{r.hubFirmaId}</span>
                          ) : (
                            <Combobox
                              items={firmalar}
                              getKey={(f) => f.firkod}
                              getLabel={(f) => `${f.firkod} ${f.firma}`}
                              value={kod}
                              onChange={(v) => setFirmaSecim((p) => ({ ...p, [r.parsUserId]: v }))}
                              placeholder="Firma seç…"
                              searchPlaceholder="Firma ara…"
                              renderValue={(f) => <span className="truncate text-[12px]"><span className="font-mono">{f.firkod}</span> {f.firma}</span>}
                              renderItem={(f) => <span className="truncate text-[12px]"><span className="font-mono">{f.firkod}</span> {f.firma}</span>}
                              className={cn("h-7", !kod && "border-amber-500/50")}
                            />
                          )}
                          {!kayitli && kod && !ad && (
                            <span className="text-[10px] text-amber-600 dark:text-amber-400">Hub&apos;da bu kodla firma yok</span>
                          )}
                          {!kayitli && tahminMi(r) && (
                            <span className="text-[10px] text-amber-600 dark:text-amber-400">ad benzerliği — doğrula</span>
                          )}
                        </span>
                        <span className="text-[10px]">
                          {kayitli
                            ? <span className="inline-flex rounded-[5px] bg-emerald-500/15 px-1.5 py-0.5 font-medium text-emerald-700 dark:text-emerald-400">Hub&apos;da</span>
                            : tahminMi(r)
                              ? <span className="inline-flex rounded-[5px] bg-amber-500/15 px-1.5 py-0.5 font-medium text-amber-700 dark:text-amber-400" title={`Ad benzerliği: ${r.firmaTahmini?.data}`}>tahmin</span>
                              : kod
                                ? <span className="inline-flex rounded-[5px] bg-muted px-1.5 py-0.5 text-muted-foreground">aktarılacak</span>
                                : <span className="inline-flex rounded-[5px] bg-amber-500/15 px-1.5 py-0.5 font-medium text-amber-700 dark:text-amber-400">firma?</span>}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            </>
          )}
        </div>

        <SheetFooter className="flex-row">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="flex-1 text-[11px] font-medium py-2 rounded-[5px] border border-border/60 hover:bg-muted/40 transition-colors text-muted-foreground hover:text-foreground"
          >
            Kapat
          </button>
          <button
            type="button"
            disabled={aktariliyor || seciliGecerli.length === 0}
            onClick={aktar}
            className="flex-1 flex items-center justify-center gap-1.5 text-[11px] font-semibold py-2 rounded-[5px] bg-primary text-primary-foreground hover:bg-foreground/90 transition-colors disabled:opacity-40 disabled:pointer-events-none"
          >
            {aktariliyor ? <Loader2 className="size-3.5 animate-spin" /> : <Building2 className="size-3.5" />}
            {seciliGecerli.length > 0 ? `${seciliGecerli.length} Kullanıcıyı Aktar` : "Aktar"}
          </button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
