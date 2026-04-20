"use client"

import React, { useState, useEffect, useCallback, useRef } from "react"
import {
  ChevronLeft, ChevronRight, Plus, X, Clock, CalendarDays,
  ListTodo, StickyNote, AlarmClock, Trash2, CalendarRange,
  Search, RotateCcw,
} from "lucide-react"
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
  type DragStartEvent, type DragEndEvent,
} from "@dnd-kit/core"
import { useDraggable, useDroppable } from "@dnd-kit/core"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { stripHtml } from "@/lib/strip-html"
import { NoteViewer } from "@/components/notes/note-viewer"
import * as VisuallyHidden from "@radix-ui/react-visually-hidden"
import type { CalendarEvent } from "@/app/api/calendar/route"

/* ──────────────────────────────────────────
   Sabitler
────────────────────────────────────────── */
const TR_DAYS_SHORT  = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"]
const TR_DAYS_LONG   = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"]
const TR_MONTHS      = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"]

const EVENT_COLORS = [
  "#3b82f6", "#6366f1", "#8b5cf6", "#ec4899",
  "#ef4444", "#f97316", "#f59e0b", "#10b981",
  "#06b6d4", "#64748b",
]

const TYPE_META: Record<string, { label: string; icon: React.ElementType; bg: string }> = {
  event:    { label: "Etkinlik",      icon: CalendarDays, bg: "bg-blue-50 text-blue-700 border-blue-200"     },
  reminder: { label: "Hatırlatıcı",   icon: AlarmClock,   bg: "bg-purple-50 text-purple-700 border-purple-200" },
  task:     { label: "Görev",         icon: ListTodo,     bg: "bg-amber-50 text-amber-700 border-amber-200"   },
  note:     { label: "Not",           icon: StickyNote,   bg: "bg-yellow-50 text-yellow-700 border-yellow-200"},
}

const RECURRENCE_OPTIONS = [
  { value: "none",    label: "Tekrar yok"  },
  { value: "daily",   label: "Her gün"     },
  { value: "weekly",  label: "Her hafta"   },
  { value: "monthly", label: "Her ay"      },
  { value: "yearly",  label: "Her yıl"     },
]

