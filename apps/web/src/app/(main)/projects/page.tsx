"use client"

import { useState, useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"
import {
  Plus, FolderKanban, Building2, CheckCircle2,
  MoreVertical, Archive, Trash2, Circle, Pencil,
  Search, Filter, Download, SlidersHorizontal,
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
import {
  Table, TableBody, TableCell, TableHead,
  TableHeader, TableRow,
} from "@/components/ui/table"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import type { ProjectListItem } from "@/app/api/projects/route"

const PROJECT_COLORS = [
  "#3b82f6","#10b981","#f59e0b","#ef4444","#8b5cf6",
  "#ec4899","#06b6d4","#f97316","#6366f1","#14b8a6",
]

const STATUS_CONFIG: Record<string, { label: string; icon: typeof Circle; cls: string; badgeCls: string }> = {
  active:    { label: "Aktif",      icon: Circle,       cls: "text-emerald-600", badgeCls: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  completed: { label: "Tamamlandı", icon: CheckCircle2, cls: "text-blue-600",    badgeCls: "bg-blue-100 text-blue-700 border-blue-200" },
  archived:  { label: "Arşivlendi", icon: Archive,      cls: "text-muted-foreground", badgeCls: "bg-muted text-muted-foreground border-border" },
}

export default function ProjectsPage() {
  const router = useRouter()
  const [projects, setProjects] = useState<ProjectListItem[]>([])
  const [loading,  setLoading]  = useState(true)
  const [creating, setCreating] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  // Filtreler
  const [search,       setSearch]       = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [showArchived, setShowArchived] = useState(false)

  // Oluşturma formu
  const [name,  setName]  = useState("")
  const [desc,  setDesc]  = useState("")
  const [color, setColor] = useState(PROJECT_COLORS[0])
  const [saving, setSaving] = useState(false)

  // Düzenleme
  const [editing, setEditing] = useState<ProjectListItem | null>(null)
  const [editName, setEditName]     = useState("")
  const [editDesc, setEditDesc]     = useState("")
  const [editColor, setEditColor]   = useState("")
  const [editStatus, setEditStatus] = useState("")
  const [editSaving, setEditSaving] = useState(false)

  async function load() {
    try {
      const url = showArchived ? "/api/projects?archived=1" : "/api/projects"
      const r = await fetch(url)
      if (r.ok) setProjects(await r.json())
    } catch { /* */ } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [showArchived])

  // Filtreleme
  const filtered = useMemo(() => {
    let result = projects
    // Durum filtresi
    if (statusFilter !== "all") {
      result = result.filter((p) => p.status === statusFilter)
    }
    // Arama
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter((p) =>
        p.name.toLowerCase().includes(q) ||
        (p.description?.toLowerCase().includes(q)) ||
        (p.companyName?.toLowerCase().includes(q))
      )
    }
    return result
  }, [projects, statusFilter, search])

  // Firma listesi (filtre için)
  const companies = useMemo(() => {
    const set = new Set<string>()
    projects.forEach((p) => p.companyName && set.add(p.companyName))
    return [...set].sort()
  }, [projects])

  function openEdit(p: ProjectListItem) {
    setEditing(p)
    setEditName(p.name)
    setEditDesc(p.description ?? "")
    setEditColor(p.color)
    setEditStatus(p.status)
  }

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

  async function handleEdit() {
    if (!editing || !editName.trim()) return
    setEditSaving(true)
    try {
      const r = await fetch(`/api/projects/${editing.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name:        editName.trim(),
          description: editDesc || null,
          color:       editColor,
          status:      editStatus,
        }),
      })
      if (!r.ok) throw new Error()
      toast.success("Proje güncellendi")
      setEditing(null)
      load()
    } catch { toast.error("Güncellenemedi") } finally { setEditSaving(false) }
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

      {/* Filtre çubuğu */}
      <div className="rounded-[8px] p-2 pb-0" style={{ backgroundColor: "#F4F2F0" }}>
        <div className="rounded-[4px] px-4 py-2.5 flex items-center gap-3 flex-wrap"
          style={{ backgroundColor: "#FFFFFF", boxShadow: "0 2px 4px rgba(0,0,0,0.06)" }}>
          {/* Arama */}
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Proje ara..."
              className="h-8 pl-8 text-[11px] rounded-[5px]"
            />
          </div>

          {/* Durum filtresi */}
          <ToggleGroup type="single" value={statusFilter} onValueChange={(v) => v && setStatusFilter(v)}
            className="gap-0.5">
            <ToggleGroupItem value="all" className="h-7 px-2.5 text-[10px] font-medium rounded-[4px] data-[state=on]:bg-foreground data-[state=on]:text-background">
              Tümü
            </ToggleGroupItem>
            <ToggleGroupItem value="active" className="h-7 px-2.5 text-[10px] font-medium rounded-[4px] data-[state=on]:bg-emerald-600 data-[state=on]:text-white">
              Aktif
            </ToggleGroupItem>
            <ToggleGroupItem value="completed" className="h-7 px-2.5 text-[10px] font-medium rounded-[4px] data-[state=on]:bg-blue-600 data-[state=on]:text-white">
              Tamamlandı
            </ToggleGroupItem>
            <ToggleGroupItem value="archived" className="h-7 px-2.5 text-[10px] font-medium rounded-[4px] data-[state=on]:bg-muted data-[state=on]:text-foreground">
              Arşiv
            </ToggleGroupItem>
          </ToggleGroup>

          {/* Arşivlenmiş dahil et */}
          <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground cursor-pointer select-none">
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)}
              className="size-3 rounded-sm" />
            Arşivi dahil et
          </label>

          {/* Sonuç sayısı */}
          <span className="text-[10px] text-muted-foreground tabular-nums ml-auto">
            {filtered.length}/{projects.length} proje
          </span>
        </div>
        <div className="h-2" />
      </div>

      {/* Proje listesi */}
      <div className="rounded-[8px] p-2 pb-0" style={{ backgroundColor: "#F4F2F0" }}>
        <div className="rounded-[4px] overflow-hidden"
          style={{ backgroundColor: "#FFFFFF", boxShadow: "0 2px 4px rgba(0,0,0,0.06)" }}>

          {loading ? (
            <div className="p-4 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="size-3 rounded-full" />
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 flex-1" />
                  <Skeleton className="h-4 w-16" />
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <FolderKanban className="size-10 text-muted-foreground/30" />
              <p className="text-[13px] text-muted-foreground font-medium">
                {projects.length === 0 ? "Henüz proje yok" : "Filtreye uygun proje bulunamadı"}
              </p>
              {projects.length === 0 && (
                <button onClick={() => setCreating(true)}
                  className="px-4 py-2 rounded-[5px] text-[11px] font-semibold bg-foreground text-background hover:bg-foreground/90 transition-colors">
                  İlk Projeyi Oluştur
                </button>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30 border-b border-border/40">
                  <TableHead className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase w-[3%]" />
                  <TableHead className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase">Proje</TableHead>
                  <TableHead className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase">Durum</TableHead>
                  <TableHead className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase">Firma</TableHead>
                  <TableHead className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase">İlerleme</TableHead>
                  <TableHead className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase text-center">Görev</TableHead>
                  <TableHead className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase w-[40px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((p) => {
                  const donePct = p.taskCount > 0 ? Math.round((p.doneCount / p.taskCount) * 100) : 0
                  const st = STATUS_CONFIG[p.status] ?? STATUS_CONFIG.active
                  return (
                    <TableRow
                      key={p.id}
                      className="hover:bg-muted/20 transition-colors cursor-pointer group"
                      onClick={() => router.push(`/projects/${p.id}`)}
                    >
                      {/* Renk */}
                      <TableCell className="px-0 py-0 w-[3px]">
                        <div className="w-[3px] h-10 rounded-r-full" style={{ backgroundColor: p.color }} />
                      </TableCell>

                      {/* Proje adı + açıklama */}
                      <TableCell className="py-2.5">
                        <p className="text-[12px] font-semibold leading-tight">{p.name}</p>
                        {p.description && (
                          <p className="text-[10px] text-muted-foreground line-clamp-1 mt-0.5">{p.description}</p>
                        )}
                      </TableCell>

                      {/* Durum badge */}
                      <TableCell className="py-2.5">
                        <Badge variant="outline" className={cn("text-[10px] font-medium px-2 py-0.5 rounded-full", st.badgeCls)}>
                          {st.label}
                        </Badge>
                      </TableCell>

                      {/* Firma */}
                      <TableCell className="py-2.5">
                        {p.companyName ? (
                          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                            <Building2 className="size-3 shrink-0" />{p.companyName}
                          </span>
                        ) : (
                          <span className="text-[11px] text-muted-foreground/50">—</span>
                        )}
                      </TableCell>

                      {/* İlerleme */}
                      <TableCell className="py-2.5">
                        <div className="flex items-center gap-2 min-w-[120px]">
                          <Progress value={donePct} className="h-1.5 flex-1" />
                          <span className="text-[10px] font-semibold tabular-nums w-8 text-right" style={{ color: p.color }}>
                            %{donePct}
                          </span>
                        </div>
                      </TableCell>

                      {/* Görev sayısı */}
                      <TableCell className="py-2.5 text-center">
                        <span className="text-[11px] tabular-nums text-muted-foreground">
                          {p.doneCount}<span className="text-muted-foreground/50">/{p.taskCount}</span>
                        </span>
                      </TableCell>

                      {/* Aksiyon */}
                      <TableCell className="py-2.5 pr-3">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              className="text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <MoreVertical className="size-4" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="rounded-[6px] text-[11px]"
                            onClick={(e) => e.stopPropagation()}>
                            <DropdownMenuItem onClick={() => router.push(`/projects/${p.id}`)}>
                              <FolderKanban className="size-3.5 mr-2" /> Kanban Aç
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openEdit(p)}>
                              <Pencil className="size-3.5 mr-2" /> Düzenle
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
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}

          {/* Footer */}
          {!loading && filtered.length > 0 && (
            <div className="flex items-center gap-1.5 px-4 py-2 border-t border-border/40 text-[10px] text-muted-foreground">
              <FolderKanban className="size-3" />
              {filtered.length} proje listeleniyor
            </div>
          )}
        </div>
        <div className="h-2" />
      </div>

      {/* ── Yeni proje dialog ── */}
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

      {/* ── Düzenleme dialog ── */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="rounded-[8px] max-w-sm p-0 gap-0">
          <DialogHeader className="px-5 py-4 border-b border-border/50">
            <DialogTitle className="text-[13px] font-semibold">Projeyi Düzenle</DialogTitle>
          </DialogHeader>
          <div className="px-5 py-4 space-y-4">
            <div className="space-y-1.5">
              <Label className="text-[10px] text-muted-foreground uppercase tracking-wide">Proje Adı</Label>
              <Input autoFocus value={editName} onChange={(e) => setEditName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleEdit()}
                className="h-8 text-[11px] rounded-[5px]" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] text-muted-foreground uppercase tracking-wide">Açıklama</Label>
              <Input value={editDesc} onChange={(e) => setEditDesc(e.target.value)}
                placeholder="Kısa açıklama..." className="h-8 text-[11px] rounded-[5px]" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] text-muted-foreground uppercase tracking-wide">Durum</Label>
              <Select value={editStatus} onValueChange={setEditStatus}>
                <SelectTrigger className="h-8 text-[11px] rounded-[5px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active" className="text-[11px]">Aktif</SelectItem>
                  <SelectItem value="completed" className="text-[11px]">Tamamlandı</SelectItem>
                  <SelectItem value="archived" className="text-[11px]">Arşivlendi</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] text-muted-foreground uppercase tracking-wide">Renk</Label>
              <div className="flex gap-2 flex-wrap">
                {PROJECT_COLORS.map((c) => (
                  <button key={c} onClick={() => setEditColor(c)}
                    className={cn("size-6 rounded-full transition-transform hover:scale-110",
                      editColor === c && "ring-2 ring-offset-2 ring-foreground/30 scale-110")}
                    style={{ backgroundColor: c }} />
                ))}
              </div>
            </div>
          </div>
          <div className="px-5 py-3 border-t border-border/50 flex justify-end gap-2">
            <button onClick={() => setEditing(null)}
              className="px-3 py-1.5 rounded-[5px] text-[11px] font-medium border border-border/60 hover:bg-muted/40 transition-colors">
              İptal
            </button>
            <button onClick={handleEdit} disabled={!editName.trim() || editSaving}
              className="px-4 py-1.5 rounded-[5px] text-[11px] font-semibold bg-foreground text-background hover:bg-foreground/90 disabled:opacity-50 transition-colors">
              {editSaving ? "Kaydediliyor..." : "Kaydet"}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Silme onayı ── */}
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
