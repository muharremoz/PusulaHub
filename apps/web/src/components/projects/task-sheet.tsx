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
import { Checkbox } from "@/components/ui/checkbox"
import { Skeleton } from "@/components/ui/skeleton"
import { Separator } from "@/components/ui/separator"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { toast } from "sonner"
import {
  Calendar, User, Tag, Trash2, MessageSquare, Send, Clock,
  ListChecks, Plus, X, Activity, Timer,
} from "lucide-react"
import { cn } from "@/lib/utils"
import type { BoardTask, BoardColumn } from "@/app/api/projects/[id]/route"

interface Comment { id: string; author: string; content: string; createdAt: string }
interface Subtask { id: string; title: string; completed: boolean; position: number }
interface ActivityItem { id: string; taskId: string | null; userName: string | null; action: string; detail: string | null; createdAt: string }
interface UserLookup { id: string; username: string; fullName: string | null }

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
  const [title,          setTitle]          = useState("")
  const [description,    setDescription]    = useState("")
  const [priority,       setPriority]       = useState<BoardTask["priority"]>("medium")
  const [assignedTo,     setAssignedTo]     = useState("")
  const [dueDate,        setDueDate]        = useState("")
  const [labelInput,     setLabelInput]     = useState("")
  const [labels,         setLabels]         = useState<string[]>([])
  const [columnId,       setColumnId]       = useState("")
  const [estimatedHours, setEstimatedHours] = useState("")
  const [actualHours,    setActualHours]    = useState("")
  const [saving,         setSaving]         = useState(false)

  const [comments,     setComments]    = useState<Comment[]>([])
  const [commLoading,  setCommLoading] = useState(false)
  const [newComment,   setNewComment]  = useState("")
  const [sendingComm,  setSendingComm] = useState(false)

  // Subtasks
  const [subtasks,      setSubtasks]      = useState<Subtask[]>([])
  const [subtaskLoading,setSubtaskLoading]= useState(false)
  const [newSubtask,    setNewSubtask]    = useState("")

  // Activity
  const [activities,      setActivities]      = useState<ActivityItem[]>([])
  const [activityLoading, setActivityLoading] = useState(false)

  // Users (for assignee selector)
  const [users, setUsers] = useState<UserLookup[]>([])

  useEffect(() => {
    if (!task) return
    setTitle(task.title)
    setDescription(task.description ?? "")
    setPriority(task.priority)
    setAssignedTo(task.assignedTo ?? "")
    setDueDate(task.dueDate ?? "")
    setLabels(task.labels)
    setColumnId(task.columnId)
    setEstimatedHours(task.estimatedHours?.toString() ?? "")
    setActualHours(task.actualHours?.toString() ?? "")
    loadComments(task.id)
    loadSubtasks(task.id)
    loadActivity(task.id)
  }, [task?.id])

  useEffect(() => {
    fetch("/api/users/lookup").then((r) => r.ok ? r.json() : []).then(setUsers).catch(() => {})
  }, [])

  async function loadComments(taskId: string) {
    setCommLoading(true)
    try {
      const r = await fetch(`/api/projects/${projectId}/tasks/${taskId}`)
      if (r.ok) setComments(await r.json())
    } catch { /* */ } finally { setCommLoading(false) }
  }

  async function loadSubtasks(taskId: string) {
    setSubtaskLoading(true)
    try {
      const r = await fetch(`/api/projects/${projectId}/tasks/${taskId}/subtasks`)
      if (r.ok) setSubtasks(await r.json())
    } catch { /* */ } finally { setSubtaskLoading(false) }
  }

  async function loadActivity(taskId: string) {
    setActivityLoading(true)
    try {
      const r = await fetch(`/api/projects/${projectId}/activity?taskId=${taskId}&limit=20`)
      if (r.ok) setActivities(await r.json())
    } catch { /* */ } finally { setActivityLoading(false) }
  }

  async function handleSave() {
    if (!task) return
    setSaving(true)
    try {
      const body: Record<string, unknown> = {
        title, description: description || null,
        priority, assignedTo: assignedTo || null,
        dueDate: dueDate || null, labels,
        estimatedHours: estimatedHours ? parseFloat(estimatedHours) : null,
        actualHours: actualHours ? parseFloat(actualHours) : null,
      }
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

  // Subtask handlers
  async function addSubtask() {
    if (!task || !newSubtask.trim()) return
    try {
      const r = await fetch(`/api/projects/${projectId}/tasks/${task.id}/subtasks`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newSubtask.trim() }),
      })
      if (!r.ok) throw new Error()
      setNewSubtask("")
      loadSubtasks(task.id)
    } catch { toast.error("Alt görev eklenemedi") }
  }

  async function toggleSubtask(s: Subtask) {
    try {
      await fetch(`/api/projects/${projectId}/tasks/${task!.id}/subtasks`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subtasks: [{ id: s.id, completed: !s.completed }] }),
      })
      setSubtasks((prev) => prev.map((x) => x.id === s.id ? { ...x, completed: !x.completed } : x))
    } catch { toast.error("Güncellenemedi") }
  }

  async function deleteSubtask(subtaskId: string) {
    try {
      await fetch(`/api/projects/${projectId}/tasks/${task!.id}/subtasks`, {
        method: "DELETE", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subtaskId }),
      })
      setSubtasks((prev) => prev.filter((x) => x.id !== subtaskId))
    } catch { toast.error("Silinemedi") }
  }

  if (!task) return null

  const subtaskDone = subtasks.filter((s) => s.completed).length
  const subtaskPct  = subtasks.length > 0 ? Math.round((subtaskDone / subtasks.length) * 100) : 0

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="!w-[560px] !max-w-[560px] p-0 flex flex-col gap-0">
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

            {/* Başlık + Açıklama */}
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

                {/* Atanan — AppUsers entegrasyonu */}
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <User className="size-3" /> Atanan
                  </Label>
                  {users.length > 0 ? (
                    <Select value={assignedTo || "__none__"} onValueChange={(v) => setAssignedTo(v === "__none__" ? "" : v)}>
                      <SelectTrigger className="h-8 text-[11px] rounded-[5px]">
                        <SelectValue placeholder="Seçiniz..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__" className="text-[11px] text-muted-foreground">Atanmamış</SelectItem>
                        {users.map((u) => (
                          <SelectItem key={u.id} value={u.fullName || u.username} className="text-[11px]">
                            {u.fullName || u.username}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}
                      className="h-8 text-[11px] rounded-[5px]" placeholder="Kullanıcı adı..." />
                  )}
                </div>

                {/* Bitiş tarihi */}
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <Calendar className="size-3" /> Bitiş Tarihi
                  </Label>
                  <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)}
                    className="h-8 text-[11px] rounded-[5px]" />
                </div>

                {/* Tahmini süre */}
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <Timer className="size-3" /> Tahmini (saat)
                  </Label>
                  <Input type="number" step="0.5" min="0" value={estimatedHours}
                    onChange={(e) => setEstimatedHours(e.target.value)}
                    className="h-8 text-[11px] rounded-[5px]" placeholder="0" />
                </div>

                {/* Gerçekleşen süre */}
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <Clock className="size-3" /> Gerçekleşen (saat)
                  </Label>
                  <Input type="number" step="0.5" min="0" value={actualHours}
                    onChange={(e) => setActualHours(e.target.value)}
                    className="h-8 text-[11px] rounded-[5px]" placeholder="0" />
                </div>
              </div>
            </div>

            {/* Alt Görevler (Subtasks) */}
            <div className="rounded-[5px] border border-border/50 overflow-hidden">
              <div className="px-3 py-2 bg-muted/30 border-b border-border/40 flex items-center justify-between">
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                  <ListChecks className="size-3" /> Alt Görevler
                  {subtasks.length > 0 && (
                    <span className="ml-1 text-[9px] tabular-nums">{subtaskDone}/{subtasks.length}</span>
                  )}
                </span>
                {subtasks.length > 0 && (
                  <span className="text-[9px] text-muted-foreground tabular-nums">%{subtaskPct}</span>
                )}
              </div>
              <div className="px-3 py-3 space-y-2">
                {/* Progress bar */}
                {subtasks.length > 0 && (
                  <div className="h-1.5 bg-muted/60 rounded-full overflow-hidden mb-2">
                    <div className="h-full bg-emerald-500 rounded-full transition-all"
                      style={{ width: `${subtaskPct}%` }} />
                  </div>
                )}

                {subtaskLoading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-6 w-full rounded-[4px]" />
                    <Skeleton className="h-6 w-3/4 rounded-[4px]" />
                  </div>
                ) : (
                  <div className="space-y-1">
                    {subtasks.map((s) => (
                      <div key={s.id} className="flex items-center gap-2 group/st hover:bg-muted/20 rounded-[4px] px-1 py-0.5 -mx-1">
                        <Checkbox
                          checked={s.completed}
                          onCheckedChange={() => toggleSubtask(s)}
                          className="size-3.5"
                        />
                        <span className={cn(
                          "text-[11px] flex-1",
                          s.completed && "line-through text-muted-foreground"
                        )}>
                          {s.title}
                        </span>
                        <button
                          onClick={() => deleteSubtask(s.id)}
                          className="opacity-0 group-hover/st:opacity-100 text-muted-foreground hover:text-destructive transition-all"
                        >
                          <X className="size-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Yeni subtask ekle */}
                <div className="flex gap-1.5 mt-1">
                  <Input
                    value={newSubtask}
                    onChange={(e) => setNewSubtask(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addSubtask())}
                    className="h-7 text-[11px] rounded-[5px] flex-1"
                    placeholder="Alt görev ekle..."
                  />
                  <button onClick={addSubtask} disabled={!newSubtask.trim()}
                    className="h-7 px-2 text-[10px] font-medium rounded-[5px] bg-muted hover:bg-muted/80 transition-colors disabled:opacity-40">
                    <Plus className="size-3" />
                  </button>
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

            {/* Aktivite Geçmişi */}
            <div className="rounded-[5px] border border-border/50 overflow-hidden">
              <div className="px-3 py-2 bg-muted/30 border-b border-border/40">
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                  <Activity className="size-3" /> Aktivite Geçmişi
                </span>
              </div>
              <div className="px-3 py-3">
                {activityLoading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-full rounded-[3px]" />
                    <Skeleton className="h-4 w-2/3 rounded-[3px]" />
                  </div>
                ) : activities.length === 0 ? (
                  <p className="text-[10px] text-muted-foreground text-center py-2">Henüz aktivite yok</p>
                ) : (
                  <div className="space-y-1.5">
                    {activities.map((a) => (
                      <div key={a.id} className="flex items-start gap-2">
                        <div className="size-1.5 rounded-full bg-muted-foreground/40 mt-1.5 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] leading-relaxed">
                            {a.userName && <span className="font-medium">{a.userName} </span>}
                            <span className="text-muted-foreground">{a.action}</span>
                            {a.detail && <span className="text-muted-foreground"> — {a.detail}</span>}
                          </p>
                          <p className="text-[9px] text-muted-foreground/60">
                            {new Date(a.createdAt).toLocaleString("tr-TR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
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
