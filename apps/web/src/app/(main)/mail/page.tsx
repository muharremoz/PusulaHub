"use client"

import React, { useState, useEffect, useCallback, useRef } from "react"
import {
  Mail, Inbox, Send, Star, Trash2, RefreshCw, ChevronLeft,
  ChevronRight, Pencil, X, Paperclip, Search, AlertCircle,
  ArchiveX, Reply, Forward, MoreVertical, ExternalLink,
  CheckCheck, StarOff,
} from "lucide-react"
import { Button }       from "@/components/ui/button"
import { Input }        from "@/components/ui/input"
import { Textarea }     from "@/components/ui/textarea"
import { Badge }        from "@/components/ui/badge"
import { ScrollArea }   from "@/components/ui/scroll-area"
import { Skeleton }     from "@/components/ui/skeleton"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import { cn }    from "@/lib/utils"
import type { MailMessage }  from "@/app/api/mail/messages/route"
import type { MailDetail }   from "@/app/api/mail/messages/[id]/route"

/* ──────────────────────────────────────────
   Sabitler
────────────────────────────────────────── */
const LABELS = [
  { id: "INBOX",     label: "Gelen Kutusu", icon: Inbox  },
  { id: "STARRED",   label: "Yıldızlı",     icon: Star   },
  { id: "SENT",      label: "Gönderilenler", icon: Send  },
  { id: "DRAFT",     label: "Taslaklar",    icon: Pencil },
  { id: "TRASH",     label: "Çöp Kutusu",   icon: Trash2 },
]

function formatDate(raw: string) {
  try {
    const d   = new Date(raw)
    const now = new Date()
    const diff = now.getTime() - d.getTime()
    if (diff < 86_400_000 && d.getDate() === now.getDate())
      return d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })
    if (diff < 7 * 86_400_000)
      return d.toLocaleDateString("tr-TR", { weekday: "short" })
    return d.toLocaleDateString("tr-TR", { day: "2-digit", month: "short" })
  } catch { return raw }
}

function parseFromName(from: string) {
  const m = from.match(/^(.*?)\s*</)
  return (m?.[1] ?? from).trim().replace(/^"|"$/g, "") || from
}

function avatarLetter(name: string) {
  return (name.trim()[0] ?? "?").toUpperCase()
}

function avatarColor(name: string) {
  const colors = ["#3b82f6","#8b5cf6","#ec4899","#f97316","#10b981","#06b6d4","#f59e0b","#ef4444"]
  let h = 0; for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h)
  return colors[Math.abs(h) % colors.length]
}

/* ──────────────────────────────────────────
   Bağlantı Ekranı
────────────────────────────────────────── */
function ConnectScreen({ onConnect, error }: { onConnect: () => void; error: string | null }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-6 bg-white">
      <div className="size-16 rounded-full bg-blue-50 flex items-center justify-center">
        <Mail className="size-8 text-blue-500" />
      </div>
      <div className="text-center space-y-1">
        <h2 className="text-[15px] font-semibold">Google Workspace Bağlantısı</h2>
        <p className="text-[12px] text-muted-foreground max-w-[320px]">
          Şirket Gmail hesabınıza erişmek için Google hesabınızla giriş yapın.
        </p>
      </div>
      {error && (
        <div className="flex items-center gap-2 px-4 py-2 rounded-[6px] bg-destructive/10 text-destructive text-[12px]">
          <AlertCircle className="size-4" /> {error === "auth_failed" ? "Kimlik doğrulama başarısız." : error}
        </div>
      )}
      <Button onClick={onConnect} className="gap-2 rounded-[6px]">
        <svg viewBox="0 0 24 24" className="size-4" fill="none">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
        </svg>
        Google ile Bağlan
      </Button>
    </div>
  )
}

