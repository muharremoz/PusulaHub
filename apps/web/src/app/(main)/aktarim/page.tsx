"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { PageContainer } from "@/components/layout/page-container"
import { NestedCard } from "@/components/shared/nested-card"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Command, CommandInput, CommandList, CommandGroup, CommandItem } from "@/components/ui/command"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { copyToClipboard } from "@/lib/clipboard"
import { toast } from "sonner"
import {
  ArrowRightLeft, Plus, Copy, CheckCheck, Link2, X, Trash2,
  Search, Database, HardDrive, Building2, Clock, AlertCircle,
} from "lucide-react"
import { cn } from "@/lib/utils"

interface TransferSession {
  Id:                  string
  Token:               string
  CompanyId:           string
  FirmaName:           string
  SqlServerId:         string | null
  DepoServerId:        string | null
  Status:              "pending" | "active" | "completed" | "cancelled" | "expired"
  CreatedBy:           string | null
  CreatedAt:           string
  ExpiresAt:           string
  CompletedAt:         string | null
  DataBytesTotal:      number
  DataBytesReceived:   number
  ImageFilesTotal:     number
  ImageFilesReceived:  number
  ImageBytesTotal:     number
  ImageBytesReceived:  number
  Notes:               string | null
}

interface FirmaItem { firkod: string; firma: string }
interface ServerOption { id: string; name: string; ip: string }

function formatBytes(b: number): string {
  if (!b || b <= 0) return "0"
  if (b >= 1024 ** 3) return `${(b / 1024 ** 3).toFixed(1)} GB`
  if (b >= 1024 ** 2) return `${(b / 1024 ** 2).toFixed(1)} MB`
  if (b >= 1024) return `${(b / 1024).toFixed(0)} KB`
  return `${b} B`
}

function formatRelative(iso: string): string {
  const t = new Date(iso).getTime()
  const diff = Date.now() - t
  if (diff < 60_000) return "az önce"
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)} dk önce`
  if (diff < 86_400_000) return `${Math.floor(diff / 3600_000)} sa önce`
  return new Date(iso).toLocaleString("tr-TR")
}

function statusBadge(s: TransferSession["Status"]) {
  const map = {
    pending:   { label: "Bekliyor",    cls: "bg-amber-50 text-amber-700 border-amber-200" },
    active:    { label: "Aktif",       cls: "bg-blue-50 text-blue-700 border-blue-200" },
    completed: { label: "Tamamlandı",  cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
    cancelled: { label: "İptal",       cls: "bg-zinc-100 text-zinc-700 border-zinc-200" },
    expired:   { label: "Süresi Doldu", cls: "bg-red-50 text-red-700 border-red-200" },
  }[s]
  return (
    <span className={cn("text-[10px] font-medium px-2 py-0.5 rounded-[4px] border", map.cls)}>
      {map.label}
    </span>
  )
}

function buildPublicUrl(token: string): string {
  // VPN açıkken DNS LAN'a çözer; kapalıyken WAN proxy'sine. İki tarafta da çalışır.
  return `https://aktarim.pusulanet.net/${token}`
}

