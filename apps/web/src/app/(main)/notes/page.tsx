"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import {
  Plus, Search, Pin, PinOff, Trash2, Tag, X,
  StickyNote, Clock, ChevronDown, User, Calendar,
} from "lucide-react"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import type { NoteItem } from "@/app/api/notes/route"
import type { NoteDetail } from "@/app/api/notes/[id]/route"

/* ── Renk seçenekleri ── */
const NOTE_COLORS = [
  { value: "#ffffff", label: "Beyaz" },
  { value: "#fef9c3", label: "Sarı" },
  { value: "#dcfce7", label: "Yeşil" },
  { value: "#dbeafe", label: "Mavi" },
  { value: "#fce7f3", label: "Pembe" },
  { value: "#f3e8ff", label: "Mor" },
  { value: "#ffedd5", label: "Turuncu" },
  { value: "#f1f5f9", label: "Gri" },
]

function formatDate(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  if (diff < 60_000)    return "Az önce"
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} dk önce`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} sa önce`
  return d.toLocaleDateString("tr-TR", { day: "2-digit", month: "short", year: "numeric" })
}

/* ── Sol panel: Not listesi ── */
function NoteList({
  notes, selected, loading, search, onSearch, onSelect, onCreate, onPin,
}: {
  notes: NoteItem[]
  selected: string | null
  loading: boolean
  search: string
  onSearch: (v: string) => void
  onSelect: (id: string) => void
  onCreate: () => void
  onPin: (id: string, pinned: boolean) => void
}) {
  const filtered = notes.filter(n =>
    n.title.toLowerCase().includes(search.toLowerCase()) ||
    n.excerpt.toLowerCase().includes(search.toLowerCase()) ||
    n.tags.some(t => t.toLowerCase().includes(search.toLowerCase()))
  )
  const pinned   = filtered.filter(n => n.pinned)
  const unpinned = filtered.filter(n => !n.pinned)

  return (
    <div className="w-[260px] shrink-0 flex flex-col h-full border-r border-border/40">
      {/* Başlık + yeni not */}
      <div className="px-3 pt-3 pb-2 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
            Notlar {!loading && <span className="font-normal">({notes.length})</span>}
          </span>
          <button
            onClick={onCreate}
            className="flex items-center gap-1 px-2 py-1 rounded-[5px] text-[10px] font-semibold bg-foreground text-background hover:bg-foreground/90 transition-colors"
          >
            <Plus className="size-3" /> Yeni
          </button>
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => onSearch(e.target.value)}
            placeholder="Ara..."
            className="h-7 pl-7 text-[11px] rounded-[5px] bg-muted/40 border-border/40"
          />
          {search && (
            <button onClick={() => onSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="size-3" />
            </button>
          )}
        </div>
      </div>

      {/* Liste */}
      <div className="flex-1 overflow-y-auto px-2 pb-3 space-y-0.5">
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="rounded-[6px] p-2.5 space-y-1.5">
              <Skeleton className="h-3 w-3/4 rounded-[3px]" />
              <Skeleton className="h-2.5 w-full rounded-[3px]" />
              <Skeleton className="h-2 w-1/3 rounded-[3px]" />
            </div>
          ))
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 gap-2 text-muted-foreground">
            <StickyNote className="size-8 opacity-20" />
            <p className="text-[11px]">{search ? "Sonuç bulunamadı" : "Henüz not yok"}</p>
          </div>
        ) : (
          <>
            {pinned.length > 0 && (
              <>
                <div className="flex items-center gap-1 px-1.5 py-1.5">
                  <Pin className="size-3 text-muted-foreground" />
                  <span className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wide">Sabitlendi</span>
                </div>
                {pinned.map(n => (
                  <NoteListItem key={n.id} note={n} selected={selected === n.id} onSelect={onSelect} onPin={onPin} />
                ))}
                {unpinned.length > 0 && <div className="h-px bg-border/30 my-1.5 mx-1" />}
              </>
            )}
            {unpinned.map(n => (
              <NoteListItem key={n.id} note={n} selected={selected === n.id} onSelect={onSelect} onPin={onPin} />
            ))}
          </>
        )}
      </div>
    </div>
  )
}