/* ──────────────────────────────────────────
   Mesaj Satırı
────────────────────────────────────────── */
function MessageRow({ msg, selected, onClick }: {
  msg: MailMessage; selected: boolean; onClick: () => void
}) {
  const name  = parseFromName(msg.fromName || msg.from)
  const color = avatarColor(name)

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left flex items-start gap-2.5 px-3 py-2.5 border-b border-border/30 transition-colors",
        selected ? "bg-primary/8 border-l-2 border-l-primary" : "hover:bg-muted/40",
        !msg.isRead && !selected && "bg-blue-50/40"
      )}
    >
      {/* Avatar */}
      <div className="size-8 rounded-full flex items-center justify-center text-white text-[11px] font-bold shrink-0 mt-0.5"
        style={{ backgroundColor: color }}>
        {avatarLetter(name)}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-1">
          <span className={cn("text-[12px] truncate", !msg.isRead ? "font-semibold" : "font-medium")}>
            {name}
          </span>
          <div className="flex items-center gap-1 shrink-0">
            {msg.isStarred && <Star className="size-3 text-amber-400 fill-amber-400" />}
            {msg.hasAttachment && <Paperclip className="size-3 text-muted-foreground" />}
            <span className="text-[10px] text-muted-foreground">{formatDate(msg.date)}</span>
          </div>
        </div>
        <p className={cn("text-[11px] truncate", !msg.isRead ? "text-foreground font-medium" : "text-muted-foreground")}>
          {msg.subject}
        </p>
        <p className="text-[10px] text-muted-foreground truncate">{msg.snippet}</p>
      </div>
    </button>
  )
}

/* ──────────────────────────────────────────
   Yeni Mail / Yanıt Compose
────────────────────────────────────────── */
interface AttachmentPayload { name: string; type: string; data: string } // data = base64

