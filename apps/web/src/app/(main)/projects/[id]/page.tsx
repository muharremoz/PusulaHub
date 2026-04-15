"use client"

import { use, useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import {
  ChevronLeft, RefreshCw, MoreVertical,
  CheckCircle2, Circle, ListTodo, Users2,
  Download, Plus, Settings2, Search,
  Activity, LayoutGrid, GanttChart as GanttChartIcon, BarChart3,
} from "lucide-react"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { KanbanBoard } from "@/components/projects/kanban-board"
import { ActivityPanel } from "@/components/projects/activity-panel"
import { GanttChart } from "@/components/projects/gantt-chart"
import { ProjectCharts } from "@/components/projects/project-charts"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import type { BoardData } from "@/app/api/projects/[id]/route"

type ViewMode = "kanban" | "gantt" | "charts"

const EMPTY_BOARD: BoardData = {
  id: "", name: "", description: null, status: "active",
  color: "#3b82f6", companyId: null, companyName: null, columns: [],
}

export default function ProjectBoardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router  = useRouter()

  const [board,     setBoard]     = useState<BoardData>(EMPTY_BOARD)
  const [loading,   setLoading]   = useState(true)
  const [refreshing,setRefreshing]= useState(false)
  const [showActivity, setShowActivity] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>("kanban")

  // Kolon ekleme
  const [addingCol, setAddingCol] = useState(false)
  const [newColName, setNewColName] = useState("")
  const [newColColor, setNewColColor] = useState("#6b7280")

  // Task filtre
  const [taskSearch, setTaskSearch] = useState("")
  const [priorityFilter, setPriorityFilter] = useState<string>("all")
  const [assigneeFilter, setAssigneeFilter] = useState<string>("all")

  const fetchBoard = useCallback(async () => {
    try {
      const r = await fetch(`/api/projects/${id}`)
      if (r.ok) setBoard(await r.json())
      else if (r.status === 404) router.push("/projects")
    } catch { /* */ }
  }, [id, router])

  useEffect(() => {
    fetchBoard().finally(() => setLoading(false))
  }, [fetchBoard])

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeydown(e: KeyboardEvent) {
      // N: new task (focus ilk kolonun add butonuna)
      if (e.key === "n" && !e.ctrlKey && !e.metaKey && !e.altKey && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault()
        const btn = document.querySelector("[data-add-task-btn]") as HTMLButtonElement | null
        btn?.click()
      }
      // R: refresh
      if (e.key === "r" && !e.ctrlKey && !e.metaKey && !e.altKey && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault()
        handleRefresh()
      }
      // /: focus search
      if (e.key === "/" && !e.ctrlKey && !e.metaKey && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault()
        const input = document.querySelector("[data-task-search]") as HTMLInputElement | null
        input?.focus()
      }
      // Esc: clear search
      if (e.key === "Escape") {
        setTaskSearch("")
        setPriorityFilter("all")
        setAssigneeFilter("all")
      }
    }
    window.addEventListener("keydown", handleKeydown)
    return () => window.removeEventListener("keydown", handleKeydown)
  }, [])

  async function handleRefresh() {
    setRefreshing(true)
    await fetchBoard()
    setRefreshing(false)
  }

  async function handleStatusChange(status: string) {
    try {
      await fetch(`/api/projects/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      })
      toast.success("Proje güncellendi")
      fetchBoard()
    } catch { toast.error("Güncellenemedi") }
  }

  async function handleDelete() {
    try {
      await fetch(`/api/projects/${id}`, { method: "DELETE" })
      toast.success("Proje silindi")
      router.push("/projects")
    } catch { toast.error("Proje silinemedi") }
  }

  async function handleExport() {
    window.open(`/api/projects/${id}/export?format=csv`, "_blank")
    toast.success("CSV dışa aktarılıyor...")
  }

  async function handleAddColumn() {
    if (!newColName.trim()) return
    try {
      const r = await fetch(`/api/projects/${id}/columns`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newColName.trim(), color: newColColor }),
      })
      if (!r.ok) throw new Error()
      toast.success("Kolon eklendi")
      setAddingCol(false)
      setNewColName("")
      setNewColColor("#6b7280")
      fetchBoard()
    } catch { toast.error("Kolon eklenemedi") }
  }

  // İstatistikler
  const totalTasks = board.columns.reduce((s, c) => s + c.tasks.length, 0)
  const doneTasks  = board.columns.filter((c) =>
    ["Tamamlandı", "Done", "Bitti"].includes(c.name)
  ).reduce((s, c) => s + c.tasks.length, 0)
  const donePct    = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0
  const assignees  = [...new Set(board.columns.flatMap((c) => c.tasks.map((t) => t.assignedTo)).filter(Boolean))] as string[]

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Header */}
      <div className="rounded-[8px] p-2 pb-0" style={{ backgroundColor: "#F4F2F0" }}>
        <div className="rounded-[4px] px-4 py-3"
          style={{ backgroundColor: "#FFFFFF", boxShadow: "0 2px 4px rgba(0,0,0,0.06)" }}>
          <div className="flex items-center gap-3">
            <button onClick={() => router.push("/projects")}
              className="flex items-center gap-1 border border-border/60 hover:bg-muted/40 rounded-[5px] text-[11px] font-medium px-2.5 py-1.5 text-muted-foreground transition-colors shrink-0">
              <ChevronLeft className="size-3.5" />
              Projeler
            </button>

            {/* Renk noktası + isim */}
            {loading ? (
              <Skeleton className="h-5 w-48 rounded-[3px]" />
            ) : (
              <>
                <div className="size-3 rounded-full shrink-0" style={{ backgroundColor: board.color }} />
                <h1 className="text-sm font-semibold tracking-tight">{board.name}</h1>
                {board.companyName && (
                  <span className="text-[11px] text-muted-foreground">· {board.companyName}</span>
                )}
              </>
            )}

            <div className="flex-1" />

            {/* Özet istatistikler */}
            <div className="flex items-center gap-4 text-[11px]">
              <div className="flex items-center gap-1.5">
                <ListTodo className="size-3.5 text-muted-foreground" />
                <span className="tabular-nums font-medium">{totalTasks}</span>
                <span className="text-muted-foreground">görev</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="size-3.5 text-emerald-600" />
                <span className="tabular-nums font-medium text-emerald-600">{donePct}%</span>
                <span className="text-muted-foreground">tamamlandı</span>
              </div>
              {assignees.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <Users2 className="size-3.5 text-muted-foreground" />
                  <span className="tabular-nums font-medium">{assignees.length}</span>
                  <span className="text-muted-foreground">kişi</span>
                </div>
              )}
            </div>

            {/* İlerleme çubuğu */}
            <div className="w-24 h-1.5 bg-muted rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all"
                style={{ width: `${donePct}%`, backgroundColor: board.color }} />
            </div>

            {/* Durum badge */}
            <div className={cn(
              "flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-[4px]",
              board.status === "active"    && "bg-emerald-50 text-emerald-700",
              board.status === "completed" && "bg-blue-50 text-blue-700",
              board.status === "archived"  && "bg-muted text-muted-foreground",
            )}>
              {board.status === "active"    && <Circle className="size-2.5 fill-current" />}
              {board.status === "completed" && <CheckCircle2 className="size-2.5" />}
              {board.status === "active"    ? "Aktif" : board.status === "completed" ? "Tamamlandı" : "Arşiv"}
            </div>

            {/* Görünüm seçici */}
            <ToggleGroup type="single" value={viewMode}
              onValueChange={(v) => v && setViewMode(v as ViewMode)}
              className="h-7 bg-muted/30 rounded-[5px] p-0.5 gap-0"
            >
              <ToggleGroupItem value="kanban" className="h-6 px-2 text-[9px] gap-1 rounded-[4px] data-[state=on]:bg-white data-[state=on]:shadow-sm">
                <LayoutGrid className="size-3" /> Kanban
              </ToggleGroupItem>
              <ToggleGroupItem value="gantt" className="h-6 px-2 text-[9px] gap-1 rounded-[4px] data-[state=on]:bg-white data-[state=on]:shadow-sm">
                <GanttChartIcon className="size-3" /> Gantt
              </ToggleGroupItem>
              <ToggleGroupItem value="charts" className="h-6 px-2 text-[9px] gap-1 rounded-[4px] data-[state=on]:bg-white data-[state=on]:shadow-sm">
                <BarChart3 className="size-3" /> Grafikler
              </ToggleGroupItem>
            </ToggleGroup>

            {/* Yenile */}
            <button onClick={handleRefresh} disabled={refreshing}
              className="text-muted-foreground hover:text-foreground transition-colors"
              title="Yenile (R)">
              <RefreshCw className={cn("size-4", refreshing && "animate-spin")} />
            </button>

            {/* Menü */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="text-muted-foreground hover:text-foreground transition-colors">
                  <MoreVertical className="size-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="rounded-[6px] text-[11px]">
                <DropdownMenuItem onClick={() => setAddingCol(true)}>
                  <Plus className="size-3.5 mr-2" /> Kolon Ekle
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleExport}>
                  <Download className="size-3.5 mr-2" /> CSV Dışa Aktar
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setShowActivity(!showActivity)}>
                  <Activity className="size-3.5 mr-2" /> Aktivite Geçmişi
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {board.status !== "completed" && (
                  <DropdownMenuItem onClick={() => handleStatusChange("completed")}>
                    <CheckCircle2 className="size-3.5 mr-2" /> Tamamlandı işaretle
                  </DropdownMenuItem>
                )}
                {board.status !== "active" && (
                  <DropdownMenuItem onClick={() => handleStatusChange("active")}>
                    <Circle className="size-3.5 mr-2" /> Aktife al
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-destructive focus:text-destructive"
                  onClick={handleDelete}>
                  Projeyi Sil
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        <div className="h-2" />
      </div>

      {/* Filtre çubuğu — sadece Kanban modunda */}
      {viewMode === "kanban" && !loading && totalTasks > 0 && (
        <div className="flex items-center gap-3 px-1">
          <div className="relative min-w-[200px] max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <Input
              data-task-search
              value={taskSearch}
              onChange={(e) => setTaskSearch(e.target.value)}
              placeholder="Görev ara... ( / )"
              className="h-7 pl-8 text-[11px] rounded-[5px] bg-white"
            />
          </div>

          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="h-7 px-2 text-[10px] rounded-[5px] border border-border/60 bg-white text-foreground"
          >
            <option value="all">Tüm Öncelikler</option>
            <option value="critical">Kritik</option>
            <option value="high">Yüksek</option>
            <option value="medium">Orta</option>
            <option value="low">Düşük</option>
          </select>

          {assignees.length > 0 && (
            <select
              value={assigneeFilter}
              onChange={(e) => setAssigneeFilter(e.target.value)}
              className="h-7 px-2 text-[10px] rounded-[5px] border border-border/60 bg-white text-foreground"
            >
              <option value="all">Tüm Kişiler</option>
              {assignees.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          )}

          {(taskSearch || priorityFilter !== "all" || assigneeFilter !== "all") && (
            <button
              onClick={() => { setTaskSearch(""); setPriorityFilter("all"); setAssigneeFilter("all") }}
              className="h-7 px-2.5 text-[10px] font-medium rounded-[5px] border border-border/60 hover:bg-muted/40 transition-colors text-muted-foreground"
            >
              Temizle
            </button>
          )}

          <div className="ml-auto text-[9px] text-muted-foreground/60">
            <kbd className="px-1 py-0.5 rounded border border-border/40 bg-muted/40 font-mono">N</kbd> yeni görev
            <span className="mx-1.5">·</span>
            <kbd className="px-1 py-0.5 rounded border border-border/40 bg-muted/40 font-mono">R</kbd> yenile
            <span className="mx-1.5">·</span>
            <kbd className="px-1 py-0.5 rounded border border-border/40 bg-muted/40 font-mono">/</kbd> ara
            <span className="mx-1.5">·</span>
            <kbd className="px-1 py-0.5 rounded border border-border/40 bg-muted/40 font-mono">Esc</kbd> temizle
          </div>
        </div>
      )}

      <div className="flex gap-4">
        {/* Ana içerik — görünüme göre değişir */}
        <div className="flex-1 min-w-0">
          {viewMode === "kanban" && (
            <KanbanBoard
              board={board}
              loading={loading}
              onRefresh={fetchBoard}
              taskSearch={taskSearch}
              priorityFilter={priorityFilter}
              assigneeFilter={assigneeFilter}
            />
          )}
          {viewMode === "gantt" && (
            <GanttChart board={board} loading={loading} />
          )}
          {viewMode === "charts" && (
            <ProjectCharts projectId={id} />
          )}
        </div>

        {/* Activity panel */}
        {showActivity && (
          <ActivityPanel projectId={id} onClose={() => setShowActivity(false)} />
        )}
      </div>

      {/* Kolon ekleme dialog */}
      <Dialog open={addingCol} onOpenChange={(o) => !o && setAddingCol(false)}>
        <DialogContent className="rounded-[8px] max-w-xs p-0 gap-0">
          <DialogHeader className="px-5 py-4 border-b border-border/50">
            <DialogTitle className="text-[13px] font-semibold">Yeni Kolon</DialogTitle>
          </DialogHeader>
          <div className="px-5 py-4 space-y-3">
            <div className="space-y-1.5">
              <Label className="text-[10px] text-muted-foreground uppercase tracking-wide">Kolon Adı</Label>
              <Input autoFocus value={newColName} onChange={(e) => setNewColName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddColumn()}
                placeholder="örn. Test" className="h-8 text-[11px] rounded-[5px]" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] text-muted-foreground uppercase tracking-wide">Renk</Label>
              <div className="flex gap-2 flex-wrap">
                {["#6b7280","#3b82f6","#f59e0b","#8b5cf6","#10b981","#ef4444","#ec4899","#06b6d4"].map((c) => (
                  <button key={c} onClick={() => setNewColColor(c)}
                    className={cn("size-6 rounded-full transition-transform hover:scale-110",
                      newColColor === c && "ring-2 ring-offset-2 ring-foreground/30 scale-110")}
                    style={{ backgroundColor: c }} />
                ))}
              </div>
            </div>
          </div>
          <div className="px-5 py-3 border-t border-border/50 flex justify-end gap-2">
            <button onClick={() => setAddingCol(false)}
              className="px-3 py-1.5 rounded-[5px] text-[11px] font-medium border border-border/60 hover:bg-muted/40 transition-colors">
              İptal
            </button>
            <button onClick={handleAddColumn} disabled={!newColName.trim()}
              className="px-4 py-1.5 rounded-[5px] text-[11px] font-semibold bg-foreground text-background hover:bg-foreground/90 disabled:opacity-50 transition-colors">
              Ekle
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
