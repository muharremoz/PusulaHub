"use client"

import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { PageContainer } from "@/components/layout/page-container"
import { NestedCard } from "@/components/shared/nested-card"
import { StatsCard } from "@/components/shared/stats-card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  MessageSquare, Send, Plus, Search, Mail, MailOpen,
  AlertTriangle, Users, Building2, UserCheck, Check, CheckCheck, X,
  Server,
} from "lucide-react"

type MsgType         = "info" | "warning" | "urgent"
type MsgPriority     = "normal" | "high" | "urgent"
type RecipientKind   = "all" | "company" | "selected"
type RecipientStatus = "pending" | "delivered" | "read" | "failed"

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
  normal: { label: "Normal", color: "bg-blue-50 text-blue-600 border-blue-200/60"   },
  high:   { label: "Yüksek", color: "bg-amber-50 text-amber-600 border-amber-200/60" },
  urgent: { label: "Acil",   color: "bg-red-50 text-red-600 border-red-200/60"      },
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

  const [search,            setSearch]            = useState("")
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null)
  const [detailRecipients,  setDetailRecipients]  = useState<RecipientItem[]>([])
  const [showCompose,       setShowCompose]       = useState(false)

  // Compose state
  const [recipientType,      setRecipientType]      = useState<RecipientKind>("all")
  const [composeCompany,     setComposeCompany]     = useState<string>("")
  const [composeSubject,     setComposeSubject]     = useState("")
  const [composeBody,        setComposeBody]        = useState("")
  const [composePriority,    setComposePriority]    = useState<MsgPriority>("normal")
  const [composeType,        setComposeType]        = useState<MsgType>("info")
  const [selectedRecipients, setSelectedRecipients] = useState<Set<string>>(new Set())
  const [companyFilter,      setCompanyFilter]      = useState<string>("all")
  const [sending,            setSending]            = useState(false)

  const loadList = async () => {
    setLoading(true)
    try {
      const r = await fetch("/api/messages?limit=100")
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

  useEffect(() => {
    loadList()
    loadRecipients()
  }, [])

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

  /* Filtreler ve sayaçlar */
  const filtered = useMemo(() => {
    if (!search.trim()) return messages
    const q = search.toLowerCase()
    return messages.filter(m =>
      m.subject.toLowerCase().includes(q) ||
      m.body.toLowerCase().includes(q)
    )
  }, [messages, search])

  const totalSent   = messages.length
  const totalRead   = messages.filter(m => m.readCount >= m.totalCount && m.totalCount > 0).length
  const urgentCount = messages.filter(m => m.priority === "urgent").length

  const filteredDirectory = useMemo(() => {
    return recipients.filter(r => {
      if (companyFilter !== "all" && r.company !== companyFilter) return false
      return true
    })
  }, [recipients, companyFilter])

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
    setRecipientType("all"); setComposeCompany("")
    setSelectedRecipients(new Set()); setCompanyFilter("all")
    setComposePriority("normal"); setComposeType("info")
  }

  const sendMessage = async () => {
    if (!composeSubject.trim() || !composeBody.trim()) {
      toast.error("Konu ve mesaj zorunlu"); return
    }
    if (recipientType === "company" && !composeCompany) {
      toast.error("Firma seçimi zorunlu"); return
    }
    if (recipientType === "selected" && selectedRecipients.size === 0) {
      toast.error("En az bir alıcı seçilmeli"); return
    }

    const payload: Record<string, unknown> = {
      subject:       composeSubject.trim(),
      body:          composeBody.trim(),
      type:          composeType,
      priority:      composePriority,
      recipientType,
    }
    if (recipientType === "company")  payload.companyId = composeCompany
    if (recipientType === "selected") {
      payload.targets = [...selectedRecipients].map(k => {
        const [agentId, username] = k.split("::")
        return { agentId, username }
      })
    }

    setSending(true)
    try {
      const r = await fetch("/api/messages", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(payload),
      })
      const d = await r.json()
      if (!r.ok || d.ok === false) {
        toast.error(d.error ?? "Gönderim başarısız")
      } else {
        toast.success("Mesaj gönderildi", {
          description: `${d.totalRecipients ?? 0} alıcıya iletildi (${d.serversOk ?? 0}/${d.serversTargeted ?? 0} sunucu)`,
        })
        resetCompose()
        setShowCompose(false)
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
      {/* Stats */}
      <div className="grid grid-cols-4 gap-3 mb-6 items-stretch">
        <StatsCard title="GÖNDERİLEN" value={totalSent}                       icon={<Send             className="h-4 w-4" />} subtitle="Toplam mesaj" />
        <StatsCard title="OKUNAN"     value={totalRead}                       icon={<MailOpen         className="h-4 w-4" />} subtitle="Tamamlanan"
          trend={totalSent > 0 ? { value: `%${Math.round((totalRead / totalSent) * 100)} okunma`, positive: true } : undefined} />
        <StatsCard title="ACİL"       value={urgentCount}                     icon={<AlertTriangle    className="h-4 w-4" />} subtitle="Yüksek öncelikli" />
        <StatsCard title="ALICI"      value={recipients.length}               icon={<Users            className="h-4 w-4" />} subtitle={`${companies.length} firma`} />
      </div>

      {/* Action bar */}
      <div className="flex items-center gap-3 mb-4">
        <Button
          size="sm"
          className="rounded-[5px] text-xs gap-1.5 h-8"
          onClick={() => { setShowCompose(v => !v); setSelectedMessageId(null) }}
        >
          <Plus className="h-3.5 w-3.5" />
          {showCompose ? "Kapat" : "Yeni Mesaj"}
        </Button>
        <div className="relative ml-auto">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Mesaj ara..."
            className="h-8 text-xs rounded-[5px] bg-white pl-8 w-64"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-[1fr_380px] gap-3">
        {/* Sol: Compose veya Liste */}
        {showCompose ? (
          <NestedCard footer={<><MessageSquare className="h-3 w-3" /><span>Yeni mesaj oluşturuluyor</span></>}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold">Yeni Mesaj</h3>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setShowCompose(false)}>İptal</Button>
            </div>

            <div className="space-y-4">
              {/* Alıcı tipi */}
              <div>
                <Label className="text-[11px] text-muted-foreground mb-2 block">Alıcı Tipi</Label>
                <div className="flex items-center rounded-[8px] p-1 w-fit" style={{ backgroundColor: "#F4F2F0" }}>
                  {(["all", "company", "selected"] as const).map(t => (
                    <button
                      key={t}
                      onClick={() => { setRecipientType(t); clearSelection(); setComposeCompany("") }}
                      className={`rounded-[6px] text-xs px-3 py-1.5 font-medium transition-colors flex items-center gap-1.5 ${
                        recipientType === t ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {t === "all"      && <Users      className="h-3 w-3" />}
                      {t === "company"  && <Building2  className="h-3 w-3" />}
                      {t === "selected" && <UserCheck  className="h-3 w-3" />}
                      {recipientTypeLabels[t]}
                    </button>
                  ))}
                </div>
                {recipientType === "all" && (
                  <p className="text-[11px] text-muted-foreground mt-2">
                    {recipients.length} kullanıcıya iletilecek
                  </p>
                )}
              </div>

              {/* Firma seçimi */}
              {recipientType === "company" && (
                <div>
                  <Label className="text-[11px] text-muted-foreground mb-2 block">Firma</Label>
                  {companies.length === 0 ? (
                    <p className="text-[11px] text-muted-foreground">Aktif sunucusu olan firma yok</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {companies.map(c => (
                        <button
                          key={c.id}
                          onClick={() => setComposeCompany(c.id)}
                          className={`flex items-center gap-1.5 rounded-[5px] border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                            composeCompany === c.id ? "bg-foreground text-background border-foreground" : "bg-white border-border/40 hover:bg-muted/30"
                          }`}
                        >
                          <Building2 className="h-3 w-3" />
                          {c.name}
                          <span className={`text-[10px] ${composeCompany === c.id ? "text-background/70" : "text-muted-foreground"}`}>
                            ({c.userCount})
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Kullanıcı seçimi */}
              {recipientType === "selected" && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label className="text-[11px] text-muted-foreground">Alıcılar ({selectedRecipients.size} seçili)</Label>
                    <div className="flex items-center gap-2">
                      <Select value={companyFilter} onValueChange={setCompanyFilter}>
                        <SelectTrigger className="h-7 text-[11px] rounded-[5px] w-40"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Tüm Firmalar</SelectItem>
                          {companies.map(c => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Button variant="ghost" size="sm" className="h-7 text-[11px] px-2" onClick={selectAllVisible}>Tümünü Seç</Button>
                    </div>
                  </div>
                  <ScrollArea className="rounded-[5px] max-h-[220px]" style={{ backgroundColor: "#F4F2F0" }}>
                    <div className="p-2 space-y-0.5">
                      {filteredDirectory.length === 0 ? (
                        <p className="text-[11px] text-muted-foreground p-2">Aktif oturum bulunamadı</p>
                      ) : filteredDirectory.map(r => {
                        const key = `${r.agentId}::${r.username}`
                        const isSel = selectedRecipients.has(key)
                        return (
                          <button
                            key={key}
                            onClick={() => toggleRecipient(key)}
                            className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-[4px] text-left text-xs transition-colors ${
                              isSel ? "bg-foreground text-background" : "hover:bg-white/60"
                            }`}
                          >
                            <div className={`h-1.5 w-1.5 rounded-full shrink-0 ${r.online ? "bg-emerald-500" : "bg-gray-300"}`} />
                            <span className="font-medium flex-1 truncate font-mono">{r.username}</span>
                            <span className={`text-[10px] truncate ${isSel ? "text-background/60" : "text-muted-foreground"}`}>{r.company}</span>
                            <span className={`text-[10px] truncate ${isSel ? "text-background/60" : "text-muted-foreground"}`}>{r.serverName}</span>
                          </button>
                        )
                      })}
                    </div>
                  </ScrollArea>
                </div>
              )}

              {/* Konu */}
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Konu</Label>
                <Input
                  placeholder="Mesaj konusu..."
                  className="h-8 text-sm rounded-[5px] bg-white"
                  value={composeSubject}
                  onChange={(e) => setComposeSubject(e.target.value)}
                />
              </div>

              {/* Tip + Öncelik */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-[11px] text-muted-foreground mb-2 block">Mesaj Tipi</Label>
                  <Select value={composeType} onValueChange={(v) => setComposeType(v as MsgType)}>
                    <SelectTrigger className="h-8 text-xs rounded-[5px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="info">Bilgi</SelectItem>
                      <SelectItem value="warning">Uyarı</SelectItem>
                      <SelectItem value="urgent">Acil</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-[11px] text-muted-foreground mb-2 block">Öncelik</Label>
                  <Select value={composePriority} onValueChange={(v) => setComposePriority(v as MsgPriority)}>
                    <SelectTrigger className="h-8 text-xs rounded-[5px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="normal">Normal</SelectItem>
                      <SelectItem value="high">Yüksek</SelectItem>
                      <SelectItem value="urgent">Acil</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Mesaj */}
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Mesaj</Label>
                <textarea
                  className="w-full h-32 rounded-[5px] border border-border/40 bg-white p-3 text-xs resize-none focus:outline-none focus:ring-1 focus:ring-ring"
                  placeholder="Mesajınızı yazın..."
                  value={composeBody}
                  onChange={(e) => setComposeBody(e.target.value)}
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" size="sm" className="rounded-[5px] text-xs" onClick={() => setShowCompose(false)} disabled={sending}>İptal</Button>
                <Button size="sm" className="rounded-[5px] text-xs gap-1" onClick={sendMessage} disabled={sending}>
                  <Send className="h-3.5 w-3.5" />
                  {sending ? "Gönderiliyor..." : "Gönder"}
                </Button>
              </div>
            </div>
          </NestedCard>
        ) : (
          /* Mesaj listesi */
          <NestedCard footer={<><Mail className="h-3 w-3" /><span>{filtered.length} mesaj</span></>}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold">Gönderilen Mesajlar</h3>
            </div>

            <div className="grid grid-cols-[0.4fr_2fr_0.7fr_0.7fr_0.8fr_0.6fr] gap-2 px-1 py-1.5 bg-muted/30 rounded-[4px] border-b">
              <span className="text-[11px] font-medium text-muted-foreground tracking-wide">ÖNCELİK</span>
              <span className="text-[11px] font-medium text-muted-foreground tracking-wide">KONU</span>
              <span className="text-[11px] font-medium text-muted-foreground tracking-wide">ALICI</span>
              <span className="text-[11px] font-medium text-muted-foreground tracking-wide">DURUM</span>
              <span className="text-[11px] font-medium text-muted-foreground tracking-wide">OKUNMA</span>
              <span className="text-[11px] font-medium text-muted-foreground tracking-wide">TARİH</span>
            </div>

            {loading ? (
              <div className="space-y-2 py-2">
                {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-12 flex flex-col items-center gap-2">
                <div className="size-10 rounded-full bg-muted/60 flex items-center justify-center">
                  <Mail className="size-5 text-muted-foreground" />
                </div>
                <p className="text-xs font-medium">Henüz mesaj gönderilmedi</p>
                <p className="text-[11px] text-muted-foreground">"Yeni Mesaj" ile ilk mesajınızı gönderin</p>
              </div>
            ) : filtered.map(msg => {
              const prio = priorityConfig[msg.priority]
              const status = deriveStatus(msg)
              const readPct = msg.totalCount > 0 ? Math.round((msg.readCount / msg.totalCount) * 100) : 0
              return (
                <div
                  key={msg.id}
                  onClick={() => { setSelectedMessageId(msg.id); setShowCompose(false) }}
                  className={`grid grid-cols-[0.4fr_2fr_0.7fr_0.7fr_0.8fr_0.6fr] gap-2 px-1 py-2 border-b border-border/40 last:border-0 hover:bg-muted/20 transition-colors cursor-pointer items-center ${
                    selectedMessageId === msg.id ? "bg-muted/30" : ""
                  }`}
                >
                  <span className={`inline-flex items-center rounded-[5px] border px-2 py-0.5 text-[10px] font-medium w-fit ${prio.color}`}>
                    {prio.label}
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-medium truncate">{msg.subject}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{msg.body}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    {msg.recipientType === "all"      && <Users     className="h-3 w-3 text-muted-foreground" />}
                    {msg.recipientType === "company"  && <Building2 className="h-3 w-3 text-muted-foreground" />}
                    {msg.recipientType === "selected" && <UserCheck className="h-3 w-3 text-muted-foreground" />}
                    <span className="text-[10px] text-muted-foreground truncate">
                      {msg.recipientType === "all"
                        ? "Herkes"
                        : msg.recipientType === "company"
                          ? msg.companyName ?? "Firma"
                          : `${msg.totalCount} kişi`}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    {statusIcon(status)}
                    <span className="text-[10px] text-muted-foreground">{statusLabel(status)}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="flex-1 h-1.5 bg-muted rounded-[5px] overflow-hidden">
                      <div
                        className={`h-full rounded-[5px] ${readPct === 100 ? "bg-emerald-500" : readPct >= 50 ? "bg-blue-500" : "bg-amber-500"}`}
                        style={{ width: `${readPct}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-muted-foreground tabular-nums w-10 text-right">{msg.readCount}/{msg.totalCount}</span>
                  </div>
                  <span className="text-[10px] text-muted-foreground tabular-nums">{formatDate(msg.sentAt)}</span>
                </div>
              )
            })}
          </NestedCard>
        )}

        {/* Sağ panel */}
        <div className="space-y-3">
          {selected && !showCompose && (
            <NestedCard>
              <div className="space-y-4">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`inline-flex items-center rounded-[5px] border px-2 py-0.5 text-[10px] font-medium ${priorityConfig[selected.priority].color}`}>
                      {priorityConfig[selected.priority].label}
                    </span>
                  </div>
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
                  <ScrollArea className="max-h-[260px]">
                    <div className="space-y-1">
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
          )}

          {/* Firmalar paneli */}
          <NestedCard footer={<><Building2 className="h-3 w-3" /><span>{companies.length} firma aktif</span></>}>
            <h3 className="text-sm font-semibold mb-3">Firmalar</h3>
            <div className="space-y-1.5">
              {companies.length === 0 ? (
                <p className="text-[11px] text-muted-foreground py-4 text-center">Aktif sunucusu olan firma yok</p>
              ) : companies.map(c => (
                <div key={c.id} className="flex items-center justify-between px-2.5 py-2 rounded-[5px] hover:bg-muted/30 transition-colors">
                  <div className="flex items-center gap-2">
                    <div className="flex items-center justify-center h-7 w-7 rounded-[5px] bg-muted/50">
                      <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-xs font-medium">{c.name}</p>
                      <p className="text-[10px] text-muted-foreground">{c.userCount} aktif kullanıcı</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </NestedCard>
        </div>
      </div>
    </PageContainer>
  )
}
