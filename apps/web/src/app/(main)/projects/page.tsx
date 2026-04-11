"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import {
  Plus, FolderKanban, Building2, CheckCircle2,
  MoreVertical, Archive, Trash2, Circle,
} from "lucide-react"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import type { ProjectListItem } from "@/app/api/projects/route"

const PROJECT_COLORS = [
  "#3b82f6","#10b981","#f59e0b","#ef4444","#8b5cf6",
  "#ec4899","#06b6d4","#f97316","#6366f1","#14b8a6",
]

const STATUS_CONFIG = {
  active:    { label: "Aktif",       icon: Circle,       cls: "text-emerald-600" },
  completed: { label: "Tamamlandı",  icon: CheckCircle2, cls: "text-blue-600" },
  archived:  { label: "Arşivlendi", icon: Archive,      cls: "text-muted-foreground" },
}

export default function ProjectsPage() {
  const router = useRouter()
  const [projects, setProjects] = useState<ProjectListItem[]>([])
  const [loading,  setLoading]  = useState(true)
  const [creating, setCreating] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const [name,  setName]  = useState("")
  const [desc,  setDesc]  = useState("")
  const [color, setColor] = useState(PROJECT_COLORS[0])
  const [saving, setSaving] = useState(false)

  async function load() {
    try {
      const r = await fetch("/api/projects")
      if (r.ok) setProjects(await r.json())
    } catch { /* */ } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  async function handleCreate() {
    if (!name.trim()) return
    setSaving(true)
    try {
      const r = await fetch("/api/projects", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), description: desc || null, color }),
      })
      if (!r.ok) throw new Error()
      const { id } = await r.json()
      toast.success("Proje oluşturuldu")
      setCreating(false); setName(""); setDesc(""); setColor(PROJECT_COLORS[0])
      router.push(`/projects/${id}`)
    } catch { toast.error("Proje oluşturulamadı") } finally { setSaving(false) }
  }

  async function handleDelete(id: string) {
    try {
      await fetch(`/api/projects/${id}`, { method: "DELETE" })
      toast.success("Proje silindi")
      setDeleteId(null)
      load()
    } catch { toast.error("Proje silinemedi") }
  }

  async function handleArchive(id: string) {
    try {
      await fetch(`/api/projects/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "archived" }),
      })
      toast.success("Proje arşivlendi")
      load()
    } catch { toast.error("Arşivlenemedi") }
  }

  const total     = projects.length
  const taskTotal = projects.reduce((s, p) => s + p.taskCount, 0)
  const doneTotal = projects.reduce((s, p) => s + p.doneCount, 0)

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Header */}
      <div className="rounded-[8px] p-2 pb-0" style={{ backgroundColor: "#F4F2F0" }}>
        <div className="rounded-[4px] px-4 py-3 flex items-center gap-4"
          style={{ backgroundColor: "#FFFFFF", boxShadow: "0 2px 4px rgba(0,0,0,0.06)" }}>
          <FolderKanban className="size-5 text-muted-foreground shrink-0" />
          <div>
            <h1 className="text-sm font-semibold tracking-tight">Proje Takip</h1>
            <p className="text-[11px] text-muted-foreground">Kanban tabanlı proje ve görev yönetimi</p>
          </div>
          <div className="flex items-center gap-4 ml-6">
            <div className="text-center">
              <p className="text-lg font-bold tabular-nums">{total}</p>
              <p className="text-[10px] text-muted-foreground">Proje</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold tabular-nums">{taskTotal}</p>
              <p className="text-[10px] text-muted-foreground">Görev</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold tabular-nums text-emerald-600">{doneTotal}</p>
              <p className="text-[10px] text-muted-foreground">Tamamlanan</p>
            </div>
          </div>
          <div className="flex-1" />
          <button
            onClick={() => setCreating(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-[5px] text-[11px] font-semibold bg-foreground text-background hover:bg-foreground/90 transition-colors"
          >
            <Plus className="size-3.5" />
            Yeni Proje
          </button>
        </div>
        <div className="h-2" />
      </div>

      {/* Project grid */}
      {loading ? (
        <div className="grid grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-[8px] p-2 pb-0" style={{ backgroundColor: "#F4F2F0" }}>
              <div className="rounded-[4px] px-4 py-4 space-y-3"
                style={{ backgroundColor: "#FFFFFF", boxShadow: "0 2px 4px rgba(0,0,0,0.06)" }}>
                <Skeleton className="h-4 w-3/4 rounded-[3px]" />
                <Skeleton className="h-3 w-full rounded-[3px]" />
                <div className="flex gap-2">
                  <Skeleton className="h-7 flex-1 rounded-[3px]" />
                  <Skeleton className="h-7 flex-1 rounded-[3px]" />
                </div>
              </div>
              <div className="h-2" />
            </div>
          ))}
        </div>
      ) : projects.length === 0 ? (
        <div className="rounded-[8px] p-2 pb-0" style={{ backgroundColor: "#F4F2F0" }}>
          <div className="rounded-[4px] flex flex-col items-center justify-center py-16 gap-3"
            style={{ backgroundColor: "#FFFFFF", boxShadow: "0 2px 4px rgba(0,0,0,0.06)" }}>
            <FolderKanban className="size-10 text-muted-foreground/30" />
            <p className="text-[13px] text-muted-foreground font-medium">Henüz proje yok</p>
            <button onClick={() => setCreating(true)}
              className="px-4 py-2 rounded-[5px] text-[11px] font-semibold bg-foreground text-background hover:bg-foreground/90 transition-colors">
              İlk Projeyi Oluştur
            </button>
          </div>
          <div className="h-2" />
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-3">
          {projects.map((p) => {
            const donePct = p.taskCount > 0 ? Math.round((p.doneCount / p.taskCount) * 100) : 0
            const st = STATUS_CONFIG[p.status]
            const StIcon = st.icon
            return (
              <div key={p.id}
                className="rounded-[8px] p-2 pb-0 cursor-pointer group"
                style={{ backgroundColor: "#F4F2F0" }}
                onClick={() => router.push(`/projects/${p.id}`)}
              >
                <div className="rounded-[4px] overflow-hidden group-hover:shadow-md transition-shadow"
                  style={{ backgroundColor: "#FFFFFF", boxShadow: "0 2px 4px rgba(0,0,0,0.06)" }}>
                  {/* Renk şeridi */}
                  <div className="h-1" style={{ backgroundColor: p.color }} />

                  <div className="px-4 py-3">
                    {/* Başlık satırı */}
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <h3 className="text-[13px] font-semibold leading-tight flex-1 line-clamp-1">{p.name}</h3>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            className="text-muted-foreground hover:text-foreground shrink-0 opacity-0 group-hover:opacity-100 transition-opacity mt-0.5"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <MoreVertical className="size-4" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="rounded-[6px] text-[11px]"
                          onClick={(e) => e.stopPropagation()}>
                          <DropdownMenuItem onClick={() => router.push(`/projects/${p.id}`)}>
                            Aç
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => handleArchive(p.id)}>
                            <Archive className="size-3.5 mr-2" /> Arşivle
                          </DropdownMenuItem>
                          <DropdownMenuItem className="text-destructive focus:text-destructive"
                            onClick={() => setDeleteId(p.id)}>
                            <Trash2 className="size-3.5 mr-2" /> Sil
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>

                    {/* Açıklama */}
                    {p.description && (
                      <p className="text-[11px] text-muted-foreground line-clamp-2 mb-3 leading-relaxed">
                        {p.description}
                      </p>
                    )}

                    {/* Firma */}
                    {p.companyName && (
                      <div className="flex items-center gap-1 mb-3 text-[10px] text-muted-foreground">
                        <Building2 className="size-3" />
                        {p.companyName}
                      </div>
                    )}

                    {/* İlerleme */}
                    <div className="space-y-1.5 mb-3">
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all"
                          style={{ width: `${donePct}%`, backgroundColor: p.color }} />
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-muted-foreground">
                          {p.doneCount} / {p.taskCount} görev
                        </span>
                        <span className="text-[10px] font-semibold tabular-nums" style={{ color: p.color }}>
                          %{donePct}
                        </span>
                      </div>
                    </div>

                    {/* Status */}
                    <div className={cn("flex items-center gap-1 text-[10px] font-medium", st.cls)}>
                      <StIcon className="size-3" />
                      {st.label}
                    </div>
                  </div>
                </div>
                <div className="h-2" />
              </div>
            )
          })}
        </div>
      )}

      {/* Yeni proje dialog */}
      <Dialog open={creating} onOpenChange={(o) => !o && setCreating(false)}>
        <DialogContent className="rounded-[8px] max-w-sm p-0 gap-0">
          <DialogHeader className="px-5 py-4 border-b border-border/50">
            <DialogTitle className="text-[13px] font-semibold">Yeni Proje</DialogTitle>
          </DialogHeader>
          <div className="px-5 py-4 space-y-4">
            <div className="space-y-1.5">
              <Label className="text-[10px] text-muted-foreground uppercase tracking-wide">Proje Adı</Label>
              <Input autoFocus value={name} onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                placeholder="örn. Web Yenileme Projesi" className="h-8 text-[11px] rounded-[5px]" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] text-muted-foreground uppercase tracking-wide">Açıklama (opsiyonel)</Label>
              <Input value={desc} onChange={(e) => setDesc(e.target.value)}
                placeholder="Kısa açıklama..." className="h-8 text-[11px] rounded-[5px]" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] text-muted-foreground uppercase tracking-wide">Renk</Label>
              <div className="flex gap-2 flex-wrap">
                {PROJECT_COLORS.map((c) => (
                  <button key={c} onClick={() => setColor(c)}
                    className={cn("size-6 rounded-full transition-transform hover:scale-110",
                      color === c && "ring-2 ring-offset-2 ring-foreground/30 scale-110")}
                    style={{ backgroundColor: c }} />
                ))}
              </div>
            </div>
          </div>
          <div className="px-5 py-3 border-t border-border/50 flex justify-end gap-2">
            <button onClick={() => setCreating(false)}
              className="px-3 py-1.5 rounded-[5px] text-[11px] font-medium border border-border/60 hover:bg-muted/40 transition-colors">
              İptal
            </button>
            <button onClick={handleCreate} disabled={!name.trim() || saving}
              className="px-4 py-1.5 rounded-[5px] text-[11px] font-semibold bg-foreground text-background hover:bg-foreground/90 disabled:opacity-50 transition-colors">
              {saving ? "Oluşturuluyor..." : "Oluştur"}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Silme onayı */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-sm">Projeyi sil</AlertDialogTitle>
            <AlertDialogDescription className="text-[12px]">
              Proje ve tüm görevler kalıcı olarak silinecek. Bu işlem geri alınamaz.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="text-[12px] h-8">İptal</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId && handleDelete(deleteId)}
              className="text-[12px] h-8 bg-destructive text-white hover:bg-destructive/90">
              Sil
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