function NoteListItem({ note, selected, onSelect, onPin }: {
  note: NoteItem; selected: boolean
  onSelect: (id: string) => void
  onPin: (id: string, pinned: boolean) => void
}) {
  return (
    <button
      onClick={() => onSelect(note.id)}
      className={cn(
        "w-full text-left rounded-[6px] px-2.5 py-2 transition-colors group relative",
        selected ? "bg-foreground/[0.07]" : "hover:bg-muted/50"
      )}
      style={note.color !== "#ffffff" ? { backgroundColor: selected ? undefined : note.color + "80" } : {}}
    >
      {/* Sabitle butonu */}
      <button
        onClick={e => { e.stopPropagation(); onPin(note.id, !note.pinned) }}
        className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-all"
      >
        {note.pinned ? <PinOff className="size-3" /> : <Pin className="size-3" />}
      </button>

      <p className="text-[12px] font-medium leading-tight line-clamp-1 pr-4">{note.title || "Başlıksız"}</p>
      {note.excerpt && (
        <p className="text-[10px] text-muted-foreground line-clamp-2 mt-0.5 leading-relaxed">{note.excerpt}</p>
      )}
      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
        <span className="text-[9px] text-muted-foreground flex items-center gap-0.5">
          <Clock className="size-2.5" />{formatDate(note.updatedAt)}
        </span>
        <span className="text-[9px] text-muted-foreground flex items-center gap-0.5">
          <User className="size-2.5" />{note.createdBy}
        </span>
        {note.tags.slice(0, 2).map(t => (
          <span key={t} className="text-[9px] bg-muted/60 text-muted-foreground px-1.5 py-0.5 rounded-full">{t}</span>
        ))}
      </div>
    </button>
  )
}

