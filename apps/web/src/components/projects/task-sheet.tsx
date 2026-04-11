"use client"

import { useState, useEffect } from "react"
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Separator } from "@/components/ui/separator"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { toast } from "sonner"
import { Calendar, User, Tag, Trash2, MessageSquare, Send, Clock } from "lucide-react"
import { cn } from "@/lib/utils"
import type { BoardTask, BoardColumn } from "@/app/api/projects/[id]/route"

interface Comment { id: string; author: string; content: string; createdAt: string }

const PRIORITY_OPTS = [
  { value: "low",      label: "Düşük",   cls: "bg-slate-100 text-slate-600" },
  { value: "medium",   label: "Orta",    cls: "bg-amber-100 text-amber-700" },
  { value: "high",     label: "Yüksek",  cls: "bg-orange-100 text-orange-700" },
  { value: "critical", label: "Kritik",  cls: "bg-red-100 text-red-700" },
]

interface Props {
  task:       BoardTask | null
  columns:    BoardColumn[]
  projectId:  string
  open:       boolean
  onClose:    () => void
  onUpdated:  () => void
  onDeleted:  () => void
}

export function TaskSheet({ task, columns, projectId, open, onClose, onUpdated, onDeleted }: Props) {
  const [title,       setTitle]       = useState("")
  const [description, setDescription] = useState("")
  const [priority,    setPriority]    = useState<BoardTask["priority"]>("medium")
  const [assignedTo,  setAssignedTo]  = useState("")
  const [dueDate,     setDueDate]     = useState("")
  const [labelInput,  setLabelInput]  = useState("")
  const [labels,      setLabels]      = useState<string[]>([])
  const [columnId,    setColumnId]    = useState("")
  const [saving,      setSaving]      = useState(false)

  const [comments,     setComments]    = useState<Comment[]>([])
  const [commLoading,  setCommLoading] = useState(false)
  const [newComment,   setNewComment]  = useState("")
  const [sendingComm,  setSendingComm] = useState(false)

  useEffect(() => {
    if (!task) return
    setTitle(task.title)
    setDescription(task.description ?? "")
    setPriority(task.priority)
    setAssignedTo(task.assignedTo ?? "")
    setDueDate(task.dueDate ?? "")
    setLabels(task.labels)
    setColumnId(task.columnId)
    loadComments(task.id)
  }, [task?.id])

  async function loadComments(taskId: string) {
    setCommLoading(true)
    try {
      const r = await fetch(`/api/projects/${projectId}/tasks/${taskId}`)
      if (r.ok) setComments(await r.json())
    } catch { /* */ } finally { setCommLoading(false) }
  }

  async function handleSave() {
    if (!task) return
    setSaving(true)
    try {
      const body: Record<string, unknown> = {
        title, description: description || null,
        priority, assignedTo: assignedTo || null,
        dueDate: dueDate || null, labels,
      }
      // Kolon değiştiyse taşıma da yap
      if (columnId !== task.columnId) {
        body.columnId = columnId
        body.position = 9999
      }
      const r = await fetch(`/api/projects/${projectId}/tasks/${task.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!r.ok) throw new Error()
      toast.success("Görev güncellendi")
      onUpdated()
    } catch {
      toast.error("Görev güncellenemedi")
    } finally { setSaving(false) }
  }

  async function handleDelete() {
    if (!task) return
    try {
      await fetch(`/api/projects/${projectId}/tasks/${task.id}`, { method: "DELETE" })
      toast.success("Görev silindi")
      onDeleted()
    } catch {
      toast.error("Görev silinemedi")
    }
  }

  async function handleComment() {
    if (!task || !newComment.trim()) return
    setSendingComm(true)
    try {
      await fetch(`/api/projects/${projectId}/tasks/${task.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment: { author: "Admin", content: newComment.trim() } }),
      })
      setNewComment("")
      loadComments(task.id)
      onUpdated()
    } catch { toast.error("Yorum eklenemedi") } finally { setSendingComm(false) }
  }

  function addLabel() {
    const v = labelInput.trim()
    if (v && !labels.includes(v)) setLabels([...labels, v])
    setLabelInput("")
  }

  if (!task) return null

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="!w-[520px] !max-w-[520px] p-0 flex flex-col gap-0">
        <SheetHeader className="px-5 py-4 border-b border-border/50">
          <SheetTitle className="text-[13px] font-semibold leading-tight pr-8 line-clamp-2">
            {task.title}
          </SheetTitle>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            {new Date(task.createdAt).toLocaleDateString("tr-TR", { day: "2-digit", month: "long", year: "numeric" })} tarihinde oluşturuldu
          </p>
        </SheetHeader>

        <ScrollArea className="flex-1">
          <div className="px-4 py-4 space-y-4">

            {/* Başlık */}
            <div className="rounded-[5px] border border-border/50 overflow-hidden">
              <div className="px-3 py-2 bg-muted/30 border-b border-border/40">
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Görev Bilgileri</span>
              </div>
              <div className="px-3 py-3 space-y-3">
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">Başlık</Label>
                  <Input value={title} onChange={(e) => setTitle(e.target.value)}
                    className="h-8 text-[11px] rounded-[5px]" />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">Açıklama</Label>
                  <Textarea value={description} onChange={(e) => setDescription(e.target.value)}
                    rows={3} className="text-[11px] rounded-[5px] resize-none" placeholder="Açıklama ekle..." />
                </div>
              </div>
            </div>

            {/* Detaylar */}
            <div className="rounded-[5px] border border-border/50 overflow-hidden">
              <div className="px-3 py-2 bg-muted/30 border-b border-border/40">
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Detaylar</span>
              </div>
              <div className="px-3 py-3 grid grid-cols-2 gap-3">
                {/* Öncelik */}
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">Öncelik</Label>
                  <Select value={priority} onValueChange={(v) => setPriority(v as BoardTask["priority"])}>
                    <SelectTrigger className="h-8 text-[11px] rounded-[5px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PRIORITY_OPTS.map((o) => (
                        <SelectItem key={o.value} value={o.value} className="text-[11px]">
                          <span className={cn("px-1.5 py-0.5 rounded-[3px] text-[10px] font-medium", o.cls)}>
                            {o.label}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Kolon */}
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">Kolon</Label>
                  <Select value={columnId} onValueChange={setColumnId}>
                    <SelectTrigger className="h-8 text-[11px] rounded-[5px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {columns.map((c) => (
                        <SelectItem key={c.id} value={c.id} className="text-[11px]">{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Atanan */}
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <User className="size-3" /> Atanan
                  </Label>
                  <Input value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}
                    className="h-8 text-[11px] rounded-[5px]" placeholder="Kullanıcı adı..." />
                </div>

                {/* Bitiş tarihi */}
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <Calendar className="size-3" /> Bitiş Tarihi
                  </Label>
                  <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)}
                    className="h-8 text-[11px] rounded-[5px]" />
                </div>
              </div>
            </div>

            {/* Etiketler */}
            <div className="rounded-[5px] border border-border/50 overflow-hidden">
              <div className="px-3 py-2 bg-muted/30 border-b border-border/40">
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                  <Tag className="size-3" /> Etiketler
                </span>
              </div>
              <div className="px-3 py-3 space-y-2">
                <div className="flex gap-1.5">
                  <Input value={labelInput} onChange={(e) => setLabelInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addLabel())}
                    className="h-7 text-[11px] rounded-[5px] flex-1" placeholder="Etiket ekle, Enter'a bas..." />
                  <button onClick={addLabel}
                    className="h-7 px-2.5 text-[10px] font-medium rounded-[5px] bg-muted hover:bg-muted/80 transition-colors">
                    Ekle
                  </button>
                </div>
                {labels.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {labels.map((l) => (
                      <Badge key={l} variant="secondary" className="text-[10px] px-2 py-0.5 gap-1 cursor-pointer"
                        onClick={() => setLabels(labels.filter((x) => x !== l))}>
                        {l} ×
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Yorumlar */}
            <div className="rounded-[5px] border border-border/50 overflow-hidden">
              <div className="px-3 py-2 bg-muted/30 border-b border-border/40">
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                  <MessageSquare className="size-3" /> Yorumlar
                  {comments.length > 0 && (
                    <span className="ml-1 bg-muted px-1.5 py-0.5 rounded-[3px]">{comments.length}</span>
                  )}
                </span>
              </div>
              <div className="px-3 py-3 space-y-3">
                {commLoading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-10 w-full rounded-[4px]" />
                    <Skeleton className="h-10 w-3/4 rounded-[4px]" />
                  </div>
                ) : comments.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground text-center py-2">Henüz yorum yok</p>
                ) : (
                  <div className="space-y-2">
                    {comments.map((c) => (
                      <div key={c.id} className="rounded-[4px] bg-muted/30 px-3 py-2">
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className="text-[11px] font-medium">{c.author}</span>
                          <span className="text-[9px] text-muted-foreground flex items-center gap-0.5">
                            <Clock className="size-2.5" />
                            {new Date(c.createdAt).toLocaleString("tr-TR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground leading-relaxed">{c.content}</p>
                      </div>
                    ))}
                  </div>
                )}
                <Separator />
                <div className="flex gap-1.5">
                  <Input value={newComment} onChange={(e) => setNewComment(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), handleComment())}
                    className="h-7 text-[11px] rounded-[5px] flex-1" placeholder="Yorum yaz..." />
                  <button onClick={handleComment} disabled={!newComment.trim() || sendingComm}
                    className="h-7 w-7 flex items-center justify-center rounded-[5px] bg-foreground text-background hover:bg-foreground/90 disabled:opacity-40 transition-colors">
                    <Send className="size-3" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </ScrollArea>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-border/50 flex items-center justify-between gap-2">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-[5px] text-[11px] font-medium text-destructive hover:bg-destructive/10 transition-colors">
                <Trash2 className="size-3.5" />
                Sil
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle className="text-sm">Görevi sil</AlertDialogTitle>
                <AlertDialogDescription className="text-[12px]">
                  Bu görev kalıcı olarak silinecek. Bu işlem geri alınamaz.
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

          <div className="flex items-center gap-2">
            <button onClick={onClose}
              className="px-3 py-1.5 rounded-[5px] text-[11px] font-medium border border-border/60 hover:bg-muted/40 transition-colors">
              İptal
            </button>
            <button onClick={handleSave} disabled={saving}
              className="px-4 py-1.5 rounded-[5px] text-[11px] font-semibold bg-foreground text-background hover:bg-foreground/90 disabled:opacity-50 transition-colors">
              {saving ? "Kaydediliyor..." : "Kaydet"}
            </button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