export default function AktarimPage() {
  const [items, setItems]               = useState<TransferSession[]>([])
  const [loading, setLoading]           = useState(true)
  const [error, setError]               = useState<string | null>(null)
  const [newOpen, setNewOpen]           = useState(false)
  const [cancelTarget, setCancelTarget] = useState<TransferSession | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<TransferSession | null>(null)

  const reload = useCallback(async () => {
    try {
      const r = await fetch("/api/aktarim", { cache: "no-store" })
      const d = await r.json()
      if (!r.ok) throw new Error(d?.error ?? "Yüklenemedi")
      setItems(Array.isArray(d) ? d : [])
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Hata")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    reload()
    // Canlı progress için 5 sn polling
    const id = setInterval(reload, 5000)
    return () => clearInterval(id)
  }, [reload])

  async function handleCancel(id: string) {
    try {
      const r = await fetch(`/api/aktarim/${id}`, { method: "POST" })
      if (!r.ok) throw new Error("İptal başarısız")
      toast.success("Aktarım iptal edildi")
      reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Hata")
    } finally {
      setCancelTarget(null)
    }
  }

  async function handleDelete(id: string) {
    try {
      const r = await fetch(`/api/aktarim/${id}`, { method: "DELETE" })
      if (!r.ok) throw new Error("Silme başarısız")
      toast.success("Aktarım silindi")
      reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Hata")
    } finally {
      setDeleteTarget(null)
    }
  }

  const active = items.filter((i) => i.Status === "active" || i.Status === "pending")
  const past   = items.filter((i) => !["active", "pending"].includes(i.Status))

  return (
    <PageContainer
      title="Firma Aktarım"
      description="Müşterilerden veri (.bak) ve resim klasörü transferi"
    >
      <div className="mb-4 flex items-center justify-end">
        <button
          onClick={() => setNewOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-[5px] bg-[#1d64ff] text-white text-[11px] font-medium hover:bg-[#1d64ff]/90 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          Yeni Aktarım
        </button>
      </div>

      {/* Aktif Aktarımlar */}
      <NestedCard>
        <div className="mb-2 flex items-center gap-2">
          <ArrowRightLeft className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase">
            Aktif ({active.length})
          </span>
        </div>

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-[5px]" />
            ))}
          </div>
        ) : error ? (
          <div className="text-[11px] text-red-600">{error}</div>
        ) : active.length === 0 ? (
          <div className="text-[11px] text-muted-foreground py-6 text-center">
            Aktif aktarım yok. "Yeni Aktarım" ile başlat.
          </div>
        ) : (
          <div className="space-y-2">
            {active.map((s) => (
              <SessionCard
                key={s.Id}
                s={s}
                onCancel={() => setCancelTarget(s)}
                onDelete={() => setDeleteTarget(s)}
              />
            ))}
          </div>
        )}
      </NestedCard>

      {/* Geçmiş */}
      <div className="h-2" />
      <NestedCard>
        <div className="mb-2 flex items-center gap-2">
          <Clock className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase">
            Geçmiş ({past.length})
          </span>
        </div>

        {past.length === 0 ? (
          <div className="text-[11px] text-muted-foreground py-6 text-center">
            Henüz tamamlanmış aktarım yok.
          </div>
        ) : (
          <div className="space-y-2">
            {past.map((s) => (
              <SessionCard
                key={s.Id}
                s={s}
                onCancel={() => setCancelTarget(s)}
                onDelete={() => setDeleteTarget(s)}
              />
            ))}
          </div>
        )}
      </NestedCard>

      <NewTransferDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        onCreated={() => { reload(); setNewOpen(false) }}
      />

      <AlertDialog open={!!cancelTarget} onOpenChange={(o) => !o && setCancelTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Aktarımı iptal et</AlertDialogTitle>
            <AlertDialogDescription>
              {cancelTarget?.FirmaName} firması için oluşturulan aktarım iptal edilecek. Müşteri linki artık çalışmayacak.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Vazgeç</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => cancelTarget && handleCancel(cancelTarget.Id)}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              İptal Et
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Aktarımı sil</AlertDialogTitle>
            <AlertDialogDescription>
              Kayıt tamamen silinecek (geçmişten de kalkar).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Vazgeç</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && handleDelete(deleteTarget.Id)}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              Sil
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageContainer>
  )
}

