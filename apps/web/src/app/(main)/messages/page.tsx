"use client"

import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { PageContainer } from "@/components/layout/page-container"
import { NestedCard } from "@/components/shared/nested-card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/combobox-select"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog"
import { Popover, PopoverContent, PopoverTrigger } from "@muharremoz/pusula-ui"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@muharremoz/pusula-ui"

import { ComboboxMulti } from "@/components/ui/combobox"
import { ListeKarti, ListeThead } from "@/components/shared/liste-karti"
import { MetinFiltre, SecimFiltre, TarihFiltre, type TarihFiltreDeger } from "@/components/shared/liste-filtreleri"
import {
  Send, Plus, Search, Mail,
  Users, Building2, UserCheck, Check, CheckCheck, X,
  Server, ChevronsUpDown, Sparkles, Bookmark, MoreVertical, Pencil, Trash2,
} from "lucide-react"

type MsgType         = "info" | "warning" | "urgent"
type MsgPriority     = "normal" | "high" | "urgent"
type RecipientKind   = "all" | "company" | "selected"
type RecipientStatus = "pending" | "delivered" | "read" | "failed"

/**
 * Mesaj şablonu — sol panelde "Hazır Mesajlar" listesinde gösterilir.
 * built-in olanlar `apps/web/src/lib/preset-messages.ts`'den, kullanıcı
 * şablonları DB'den (MessageTemplates tablosu) gelir; API merge eder.
 */
interface MessageTemplate {
  id:          string
  title:       string
  description: string
  subject:     string
  body:        string
  type:        MsgType
  priority:    MsgPriority
  builtIn:     boolean
  createdBy?:  string | null
  createdAt?:  string | null
  updatedAt?:  string | null
}

interface MessageItem {
  id:            string
  subject:       string
  body:          string
  type:          MsgType
  priority:      MsgPriority
  recipientType: RecipientKind
  companyId:     string | null
  companyName:   string | null
  senderName:    string
  sentAt:        string
  totalCount:    number
  readCount:     number
}

interface RecipientItem {
  id:           number
  serverId:     string
  serverName:   string | null
  username:     string
  status:       RecipientStatus
  deliveredAt:  string | null
  readAt:       string | null
  errorMessage: string | null
}

interface DirectoryRecipient {
  agentId:     string
  serverName:  string
  username:    string
  company:     string
  online:      boolean
  sessionType: string
  state:       string
}

interface Company {
  id:        string
  name:      string
  userCount: number
}