function ComposeWindow({ open, replyTo, onClose, onSent }: {
  open: boolean
  replyTo?: MailDetail | null
  onClose: () => void
  onSent:  () => void
}) {
  const [to,          setTo]          = useState("")
  const [cc,          setCc]          = useState("")
  const [subject,     setSubject]     = useState("")
  const [body,        setBody]        = useState("")
  const [showCc,      setShowCc]      = useState(false)
  const [sending,     setSending]     = useState(false)
  const [attachments, setAttachments] = useState<AttachmentPayload[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setTo(replyTo ? replyTo.from : "")
      setCc("")
      setSubject(replyTo ? `Re: ${replyTo.subject.replace(/^Re:\s*/i, "")}` : "")
      setBody("")
      setShowCc(false)
      setAttachments([])
    }
  }, [open, replyTo])

  async function handleFiles(files: FileList | null) {
    if (!files || !files.length) return
    const MAX = 20 * 1024 * 1024 // 20MB
    const next: AttachmentPayload[] = []
    for (const f of Array.from(files)) {
      if (f.size > MAX) { toast.error(`${f.name} 20MB'den büyük`); continue }
      const b64 = await new Promise<string>((res, rej) => {
        const r = new FileReader()
        r.onload  = () => res((r.result as string).split(",")[1] ?? "")
        r.onerror = () => rej(r.error)
        r.readAsDataURL(f)
      })
      next.push({ name: f.name, type: f.type || "application/octet-stream", data: b64 })
    }
    setAttachments((cur) => [...cur, ...next])
  }

  function removeAttachment(i: number) {
    setAttachments((cur) => cur.filter((_, idx) => idx !== i))
  }

  async function send() {
    if (!to.trim()) { toast.error("Alıcı gerekli"); return }
    if (!subject.trim()) { toast.error("Konu gerekli"); return }
    setSending(true)
    try {
      const r = await fetch("/api/mail/send", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to, cc: cc || undefined, subject,
          body: `<div style="font-family:sans-serif;font-size:13px">${body.replace(/\n/g,"<br>")}</div>`,
          replyToMessageId: replyTo?.id,
          attachments: attachments.length ? attachments : undefined,
        }),
      })
      if (!r.ok) throw new Error()
      toast.success("Mail gönderildi")
      onSent(); onClose()
    } catch { toast.error("Gönderilemedi") } finally { setSending(false) }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[640px] p-0 gap-0 rounded-[8px]">
        <DialogHeader className="px-5 py-3 border-b border-border/50">
          <DialogTitle className="text-[13px] font-semibold">{replyTo ? "Yanıtla" : "Yeni Mail"}</DialogTitle>
        </DialogHeader>

        {/* Alanlar */}
        <div className="px-5 py-3 border-b border-border/30 space-y-2">
          <div className="flex items-center gap-2">
            <Label className="text-[10px] text-muted-foreground uppercase tracking-wide w-10 shrink-0">Kime</Label>
            <input value={to} onChange={e => setTo(e.target.value)}
              className="flex-1 text-[12px] outline-none bg-transparent"
              placeholder="alici@ornek.com" />
            <button onClick={() => setShowCc(v => !v)} className="text-[10px] text-muted-foreground hover:text-foreground">{showCc ? "Gizle" : "Cc"}</button>
          </div>
          {showCc && (
            <div className="flex items-center gap-2">
              <Label className="text-[10px] text-muted-foreground uppercase tracking-wide w-10 shrink-0">Cc</Label>
              <input value={cc} onChange={e => setCc(e.target.value)} className="flex-1 text-[12px] outline-none bg-transparent" placeholder="cc@ornek.com" />
            </div>
          )}
          <div className="flex items-center gap-2">
            <Label className="text-[10px] text-muted-foreground uppercase tracking-wide w-10 shrink-0">Konu</Label>
            <input value={subject} onChange={e => setSubject(e.target.value)} className="flex-1 text-[12px] outline-none bg-transparent font-medium" placeholder="Konu..." />
          </div>
        </div>

        {/* Gövde */}
        <Textarea value={body} onChange={e => setBody(e.target.value)}
          placeholder="Mesajınızı yazın..."
          className="border-0 rounded-none text-[12px] resize-none min-h-[240px] focus-visible:ring-0 px-5 py-3" />

        {/* Attachment listesi */}
        {attachments.length > 0 && (
          <div className="px-5 py-2 border-t border-border/30 flex flex-wrap gap-1.5">
            {attachments.map((a, i) => (
              <span key={i} className="flex items-center gap-1.5 text-[11px] bg-muted/50 px-2 py-1 rounded-[4px] border border-border/40">
                <Paperclip className="size-3" />
                <span className="max-w-[160px] truncate">{a.name}</span>
                <button onClick={() => removeAttachment(i)} className="text-muted-foreground hover:text-destructive"><X className="size-3" /></button>
              </span>
            ))}
          </div>
        )}

        {/* Alt */}
        <div className="px-5 py-3 border-t border-border/50 flex items-center gap-2">
          <input ref={fileInputRef} type="file" multiple className="hidden"
            onChange={(e) => { handleFiles(e.target.files); if (fileInputRef.current) fileInputRef.current.value = "" }} />
          <button onClick={() => fileInputRef.current?.click()}
            className="h-8 px-2.5 rounded-[5px] text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors flex items-center gap-1.5"
            title="Dosya ekle">
            <Paperclip className="size-3.5" /> Ek Ekle
          </button>
          <div className="ml-auto flex items-center gap-2">
            <button onClick={onClose} className="text-[11px] text-muted-foreground hover:text-foreground">Kapat</button>
            <Button onClick={send} disabled={sending} className="h-8 text-[12px] rounded-[5px] gap-1.5">
              <Send className="size-3.5" />{sending ? "Gönderiliyor..." : "Gönder"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/* ──────────────────────────────────────────
   Mesaj Görüntüleyici
────────────────────────────────────────── */
function MessageViewer({ msgId, onBack, onReply, onRefresh }: {
  msgId: string; onBack: () => void
  onReply: (d: MailDetail) => void; onRefresh: () => void
}) {
  const [detail,  setDetail]  = useState<MailDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  useEffect(() => {
    setLoading(true); setDetail(null)
    fetch(`/api/mail/messages/${msgId}`)
      .then(r => r.ok ? r.json() : null)
      .then(setDetail)
      .finally(() => setLoading(false))
  }, [msgId])

  // HTML içeriği sandboxed iframe içinde göster
  useEffect(() => {
    if (!detail?.html || !iframeRef.current) return
    const doc = iframeRef.current.contentDocument
    if (!doc) return
    doc.open(); doc.write(detail.html); doc.close()
    // iframe yüksekliğini içeriğe göre ayarla
    const resize = () => {
      if (iframeRef.current && doc.body)
        iframeRef.current.style.height = doc.body.scrollHeight + 32 + "px"
    }
    setTimeout(resize, 100)
  }, [detail?.html])

  async function toggleStar() {
    if (!detail) return
    await fetch(`/api/mail/messages/${detail.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ star: !detail.isStarred }),
    })
    setDetail(d => d ? { ...d, isStarred: !d.isStarred } : d)
  }

  async function archive() {
    if (!detail) return
    await fetch(`/api/mail/messages/${detail.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archive: true }),
    })
    toast.success("Arşivlendi")
    onRefresh(); onBack()
  }

  async function trash() {
    if (!detail) return
    await fetch(`/api/mail/messages/${detail.id}`, { method: "DELETE" })
    toast.success("Çöp kutusuna taşındı")
    onRefresh(); onBack()
  }

  if (loading) return (
    <div className="flex-1 p-6 space-y-3">
      <Skeleton className="h-6 w-2/3 rounded-[4px]" />
      <Skeleton className="h-4 w-1/2 rounded-[4px]" />
      <div className="space-y-2 mt-6">{Array.from({length:8}).map((_,i) => <Skeleton key={i} className="h-3 rounded-[3px]" style={{width:`${90-i*5}%`}} />)}</div>
    </div>
  )

  if (!detail) return (
    <div className="flex-1 flex items-center justify-center text-muted-foreground">
      <p className="text-[12px]">Mesaj yüklenemedi</p>
    </div>
  )

  const senderName  = parseFromName(detail.from)
  const senderColor = avatarColor(senderName)

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Header araç çubuğu */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border/30 shrink-0">
        <button onClick={onBack} className="p-1.5 rounded-[5px] hover:bg-muted/60 text-muted-foreground md:hidden">
          <ChevronLeft className="size-4" />
        </button>
        <h2 className="text-[13px] font-semibold flex-1 truncate">{detail.subject}</h2>
        <div className="flex items-center gap-1">
          <button onClick={toggleStar} className={cn("p-1.5 rounded-[5px] hover:bg-muted/60 transition-colors", detail.isStarred ? "text-amber-400" : "text-muted-foreground")}>
            {detail.isStarred ? <Star className="size-4 fill-amber-400" /> : <StarOff className="size-4" />}
          </button>
          <button onClick={() => onReply(detail)} className="p-1.5 rounded-[5px] hover:bg-muted/60 text-muted-foreground" title="Yanıtla">
            <Reply className="size-4" />
          </button>
          <button onClick={archive} className="p-1.5 rounded-[5px] hover:bg-muted/60 text-muted-foreground" title="Arşivle">
            <ArchiveX className="size-4" />
          </button>
          <button onClick={trash} className="p-1.5 rounded-[5px] hover:bg-destructive/10 hover:text-destructive text-muted-foreground" title="Sil">
            <Trash2 className="size-4" />
          </button>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="px-6 py-4">
          {/* Gönderen bilgisi */}
          <div className="flex items-start gap-3 mb-5">
            <div className="size-10 rounded-full flex items-center justify-center text-white text-[13px] font-bold shrink-0"
              style={{ backgroundColor: senderColor }}>
              {avatarLetter(senderName)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[13px] font-semibold">{senderName}</span>
                <span className="text-[11px] text-muted-foreground shrink-0">{formatDate(detail.date)}</span>
              </div>
              <p className="text-[11px] text-muted-foreground truncate">{detail.from}</p>
              <p className="text-[10px] text-muted-foreground">Kime: {detail.to}</p>
              {detail.cc && <p className="text-[10px] text-muted-foreground">Cc: {detail.cc}</p>}
            </div>
          </div>

          {/* İçerik */}
          {detail.html ? (
            <iframe
              ref={iframeRef}
              sandbox="allow-same-origin"
              className="w-full border-0 min-h-[200px]"
              title="mail-content"
            />
          ) : (
            <pre className="text-[12px] leading-relaxed whitespace-pre-wrap font-sans text-foreground">
              {detail.text || "(İçerik yok)"}
            </pre>
          )}

          {/* Ekler */}
          {detail.attachments.length > 0 && (
            <div className="mt-4 pt-4 border-t border-border/30">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                {detail.attachments.length} Ek
              </p>
              <div className="flex flex-wrap gap-2">
                {detail.attachments.map(a => (
                  <div key={a.id}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-[5px] border border-border/50 bg-muted/20 text-[11px]">
                    <Paperclip className="size-3 text-muted-foreground" />
                    <span className="max-w-[160px] truncate">{a.name}</span>
                    <span className="text-muted-foreground">({Math.round(a.size / 1024)} KB)</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Yanıtla butonu */}
          <button onClick={() => onReply(detail)}
            className="mt-6 w-full flex items-center justify-center gap-2 py-2.5 rounded-[6px] border border-border/50 text-[12px] text-muted-foreground hover:bg-muted/40 hover:text-foreground transition-colors">
            <Reply className="size-3.5" /> Yanıtla
          </button>
        </div>
      </ScrollArea>
    </div>
  )
}

/* ──────────────────────────────────────────
   Ana Sayfa
────────────────────────────────────────── */
export default function MailPage() {
  const [connected,     setConnected]     = useState<boolean | null>(null)
  const [connectedEmail, setConnEmail]    = useState<string | null>(null)
  const [urlError,      setUrlError]      = useState<string | null>(null)

  const [activeLabel,   setActiveLabel]   = useState("INBOX")
  const [messages,      setMessages]      = useState<MailMessage[]>([])
  const [nextPageToken, setNextPageToken] = useState<string | null>(null)
  const [pageTokens,    setPageTokens]    = useState<string[]>([])  // history for back
  const [loading,       setLoading]       = useState(false)
  const [searchQ,       setSearchQ]       = useState("")
  const [searchInput,   setSearchInput]   = useState("")

  const [selectedId,    setSelectedId]    = useState<string | null>(null)
  const [composeOpen,   setComposeOpen]   = useState(false)
  const [replyTo,       setReplyTo]       = useState<MailDetail | null>(null)

  /* ── URL param ── */
  useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    if (p.get("error"))     setUrlError(p.get("error"))
    if (p.get("connected")) toast.success("Google hesabı bağlandı!")
    window.history.replaceState({}, "", "/mail")
  }, [])

  /* ── Bağlantı kontrolü ── */
  useEffect(() => {
    fetch("/api/mail/status")
      .then(r => r.json())
      .then(d => { setConnected(d.connected); setConnEmail(d.email) })
      .catch(() => setConnected(false))
  }, [])

  /* ── Mesaj yükleme ── */
  const loadMessages = useCallback(async (label: string, q: string, token?: string) => {
    setLoading(true)
    const params = new URLSearchParams({ label, maxResults: "25" })
    if (q)     params.set("q", q)
    if (token) params.set("pageToken", token)
    try {
      const r = await fetch(`/api/mail/messages?${params}`)
      if (!r.ok) { setMessages([]); return }
      const d = await r.json()
      setMessages(d.messages ?? [])
      setNextPageToken(d.nextPageToken ?? null)
    } catch { setMessages([]) } finally { setLoading(false) }
  }, [])

  useEffect(() => {
    if (connected) { setSelectedId(null); setPageTokens([]); loadMessages(activeLabel, searchQ) }
  }, [connected, activeLabel, searchQ, loadMessages])

  function handleLabelChange(id: string) {
    setActiveLabel(id); setSearchQ(""); setSearchInput(""); setSelectedId(null); setPageTokens([])
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault(); setSearchQ(searchInput); setPageTokens([])
  }

  function nextPage() {
    if (!nextPageToken) return
    setPageTokens(p => [...p, nextPageToken])
    loadMessages(activeLabel, searchQ, nextPageToken)
  }
  function prevPage() {
    const prev = pageTokens.slice(0, -1)
    setPageTokens(prev)
    loadMessages(activeLabel, searchQ, prev[prev.length - 1])
  }

  function handleReply(detail: MailDetail) {
    setReplyTo(detail); setComposeOpen(true)
  }

  /* ── Mesaj listesinde okundu güncelle ── */
  function markRead(id: string) {
    setMessages(prev => prev.map(m => m.id === id ? { ...m, isRead: true } : m))
  }

  if (connected === null) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="space-y-2">{Array.from({length:3}).map((_,i) => <Skeleton key={i} className="h-3 w-48 rounded-[3px]" />)}</div>
      </div>
    )
  }

  if (!connected) {
    return (
      <div className="flex h-full" style={{ backgroundColor: "#F4F2F0" }}>
        <ConnectScreen onConnect={() => window.location.href = "/api/mail/auth"} error={urlError} />
      </div>
    )
  }

  const unreadCount = messages.filter(m => !m.isRead).length

  return (
    <div className="flex h-[calc(100vh-0px)] overflow-hidden relative" style={{ backgroundColor: "#F4F2F0" }}>

      {/* ── Sol: Etiket Sidebar ── */}
      <div className="w-[200px] shrink-0 flex flex-col border-r border-border/40 bg-[#F4F2F0]">
        <div className="px-3 pt-4 pb-3">
          <Button onClick={() => { setReplyTo(null); setComposeOpen(true) }}
            className="w-full h-8 text-[11px] rounded-[5px] gap-1.5">
            <Pencil className="size-3.5" />Yeni Mail
          </Button>
        </div>

        {/* Hesap */}
        {connectedEmail && (
          <div className="px-3 pb-2">
            <div className="flex items-center gap-2 px-2 py-1.5 rounded-[5px] bg-muted/30">
              <div className="size-5 rounded-full flex items-center justify-center text-white text-[9px] font-bold"
                style={{ backgroundColor: avatarColor(connectedEmail) }}>
                {avatarLetter(connectedEmail)}
              </div>
              <span className="text-[10px] text-muted-foreground truncate">{connectedEmail}</span>
            </div>
          </div>
        )}

        {/* Etiketler */}
        <nav className="flex-1 px-2 space-y-0.5">
          {LABELS.map(l => (
            <button key={l.id} onClick={() => handleLabelChange(l.id)}
              className={cn(
                "w-full flex items-center gap-2 px-2.5 py-1.5 rounded-[5px] text-[12px] font-medium transition-colors",
                activeLabel === l.id ? "bg-foreground text-background" : "text-foreground hover:bg-muted/50"
              )}>
              <l.icon className="size-3.5 shrink-0" />
              <span className="flex-1 text-left">{l.label}</span>
              {l.id === "INBOX" && unreadCount > 0 && (
                <Badge className="h-4 px-1.5 text-[9px] bg-primary text-white rounded-full">{unreadCount}</Badge>
              )}
            </button>
          ))}
        </nav>

        {/* Yenile */}
        <div className="px-3 py-3 border-t border-border/30">
          <button onClick={() => loadMessages(activeLabel, searchQ)}
            className="w-full flex items-center gap-1.5 justify-center text-[11px] text-muted-foreground hover:text-foreground transition-colors py-1">
            <RefreshCw className="size-3.5" />Yenile
          </button>
        </div>
      </div>

      {/* ── Orta: Mesaj Listesi ── */}
      <div className={cn(
        "flex flex-col border-r border-border/40 bg-white",
        selectedId ? "hidden md:flex w-[320px] shrink-0" : "flex-1 md:flex md:w-[320px] md:shrink-0"
      )}>
        {/* Arama */}
        <form onSubmit={handleSearch} className="px-3 py-2.5 border-b border-border/30">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3 text-muted-foreground" />
            <input
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              placeholder="Ara..."
              className="w-full h-7 pl-7 pr-2 text-[11px] rounded-[5px] bg-muted/40 border border-border/40 outline-none focus:border-primary/50"
            />
          </div>
        </form>

        {/* Başlık */}
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/20">
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
            {LABELS.find(l => l.id === activeLabel)?.label ?? activeLabel}
          </span>
          {searchQ && (
            <button onClick={() => { setSearchQ(""); setSearchInput("") }}
              className="flex items-center gap-0.5 text-[10px] text-muted-foreground hover:text-foreground">
              <X className="size-3" />{searchQ}
            </button>
          )}
        </div>

        {/* Liste */}
        {loading ? (
          <div className="p-3 space-y-2">
            {Array.from({length:8}).map((_,i) => (
              <div key={i} className="flex gap-2.5">
                <Skeleton className="size-8 rounded-full shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3 w-3/4 rounded-[3px]" />
                  <Skeleton className="h-2.5 w-full rounded-[3px]" />
                  <Skeleton className="h-2 w-1/2 rounded-[3px]" />
                </div>
              </div>
            ))}
          </div>
        ) : messages.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-2 text-muted-foreground">
            <Mail className="size-10 opacity-20" />
            <p className="text-[12px]">Mesaj yok</p>
          </div>
        ) : (
          <ScrollArea className="flex-1">
            {messages.map(m => (
              <MessageRow key={m.id} msg={m} selected={selectedId === m.id}
                onClick={() => { setSelectedId(m.id); markRead(m.id) }} />
            ))}
          </ScrollArea>
        )}

        {/* Sayfalama */}
        <div className="px-3 py-2 border-t border-border/30 flex items-center justify-between">
          <button onClick={prevPage} disabled={pageTokens.length === 0}
            className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors">
            <ChevronLeft className="size-3.5" />Önceki
          </button>
          <span className="text-[10px] text-muted-foreground">{messages.length} mesaj</span>
          <button onClick={nextPage} disabled={!nextPageToken}
            className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors">
            Sonraki<ChevronRight className="size-3.5" />
          </button>
        </div>
      </div>

      {/* ── Sağ: Mesaj Görüntüleyici ── */}
      <div className={cn(
        "flex-1 flex flex-col bg-white",
        !selectedId && "hidden md:flex"
      )}>
        {selectedId ? (
          <MessageViewer
            key={selectedId}
            msgId={selectedId}
            onBack={() => setSelectedId(null)}
            onReply={handleReply}
            onRefresh={() => loadMessages(activeLabel, searchQ)}
          />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground">
            <Mail className="size-14 opacity-15" />
            <p className="text-[13px]">Okumak için bir mesaj seçin</p>
          </div>
        )}
      </div>

      {/* ── Compose Dialog ── */}
      <ComposeWindow
        open={composeOpen}
        replyTo={replyTo}
        onClose={() => { setComposeOpen(false); setReplyTo(null) }}
        onSent={() => loadMessages(activeLabel, searchQ)}
      />

    </div>
  )
}