function SessionCard({
  s, onCancel, onDelete,
}: {
  s: TransferSession
  onCancel: () => void
  onDelete: () => void
}) {
  const [copied, setCopied] = useState(false)
  const url = buildPublicUrl(s.Token)

  const dataPct  = s.DataBytesTotal  > 0 ? Math.round((s.DataBytesReceived  / s.DataBytesTotal) * 100)  : 0
  const imgPct   = s.ImageBytesTotal > 0 ? Math.round((s.ImageBytesReceived / s.ImageBytesTotal) * 100) : 0
  const overallPct =
    s.DataBytesTotal + s.ImageBytesTotal > 0
      ? Math.round(((s.DataBytesReceived + s.ImageBytesReceived) / (s.DataBytesTotal + s.ImageBytesTotal)) * 100)
      : 0

  const isActive = s.Status === "active" || s.Status === "pending"
  const expiresIn = new Date(s.ExpiresAt).getTime() - Date.now()
  const expiresInDays = Math.max(0, Math.ceil(expiresIn / 86400000))

  return (
    <div className="rounded-[5px] border border-border/50 bg-background p-3 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="font-medium text-[12px] truncate">{s.FirmaName}</span>
            <span className="text-[10px] text-muted-foreground font-mono">({s.CompanyId})</span>
            {statusBadge(s.Status)}
          </div>
          <div className="text-[10px] text-muted-foreground mt-1">
            Oluşturuldu: {formatRelative(s.CreatedAt)}
            {s.CreatedBy && ` · ${s.CreatedBy}`}
            {isActive && ` · ${expiresInDays} gün geçerli`}
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={async () => {
              const ok = await copyToClipboard(url)
              if (ok) {
                setCopied(true)
                toast.success("Link kopyalandı")
                setTimeout(() => setCopied(false), 1500)
              }
            }}
            className="flex items-center gap-1 px-2 py-1 rounded-[4px] border border-border/60 text-[10px] font-medium hover:bg-muted/40 transition-colors"
            title={url}
          >
            {copied ? <CheckCheck className="h-3 w-3 text-emerald-600" /> : <Link2 className="h-3 w-3" />}
            {copied ? "Kopyalandı" : "Linki Kopyala"}
          </button>
          {isActive && (
            <button
              onClick={onCancel}
              className="flex items-center justify-center size-6 rounded-[4px] hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors"
              title="İptal et"
            >
              <X className="h-3 w-3" />
            </button>
          )}
          <button
            onClick={onDelete}
            className="flex items-center justify-center size-6 rounded-[4px] hover:bg-red-50 text-muted-foreground hover:text-red-600 transition-colors"
            title="Sil"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Progress */}
      <div className="grid grid-cols-2 gap-3 text-[10px]">
        <div className="space-y-0.5">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Database className="h-3 w-3" />
            <span>Veri (.bak)</span>
            <span className="ml-auto tabular-nums">{formatBytes(s.DataBytesReceived)} / {formatBytes(s.DataBytesTotal)}</span>
          </div>
          <ProgressBar pct={dataPct} />
        </div>
        <div className="space-y-0.5">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <HardDrive className="h-3 w-3" />
            <span>Resimler</span>
            <span className="ml-auto tabular-nums">
              {s.ImageFilesReceived} / {s.ImageFilesTotal} dosya · {formatBytes(s.ImageBytesReceived)} / {formatBytes(s.ImageBytesTotal)}
            </span>
          </div>
          <ProgressBar pct={imgPct} />
        </div>
      </div>

      {(s.DataBytesTotal + s.ImageBytesTotal > 0) && (
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          <span>Toplam:</span>
          <span className="font-medium tabular-nums">{overallPct}%</span>
        </div>
      )}
    </div>
  )
}

function ProgressBar({ pct }: { pct: number }) {
  const safe = Math.max(0, Math.min(100, pct))
  return (
    <div className="h-1.5 bg-muted/40 rounded-full overflow-hidden">
      <div
        className="h-full bg-[#1d64ff] transition-all duration-300"
        style={{ width: `${safe}%` }}
      />
    </div>
  )
}

