"use client"

import React, { useState, useCallback, useMemo } from "react"
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
  type DragStartEvent, type DragOverEvent, type DragEndEvent,
  closestCorners,
} from "@dnd-kit/core"
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { useDroppable } from "@dnd-kit/core"
import { Plus, MoreVertical, Pencil, Trash2, Settings2, CheckSquare } from "lucide-react"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { TaskCard } from "@/components/projects/task-card"
import { TaskSheet } from "@/components/projects/task-sheet"
import type { BoardData, BoardColumn, BoardTask } from "@/app/api/projects/[id]/route"

/* ── Droppable kolon wrapper ── */
function ColumnDropZone({ column, children }: { column: BoardColumn; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id, data: { type: "column", column } })
  return (
    <div ref={setNodeRef} className={cn(
      "flex-1 min-h-[100px] rounded-[4px] transition-colors",
      isOver && "bg-muted/40"
    )}>
      {children}
    </div>
  )
}

/* ── Tek kolon ── */
function KanbanColumn({
  column, projectId, onRefresh, onCardClick, filteredTasks,
  selectedTasks, onToggleSelect, bulkMode,
  onEditColumn, onDeleteColumn,
}: {
  column: BoardColumn
  projectId: string
  onRefresh: () => void
  onCardClick: (task: BoardTask) => void
  filteredTasks: BoardTask[]
  selectedTasks: Set<string>
  onToggleSelect: (id: string) => void
  bulkMode: boolean
  onEditColumn: (col: BoardColumn) => void
  onDeleteColumn: (col: BoardColumn) => void
}) {
  const [adding, setAdding] = useState(false)
  const [newTitle, setNewTitle] = useState("")
  const [saving, setSaving] = useState(false)

  const wipOver = column.wipLimit !== null && filteredTasks.length >= column.wipLimit

  async function addTask() {
    if (!newTitle.trim()) return
    setSaving(true)
    try {
      const r = await fetch(`/api/projects/${projectId}/tasks`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ columnId: column.id, title: newTitle.trim() }),
      })
      if (!r.ok) throw new Error()
      setNewTitle(""); setAdding(false)
      toast.success("Görev eklendi")
      onRefresh()
    } catch {
      toast.error("Görev eklenemedi")
    } finally { setSaving(false) }
  }

  return (
    <div className="w-[272px] shrink-0 flex flex-col gap-0">
      {/* Kolon başlığı */}
      <div className="rounded-[4px] px-3 py-2 mb-2 flex items-center gap-2"
        style={{ backgroundColor: "#FFFFFF", boxShadow: "0 1px 3px rgba(0,0,0,0.07)" }}>
        <div className="size-2 rounded-full shrink-0" style={{ backgroundColor: column.color }} />
        <span className="text-[11px] font-semibold flex-1 truncate">{column.name}</span>
        <span className={cn(
          "text-[10px] px-1.5 py-0.5 rounded-[3px] font-medium tabular-nums",
          wipOver ? "bg-red-100 text-red-700" : "bg-muted/60 text-muted-foreground"
        )}>
          {filteredTasks.length}{column.wipLimit !== null ? `/${column.wipLimit}` : ""}
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="text-muted-foreground hover:text-foreground transition-colors">
              <MoreVertical className="size-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="rounded-[6px] text-[11px]">
            <DropdownMenuItem onClick={() => setAdding(true)}>
              <Plus className="size-3.5 mr-2" /> Görev Ekle
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onEditColumn(column)}>
              <Pencil className="size-3.5 mr-2" /> Kolonu Düzenle
            </DropdownMenuItem>
            <DropdownMenuItem className="text-destructive focus:text-destructive"
              onClick={() => onDeleteColumn(column)}>
              <Trash2 className="size-3.5 mr-2" /> Kolonu Sil
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Kartlar */}
      <ColumnDropZone column={column}>
        <SortableContext items={filteredTasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {filteredTasks.map((task) => (
              <div key={task.id} className="relative">
                {bulkMode && (
                  <button
                    className={cn(
                      "absolute -left-1 top-2 z-10 size-4 rounded-sm border-2 transition-colors",
                      selectedTasks.has(task.id)
                        ? "bg-foreground border-foreground"
                        : "bg-white border-border/60 hover:border-foreground/50"
                    )}
                    onClick={(e) => { e.stopPropagation(); onToggleSelect(task.id) }}
                  >
                    {selectedTasks.has(task.id) && (
                      <CheckSquare className="size-3 text-background absolute -top-0.5 -left-0.5" />
                    )}
                  </button>
                )}
                <TaskCard task={task} onClick={onCardClick} />
              </div>
            ))}
          </div>
        </SortableContext>
      </ColumnDropZone>

      {/* Görev ekle */}
      <div className="mt-2">
        {adding ? (
          <div className="rounded-[4px] bg-white border border-border/50 p-2.5 space-y-2"
            style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.07)" }}>
            <Input
              autoFocus
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") addTask()
                if (e.key === "Escape") { setAdding(false); setNewTitle("") }
              }}
              placeholder="Görev başlığı..."
              className="h-7 text-[11px] rounded-[4px]"
            />
            <div className="flex items-center gap-1.5">
              <button onClick={addTask} disabled={saving || !newTitle.trim()}
                className="px-2.5 py-1 text-[10px] font-semibold rounded-[4px] bg-foreground text-background disabled:opacity-40 transition-colors">
                {saving ? "..." : "Ekle"}
              </button>
              <button onClick={() => { setAdding(false); setNewTitle("") }}
                className="px-2.5 py-1 text-[10px] font-medium rounded-[4px] hover:bg-muted/60 text-muted-foreground transition-colors">
                İptal
              </button>
            </div>
          </div>
        ) : (
          <button
            data-add-task-btn
            onClick={() => setAdding(true)}
            className="w-full flex items-center gap-1.5 px-3 py-2 text-[11px] text-muted-foreground hover:text-foreground hover:bg-white/70 rounded-[4px] transition-all group"
          >
            <Plus className="size-3.5 group-hover:text-foreground" />
            Görev ekle
          </button>
        )}
      </div>
    </div>
  )
}

