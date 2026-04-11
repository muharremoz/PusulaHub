"use client"

import { use, useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import {
  ChevronLeft, RefreshCw, MoreVertical,
  CheckCircle2, Circle, ListTodo, Users2,
} from "lucide-react"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { KanbanBoard } from "@/components/projects/kanban-board"
import type { BoardData } from "@/app/api/projects/[id]/route"

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

  // İstatistikler
  const totalTasks = board.columns.reduce((s, c) => s + c.tasks.length, 0)
  const doneTasks  = board.columns.filter((c) =>
    ["Tamamlandı", "Done", "Bitti"].includes(c.name)
  ).reduce((s, c) => s + c.tasks.length, 0)
  const donePct    = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0
  const assignees  = [...new Set(board.columns.flatMap((c) => c.tasks.map((t) => t.assignedTo)).filter(Boolean))]

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

            {/* Yenile */}
            <button onClick={handleRefresh} disabled={refreshing}
              className="text-muted-foreground hover:text-foreground transition-colors">
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

      {/* Kanban board */}
      <KanbanBoard board={board} loading={loading} onRefresh={fetchBoard} />
    </div>
  )
}