const priorityConfig: Record<MsgPriority, { label: string; color: string }> = {
  normal: { label: "Normal", color: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/25/60"   },
  high:   { label: "Yüksek", color: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/25/60" },
  urgent: { label: "Acil",   color: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/25/60"      },
}

const recipientTypeLabels: Record<RecipientKind, string> = {
  all:      "Tüm Kullanıcılar",
  company:  "Firma",
  selected: "Seçili Kullanıcılar",
}

const statusIcon = (s: RecipientStatus | undefined) => {
  switch (s) {
    case "delivered": return <Check     className="h-3 w-3 text-blue-500"    />
    case "read":      return <CheckCheck className="h-3 w-3 text-emerald-500"/>
    case "failed":    return <X         className="h-3 w-3 text-red-500"    />
    default:          return <Send      className="h-3 w-3 text-muted-foreground" />
  }
}

const statusLabel = (s: RecipientStatus | undefined): string => {
  switch (s) {
    case "delivered": return "İletildi"
    case "read":      return "Okundu"
    case "failed":    return "Başarısız"
    default:          return "Beklemede"
  }
}

function deriveStatus(m: MessageItem): RecipientStatus {
  if (m.totalCount === 0) return "failed"
  if (m.readCount >= m.totalCount) return "read"
  if (m.readCount > 0) return "delivered"
  return "delivered"
}

function formatDate(s: string): string {
  if (!s) return ""
  const d = new Date(s.replace(" ", "T"))
  if (isNaN(d.getTime())) return s
  return d.toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" })
}

export default function MessagesPage() {
  const [messages,   setMessages]   = useState<MessageItem[]>([])
  const [loading,    setLoading]    = useState(true)
  const [recipients, setRecipients] = useState<DirectoryRecipient[]>([])
  const [companies,  setCompanies]  = useState<Company[]>([])
  const [templates,  setTemplates]  = useState<MessageTemplate[]>([])
  // Şablon CRUD dialog state — null = kapalı, "new" = yeni şablon, MessageTemplate = düzenle
  const [templateDialog, setTemplateDialog] = useState<MessageTemplate | "new" | null>(null)

  // Sol panel modu — mesaj seçilirse detail otomatik kazanır.
  const [leftMode,         setLeftMode]         = useState<"compose" | "templates">("compose")
  // Liste filtreleri
  const [filterFrom,        setFilterFrom]        = useState<string>("")  // yyyy-MM-dd
  const [filterTo,          setFilterTo]          = useState<string>("")
  const [filterCompany,     setFilterCompany]     = useState<string>("")  // companyId
  const [filterUser,        setFilterUser]        = useState<string>("")  // username
  const [filterSubject,     setFilterSubject]     = useState<string>("")
  const [filterPriority,    setFilterPriority]    = useState<string>("")  // "" | "normal" | "high" | "urgent"
  const [filtersOpen,       setFiltersOpen]       = useState(false)
  // Sütun başlığındaki tarih seçiminin görünen hali (from/to buradan türetilir)
  const [lisansTarih,       setLisansTarih]       = useState<TarihFiltreDeger>({ mode: "tum" })
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null)
  const [detailRecipients,  setDetailRecipients]  = useState<RecipientItem[]>([])

  // Compose state
  const [recipientType,      setRecipientType]      = useState<RecipientKind>("all")
  const [composeCompanies,   setComposeCompanies]   = useState<Set<string>>(new Set())
  const [companyPickerOpen,  setCompanyPickerOpen]  = useState(false)
  const [companyPickerSearch, setCompanyPickerSearch] = useState("")
  const [composeSubject,     setComposeSubject]     = useState("")
  const [composeBody,        setComposeBody]        = useState("")
  const [composePriority,    setComposePriority]    = useState<MsgPriority>("normal")
  const [composeType,        setComposeType]        = useState<MsgType>("info")
  const [selectedRecipients, setSelectedRecipients] = useState<Set<string>>(new Set())
  const [companyFilter,      setCompanyFilter]      = useState<string>("all")
  const [userSearch,         setUserSearch]         = useState<string>("")
  const [sending,            setSending]            = useState(false)

  /**
   * TarihFiltre modunu server'ın beklediği from/to çiftine çevirir.
   * Sütun başlığındaki seçim doğrudan mevcut filterFrom/filterTo state'ini
   * besliyor; böylece veri çekme yolu değişmiyor.
   */
  function tarihModunuUygula(v: TarihFiltreDeger) {
    setLisansTarih(v)
    const ymd = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
    const bugun = new Date()
    if (v.mode === "tum")      { setFilterFrom(""); setFilterTo(""); return }
    if (v.mode === "bugun")    { setFilterFrom(ymd(bugun)); setFilterTo(ymd(bugun)); return }
    if (v.mode === "buhafta")  {
      const bas = new Date(bugun); bas.setDate(bugun.getDate() - ((bugun.getDay() + 6) % 7))
      setFilterFrom(ymd(bas)); setFilterTo(ymd(bugun)); return
    }
    if (v.mode === "buay") {
      setFilterFrom(ymd(new Date(bugun.getFullYear(), bugun.getMonth(), 1)))
      setFilterTo(ymd(bugun)); return
    }
    setFilterFrom(v.from ?? ""); setFilterTo(v.to ?? "")
  }

  const loadList = async () => {
    setLoading(true)
    try {
      // Filtreleri server'a query string olarak ilet
      const qs = new URLSearchParams({ limit: "100" })
      if (filterFrom)     qs.set("from",     filterFrom)
      if (filterTo)       qs.set("to",       filterTo)
      if (filterCompany)  qs.set("companyId",filterCompany)
      if (filterUser)     qs.set("username", filterUser)
      if (filterSubject)  qs.set("subject",  filterSubject)
      if (filterPriority) qs.set("priority", filterPriority)
      const r = await fetch(`/api/messages?${qs.toString()}`)
      const d = await r.json()
      setMessages(d.messages ?? [])
    } catch {
      toast.error("Mesajlar yüklenemedi")
    } finally {
      setLoading(false)
    }
  }

  const loadRecipients = async () => {
    try {
      const r = await fetch("/api/messages/recipients")
      const d = await r.json()
      setRecipients(d.recipients ?? [])
      setCompanies(d.companies   ?? [])
    } catch { /* ignore */ }
  }

  const loadTemplates = async () => {
    try {
      const r = await fetch("/api/messages/templates")
      const d = await r.json()
      setTemplates(d.templates ?? [])
    } catch { /* ignore */ }
  }

  /** Şablon sil — sadece kullanıcı şablonları için. */
  const deleteTemplate = async (id: string) => {
    if (!confirm("Bu şablon silinsin mi?")) return
    try {
      const r = await fetch(`/api/messages/templates/${id}`, { method: "DELETE" })
      if (!r.ok) {
        const d = await r.json().catch(() => ({}))
        toast.error(d.error ?? "Silinemedi")
        return
      }
      toast.success("Şablon silindi")
      loadTemplates()
    } catch {
      toast.error("Sunucu hatası")
    }
  }

  useEffect(() => {
    loadList()
    loadRecipients()
    loadTemplates()
  }, [])

  // Filtre değişince listeyi yeniden çek (debounce için 250ms gecikme).
  useEffect(() => {
    const t = setTimeout(() => loadList(), 250)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterFrom, filterTo, filterCompany, filterUser, filterSubject, filterPriority])

  const activeFilterCount =
    (filterFrom ? 1 : 0) + (filterTo ? 1 : 0) + (filterCompany ? 1 : 0) +
    (filterUser ? 1 : 0) + (filterSubject ? 1 : 0) + (filterPriority ? 1 : 0)

  const clearFilters = () => {
    setFilterFrom(""); setFilterTo(""); setFilterCompany("")
    setFilterUser(""); setFilterSubject(""); setFilterPriority("")
  }

  // Detay yükle
  useEffect(() => {
    if (!selectedMessageId) { setDetailRecipients([]); return }
    let cancelled = false
    fetch(`/api/messages/${selectedMessageId}`)
      .then(r => r.json())
      .then(d => { if (!cancelled) setDetailRecipients(d.recipients ?? []) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [selectedMessageId])

  /* Liste sunucu tarafında filtreleniyor (loadList query string) — burada
     ek istemci filtresi yok. */
  const filtered = messages


  const filteredDirectory = useMemo(() => {
    const q = userSearch.trim().toLowerCase()
    return recipients.filter(r => {
      if (companyFilter !== "all" && r.company !== companyFilter) return false
      if (q) {
        const hay = `${r.username} ${r.company} ${r.serverName}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [recipients, companyFilter, userSearch])

  const selected = selectedMessageId ? messages.find(m => m.id === selectedMessageId) ?? null : null

  /* Compose actions */
  const toggleRecipient = (key: string) => {
    setSelectedRecipients(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }
  const selectAllVisible = () => {
    setSelectedRecipients(new Set(filteredDirectory.map(r => `${r.agentId}::${r.username}`)))
  }
  const clearSelection = () => setSelectedRecipients(new Set())

  const resetCompose = () => {
    setComposeSubject(""); setComposeBody("")
    setRecipientType("all"); setComposeCompanies(new Set()); setCompanyPickerSearch("")
    setSelectedRecipients(new Set()); setCompanyFilter("all"); setUserSearch("")
    setComposePriority("normal"); setComposeType("info")
  }

  /** Şablon seçimini compose formuna uygula. Kullanıcı göndermeden düzenleyebilir. */
  const applyTemplate = (t: MessageTemplate) => {
    setComposeSubject(t.subject)
    setComposeBody(t.body)
    setComposeType(t.type)
    setComposePriority(t.priority)
  }

  /** Şablon listesinden bir şablon seçildiğinde — formu doldur ve compose mode'a dön. */
  const openComposeWithTemplate = (t: MessageTemplate) => {
    applyTemplate(t)
    setSelectedMessageId(null)
    setLeftMode("compose")
    loadRecipients()  // taze alıcı listesi (online durum güncel olsun)
  }

  const sendMessage = async () => {
    if (!composeSubject.trim() || !composeBody.trim()) {
      toast.error("Konu ve mesaj zorunlu"); return
    }
    if (recipientType === "company" && composeCompanies.size === 0) {
      toast.error("En az bir firma seçmelisiniz"); return
    }
    if (recipientType === "selected" && selectedRecipients.size === 0) {
      toast.error("En az bir alıcı seçilmeli"); return
    }

    const base: Record<string, unknown> = {
      subject:       composeSubject.trim(),
      body:          composeBody.trim(),
      type:          composeType,
      priority:      composePriority,
    }

    setSending(true)
    try {
      // Firma modu: her firma için ayrı POST (API tek companyId alıyor).
      const requests: Record<string, unknown>[] = []
      if (recipientType === "company") {
        for (const id of composeCompanies) {
          requests.push({ ...base, recipientType: "company", companyId: id })
        }
      } else if (recipientType === "selected") {
        requests.push({
          ...base, recipientType: "selected",
          targets: [...selectedRecipients].map(k => {
            const [agentId, username] = k.split("::")
            return { agentId, username }
          }),
        })
      } else {
        requests.push({ ...base, recipientType: "all" })
      }

      let totalRecipients = 0, serversOk = 0, serversTargeted = 0, failed = 0
      for (const payload of requests) {
        const r = await fetch("/api/messages", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify(payload),
        })
        const d = await r.json()
        if (!r.ok || d.ok === false) {
          failed++
          continue
        }
        totalRecipients += d.totalRecipients ?? 0
        serversOk       += d.serversOk       ?? 0
        serversTargeted += d.serversTargeted ?? 0
      }

      if (failed === requests.length) {
        toast.error("Gönderim başarısız")
      } else {
        toast.success(
          requests.length > 1 ? `${requests.length} firmaya mesaj gönderildi` : "Mesaj gönderildi",
          { description: `${totalRecipients} alıcıya iletildi (${serversOk}/${serversTargeted} sunucu)` },
        )
        resetCompose()
        loadList()
      }
    } catch {
      toast.error("Sunucu hatası")
    } finally {
      setSending(false)
    }
  }

  return (
    <PageContainer title="Mesajlar" description="Sunucu kullanıcılarına mesaj gönderme">
      {/*
        2 sütun layout:
          SOL  (~520px) — Compose form / Hazır Mesajlar / Detay (toggle veya selected'a göre)
          SAĞ  (1fr)    — Gönderilen mesajlar listesi
      */}
      <div className="grid gap-3 grid-cols-[520px_1fr] items-start">
        {/* SOL SÜTUN — mesaj seçiliyse detay, değilse Hazır Mesajlar paneli */}
        {selected ? (
          <NestedCard>
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className={`inline-flex items-center rounded-[5px] border px-2 py-0.5 text-[10px] font-medium ${priorityConfig[selected.priority].color}`}>
                    {priorityConfig[selected.priority].label}
                  </span>
                </div>
                <button
                  onClick={() => setSelectedMessageId(null)}
                  className="h-6 w-6 inline-flex items-center justify-center rounded-[5px] hover:bg-muted/40 transition-colors"
                  title="Kapat"
                >
                  <X className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              </div>
              <div>
                <h3 className="text-sm font-semibold">{selected.subject}</h3>
                <p className="text-[11px] text-muted-foreground mt-1 whitespace-pre-wrap">{selected.body}</p>
              </div>

              <div className="pt-3 border-t border-border/40 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-muted-foreground">Gönderen</span>
                  <span className="text-xs font-medium">{selected.senderName}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-muted-foreground">Alıcı Tipi</span>
                  <span className="text-xs">{recipientTypeLabels[selected.recipientType]}</span>
                </div>
                {selected.companyName && (
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-muted-foreground">Firma</span>
                    <span className="text-xs font-medium">{selected.companyName}</span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-muted-foreground">Gönderim</span>
                  <span className="text-xs tabular-nums">{formatDate(selected.sentAt)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-muted-foreground">Okunma</span>
                  <span className="text-xs font-medium tabular-nums">{selected.readCount} / {selected.totalCount}</span>
                </div>
              </div>

              <div className="pt-3 border-t border-border/40">
                <p className="text-[11px] text-muted-foreground mb-1.5">Alıcılar ({detailRecipients.length})</p>
                <ScrollArea className="h-[260px]">
                  <div className="space-y-1 pr-2">
                    {detailRecipients.map(r => (
                      <div key={r.id} className="flex items-center gap-2 text-[11px] py-1 px-1 rounded hover:bg-muted/30">
                        {statusIcon(r.status)}
                        <span className="font-mono font-medium truncate flex-1">{r.username}</span>
                        <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                          <Server className="h-2.5 w-2.5" />
                          {r.serverName ?? "—"}
                        </span>
                        <span className="text-[10px] text-muted-foreground tabular-nums w-20 text-right">
                          {r.readAt ? formatDate(r.readAt) : r.deliveredAt ? formatDate(r.deliveredAt) : ""}
                        </span>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            </div>
          </NestedCard>
        ) : leftMode === "templates" ? (
          <NestedCard>
            {/* Mode toggle — Compose ↔ Templates */}
            <LeftModeTabs leftMode={leftMode} setLeftMode={setLeftMode} templateCount={templates.length} />
            <div className="flex items-center justify-between gap-2 mb-3 mt-3">
              <p className="text-[10px] text-muted-foreground">
                Bir şablon seç — düzenleyip gönder. Sistem şablonları silinemez.
              </p>
              <Button
                size="sm"
                variant="outline"
                className="h-7 rounded-[5px] text-[10px] gap-1 px-2 shrink-0"
                onClick={() => setTemplateDialog("new")}
                title="Yeni şablon ekle"
              >
                <Plus className="h-3 w-3" />
                Yeni Şablon
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {templates.map(t => {
                const badge =
                  t.priority === "urgent" ? { label: "Acil",    cls: "bg-red-100 text-red-700 dark:text-red-400 border-red-500/25" } :
                  t.priority === "high"   ? { label: "Yüksek",  cls: "bg-amber-100 text-amber-700 dark:text-amber-400 border-amber-500/25" } :
                                             { label: "Normal",  cls: "bg-muted text-muted-foreground border-border/50" }
                return (
                  <div
                    key={t.id}
                    className="group relative flex flex-col items-start gap-1 rounded-[5px] border border-border/50 bg-card hover:border-foreground/30 hover:shadow-sm transition-all p-2.5 text-left cursor-pointer"
                    onClick={() => openComposeWithTemplate(t)}
                  >
                    <div className="flex items-center justify-between w-full">
                      <Bookmark className="h-3 w-3 text-muted-foreground group-hover:text-foreground transition-colors" />
                      <div className="flex items-center gap-1">
                        <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-[5px] border ${badge.cls}`}>
                          {badge.label}
                        </span>
                        {/* Kullanıcı şablonu — düzenle/sil dropdown */}
                        {!t.builtIn && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button
                                type="button"
                                onClick={(e) => e.stopPropagation()}
                                className="rounded-[5px] hover:bg-muted/60 p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                                aria-label="Şablon işlemleri"
                              >
                                <MoreVertical className="h-3 w-3 text-muted-foreground" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-40">
                              <DropdownMenuItem
                                className="text-[11px] cursor-pointer"
                                onSelect={() => setTemplateDialog(t)}
                              >
                                <Pencil className="h-3 w-3 mr-2" />
                                Düzenle
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-[11px] cursor-pointer text-destructive focus:text-destructive"
                                onSelect={() => deleteTemplate(t.id)}
                              >
                                <Trash2 className="h-3 w-3 mr-2" />
                                Sil
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>
                    </div>
                    <span className="text-[11px] font-semibold leading-snug mt-1">{t.title}</span>
                    <span className="text-[10px] text-muted-foreground leading-snug line-clamp-2">{t.description}</span>
                  </div>
                )
              })}
            </div>
          </NestedCard>
        ) : (
          /* COMPOSE mode — eski Dialog içeriği inline NestedCard'a */
          <NestedCard>
            <LeftModeTabs leftMode={leftMode} setLeftMode={setLeftMode} templateCount={templates.length} />
            <div className="mt-3 space-y-3">
                {/* Alıcılar bölümü */}
                <div className="rounded-[5px] border border-border/50 overflow-hidden bg-card">
                  <div className="px-3 py-2 bg-muted/20 border-b border-border flex items-center justify-between">
                    <span className="text-[10px] font-medium text-muted-foreground tracking-wider uppercase">Alıcılar</span>
                    <div className="flex items-center gap-2">
                      {recipientType === "all" && (
                        <span className="text-[10px] text-muted-foreground tabular-nums">{recipients.length} kullanıcı</span>
                      )}
                      {recipientType === "company" && (
                        <span className="text-[10px] text-muted-foreground tabular-nums">{composeCompanies.size} firma seçili</span>
                      )}
                      {recipientType === "selected" && (
                        <span className="text-[10px] text-muted-foreground tabular-nums">{selectedRecipients.size} seçili</span>
                      )}
                      {/* Manuel yenile — agent heartbeat ~10sn, dialog açıkken eklenen kullanıcılar görünsün */}
                      <button
                        type="button"
                        onClick={loadRecipients}
                        className="text-[10px] text-muted-foreground hover:text-foreground underline"
                        title="Alıcı listesini yenile (agent her 10sn'de güncellenir)"
                      >
                        Yenile
                      </button>
                    </div>
                  </div>
                  <div className="p-3 space-y-3">
                    {/* Alıcı tipi toggle */}
                    <div className="flex items-center rounded-[5px] p-0.5 w-full border border-border/50" style={{ backgroundColor: "var(--section-bg)" }}>
                      {(["all", "company", "selected"] as const).map(t => (
                        <button
                          key={t}
                          onClick={() => { setRecipientType(t); clearSelection(); setComposeCompanies(new Set()) }}
                          className={`flex-1 rounded-[5px] text-[11px] px-2 py-1.5 font-medium transition-colors flex items-center justify-center gap-1.5 ${
                            recipientType === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          {t === "all"      && <Users      className="h-3 w-3" />}
                          {t === "company"  && <Building2  className="h-3 w-3" />}
                          {t === "selected" && <UserCheck  className="h-3 w-3" />}
                          {recipientTypeLabels[t]}
                        </button>
                      ))}
                    </div>

                    {/* Firma seçimi — multi-select combobox + chip listesi */}
                    {recipientType === "company" && (
                      companies.length === 0 ? (
                        <p className="text-[11px] text-muted-foreground py-1">Aktif sunucusu olan firma yok</p>
                      ) : (
                        <div className="space-y-2">
                          <ComboboxMulti
                            items={
                              companyPickerSearch.trim()
                                ? companies.filter((c) =>
                                    c.name.toLowerCase().includes(companyPickerSearch.toLowerCase()),
                                  ).slice(0, 50)
                                : companies.slice(0, 50)
                            }
                            getKey={(c) => c.id}
                            getLabel={(c) => c.name}
                            values={[...composeCompanies]}
                            onValuesChange={(next) => setComposeCompanies(new Set(next))}
                            search={companyPickerSearch}
                            onSearchChange={setCompanyPickerSearch}
                            placeholder="Firma seçin..."
                            searchPlaceholder="Firma ara..."
                            emptyText="Sonuç bulunamadı"
                            renderSummary={(v) => `${v.length} firma seçildi`}
                            renderItem={(c) => (
                              <span className="flex min-w-0 items-center gap-2">
                                <Building2 className="h-3 w-3 text-muted-foreground shrink-0" />
                                <span className="flex-1 truncate">{c.name}</span>
                                <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
                                  {c.userCount}
                                </span>
                              </span>
                            )}
                          />

                          {/* Seçilen firma chip'leri */}
                          {composeCompanies.size > 0 && (
                            <div className="flex flex-wrap gap-1.5 rounded-[5px] border border-border/50 p-2" style={{ backgroundColor: "var(--section-bg)" }}>
                              {[...composeCompanies].map(id => {
                                const c = companies.find(x => x.id === id)
                                if (!c) return null
                                return (
                                  <span
                                    key={id}
                                    className="inline-flex items-center gap-1.5 rounded-[5px] bg-card border border-border/50 pl-2 pr-1 py-1 text-[11px] font-medium"
                                  >
                                    <Building2 className="h-3 w-3 text-muted-foreground" />
                                    <span>{c.name}</span>
                                    <span className="text-[10px] text-muted-foreground tabular-nums">{c.userCount}</span>
                                    <button
                                      onClick={() => setComposeCompanies(prev => {
                                        const next = new Set(prev)
                                        next.delete(id)
                                        return next
                                      })}
                                      className="h-4 w-4 rounded-[5px] hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                                      aria-label="Kaldır"
                                    >
                                      <X className="h-3 w-3" />
                                    </button>
                                  </span>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )
                    )}

                    {/* Kullanıcı seçimi */}
                    {recipientType === "selected" && (
                      <div className="space-y-2">
                        {/* Arama + firma filtresi + tümünü seç */}
                        <div className="flex items-center gap-2">
                          <div className="relative flex-1">
                            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                            <Input
                              placeholder="Kullanıcı / firma / sunucu ara..."
                              className="h-8 text-[13px] rounded-[5px] pl-7"
                              value={userSearch}
                              onChange={(e) => setUserSearch(e.target.value)}
                            />
                          </div>
                          <Select value={companyFilter} onValueChange={setCompanyFilter}>
                            <SelectTrigger className="h-8 text-[13px] rounded-[5px] w-40"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">Tüm Firmalar</SelectItem>
                              {companies.map(c => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                          <Button variant="outline" size="sm" className="h-8 text-[13px] rounded-[5px] px-2.5 shrink-0" onClick={selectAllVisible}>Tümü</Button>
                        </div>

                        <div className="rounded-[5px] border border-border/50 overflow-hidden bg-card">
                          {/* Tablo header */}
                          <div className="grid grid-cols-[16px_1fr_140px_110px] gap-2 px-2.5 py-1.5 bg-muted/20 border-b border-border text-[10px] font-medium text-muted-foreground tracking-wider uppercase">
                            <span></span>
                            <span>Kullanıcı</span>
                            <span>Firma</span>
                            <span>Sunucu</span>
                          </div>
                          {filteredDirectory.length === 0 ? (
                            <p className="text-[11px] text-muted-foreground p-3">
                              {userSearch ? "Eşleşen kullanıcı yok" : "Aktif oturum bulunamadı"}
                            </p>
                          ) : (
                            <ScrollArea className="h-[240px]">
                              <div className="divide-y divide-border/40">
                                {filteredDirectory.map(r => {
                                  const key = `${r.agentId}::${r.username}`
                                  const isSel = selectedRecipients.has(key)
                                  return (
                                    <button
                                      key={key}
                                      onClick={() => toggleRecipient(key)}
                                      className={`w-full grid grid-cols-[16px_1fr_140px_110px] gap-2 px-2.5 py-1.5 text-left text-[11px] items-center transition-colors ${
                                        isSel ? "bg-primary text-primary-foreground" : "hover:bg-muted/20"
                                      }`}
                                    >
                                      <div className={`h-1.5 w-1.5 rounded-full shrink-0 ${r.online ? "bg-emerald-500" : "bg-gray-300"}`} />
                                      <span className="font-mono font-medium truncate">{r.username}</span>
                                      <span className={`text-[10px] truncate ${isSel ? "text-background/60" : "text-muted-foreground"}`}>{r.company}</span>
                                      <span className={`text-[10px] truncate ${isSel ? "text-background/60" : "text-muted-foreground"}`}>{r.serverName}</span>
                                    </button>
                                  )
                                })}
                              </div>
                            </ScrollArea>
                          )}
                          {/* Footer: sayım */}
                          <div className="px-2.5 py-1.5 bg-muted/20 border-t border-border/40 text-[10px] text-muted-foreground flex items-center justify-between">
                            <span>{filteredDirectory.length} kullanıcı</span>
                            {selectedRecipients.size > 0 && (
                              <button
                                onClick={clearSelection}
                                className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                              >
                                Seçimi temizle
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Mesaj içeriği bölümü */}
                <div className="rounded-[5px] border border-border/50 overflow-hidden bg-card">
                  <div className="px-3 py-2 bg-muted/20 border-b border-border flex items-center justify-between">
                    <span className="text-[10px] font-medium text-muted-foreground tracking-wider uppercase">Mesaj İçeriği</span>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          className="h-6 inline-flex items-center gap-1 px-2 rounded-[5px] border border-border/50 bg-card text-[10px] hover:bg-muted/30 transition-colors"
                        >
                          <Sparkles className="h-3 w-3 text-muted-foreground" />
                          <span>Hazır Mesaj</span>
                          <ChevronsUpDown className="h-3 w-3 text-muted-foreground opacity-60" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-[320px] max-h-[360px] overflow-y-auto">
                        {templates.map(t => (
                          <DropdownMenuItem
                            key={t.id}
                            onSelect={() => applyTemplate(t)}
                            className="text-[11px] cursor-pointer"
                          >
                            <div className="flex flex-col gap-0.5">
                              <span className="font-medium">{t.title}</span>
                              <span className="text-[10px] text-muted-foreground">{t.description}</span>
                            </div>
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <div className="p-3 space-y-3">
                    <div className="space-y-1">
                      <Label className="text-foreground/80 text-[12px] font-medium">Konu</Label>
                      <Input
                        placeholder="Mesaj konusu..."
                        className="h-8 text-[13px] rounded-[5px]"
                        value={composeSubject}
                        onChange={(e) => setComposeSubject(e.target.value)}
                      />
                    </div>

                    <div className="space-y-1">
                      <Label className="text-foreground/80 text-[12px] font-medium">Mesaj Tipi</Label>
                      <Select value={composeType} onValueChange={(v) => setComposeType(v as MsgType)}>
                        <SelectTrigger className="w-full h-8 text-[13px] rounded-[5px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="info">Bilgi</SelectItem>
                          <SelectItem value="warning">Uyarı</SelectItem>
                          <SelectItem value="urgent">Acil</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-foreground/80 text-[12px] font-medium">Öncelik</Label>
                      <Select value={composePriority} onValueChange={(v) => setComposePriority(v as MsgPriority)}>
                        <SelectTrigger className="w-full h-8 text-[13px] rounded-[5px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="normal">Normal</SelectItem>
                          <SelectItem value="high">Yüksek</SelectItem>
                          <SelectItem value="urgent">Acil</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-foreground/80 text-[12px] font-medium">Mesaj</Label>
                      <textarea
                        className="w-full h-32 rounded-[5px] border border-border/50 bg-card p-2.5 text-[11px] resize-none focus:outline-none focus:ring-1 focus:ring-ring"
                        placeholder="Mesajınızı yazın..."
                        value={composeBody}
                        onChange={(e) => setComposeBody(e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              </div>
            {/* Compose footer — Sıfırla + Gönder */}
            <div className="flex items-center justify-end gap-2 mt-3 pt-3 border-t border-border/40">
              <Button variant="outline" size="sm" className="rounded-[5px] h-8 text-[13px]" onClick={resetCompose} disabled={sending}>Sıfırla</Button>
              <Button size="sm" className="rounded-[5px] h-8 text-[13px] gap-1.5" onClick={sendMessage} disabled={sending}>
                <Send className="h-3 w-3" />
                {sending ? "Gönderiliyor..." : "Gönder"}
              </Button>
            </div>
          </NestedCard>
        )}

        {/* Mesaj listesi */}
        <ListeKarti
          baslik="Gönderilen Mesajlar"
          ikon={<Mail className="size-3.5" />}
          toplam={filtered.length}
          aksiyon={
            <>
                {activeFilterCount > 0 && (
                  <button
                    onClick={clearFilters}
                    className="text-[10px] text-muted-foreground hover:text-foreground underline"
                  >
                    Filtreleri temizle
                  </button>
                )}
                {/*
                  Filtre butonu — Popover olarak açılır. Inline expansion (mb-3 panel) yerine
                  floating popover: liste yer kaybetmez, dış tıklamayla otomatik kapanır.
                */}
                <Popover open={filtersOpen} onOpenChange={setFiltersOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      size="sm"
                      variant={filtersOpen || activeFilterCount > 0 ? "default" : "outline"}
                      className="h-7 rounded-[5px] text-[10px] gap-1 px-2"
                    >
                      <Search className="h-3 w-3" />
                      Filtre
                      {activeFilterCount > 0 && (
                        <span className="ml-0.5 rounded-full bg-white/20 px-1 text-[9px] font-bold tabular-nums">
                          {activeFilterCount}
                        </span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    align="end"
                    sideOffset={6}
                    className="w-[560px] p-3"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-medium text-muted-foreground tracking-wider uppercase">Filtreler</span>
                      {activeFilterCount > 0 && (
                        <button
                          onClick={clearFilters}
                          className="text-[10px] text-muted-foreground hover:text-foreground underline"
                        >
                          Temizle ({activeFilterCount})
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-foreground/80 text-[12px] font-medium">Firma</Label>
                        <Select value={filterCompany || "all"} onValueChange={(v) => setFilterCompany(v === "all" ? "" : v)}>
                          <SelectTrigger className="w-full h-7 text-[11px] rounded-[5px]"><SelectValue placeholder="Hepsi" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">Hepsi</SelectItem>
                            {companies.map(c => (
                              <SelectItem key={c.id} value={c.id} className="text-[13px]">{c.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-foreground/80 text-[12px] font-medium">Kullanıcı</Label>
                        <Input value={filterUser} onChange={(e) => setFilterUser(e.target.value)}
                          placeholder="kullanıcı adı"
                          className="h-7 text-[11px] rounded-[5px] font-mono" />
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
            </>
          }
        >
            <div className="overflow-x-auto">
              <table className="w-full text-[14px] font-medium leading-[20px]">
                <ListeThead>
                  <th className="w-px px-4 py-1.5 text-left font-medium whitespace-nowrap">
                    <SecimFiltre
                      label="Öncelik"
                      options={["normal", "high", "urgent"] as const}
                      getLabel={(o) => (o === "normal" ? "Normal" : o === "high" ? "Yüksek" : "Acil")}
                      selected={filterPriority ? [filterPriority] : []}
                      onChange={(v) => setFilterPriority(v[v.length - 1] ?? "")}
                    />
                  </th>
                  <th className="px-4 py-1.5 text-left font-medium">
                    <MetinFiltre label="Konu" value={filterSubject} onChange={setFilterSubject} />
                  </th>
                  <th className="w-px px-4 py-1.5 text-left font-medium whitespace-nowrap">Alıcı</th>
                  <th className="w-px px-4 py-1.5 text-left font-medium whitespace-nowrap">Durum</th>
                  <th className="w-px px-4 py-1.5 text-left font-medium whitespace-nowrap">Okunma</th>
                  <th className="w-px px-4 py-1.5 text-right font-medium whitespace-nowrap">
                    <TarihFiltre
                      label="Tarih"
                      value={lisansTarih}
                      onChange={tarihModunuUygula}
                      align="end"
                    />
                  </th>
                </ListeThead>
                <tbody>
                  {loading ? (
                    Array.from({ length: 6 }).map((_, i) => (
                      <tr key={i}>
                        {Array.from({ length: 6 }).map((_, j) => (
                          <td key={j} className="px-4 py-1.5"><Skeleton className="h-3 w-full rounded-[5px]" /></td>
                        ))}
                      </tr>
                    ))
                  ) : filtered.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-muted-foreground px-4 py-10 text-center text-[13px]">
                        {messages.length === 0
                          ? "Henüz mesaj gönderilmedi — “Yeni Mesaj” ile ilkini gönderin."
                          : "Filtreye uyan mesaj yok."}
                      </td>
                    </tr>
                  ) : filtered.map(msg => {
                    const prio = priorityConfig[msg.priority]
                    const status = deriveStatus(msg)
                    const readPct = msg.totalCount > 0 ? Math.round((msg.readCount / msg.totalCount) * 100) : 0
                    return (
                      <tr
                        key={msg.id}
                        onClick={() => setSelectedMessageId(msg.id)}
                        className={`hover:bg-muted/20 cursor-pointer transition-colors ${
                          selectedMessageId === msg.id ? "bg-muted/30" : ""
                        }`}
                      >
                        <td className="px-4 py-1.5 whitespace-nowrap">
                          <span className={`inline-flex rounded-[5px] px-2 py-0.5 text-[11px] font-medium ${prio.color}`}>
                            {prio.label}
                          </span>
                        </td>
                        <td className="px-4 py-1.5 max-w-72">
                          <p className="truncate font-medium">{msg.subject}</p>
                          <p className="text-muted-foreground truncate text-[11px]">{msg.body}</p>
                        </td>
                        <td className="px-4 py-1.5 whitespace-nowrap">
                          <span className="text-muted-foreground flex items-center gap-1 text-[12px]">
                            {msg.recipientType === "all"      && <Users     className="h-3 w-3" />}
                            {msg.recipientType === "company"  && <Building2 className="h-3 w-3" />}
                            {msg.recipientType === "selected" && <UserCheck className="h-3 w-3" />}
                            {msg.recipientType === "all"
                              ? "Herkes"
                              : msg.recipientType === "company"
                                ? msg.companyName ?? "Firma"
                                : `${msg.totalCount} kişi`}
                          </span>
                        </td>
                        <td className="px-4 py-1.5 whitespace-nowrap">
                          <span className="text-muted-foreground flex items-center gap-1 text-[12px]">
                            {statusIcon(status)}
                            {statusLabel(status)}
                          </span>
                        </td>
                        <td className="px-4 py-1.5 min-w-32">
                          <span className="flex items-center gap-1.5">
                            <span className="h-1.5 flex-1 overflow-hidden rounded-[5px] bg-muted">
                              <span
                                className={`block h-full rounded-[5px] ${readPct === 100 ? "bg-emerald-500" : readPct >= 50 ? "bg-blue-500" : "bg-amber-500"}`}
                                style={{ width: `${readPct}%` }}
                              />
                            </span>
                            <span className="text-muted-foreground w-10 text-right text-[11px] tabular-nums">
                              {msg.readCount}/{msg.totalCount}
                            </span>
                          </span>
                        </td>
                        <td className="text-muted-foreground px-4 py-1.5 whitespace-nowrap text-[12px] tabular-nums">
                          {formatDate(msg.sentAt)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
        </ListeKarti>

      </div>

      {/* Şablon ekle/düzenle dialog */}
      <TemplateFormDialog
        open={templateDialog !== null}
        initial={templateDialog === "new" ? null : templateDialog}
        onClose={() => setTemplateDialog(null)}
        onSaved={() => { setTemplateDialog(null); loadTemplates() }}
      />
    </PageContainer>
  )
}

/* ══════════════════════════════════════════════════════════════════════
   LeftModeTabs — sol panel header'ında compose ↔ templates segmented toggle
══════════════════════════════════════════════════════════════════════ */
function LeftModeTabs({
  leftMode, setLeftMode, templateCount,
}: {
  leftMode:      "compose" | "templates"
  setLeftMode:   (m: "compose" | "templates") => void
  templateCount: number
}) {
  return (
    <div className="flex items-center rounded-[5px] p-0.5 w-full border border-border/50" style={{ backgroundColor: "var(--section-bg)" }}>
      <button
        onClick={() => setLeftMode("compose")}
        className={`flex-1 rounded-[5px] text-[11px] px-2 py-1.5 font-medium transition-colors flex items-center justify-center gap-1.5 ${
          leftMode === "compose" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
        }`}
      >
        <Send className="h-3 w-3" />
        Yeni Mesaj
      </button>
      <button
        onClick={() => setLeftMode("templates")}
        className={`flex-1 rounded-[5px] text-[11px] px-2 py-1.5 font-medium transition-colors flex items-center justify-center gap-1.5 ${
          leftMode === "templates" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
        }`}
      >
        <Sparkles className="h-3 w-3" />
        Hazır Mesajlar
        <span className="text-[9px] opacity-70 tabular-nums">({templateCount})</span>
      </button>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════
   TemplateFormDialog — yeni şablon ekle veya mevcudu düzenle
   ──────────────────────────────────────────────────────────────────────
   `initial` null ise yeni mod (POST), MessageTemplate ise düzenle mod (PATCH).
══════════════════════════════════════════════════════════════════════ */
function TemplateFormDialog({
  open, initial, onClose, onSaved,
}: {
  open:    boolean
  initial: MessageTemplate | null
  onClose: () => void
  onSaved: () => void
}) {
  const isEdit = initial !== null
  const [title,       setTitle]       = useState("")
  const [description, setDescription] = useState("")
  const [subject,     setSubject]     = useState("")
  const [body,        setBody]        = useState("")
  const [type,        setType]        = useState<MsgType>("info")
  const [priority,    setPriority]    = useState<MsgPriority>("normal")
  const [saving,      setSaving]      = useState(false)

  // Dialog her açıldığında initial'a göre formu sıfırla/doldur
  useEffect(() => {
    if (!open) return
    if (initial) {
      setTitle(initial.title)
      setDescription(initial.description)
      setSubject(initial.subject)
      setBody(initial.body)
      setType(initial.type)
      setPriority(initial.priority)
    } else {
      setTitle(""); setDescription(""); setSubject(""); setBody("")
      setType("info"); setPriority("normal")
    }
  }, [open, initial])

  const save = async () => {
    if (!title.trim())   { toast.error("Başlık zorunlu"); return }
    if (!subject.trim()) { toast.error("Konu zorunlu"); return }
    if (!body.trim())    { toast.error("Mesaj metni zorunlu"); return }

    setSaving(true)
    try {
      const payload = { title: title.trim(), description: description.trim(), subject: subject.trim(), body: body.trim(), type, priority }
      const url = isEdit ? `/api/messages/templates/${initial!.id}` : "/api/messages/templates"
      const method = isEdit ? "PATCH" : "POST"
      const r = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!r.ok) {
        const d = await r.json().catch(() => ({}))
        toast.error(d.error ?? (isEdit ? "Güncellenemedi" : "Eklenemedi"))
        return
      }
      toast.success(isEdit ? "Şablon güncellendi" : "Şablon eklendi")
      onSaved()
    } catch {
      toast.error("Sunucu hatası")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        className="sm:max-w-[520px] rounded-[8px] p-0 gap-0 max-h-[90vh] flex flex-col overflow-hidden"
        style={{ backgroundColor: "var(--section-bg)" }}
      >
        <DialogHeader className="px-5 py-4 border-b border-border/50 bg-card">
          <DialogTitle className="text-sm font-semibold flex items-center gap-2">
            <Bookmark className="h-3.5 w-3.5 text-muted-foreground" />
            {isEdit ? "Şablonu Düzenle" : "Yeni Şablon"}
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1">
          <div className="px-4 py-4 space-y-3">
            <div className="rounded-[5px] border border-border/50 overflow-hidden bg-card">
              <div className="px-3 py-2 bg-muted/20 border-b border-border">
                <span className="text-[10px] font-medium text-muted-foreground tracking-wider uppercase">Şablon Bilgileri</span>
              </div>
              <div className="p-3 space-y-3">
                <div className="space-y-1">
                  <Label className="text-foreground/80 text-[12px] font-medium">Başlık</Label>
                  <Input value={title} onChange={(e) => setTitle(e.target.value)}
                    className="h-8 text-[13px] rounded-[5px]" placeholder="Örn. Planlı Bakım" />
                </div>
                <div className="space-y-1">
                  <Label className="text-foreground/80 text-[12px] font-medium">Açıklama (opsiyonel)</Label>
                  <Input value={description} onChange={(e) => setDescription(e.target.value)}
                    className="h-8 text-[13px] rounded-[5px]" placeholder="Listede 2. satırda görünür" />
                </div>
                <div className="space-y-1">
                  <Label className="text-foreground/80 text-[12px] font-medium">Mesaj Tipi</Label>
                  <Select value={type} onValueChange={(v) => setType(v as MsgType)}>
                    <SelectTrigger className="w-full h-8 text-[13px] rounded-[5px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="info">Bilgi</SelectItem>
                      <SelectItem value="warning">Uyarı</SelectItem>
                      <SelectItem value="urgent">Acil</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-foreground/80 text-[12px] font-medium">Öncelik</Label>
                  <Select value={priority} onValueChange={(v) => setPriority(v as MsgPriority)}>
                    <SelectTrigger className="w-full h-8 text-[13px] rounded-[5px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="normal">Normal</SelectItem>
                      <SelectItem value="high">Yüksek</SelectItem>
                      <SelectItem value="urgent">Acil</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div className="rounded-[5px] border border-border/50 overflow-hidden bg-card">
              <div className="px-3 py-2 bg-muted/20 border-b border-border">
                <span className="text-[10px] font-medium text-muted-foreground tracking-wider uppercase">Mesaj İçeriği</span>
              </div>
              <div className="p-3 space-y-3">
                <div className="space-y-1">
                  <Label className="text-foreground/80 text-[12px] font-medium">Konu</Label>
                  <Input value={subject} onChange={(e) => setSubject(e.target.value)}
                    className="h-8 text-[13px] rounded-[5px]" placeholder="Mesaj konusu" />
                </div>
                <div className="space-y-1">
                  <Label className="text-foreground/80 text-[12px] font-medium">Mesaj</Label>
                  <textarea
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    className="w-full h-32 rounded-[5px] border border-border/50 bg-card p-2.5 text-[11px] resize-none focus:outline-none focus:ring-1 focus:ring-ring"
                    placeholder="Mesaj metni — [SAAT], [SÜRE] gibi yer tutucular kullanabilirsin."
                  />
                </div>
              </div>
            </div>
          </div>
        </ScrollArea>

        <DialogFooter className="px-5 py-3 border-t border-border/50 gap-2 sm:gap-2 bg-card">
          <Button variant="outline" size="sm" className="rounded-[5px] h-8 text-[13px]"
            onClick={onClose} disabled={saving}>İptal</Button>
          <Button size="sm" className="rounded-[5px] h-8 text-[13px] gap-1.5"
            onClick={save} disabled={saving}>
            <Check className="h-3 w-3" />
            {saving ? "Kaydediliyor..." : (isEdit ? "Güncelle" : "Ekle")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