function NewTransferDialog({
  open, onOpenChange, onCreated,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  onCreated: () => void
}) {
  const [firmas, setFirmas]               = useState<FirmaItem[]>([])
  const [sqlServers, setSqlServers]       = useState<ServerOption[]>([])
  const [depoServers, setDepoServers]     = useState<ServerOption[]>([])
  const [firma, setFirma]                 = useState<FirmaItem | null>(null)
  const [sqlServerId, setSqlServerId]     = useState<string>("")
  const [depoServerId, setDepoServerId]   = useState<string>("")
  const [expiresInDays, setExpiresInDays] = useState<number>(7)
  const [notes, setNotes]                 = useState<string>("")
  const [submitting, setSubmitting]       = useState(false)
  const [firmaSearch, setFirmaSearch]     = useState("")
  const [firmaPopOpen, setFirmaPopOpen]   = useState(false)

  useEffect(() => {
    if (!open) return
    setFirma(null); setSqlServerId(""); setDepoServerId("")
    setExpiresInDays(7); setNotes(""); setFirmaSearch("")
    Promise.all([
      fetch("/api/firma/companies").then(r => r.ok ? r.json() : []).catch(() => []),
      fetch("/api/setup/sql-servers").then(r => r.ok ? r.json() : []).catch(() => []),
      fetch("/api/setup/depo-servers").then(r => r.ok ? r.json() : []).catch(() => []),
    ]).then(([cs, sql, depo]) => {
      setFirmas(Array.isArray(cs) ? cs : [])
      setSqlServers(Array.isArray(sql) ? sql : [])
      setDepoServers(Array.isArray(depo) ? depo : [])
    })
  }, [open])

  const firmaFiltered = useMemo(() => {
    const q = firmaSearch.trim().toLowerCase()
    if (!q) return firmas.slice(0, 50)
    return firmas
      .filter((f) =>
        f.firma.toLowerCase().includes(q) || (f.firkod || "").toLowerCase().includes(q),
      )
      .slice(0, 50)
  }, [firmas, firmaSearch])

  async function handleCreate() {
    if (!firma) {
      toast.error("Firma seçin")
      return
    }
    setSubmitting(true)
    try {
      const r = await fetch("/api/aktarim", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId:     firma.firkod,
          firmaName:     firma.firma,
          sqlServerId:   sqlServerId || null,
          depoServerId:  depoServerId || null,
          expiresInDays,
          notes:         notes.trim() || null,
        }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d?.error ?? "Oluşturulamadı")
      toast.success("Aktarım oluşturuldu", {
        description: "Link aktif aktarımlar listesinde",
      })
      onCreated()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Hata")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[14px]">
            <ArrowRightLeft className="h-4 w-4" />
            Yeni Aktarım
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="space-y-1">
            <Label className="text-[11px]">Firma</Label>
            <Popover open={firmaPopOpen} onOpenChange={setFirmaPopOpen}>
              <PopoverTrigger asChild>
                <button className="w-full h-8 px-2.5 rounded-[5px] border border-border text-[11px] text-left flex items-center justify-between hover:bg-muted/40 transition-colors">
                  {firma ? (
                    <span className="truncate">
                      <span className="font-mono text-muted-foreground">{firma.firkod}</span>
                      {" — "}
                      <span>{firma.firma}</span>
                    </span>
                  ) : (
                    <span className="text-muted-foreground">Firma seç...</span>
                  )}
                  <Search className="h-3 w-3 text-muted-foreground" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0 rounded-[5px]" align="start">
                <Command shouldFilter={false}>
                  <CommandInput
                    placeholder="Firma ara..."
                    value={firmaSearch}
                    onValueChange={setFirmaSearch}
                    className="text-[11px] h-8"
                  />
                  <CommandList className="max-h-56 overflow-y-auto" onWheel={(e) => e.stopPropagation()}>
                    <CommandGroup>
                      {firmaFiltered.map((f) => (
                        <CommandItem
                          key={f.firkod}
                          value={f.firkod}
                          onSelect={() => {
                            setFirma(f)
                            setFirmaPopOpen(false)
                            setFirmaSearch("")
                          }}
                          className="text-[11px]"
                        >
                          <span className="font-mono text-muted-foreground mr-2">{f.firkod}</span>
                          {f.firma}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-[11px]">SQL Sunucusu</Label>
              <Select value={sqlServerId} onValueChange={setSqlServerId}>
                <SelectTrigger className="h-8 text-[11px]">
                  <SelectValue placeholder="Seçilmedi" />
                </SelectTrigger>
                <SelectContent>
                  {sqlServers.map((s) => (
                    <SelectItem key={s.id} value={s.id} className="text-[11px]">
                      {s.name} ({s.ip})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-[11px]">Depo Sunucusu</Label>
              <Select value={depoServerId} onValueChange={setDepoServerId}>
                <SelectTrigger className="h-8 text-[11px]">
                  <SelectValue placeholder="Seçilmedi" />
                </SelectTrigger>
                <SelectContent>
                  {depoServers.map((s) => (
                    <SelectItem key={s.id} value={s.id} className="text-[11px]">
                      {s.name} ({s.ip})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-[11px]">Geçerlilik (gün)</Label>
            <Input
              type="number"
              min={1}
              max={60}
              value={expiresInDays}
              onChange={(e) => setExpiresInDays(parseInt(e.target.value, 10) || 7)}
              className="h-8 text-[11px]"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-[11px]">Not (opsiyonel)</Label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Müşteriye iletilen mesaj..."
              className="h-8 text-[11px]"
            />
          </div>

          <div className="flex items-start gap-2 px-3 py-2 rounded-[5px] bg-amber-50 border border-amber-200 text-[10px] text-amber-800">
            <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <div>
              Link <span className="font-mono">aktarim.pusulanet.net/&lt;token&gt;</span> formatında üretilir.
              VPN üzerinden müşteri direkt LAN'a yükler; VPN kapalıysa WAN proxy üzerinden yine çalışır.
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-3 border-t border-border/40">
          <button
            onClick={() => onOpenChange(false)}
            className="px-3 py-1.5 rounded-[5px] border border-border/60 hover:bg-muted/40 text-[11px] font-medium text-muted-foreground transition-colors"
          >
            Vazgeç
          </button>
          <button
            onClick={handleCreate}
            disabled={!firma || submitting}
            className="px-3 py-1.5 rounded-[5px] bg-[#1d64ff] text-white text-[11px] font-medium hover:bg-[#1d64ff]/90 disabled:opacity-50 transition-colors"
          >
            {submitting ? "Oluşturuluyor..." : "Oluştur"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
