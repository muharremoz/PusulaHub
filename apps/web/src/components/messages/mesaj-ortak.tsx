import { Check, CheckCheck, Clock, EyeOff, X } from "lucide-react"
import type { AnketCevaplari } from "@/lib/anket"

/* Mesajlar sayfası ve pencerelerinin ortak tipleri + görünüm yardımcıları. */

export type MsgType         = "info" | "warning" | "urgent"
export type MsgPriority     = "normal" | "high" | "urgent"
export type RecipientKind   = "all" | "company" | "selected"
/** closed: pencereyi okumadan kapattı (X / otomatik kapanma) — okundu sayılmaz (lib/anket.ts ackAyir) */
export type RecipientStatus = "pending" | "delivered" | "read" | "closed" | "failed"

/**
 * Mesaj şablonu ("Hazır mesaj"). built-in olanlar `lib/preset-messages.ts`'den,
 * kullanıcı şablonları DB'den (MessageTemplates) gelir; API birleştirir.
 */
export interface MessageTemplate {
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

export interface MessageItem {
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
  isSurvey?:     boolean
}

export interface RecipientItem {
  id:           number
  serverId:     string
  serverName:   string | null
  username:     string
  status:       RecipientStatus
  deliveredAt:  string | null
  readAt:       string | null
  closedAt?:    string | null
  errorMessage: string | null
  answers?:     AnketCevaplari | null
}

export interface DirectoryRecipient {
  agentId:     string
  serverName:  string
  username:    string
  company:     string
  online:      boolean
  sessionType: string
  state:       string
}

export interface Company {
  id:        string
  name:      string
  userCount: number
}

export const ONCELIK: Record<MsgPriority, { label: string; cls: string }> = {
  normal: { label: "Normal", cls: "bg-muted text-muted-foreground" },
  high:   { label: "Yüksek", cls: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
  urgent: { label: "Acil",   cls: "bg-rose-500/15 text-rose-700 dark:text-rose-400" },
}

export const TIP: Record<MsgType, string> = { info: "Bilgi", warning: "Uyarı", urgent: "Acil" }

export const ALICI_TIPI: Record<RecipientKind, string> = {
  all:      "Tüm kullanıcılar",
  company:  "Firma",
  selected: "Seçili kullanıcılar",
}

export const DURUM: Record<RecipientStatus, { label: string; ikon: React.ReactNode }> = {
  pending:   { label: "Beklemede", ikon: <Clock      className="text-muted-foreground size-3.5" /> },
  delivered: { label: "İletildi",  ikon: <Check      className="size-3.5 text-sky-600 dark:text-sky-400" /> },
  read:      { label: "Okundu",    ikon: <CheckCheck className="size-3.5 text-emerald-600 dark:text-emerald-400" /> },
  closed:    { label: "Kapattı",   ikon: <EyeOff     className="size-3.5 text-amber-600 dark:text-amber-400" /> },
  failed:    { label: "Başarısız", ikon: <X          className="size-3.5 text-rose-600 dark:text-rose-400" /> },
}

export function OncelikRozeti({ p }: { p: MsgPriority }) {
  const o = ONCELIK[p]
  return <span className={`inline-flex rounded-[5px] px-2 py-0.5 text-[11px] font-medium ${o.cls}`}>{o.label}</span>
}

export function tarihYaz(s: string | null | undefined): string {
  if (!s) return ""
  const d = new Date(s.replace(" ", "T"))
  if (isNaN(d.getTime())) return s
  return d.toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" })
}