/* ── Ana board ── */
interface Props {
  board:          BoardData
  loading:        boolean
  onRefresh:      () => void
  taskSearch?:    string
  priorityFilter?:string
  assigneeFilter?:string
}

export function KanbanBoard({ board, loading, onRefresh, taskSearch = "", priorityFilter = "all", assigneeFilter = "all" }: Props) {
  const [activeTask, setActiveTask]  = useState<BoardTask | null>(null)
  const [sheetTask,  setSheetTask]   = useState<BoardTask | null>(null)
  const [sheetOpen,  setSheetOpen]   = useState(false)

  // Bulk operations
  const [bulkMode, setBulkMode]       = useState(false)
  const [selectedTasks, setSelectedTasks] = useState<Set<string>>(new Set())

  // Column edit
  const [editingCol, setEditingCol] = useState<BoardColumn | null>(null)
  const [editColName, setEditColName] = useState("")
  const [editColColor, setEditColColor] = useState("")
  const [editColWip, setEditColWip] = useState("")
  const [deleteCol, setDeleteCol] = useState<BoardColumn | null>(null)

  // Optimistic state
  const [columns, setColumns] = useState<BoardColumn[]>(board.columns)
  const prevBoardRef = React.useRef(board)
  React.useEffect(() => {
    if (prevBoardRef.current !== board) {
      prevBoardRef.current = board
      setColumns(board.columns)
    }
  }, [board])

  // Filter tasks per column
  const filteredColumns = useMemo(() => {
    return columns.map((col) => {
      let tasks = col.tasks
      if (taskSearch.trim()) {
        const q = taskSearch.toLowerCase()
        tasks = tasks.filter((t) =>
          t.title.toLowerCase().includes(q) ||
          (t.description?.toLowerCase().includes(q)) ||
          t.labels.some((l) => l.toLowerCase().includes(q))
        )
      }
      if (priorityFilter !== "all") {
        tasks = tasks.filter((t) => t.priority === priorityFilter)
      }
      if (assigneeFilter !== "all") {
        tasks = tasks.filter((t) => t.assignedTo === assigneeFilter)
      }
      return { ...col, filteredTasks: tasks }
    })
  }, [columns, taskSearch, priorityFilter, assigneeFilter])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

  function findTaskAndColumn(taskId: string): { task: BoardTask; colIdx: number; taskIdx: number } | null {
    for (let ci = 0; ci < columns.length; ci++) {
      const ti = columns[ci].tasks.findIndex((t) => t.id === taskId)
      if (ti !== -1) return { task: columns[ci].tasks[ti], colIdx: ci, taskIdx: ti }
    }
    return null
  }

  function onDragStart(e: DragStartEvent) {
    if (e.active.data.current?.type === "task") {
      setActiveTask(e.active.data.current.task)
    }
  }

  function onDragOver(e: DragOverEvent) {
    const { active, over } = e
    if (!over || active.id === over.id) return

    const src = findTaskAndColumn(String(active.id))
    if (!src) return

    const overIsColumn = over.data.current?.type === "column"
    const overColId    = overIsColumn
      ? String(over.id)
      : columns.find((c) => c.tasks.some((t) => t.id === String(over.id)))?.id

    if (!overColId || overColId === columns[src.colIdx].id) return

    setColumns((prev) => {
      const next = prev.map((c) => ({ ...c, tasks: [...c.tasks] }))
      const [removed] = next[src.colIdx].tasks.splice(src.taskIdx, 1)
      const destIdx = next.findIndex((c) => c.id === overColId)
      if (destIdx === -1) return prev
      const overTaskIdx = overIsColumn ? next[destIdx].tasks.length
        : next[destIdx].tasks.findIndex((t) => t.id === String(over.id))
      next[destIdx].tasks.splice(Math.max(0, overTaskIdx), 0, { ...removed, columnId: overColId })
      return next
    })
  }

  async function onDragEnd(e: DragEndEvent) {
    setActiveTask(null)
    const { active, over } = e
    if (!over) return

    const res = findTaskAndColumn(String(active.id))
    if (!res) return

    const overIsColumn = over.data.current?.type === "column"
    const overColId    = overIsColumn
      ? String(over.id)
      : columns.find((c) => c.tasks.some((t) => t.id === String(over.id)))?.id ?? columns[res.colIdx].id

    const destCol = columns.find((c) => c.id === overColId)
    const newPos  = destCol?.tasks.findIndex((t) => t.id === String(active.id)) ?? res.taskIdx

    fetch(`/api/projects/${board.id}/tasks/${active.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ columnId: overColId, position: newPos }),
    }).catch(() => {
      toast.error("Taşıma kaydedilemedi")
      onRefresh()
    })
  }

  const openSheet = useCallback((task: BoardTask) => {
    if (bulkMode) return
    setSheetTask(task)
    setSheetOpen(true)
  }, [bulkMode])

  function toggleSelect(id: string) {
    setSelectedTasks((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Bulk operations
  async function handleBulkMove(targetColId: string) {
    const ids = [...selectedTasks]
    for (const tid of ids) {
      await fetch(`/api/projects/${board.id}/tasks/${tid}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ columnId: targetColId, position: 9999 }),
      })
    }
    toast.success(`${ids.length} görev taşındı`)
    setBulkMode(false)
    setSelectedTasks(new Set())
    onRefresh()
  }

  async function handleBulkDelete() {
    const ids = [...selectedTasks]
    for (const tid of ids) {
      await fetch(`/api/projects/${board.id}/tasks/${tid}`, { method: "DELETE" })
    }
    toast.success(`${ids.length} görev silindi`)
    setBulkMode(false)
    setSelectedTasks(new Set())
    onRefresh()
  }

  async function handleBulkPriority(priority: string) {
    const ids = [...selectedTasks]
    for (const tid of ids) {
      await fetch(`/api/projects/${board.id}/tasks/${tid}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priority }),
      })
    }
    toast.success(`${ids.length} görevin önceliği güncellendi`)
    setBulkMode(false)
    setSelectedTasks(new Set())
    onRefresh()
  }

  // Column management
  function openEditColumn(col: BoardColumn) {
    setEditingCol(col)
    setEditColName(col.name)
    setEditColColor(col.color)
    setEditColWip(col.wipLimit?.toString() ?? "")
  }

  async function handleSaveColumn() {
    if (!editingCol || !editColName.trim()) return
    try {
      await fetch(`/api/projects/${board.id}/columns/${editingCol.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editColName.trim(),
          color: editColColor,
          wipLimit: editColWip ? parseInt(editColWip) : null,
        }),
      })
      toast.success("Kolon güncellendi")
      setEditingCol(null)
      onRefresh()
    } catch { toast.error("Kolon güncellenemedi") }
  }

  async function handleDeleteColumn() {
    if (!deleteCol) return
    try {
      await fetch(`/api/projects/${board.id}/columns/${deleteCol.id}`, { method: "DELETE" })
      toast.success("Kolon silindi")
      setDeleteCol(null)
      onRefresh()
    } catch { toast.error("Kolon silinemedi") }
  }

  if (loading) {
    return (
      <div className="flex gap-3 overflow-x-auto pb-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="w-[272px] shrink-0 space-y-2">
            <Skeleton className="h-9 w-full rounded-[4px]" />
            {Array.from({ length: 3 - (i % 2) }).map((_, j) => (
              <Skeleton key={j} className="h-20 w-full rounded-[4px]" />
            ))}
          </div>
        ))}
      </div>
    )
  }

  return (
    <>
      {/* Bulk operation bar */}
      <div className="flex items-center gap-2 mb-3">
        <button
          onClick={() => { setBulkMode(!bulkMode); setSelectedTasks(new Set()) }}
          className={cn(
            "flex items-center gap-1.5 px-2.5 py-1.5 rounded-[5px] text-[10px] font-medium transition-colors border",
            bulkMode ? "bg-foreground text-background border-foreground" : "border-border/60 hover:bg-muted/40 text-muted-foreground"
          )}
        >
          <CheckSquare className="size-3" />
          {bulkMode ? "Seçimi Kapat" : "Toplu İşlem"}
        </button>

        {bulkMode && selectedTasks.size > 0 && (
          <>
            <span className="text-[10px] text-muted-foreground tabular-nums">
              {selectedTasks.size} seçili
            </span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="px-2.5 py-1.5 rounded-[5px] text-[10px] font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors">
                  Taşı
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="rounded-[6px] text-[11px]">
                {columns.map((col) => (
                  <DropdownMenuItem key={col.id} onClick={() => handleBulkMove(col.id)}>
                    <div className="size-2 rounded-full mr-2" style={{ backgroundColor: col.color }} />
                    {col.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="px-2.5 py-1.5 rounded-[5px] text-[10px] font-medium bg-amber-600 text-white hover:bg-amber-700 transition-colors">
                  Öncelik
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="rounded-[6px] text-[11px]">
                <DropdownMenuItem onClick={() => handleBulkPriority("critical")}>Kritik</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleBulkPriority("high")}>Yüksek</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleBulkPriority("medium")}>Orta</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleBulkPriority("low")}>Düşük</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <button
              onClick={handleBulkDelete}
              className="px-2.5 py-1.5 rounded-[5px] text-[10px] font-medium bg-destructive text-white hover:bg-destructive/90 transition-colors"
            >
              Sil ({selectedTasks.size})
            </button>
          </>
        )}
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
      >
        <div className="flex gap-3 overflow-x-auto pb-6 min-h-[calc(100vh-280px)]">
          {filteredColumns.map((col) => (
            <KanbanColumn
              key={col.id}
              column={col}
              projectId={board.id}
              onRefresh={onRefresh}
              onCardClick={openSheet}
              filteredTasks={col.filteredTasks}
              selectedTasks={selectedTasks}
              onToggleSelect={toggleSelect}
              bulkMode={bulkMode}
              onEditColumn={openEditColumn}
              onDeleteColumn={(c) => setDeleteCol(c)}
            />
          ))}
        </div>

        <DragOverlay>
          {activeTask && <TaskCard task={activeTask} onClick={() => {}} overlay />}
        </DragOverlay>
      </DndContext>

      <TaskSheet
        task={sheetTask}
        columns={columns}
        projectId={board.id}
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onUpdated={() => { setSheetOpen(false); onRefresh() }}
        onDeleted={() => { setSheetOpen(false); onRefresh() }}
      />

      {/* Kolon düzenleme dialog */}
      <Dialog open={!!editingCol} onOpenChange={(o) => !o && setEditingCol(null)}>
        <DialogContent className="rounded-[8px] max-w-xs p-0 gap-0">
          <DialogHeader className="px-5 py-4 border-b border-border/50">
            <DialogTitle className="text-[13px] font-semibold">Kolonu Düzenle</DialogTitle>
          </DialogHeader>
          <div className="px-5 py-4 space-y-3">
            <div className="space-y-1.5">
              <Label className="text-[10px] text-muted-foreground uppercase tracking-wide">Kolon Adı</Label>
              <Input autoFocus value={editColName} onChange={(e) => setEditColName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSaveColumn()}
                className="h-8 text-[11px] rounded-[5px]" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] text-muted-foreground uppercase tracking-wide">WIP Limiti</Label>
              <Input type="number" value={editColWip} onChange={(e) => setEditColWip(e.target.value)}
                placeholder="Sınırsız" className="h-8 text-[11px] rounded-[5px]" min={1} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] text-muted-foreground uppercase tracking-wide">Renk</Label>
              <div className="flex gap-2 flex-wrap">
                {["#6b7280","#3b82f6","#f59e0b","#8b5cf6","#10b981","#ef4444","#ec4899","#06b6d4"].map((c) => (
                  <button key={c} onClick={() => setEditColColor(c)}
                    className={cn("size-6 rounded-full transition-transform hover:scale-110",
                      editColColor === c && "ring-2 ring-offset-2 ring-foreground/30 scale-110")}
                    style={{ backgroundColor: c }} />
                ))}
              </div>
            </div>
          </div>
          <div className="px-5 py-3 border-t border-border/50 flex justify-end gap-2">
            <button onClick={() => setEditingCol(null)}
              className="px-3 py-1.5 rounded-[5px] text-[11px] font-medium border border-border/60 hover:bg-muted/40 transition-colors">
              İptal
            </button>
            <button onClick={handleSaveColumn} disabled={!editColName.trim()}
              className="px-4 py-1.5 rounded-[5px] text-[11px] font-semibold bg-foreground text-background hover:bg-foreground/90 disabled:opacity-50 transition-colors">
              Kaydet
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Kolon silme onayı */}
      <AlertDialog open={!!deleteCol} onOpenChange={(o) => !o && setDeleteCol(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-sm">Kolonu sil</AlertDialogTitle>
            <AlertDialogDescription className="text-[12px]">
              &quot;{deleteCol?.name}&quot; kolonu silinecek. Mevcut görevler ilk kolona taşınacak.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="text-[12px] h-8">İptal</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteColumn}
              className="text-[12px] h-8 bg-destructive text-white hover:bg-destructive/90">
              Sil
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