/* ──────────────────────────────────────────
   Yardımcılar
────────────────────────────────────────── */
function toYMD(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}
function parseDate(s: string) { return new Date(s.replace(" ", "T")) }
function weekStart(d: Date) {
  const r = new Date(d); r.setDate(r.getDate() - (r.getDay() + 6) % 7); r.setHours(0,0,0,0); return r
}
function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}
function formatTime(iso: string) {
  const d = parseDate(iso)
  return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`
}
// tekrarlayan occurrence'ın orijinal ID'si
function baseId(id: string) { return id.includes("_") ? id.split("_").slice(0, -1).join("_") : id }
function isRecurring(evt: CalendarEvent) { return evt.id.match(/_\d+$/) !== null }

/* ──────────────────────────────────────────
   Draggable Event Pill
────────────────────────────────────────── */
function DraggableEventPill({
  evt, onClick,
}: { evt: CalendarEvent; onClick: (e: CalendarEvent) => void }) {
  const canDrag = evt.type === "event" || evt.type === "reminder"
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id:       evt.id,
    data:     { event: evt },
    disabled: !canDrag,
  })

  // Not = post-it görünümü (dolu sarı + gölge + ikon).
  // Diğer tipler (event/task/reminder) klasik pill.
  if (evt.type === "note") {
    return (
      <button
        ref={setNodeRef}
        onClick={e => { e.stopPropagation(); onClick(evt) }}
        className={cn(
          "w-full text-left rounded-[4px] px-1.5 py-1 text-[10px] font-semibold transition-all cursor-pointer",
          "bg-yellow-200 text-amber-900 border border-amber-400/60 shadow-[0_1px_2px_rgba(146,64,14,0.2)]",
          "hover:bg-yellow-300 hover:shadow-[0_2px_4px_rgba(146,64,14,0.25)]",
          "flex items-center gap-1",
          isDragging ? "opacity-30" : ""
        )}
      >
        <StickyNote className="size-3 shrink-0 text-amber-700" />
        <span className="truncate">{evt.title}</span>
      </button>
    )
  }

  const TypeIcon = evt.type === "task"     ? ListTodo
                 : evt.type === "reminder" ? AlarmClock
                                           : null

  return (
    <button
      ref={setNodeRef}
      {...(canDrag ? { ...listeners, ...attributes } : {})}
      onClick={e => { e.stopPropagation(); onClick(evt) }}
      className={cn(
        "w-full text-left rounded-[3px] px-1.5 py-0.5 text-[10px] font-medium truncate transition-opacity flex items-center gap-1",
        isDragging ? "opacity-30" : "hover:opacity-80",
        canDrag ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"
      )}
      style={{ backgroundColor: evt.color + "33", color: evt.color, borderLeft: `2px solid ${evt.color}` }}
    >
      {TypeIcon && <TypeIcon className="size-2.5 shrink-0 opacity-80" />}
      {!evt.allDay && <span className="opacity-60">{formatTime(evt.startDate)}</span>}
      {isRecurring(evt) && <RotateCcw className="inline size-2.5 opacity-50" />}
      <span className="truncate">{evt.title}</span>
    </button>
  )
}

/* ──────────────────────────────────────────
   Droppable Day Cell
────────────────────────────────────────── */
function DroppableDay({
  date, children, className, onClick,
}: { date: Date; children: React.ReactNode; className?: string; onClick?: () => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: toYMD(date), data: { date } })
  return (
    <div
      ref={setNodeRef}
      className={cn(className, isOver && "bg-primary/10 ring-1 ring-primary/30 ring-inset")}
      onClick={onClick}
    >
      {children}
    </div>
  )
}

/* ──────────────────────────────────────────
   Mini Takvim
────────────────────────────────────────── */
function MiniCalendar({
  current, selected, events, onSelect, onNavigate,
}: {
  current: Date; selected: Date; events: CalendarEvent[]
  onSelect: (d: Date) => void; onNavigate: (d: Date) => void
}) {
  const year = current.getFullYear(); const month = current.getMonth()
  const first = new Date(year, month, 1)
  const offset = (first.getDay() + 6) % 7
  const days: (Date | null)[] = [
    ...Array.from({ length: offset }, () => null),
    ...Array.from({ length: new Date(year, month + 1, 0).getDate() }, (_, i) => new Date(year, month, i + 1)),
  ]
  const hasEvent = (d: Date) => events.some(e => isSameDay(parseDate(e.startDate), d))

  return (
    <div className="px-3 py-3 select-none">
      <div className="flex items-center justify-between mb-3">
        <button onClick={() => onNavigate(new Date(year, month - 1, 1))} className="p-0.5 rounded hover:bg-muted/60 text-muted-foreground"><ChevronLeft className="size-3.5" /></button>
        <span className="text-[11px] font-semibold">{TR_MONTHS[month]} {year}</span>
        <button onClick={() => onNavigate(new Date(year, month + 1, 1))} className="p-0.5 rounded hover:bg-muted/60 text-muted-foreground"><ChevronRight className="size-3.5" /></button>
      </div>
      <div className="grid grid-cols-7 gap-0 mb-1">
        {TR_DAYS_SHORT.map(d => <div key={d} className="text-center text-[9px] font-medium text-muted-foreground py-0.5">{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-0">
        {days.map((d, i) => (
          <div key={i} className="aspect-square flex items-center justify-center">
            {d ? (
              <button onClick={() => onSelect(d)} className={cn(
                "size-6 rounded-full text-[10px] font-medium relative flex items-center justify-center transition-colors",
                isSameDay(d, selected) ? "bg-foreground text-background" :
                isSameDay(d, new Date()) ? "bg-primary/10 text-primary font-bold" : "hover:bg-muted/60 text-foreground"
              )}>
                {d.getDate()}
                {hasEvent(d) && !isSameDay(d, selected) && (
                  <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 size-1 rounded-full bg-primary" />
                )}
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  )
}

/* ──────────────────────────────────────────
   Arama Paneli
────────────────────────────────────────── */
function SearchPanel({
  events, onSelect, onClose,
}: { events: CalendarEvent[]; onSelect: (e: CalendarEvent) => void; onClose: () => void }) {
  const [q, setQ] = useState("")
  const inputRef  = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  const qLower = q.toLowerCase()
  const results = q.trim().length < 1 ? [] : events
    .filter(e =>
      e.title.toLowerCase().includes(qLower) ||
      stripHtml(e.description).toLowerCase().includes(qLower)
    )
    .slice(0, 20)

  return (
    <div className="flex flex-col">
      <div className="relative px-2 pb-2">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 size-3 text-muted-foreground" />
        <Input
          ref={inputRef}
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Etkinlik ara..."
          className="h-7 pl-7 pr-6 text-[11px] rounded-[5px] bg-muted/40 border-border/40"
        />
        {q && (
          <button onClick={() => setQ("")} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            <X className="size-3" />
          </button>
        )}
      </div>
      {results.length > 0 && (
        <div className="border-t border-border/30 max-h-[220px] overflow-y-auto">
          {results.map(e => {
            const meta = TYPE_META[e.type]
            return (
              <button key={e.id} onClick={() => { onSelect(e); onClose() }}
                className="w-full text-left px-3 py-2 hover:bg-muted/50 transition-colors border-b border-border/20 last:border-0">
                <div className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full shrink-0" style={{ backgroundColor: e.color }} />
                  <span className="text-[11px] font-medium line-clamp-1">{e.title}</span>
                  {isRecurring(e) && <RotateCcw className="size-2.5 text-muted-foreground shrink-0" />}
                </div>
                <div className="flex items-center gap-2 mt-0.5 ml-3.5">
                  <span className={cn("text-[9px] px-1.5 py-0.5 rounded-full border", meta?.bg)}>
                    {meta?.label}
                  </span>
                  <span className="text-[9px] text-muted-foreground">
                    {new Date(e.startDate.replace(" ","T")).toLocaleDateString("tr-TR", { day: "numeric", month: "short", year: "numeric" })}
                  </span>
                </div>
              </button>
            )
          })}
        </div>
      )}
      {q.trim().length >= 1 && results.length === 0 && (
        <p className="text-[11px] text-muted-foreground text-center py-3 border-t border-border/30">Sonuç bulunamadı</p>
      )}
    </div>
  )
}

/* ──────────────────────────────────────────
   Seçili Gün Etkinlik Listesi
────────────────────────────────────────── */
function DayEventList({ date, events, onSelect, onCreate }: {
  date: Date; events: CalendarEvent[]
  onSelect: (e: CalendarEvent) => void; onCreate: (d: Date) => void
}) {
  const dayEvents = events.filter(e => isSameDay(parseDate(e.startDate), date))
    .sort((a, b) => a.startDate.localeCompare(b.startDate))

  return (
    <div className="flex-1 flex flex-col min-h-0 border-t border-border/40">
      <div className="px-3 py-2 flex items-center justify-between">
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
          {date.getDate()} {TR_MONTHS[date.getMonth()]}
        </span>
        <button onClick={() => onCreate(date)} className="text-muted-foreground hover:text-foreground transition-colors">
          <Plus className="size-3.5" />
        </button>
      </div>
      <ScrollArea className="flex-1">
        <div className="px-2 pb-2 space-y-1">
          {dayEvents.length === 0
            ? <p className="text-[10px] text-muted-foreground text-center py-4">Etkinlik yok</p>
            : dayEvents.map(e => {
                const meta = TYPE_META[e.type] ?? TYPE_META.event
                return (
                  <button key={e.id} onClick={() => onSelect(e)}
                    className="w-full text-left rounded-[5px] px-2 py-1.5 hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-1.5">
                      <span className="size-2 rounded-full shrink-0" style={{ backgroundColor: e.color }} />
                      <span className="text-[11px] font-medium line-clamp-1 flex-1">{e.title}</span>
                      {isRecurring(e) && <RotateCcw className="size-2.5 text-muted-foreground shrink-0" />}
                    </div>
                    {!e.allDay && <p className="text-[9px] text-muted-foreground ml-3.5 mt-0.5">{formatTime(e.startDate)} – {formatTime(e.endDate)}</p>}
                  </button>
                )
              })
          }
        </div>
      </ScrollArea>
    </div>
  )
}

/* ──────────────────────────────────────────
   Aylık Grid
────────────────────────────────────────── */
function MonthGrid({ year, month, events, selected, onSelectDay, onSelectEvent, onCreateOnDay }: {
  year: number; month: number; events: CalendarEvent[]; selected: Date
  onSelectDay: (d: Date) => void; onSelectEvent: (e: CalendarEvent) => void; onCreateOnDay: (d: Date) => void
}) {
  const today   = new Date()
  const first   = new Date(year, month, 1)
  const offset  = (first.getDay() + 6) % 7
  const daysInM = new Date(year, month + 1, 0).getDate()
  const daysInPrev = new Date(year, month, 0).getDate()
  const cells: { date: Date; current: boolean }[] = []
  for (let i = offset - 1; i >= 0; i--)  cells.push({ date: new Date(year, month - 1, daysInPrev - i), current: false })
  for (let i = 1; i <= daysInM; i++)      cells.push({ date: new Date(year, month, i), current: true })
  while (cells.length % 7 !== 0)          cells.push({ date: new Date(year, month + 1, cells.length - daysInM - offset + 1), current: false })

  const getEvents = (d: Date) =>
    events.filter(e => isSameDay(parseDate(e.startDate), d)).sort((a, b) => a.startDate.localeCompare(b.startDate))

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="grid grid-cols-7 border-b border-border/40 shrink-0">
        {TR_DAYS_LONG.map(d => <div key={d} className="text-center text-[10px] font-medium text-muted-foreground py-2">{d}</div>)}
      </div>
      <div className="flex-1 grid grid-cols-7 auto-rows-fr">
        {cells.map(({ date, current }, i) => {
          const dayEvts = getEvents(date)
          const isToday = isSameDay(date, today)
          const isSel   = isSameDay(date, selected)
          return (
            <DroppableDay
              key={i} date={date}
              className={cn(
                "border-r border-b border-border/25 p-1 flex flex-col gap-0.5 min-h-[90px] cursor-pointer transition-colors",
                !current && "bg-muted/10",
                isSel && current && "bg-primary/5",
                current && "hover:bg-muted/20"
              )}
              onClick={() => onSelectDay(date)}
            >
              <div className="flex items-center justify-between px-0.5">
                <span className={cn(
                  "size-6 flex items-center justify-center rounded-full text-[11px] font-medium",
                  isToday ? "bg-foreground text-background" : !current ? "text-muted-foreground/40" : "text-foreground"
                )}>
                  {date.getDate()}
                </span>
                <button onClick={e => { e.stopPropagation(); onCreateOnDay(date) }}
                  className="opacity-0 hover:opacity-100 size-5 flex items-center justify-center rounded hover:bg-muted/60 text-muted-foreground">
                  <Plus className="size-3" />
                </button>
              </div>
              {dayEvts.slice(0, 3).map(evt => (
                <DraggableEventPill key={evt.id} evt={evt} onClick={onSelectEvent} />
              ))}
              {dayEvts.length > 3 && (
                <span className="text-[9px] text-muted-foreground px-1.5">+{dayEvts.length - 3} daha</span>
              )}
            </DroppableDay>
          )
        })}
      </div>
    </div>
  )
}

/* ──────────────────────────────────────────
   Haftalık Grid
────────────────────────────────────────── */
function WeekGrid({ weekOf, events, onSelectEvent, onCreateOnDay }: {
  weekOf: Date; events: CalendarEvent[]
  onSelectEvent: (e: CalendarEvent) => void; onCreateOnDay: (d: Date) => void
}) {
  const today = new Date()
  const days  = Array.from({ length: 7 }, (_, i) => { const d = new Date(weekOf); d.setDate(d.getDate() + i); return d })
  const getEvents = (d: Date) =>
    events.filter(e => isSameDay(parseDate(e.startDate), d)).sort((a, b) => a.startDate.localeCompare(b.startDate))

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="grid grid-cols-7 border-b border-border/40 shrink-0">
        {days.map((d, i) => (
          <div key={i} className={cn("text-center py-2 px-1 border-r border-border/25 last:border-r-0", isSameDay(d, today) && "bg-primary/5")}>
            <div className="text-[10px] font-medium text-muted-foreground">{TR_DAYS_SHORT[i]}</div>
            <div className={cn("mx-auto mt-0.5 size-7 flex items-center justify-center rounded-full text-[13px] font-semibold",
              isSameDay(d, today) ? "bg-foreground text-background" : "text-foreground")}>
              {d.getDate()}
            </div>
          </div>
        ))}
      </div>
      <div className="flex-1 grid grid-cols-7 overflow-y-auto">
        {days.map((d, i) => (
          <DroppableDay key={i} date={d}
            className={cn("border-r border-b border-border/25 last:border-r-0 p-1.5 space-y-1 cursor-pointer hover:bg-muted/10 transition-colors min-h-[120px]",
              isSameDay(d, today) && "bg-primary/5")}
            onClick={() => onCreateOnDay(d)}
          >
            {getEvents(d).map(evt => (
              <DraggableEventPill key={evt.id} evt={evt} onClick={onSelectEvent} />
            ))}
          </DroppableDay>
        ))}
      </div>
    </div>
  )
}

/* ──────────────────────────────────────────
   Drag Overlay Pill
────────────────────────────────────────── */
function DragOverlayPill({ evt }: { evt: CalendarEvent }) {
  return (
    <div className="rounded-[3px] px-2 py-1 text-[10px] font-medium shadow-lg pointer-events-none max-w-[150px] truncate"
      style={{ backgroundColor: evt.color + "ee", color: "#fff", borderLeft: `2px solid ${evt.color}` }}>
      {evt.title}
    </div>
  )
}

/* ──────────────────────────────────────────
   Etkinlik Sheet
────────────────────────────────────────── */
type SheetMode = "view" | "create" | "edit"

function EventSheet({ open, mode, event, defaultDate, onClose, onSaved, onDeleted }: {
  open: boolean; mode: SheetMode; event: CalendarEvent | null; defaultDate: Date | null
  onClose: () => void; onSaved: () => void; onDeleted: (id: string) => void
}) {
  const [title,          setTitle]          = useState("")
  const [description,    setDescription]    = useState("")
  const [startDate,      setStartDate]      = useState("")
  const [startTime,      setStartTime]      = useState("09:00")
  const [endDate,        setEndDate]        = useState("")
  const [endTime,        setEndTime]        = useState("10:00")
  const [allDay,         setAllDay]         = useState(false)
  const [color,          setColor]          = useState("#3b82f6")
  const [type,           setType]           = useState<"event" | "reminder">("event")
  const [recurrenceType, setRecurrenceType] = useState("none")
  const [recurrenceEnd,  setRecurrenceEnd]  = useState("")
  const [saving,         setSaving]         = useState(false)
  const [deleteOpen,     setDeleteOpen]     = useState(false)

  useEffect(() => {
    if (!open) return
    if ((mode === "edit" || mode === "view") && event) {
      const s = parseDate(event.startDate); const e = parseDate(event.endDate)
      setTitle(event.title); setDescription(event.description)
      setStartDate(toYMD(s)); setStartTime(`${String(s.getHours()).padStart(2,"0")}:${String(s.getMinutes()).padStart(2,"0")}`)
      setEndDate(toYMD(e));   setEndTime(`${String(e.getHours()).padStart(2,"0")}:${String(e.getMinutes()).padStart(2,"0")}`)
      setAllDay(event.allDay); setColor(event.color)
      setType(event.type === "reminder" ? "reminder" : "event")
      setRecurrenceType(event.recurrenceType ?? "none")
      setRecurrenceEnd(event.recurrenceEnd ?? "")
    } else {
      const d = defaultDate ?? new Date()
      setTitle(""); setDescription("")
      setStartDate(toYMD(d)); setStartTime("09:00")
      setEndDate(toYMD(d));   setEndTime("10:00")
      setAllDay(false); setColor("#3b82f6"); setType("event")
      setRecurrenceType("none"); setRecurrenceEnd("")
    }
  }, [open, mode, event, defaultDate])

  async function handleSave() {
    if (!title.trim()) { toast.error("Başlık gerekli"); return }
    setSaving(true)
    const startISO = allDay ? `${startDate}T00:00:00` : `${startDate}T${startTime}:00`
    const endISO   = allDay ? `${endDate}T23:59:59`   : `${endDate}T${endTime}:00`
    const body = {
      title: title.trim(), description, startDate: startISO, endDate: endISO, allDay, color, type,
      recurrenceType: recurrenceType === "none" ? null : recurrenceType,
      recurrenceEnd:  recurrenceEnd || null,
    }
    try {
      const origId = event ? baseId(event.id) : null
      const url    = mode === "edit" && origId ? `/api/calendar/${origId}` : "/api/calendar"
      const r      = await fetch(url, { method: mode === "edit" ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      if (!r.ok) throw new Error()
      toast.success(mode === "edit" ? "Güncellendi" : "Etkinlik oluşturuldu")
      onSaved()
    } catch { toast.error("Kaydedilemedi") } finally { setSaving(false) }
  }

  async function handleDelete() {
    if (!event) return
    try {
      await fetch(`/api/calendar/${baseId(event.id)}`, { method: "DELETE" })
      toast.success("Silindi"); onDeleted(event.id)
    } catch { toast.error("Silinemedi") }
  }

  const isReadonly = mode === "view" && event && (event.type === "task" || event.type === "note")
  const meta       = event ? TYPE_META[event.type] : null

  return (
    <>
      <Sheet open={open} onOpenChange={v => !v && onClose()}>
        <SheetContent className="!w-[480px] !max-w-[480px] p-0 flex flex-col gap-0">
          <SheetHeader className="px-5 py-4 border-b border-border/50">
            <VisuallyHidden.Root>
              <SheetTitle>{meta ? meta.label : mode === "create" ? "Yeni Etkinlik" : "Etkinlik"}</SheetTitle>
            </VisuallyHidden.Root>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {meta ? (
                  <span className={cn("flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border", meta.bg)}>
                    <meta.icon className="size-3" />{meta.label}
                  </span>
                ) : (
                  <span className="text-sm font-semibold">{mode === "create" ? "Yeni Etkinlik" : "Etkinlik"}</span>
                )}
              </div>
              {event && !isReadonly && (
                <button onClick={() => setDeleteOpen(true)} className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive">
                  <Trash2 className="size-3.5" />
                </button>
              )}
            </div>
          </SheetHeader>

          <ScrollArea className="flex-1 min-h-0">
            <div className="px-5 py-4 space-y-4">
              {isReadonly ? (
                <div className="space-y-3">
                  <h2 className="text-lg font-bold">{event!.title}</h2>
                  {event!.type === "note" ? (
                    event!.description && (
                      <NoteViewer
                        html={event!.description}
                        className="text-[12px] text-foreground leading-relaxed"
                      />
                    )
                  ) : (
                    event!.description && (
                      <p className="text-[12px] text-muted-foreground leading-relaxed whitespace-pre-wrap">
                        {event!.description}
                      </p>
                    )
                  )}
                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    <Clock className="size-3.5" />
                    {event!.allDay
                      ? new Date(event!.startDate).toLocaleDateString("tr-TR", { day:"numeric", month:"long", year:"numeric" })
                      : `${formatTime(event!.startDate)} – ${formatTime(event!.endDate)}`}
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    {event!.type === "task" ? "Bu görev proje panosundan yönetilebilir." : "Bu not, Not Defteri'nden yönetilebilir."}
                  </p>
                </div>
              ) : (
                <>
                  {/* Tip */}
                  <div className="flex gap-1.5">
                    {(["event", "reminder"] as const).map(t => {
                      const m = TYPE_META[t]
                      return (
                        <button key={t} onClick={() => setType(t)}
                          className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-[5px] text-[11px] font-medium border transition-colors",
                            type === t ? "border-foreground/30 bg-foreground text-background" : "border-border/40 hover:bg-muted/50")}>
                          <m.icon className="size-3.5" />{m.label}
                        </button>
                      )
                    })}
                  </div>

                  {/* Başlık */}
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Başlık</Label>
                    <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Etkinlik başlığı..." className="h-8 text-[12px] rounded-[5px]" />
                  </div>

                  {/* Açıklama */}
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Açıklama</Label>
                    <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="İsteğe bağlı..." className="text-[12px] rounded-[5px] resize-none min-h-[60px]" />
                  </div>

                  {/* Tüm gün */}
                  <div className="flex items-center gap-2">
                    <Switch id="allday" checked={allDay} onCheckedChange={setAllDay} />
                    <Label htmlFor="allday" className="text-[11px] cursor-pointer">Tüm gün</Label>
                  </div>

                  {/* Tarih */}
                  <div className="rounded-[5px] border border-border/50 overflow-hidden">
                    <div className="px-3 py-2 bg-muted/30 border-b border-border/40">
                      <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Tarih & Saat</span>
                    </div>
                    <div className="p-3 space-y-2.5">
                      <div className="space-y-1">
                        <Label className="text-[10px] text-muted-foreground">Başlangıç</Label>
                        <div className="flex gap-1.5">
                          <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="h-8 text-[11px] rounded-[5px] flex-1" />
                          {!allDay && <Input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className="h-8 text-[11px] rounded-[5px] w-[90px]" />}
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] text-muted-foreground">Bitiş</Label>
                        <div className="flex gap-1.5">
                          <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="h-8 text-[11px] rounded-[5px] flex-1" />
                          {!allDay && <Input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className="h-8 text-[11px] rounded-[5px] w-[90px]" />}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Tekrar */}
                  <div className="rounded-[5px] border border-border/50 overflow-hidden">
                    <div className="px-3 py-2 bg-muted/30 border-b border-border/40 flex items-center gap-1.5">
                      <RotateCcw className="size-3 text-muted-foreground" />
                      <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Tekrar</span>
                    </div>
                    <div className="p-3 space-y-2.5">
                      <Select value={recurrenceType} onValueChange={setRecurrenceType}>
                        <SelectTrigger className="h-8 text-[11px] rounded-[5px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {RECURRENCE_OPTIONS.map(o => (
                            <SelectItem key={o.value} value={o.value} className="text-[12px]">{o.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {recurrenceType !== "none" && (
                        <div className="space-y-1">
                          <Label className="text-[10px] text-muted-foreground">Bitiş tarihi (isteğe bağlı)</Label>
                          <Input type="date" value={recurrenceEnd} onChange={e => setRecurrenceEnd(e.target.value)} className="h-8 text-[11px] rounded-[5px]" />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Renk */}
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Renk</Label>
                    <div className="flex gap-2 flex-wrap">
                      {EVENT_COLORS.map(c => (
                        <button key={c} onClick={() => setColor(c)}
                          className={cn("size-6 rounded-full border-2 transition-transform hover:scale-110",
                            color === c ? "border-foreground scale-110" : "border-transparent")}
                          style={{ backgroundColor: c }} />
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          </ScrollArea>

          {!isReadonly && (
            <div className="px-5 py-3 border-t border-border/50 flex gap-2">
              <Button onClick={handleSave} disabled={saving} className="h-8 text-[12px] rounded-[5px] flex-1">
                {saving ? "Kaydediliyor..." : mode === "edit" ? "Güncelle" : "Oluştur"}
              </Button>
              <Button variant="outline" onClick={onClose} className="h-8 text-[12px] rounded-[5px]">İptal</Button>
            </div>
          )}
        </SheetContent>
      </Sheet>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-sm">Etkinliği sil</AlertDialogTitle>
            <AlertDialogDescription className="text-[12px]">
              {event && isRecurring(event) ? "Bu tekrarlayan etkinliğin tüm oluşumları silinecek." : "Bu etkinlik kalıcı olarak silinecek."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="text-[12px] h-8">İptal</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="text-[12px] h-8 bg-destructive text-white hover:bg-destructive/90">Sil</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

/* ──────────────────────────────────────────
   Ana Sayfa
────────────────────────────────────────── */
type ViewMode = "month" | "week"

export default function CalendarPage() {
  const today   = new Date()
  const [viewMode,   setViewMode]   = useState<ViewMode>("month")
  const [current,    setCurrent]    = useState(new Date(today.getFullYear(), today.getMonth(), 1))
  const [weekOf,     setWeekOf]     = useState(weekStart(today))
  const [selected,   setSelected]   = useState(today)
  const [events,     setEvents]     = useState<CalendarEvent[]>([])
  const [loading,    setLoading]    = useState(false)
  const [showSearch, setShowSearch] = useState(false)

  const [sheetOpen,  setSheetOpen]  = useState(false)
  const [sheetMode,  setSheetMode]  = useState<SheetMode>("create")
  const [sheetEvent, setSheetEvent] = useState<CalendarEvent | null>(null)
  const [sheetDate,  setSheetDate]  = useState<Date | null>(null)

  const [dragEvt,    setDragEvt]    = useState<CalendarEvent | null>(null)

  /* ── DnD sensors ── */
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  /* ── Veri yükleme ── */
  const load = useCallback(async (year: number, month: number) => {
    setLoading(true)
    const start = new Date(year, month - 1, 1).toISOString()
    const end   = new Date(year, month + 2, 0).toISOString()
    try {
      const r = await fetch(`/api/calendar?start=${start}&end=${end}`)
      if (r.ok) setEvents(await r.json())
    } catch { /**/ } finally { setLoading(false) }
  }, [])

  useEffect(() => { load(current.getFullYear(), current.getMonth() + 1) }, [current, load])

  /* ── DnD handlers ── */
  function onDragStart({ active }: DragStartEvent) {
    setDragEvt(active.data.current?.event ?? null)
  }

  async function onDragEnd({ active, over }: DragEndEvent) {
    setDragEvt(null)
    if (!over || !active.data.current?.event) return
    const evt:  CalendarEvent = active.data.current.event
    const dest: Date          = over.data.current?.date
    if (!dest) return

    const origStart = parseDate(evt.startDate)
    const origEnd   = parseDate(evt.endDate)
    const durMs     = origEnd.getTime() - origStart.getTime()
    if (isSameDay(origStart, dest)) return

    const newStart = new Date(dest)
    newStart.setHours(origStart.getHours(), origStart.getMinutes(), 0, 0)
    const newEnd   = new Date(newStart.getTime() + durMs)

    const origId   = baseId(evt.id)

    // Optimistic update
    setEvents(prev => prev.map(e => {
      if (baseId(e.id) !== origId) return e
      const diff = newStart.getTime() - origStart.getTime()
      const s    = new Date(parseDate(e.startDate).getTime() + diff)
      const en   = new Date(parseDate(e.endDate).getTime()   + diff)
      return { ...e, startDate: s.toISOString().slice(0,19).replace("T"," "), endDate: en.toISOString().slice(0,19).replace("T"," ") }
    }))

    try {
      const r = await fetch(`/api/calendar/${origId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startDate: newStart.toISOString(), endDate: newEnd.toISOString() }),
      })
      if (!r.ok) throw new Error()
    } catch {
      toast.error("Taşıma başarısız")
      load(current.getFullYear(), current.getMonth() + 1)  // rollback
    }
  }

  /* ── Navigasyon ── */
  function prevPeriod() {
    if (viewMode === "month") setCurrent(new Date(current.getFullYear(), current.getMonth() - 1, 1))
    else { const d = new Date(weekOf); d.setDate(d.getDate() - 7); setWeekOf(d) }
  }
  function nextPeriod() {
    if (viewMode === "month") setCurrent(new Date(current.getFullYear(), current.getMonth() + 1, 1))
    else { const d = new Date(weekOf); d.setDate(d.getDate() + 7); setWeekOf(d) }
  }
  function goToday() {
    setCurrent(new Date(today.getFullYear(), today.getMonth(), 1))
    setWeekOf(weekStart(today)); setSelected(today)
  }

  /* ── Sheet açma ── */
  function openCreate(date?: Date) {
    setSheetDate(date ?? selected); setSheetEvent(null); setSheetMode("create"); setSheetOpen(true)
  }
  function openView(evt: CalendarEvent) {
    setSheetEvent(evt)
    setSheetMode(evt.type === "task" || evt.type === "note" ? "view" : "edit")
    setSheetOpen(true)
  }
  function handleSearchSelect(evt: CalendarEvent) {
    const d = parseDate(evt.startDate)
    setCurrent(new Date(d.getFullYear(), d.getMonth(), 1))
    setSelected(d)
    openView(evt)
  }

  /* ── Lejant sayaçları ── */
  const counts = {
    event:    events.filter(e => e.type === "event").length,
    reminder: events.filter(e => e.type === "reminder").length,
    task:     events.filter(e => e.type === "task").length,
    note:     events.filter(e => e.type === "note").length,
  }

  const periodLabel = viewMode === "month"
    ? `${TR_MONTHS[current.getMonth()]} ${current.getFullYear()}`
    : (() => {
        const end = new Date(weekOf); end.setDate(end.getDate() + 6)
        return `${weekOf.getDate()} ${TR_MONTHS[weekOf.getMonth()]} – ${end.getDate()} ${TR_MONTHS[end.getMonth()]} ${end.getFullYear()}`
      })()

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div className="flex h-[calc(100vh-0px)] overflow-hidden" style={{ backgroundColor: "#F4F2F0" }}>

        {/* ── Sol panel ── */}
        <div className="w-[220px] shrink-0 flex flex-col border-r border-border/40 bg-[#F4F2F0]">
          <div className="px-3 pt-4 pb-2 space-y-2">
            <Button onClick={() => openCreate()} className="w-full h-8 text-[11px] rounded-[5px] gap-1.5">
              <Plus className="size-3.5" />Yeni Etkinlik
            </Button>
            {/* Arama toggle */}
            <button
              onClick={() => setShowSearch(v => !v)}
              className={cn(
                "w-full flex items-center gap-2 h-7 px-2.5 rounded-[5px] text-[11px] border transition-colors",
                showSearch ? "bg-foreground text-background border-foreground" : "border-border/40 text-muted-foreground hover:bg-muted/50"
              )}
            >
              <Search className="size-3.5" />Ara
            </button>
          </div>

          {/* Arama paneli */}
          {showSearch && (
            <div className="border-t border-border/30 pb-1">
              <SearchPanel events={events} onSelect={handleSearchSelect} onClose={() => setShowSearch(false)} />
            </div>
          )}

          {/* Mini takvim — arama açıkken gizle */}
          {!showSearch && (
            <>
              <MiniCalendar
                current={current} selected={selected} events={events}
                onSelect={d => { setSelected(d); setCurrent(new Date(d.getFullYear(), d.getMonth(), 1)) }}
                onNavigate={d => setCurrent(d)}
              />
              {/* Lejant */}
              <div className="px-3 py-2 border-t border-border/30">
                <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Türler</p>
                <div className="space-y-1">
                  {(Object.entries(TYPE_META) as [string, typeof TYPE_META[string]][]).map(([k, v]) => (
                    <div key={k} className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <v.icon className="size-3 text-muted-foreground" />
                        <span className="text-[10px] text-muted-foreground">{v.label}</span>
                      </div>
                      <span className="text-[10px] font-medium tabular-nums text-muted-foreground">{counts[k as keyof typeof counts]}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          <DayEventList date={selected} events={events} onSelect={openView} onCreate={openCreate} />
        </div>

        {/* ── Ana alan ── */}
        <div className="flex-1 flex flex-col min-w-0 bg-white rounded-tl-[8px] overflow-hidden">
          {/* Header */}
          <div className="flex items-center gap-3 px-5 py-3 border-b border-border/40 shrink-0">
            <div className="flex items-center gap-1">
              <button onClick={prevPeriod} className="p-1.5 rounded-[5px] hover:bg-muted/60 text-muted-foreground transition-colors"><ChevronLeft className="size-4" /></button>
              <button onClick={nextPeriod} className="p-1.5 rounded-[5px] hover:bg-muted/60 text-muted-foreground transition-colors"><ChevronRight className="size-4" /></button>
            </div>
            <h1 className="text-[15px] font-semibold flex-1">{periodLabel}</h1>
            {loading && <span className="text-[10px] text-muted-foreground animate-pulse">Yükleniyor...</span>}
            <button onClick={goToday} className="px-3 py-1 rounded-[5px] text-[11px] font-medium border border-border/50 hover:bg-muted/50 transition-colors">Bugün</button>
            <div className="flex items-center rounded-[5px] border border-border/50 overflow-hidden">
              <button onClick={() => setViewMode("month")} className={cn("flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium transition-colors",
                viewMode === "month" ? "bg-foreground text-background" : "hover:bg-muted/50 text-muted-foreground")}>
                <CalendarDays className="size-3.5" />Ay
              </button>
              <button onClick={() => setViewMode("week")} className={cn("flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium transition-colors border-l border-border/50",
                viewMode === "week" ? "bg-foreground text-background" : "hover:bg-muted/50 text-muted-foreground")}>
                <CalendarRange className="size-3.5" />Hafta
              </button>
            </div>
          </div>

          {viewMode === "month"
            ? <MonthGrid year={current.getFullYear()} month={current.getMonth()} events={events} selected={selected}
                onSelectDay={setSelected} onSelectEvent={openView} onCreateOnDay={openCreate} />
            : <WeekGrid weekOf={weekOf} events={events} onSelectEvent={openView} onCreateOnDay={openCreate} />
          }
        </div>
      </div>

      {/* Drag overlay */}
      <DragOverlay dropAnimation={null}>
        {dragEvt ? <DragOverlayPill evt={dragEvt} /> : null}
      </DragOverlay>

      <EventSheet
        open={sheetOpen} mode={sheetMode} event={sheetEvent} defaultDate={sheetDate}
        onClose={() => setSheetOpen(false)}
        onSaved={() => { setSheetOpen(false); load(current.getFullYear(), current.getMonth() + 1) }}
        onDeleted={() => { setSheetOpen(false); load(current.getFullYear(), current.getMonth() + 1) }}
      />
    </DndContext>
  )
}