/* ── Sağ panel: Editör ── */
function NoteEditor({ noteId, onUpdated, onDeleted, onPinToggled }: {
  noteId: string | null
  onUpdated: (id: string, title: string, excerpt: string) => void
  onDeleted: (id: string) => void
  onPinToggled: (id: string, pinned: boolean) => void
}) {
  const [note,       setNote]       = useState<NoteDetail | null>(null)
  const [title,      setTitle]      = useState("")
  const [content,    setContent]    = useState("")
  const [tags,       setTags]       = useState<string[]>([])
  const [color,      setColor]      = useState("#ffffff")
  const [tagInput,   setTagInput]   = useState("")
  const [saving,     setSaving]     = useState(false)
  const [showColors, setShowColors] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [loading,    setLoading]    = useState(false)

  const saveTimer  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const titleRef   = useRef<HTMLInputElement>(null)

  // Not yükle
  useEffect(() => {
    if (!noteId) { setNote(null); return }
    setLoading(true)
    fetch(`/api/notes/${noteId}`)
      .then(r => r.ok ? r.json() : null)
      .then((d: NoteDetail | null) => {
        if (!d) return
        setNote(d)
        setTitle(d.title === "Yeni Not" ? "" : d.title)
        setContent(d.content)
        setTags(d.tags)
        setColor(d.color)
      })
      .finally(() => setLoading(false))
  }, [noteId])

  // Auto-save (debounce 800ms)
  const save = useCallback(async (t: string, c: string, tg: string[], cl: string) => {
    if (!noteId) return
    setSaving(true)
    try {
      await fetch(`/api/notes/${noteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title:   t.trim() || "Yeni Not",
          content: c,
          tags:    tg,
          color:   cl,
        }),
      })
      onUpdated(noteId, t.trim() || "Yeni Not", c)
    } catch { /* sessizce geç */ } finally { setSaving(false) }
  }, [noteId, onUpdated])

  const schedSave = useCallback((t: string, c: string, tg: string[], cl: string) => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => save(t, c, tg, cl), 800)
  }, [save])

  function handleTitle(v: string) { setTitle(v); schedSave(v, content, tags, color) }
  function handleContent(v: string) { setContent(v); schedSave(title, v, tags, color) }
  function handleColor(v: string) { setColor(v); setShowColors(false); save(title, content, tags, v) }

  function addTag() {
    const v = tagInput.trim()
    if (!v || tags.includes(v)) { setTagInput(""); return }
    const next = [...tags, v]
    setTags(next); setTagInput(""); schedSave(title, content, next, color)
  }
  function removeTag(t: string) {
    const next = tags.filter(x => x !== t)
    setTags(next); schedSave(title, content, next, color)
  }

  async function handleDelete() {
    if (!noteId) return
    try {
      await fetch(`/api/notes/${noteId}`, { method: "DELETE" })
      toast.success("Not silindi")
      onDeleted(noteId)
    } catch { toast.error("Silinemedi") }
  }

  function handlePin() {
    if (!note || !noteId) return
    const next = !note.pinned
    setNote({ ...note, pinned: next })
    onPinToggled(noteId, next)
  }

  if (!noteId) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground">
        <StickyNote className="size-14 opacity-15" />
        <p className="text-[13px] font-medium">Bir not seçin veya yeni not oluşturun</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex-1 p-6 space-y-4">
        <Skeleton className="h-8 w-2/3 rounded-[4px]" />
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-4 rounded-[3px]" style={{ width: `${85 - i * 8}%` }} />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col min-h-0" style={{ backgroundColor: color !== "#ffffff" ? color : undefined }}>
      {/* Editör araç çubuğu */}
      <div className="flex items-center gap-2 px-5 py-2.5 border-b border-border/30 shrink-0">
        {/* Renk seçici */}
        <div className="relative">
          <button
            onClick={() => setShowColors(v => !v)}
            className="flex items-center gap-1 px-2 py-1 rounded-[5px] text-[10px] text-muted-foreground hover:bg-muted/50 transition-colors"
          >
            <span className="size-3 rounded-full border border-border/50" style={{ backgroundColor: color }} />
            <ChevronDown className="size-2.5" />
          </button>
          {showColors && (
            <div className="absolute top-full left-0 mt-1 z-50 rounded-[6px] border border-border/50 bg-white shadow-lg p-2 flex gap-1.5 flex-wrap w-[148px]">
              {NOTE_COLORS.map(c => (
                <button
                  key={c.value}
                  onClick={() => handleColor(c.value)}
                  title={c.label}
                  className={cn(
                    "size-6 rounded-full border transition-transform hover:scale-110",
                    color === c.value ? "border-foreground/50 scale-110" : "border-border/30"
                  )}
                  style={{ backgroundColor: c.value }}
                />
              ))}
            </div>
          )}
        </div>

        <div className="h-3.5 w-px bg-border/40" />

        {/* Sabitle */}
        <button
          onClick={handlePin}
          className={cn(
            "flex items-center gap-1 px-2 py-1 rounded-[5px] text-[10px] transition-colors",
            note?.pinned
              ? "text-amber-600 bg-amber-50 hover:bg-amber-100"
              : "text-muted-foreground hover:bg-muted/50"
          )}
        >
          {note?.pinned ? <PinOff className="size-3" /> : <Pin className="size-3" />}
          {note?.pinned ? "Sabiti Kaldır" : "Sabitle"}
        </button>

        <div className="flex-1" />

        {/* Kayıt durumu */}
        <span className={cn(
          "text-[10px] transition-opacity",
          saving ? "text-muted-foreground opacity-100" : "opacity-0"
        )}>
          Kaydediliyor...
        </span>

        {/* Tarih */}
        {note && (
          <span className="text-[10px] text-muted-foreground hidden sm:block">
            {formatDate(note.updatedAt)}
          </span>
        )}

        {/* Sil */}
        <button
          onClick={() => setDeleteOpen(true)}
          className="flex items-center gap-1 px-2 py-1 rounded-[5px] text-[10px] text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
        >
          <Trash2 className="size-3" />
        </button>
      </div>

      {/* Başlık */}
      <input
        ref={titleRef}
        value={title}
        onChange={e => handleTitle(e.target.value)}
        placeholder="Başlık..."
        className="w-full px-5 pt-5 pb-3 text-xl font-bold bg-transparent outline-none placeholder:text-muted-foreground/40 resize-none"
      />

      {/* Meta bilgi satırı */}
      <div className="px-5 pb-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
        {/* Oluşturan */}
        <div className="flex items-center gap-1.5">
          <div className="size-5 rounded-full bg-muted flex items-center justify-center shrink-0">
            <User className="size-3 text-muted-foreground" />
          </div>
          <span className="text-[11px] text-muted-foreground">{note?.createdBy ?? "—"}</span>
        </div>

        {/* Oluşturma tarihi */}
        <div className="flex items-center gap-1.5">
          <Calendar className="size-3 text-muted-foreground shrink-0" />
          <span className="text-[11px] text-muted-foreground">
            {note ? new Date(note.createdAt).toLocaleDateString("tr-TR", { day: "2-digit", month: "long", year: "numeric" }) : "—"}
          </span>
        </div>

        {/* Etiketler */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <Tag className="size-3 text-muted-foreground shrink-0" />
          {tags.map(t => (
            <span key={t}
              className="flex items-center gap-1 text-[10px] bg-muted/70 text-muted-foreground px-2 py-0.5 rounded-full border border-border/30">
              {t}
              <button onClick={() => removeTag(t)} className="hover:text-destructive transition-colors">
                <X className="size-2.5" />
              </button>
            </span>
          ))}
          <input
            value={tagInput}
            onChange={e => setTagInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addTag() } }}
            placeholder="+ Etiket"
            className="text-[10px] bg-transparent outline-none placeholder:text-muted-foreground/40 min-w-[60px]"
          />
        </div>
      </div>

      <div className="h-px bg-border/30 mx-5" />

      {/* İçerik */}
      <textarea
        value={content}
        onChange={e => handleContent(e.target.value)}
        placeholder="Notunuzu buraya yazın..."
        className="flex-1 w-full px-5 py-4 bg-transparent outline-none resize-none text-[13px] leading-relaxed placeholder:text-muted-foreground/30"
      />

      {/* Alt bilgi */}
      <div className="px-5 py-2 border-t border-border/20 flex items-center justify-between shrink-0">
        <span className="text-[10px] text-muted-foreground">
          {content.length} karakter · {content.split(/\s+/).filter(Boolean).length} kelime
        </span>
        {note && (
          <span className="text-[10px] text-muted-foreground flex items-center gap-1">
            <Clock className="size-3" />
            Son güncelleme: {formatDate(note.updatedAt)}
          </span>
        )}
      </div>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-sm">Notu sil</AlertDialogTitle>
            <AlertDialogDescription className="text-[12px]">
              Bu not kalıcı olarak silinecek.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="text-[12px] h-8">İptal</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}
              className="text-[12px] h-8 bg-destructive text-white hover:bg-destructive/90">
              Sil
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

/* ── Ana sayfa ── */
export default function NotesPage() {
  const [notes,    setNotes]    = useState<NoteItem[]>([])
  const [loading,  setLoading]  = useState(true)
  const [selected, setSelected] = useState<string | null>(null)
  const [search,   setSearch]   = useState("")

  async function loadNotes() {
    try {
      const r = await fetch("/api/notes")
      if (r.ok) setNotes(await r.json())
    } catch { /* */ }
  }

  useEffect(() => {
    loadNotes().finally(() => setLoading(false))
  }, [])

  async function handleCreate() {
    try {
      const r = await fetch("/api/notes", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      })
      if (!r.ok) throw new Error()
      const { id } = await r.json()
      const newNote: NoteItem = {
        id, title: "Yeni Not", excerpt: "", tags: [],
        color: "#ffffff", pinned: false,
        createdBy: "Admin",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      setNotes(prev => [newNote, ...prev])
      setSelected(id)
    } catch { toast.error("Not oluşturulamadı") }
  }

  function handleUpdated(id: string, title: string, content: string) {
    setNotes(prev => prev.map(n =>
      n.id === id
        ? { ...n, title, excerpt: content.replace(/\n+/g, " ").trim().slice(0, 120), updatedAt: new Date().toISOString() }
        : n
    ))
  }

  function handleDeleted(id: string) {
    setNotes(prev => {
      const remaining = prev.filter(n => n.id !== id)
      setSelected(remaining[0]?.id ?? null)
      return remaining
    })
  }

  function handlePin(id: string, pinned: boolean) {
    setNotes(prev => {
      const updated = prev.map(n => n.id === id ? { ...n, pinned } : n)
      return [...updated.filter(n => n.pinned), ...updated.filter(n => !n.pinned)]
    })
    fetch(`/api/notes/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pinned }),
    }).catch(() => {})
  }

  return (
    <div className="flex h-[calc(100vh-0px)] overflow-hidden">
      {/* Sol: Not listesi */}
      <div className="shrink-0 h-full" style={{ backgroundColor: "#F4F2F0" }}>
        <NoteList
          notes={notes}
          selected={selected}
          loading={loading}
          search={search}
          onSearch={setSearch}
          onSelect={setSelected}
          onCreate={handleCreate}
          onPin={handlePin}
        />
      </div>

      {/* Sağ: Editör */}
      <div className="flex-1 flex flex-col h-full overflow-hidden bg-white">
        <NoteEditor
          noteId={selected}
          onUpdated={handleUpdated}
          onDeleted={handleDeleted}
          onPinToggled={handlePin}
        />
      </div>
    </div>
  )
}
