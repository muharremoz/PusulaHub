"use client"

import React, { useState, useCallback } from "react"
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
  type DragStartEvent, type DragOverEvent, type DragEndEvent,
  closestCorners,
} from "@dnd-kit/core"
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { useDroppable } from "@dnd-kit/core"
import { Plus, MoreVertical } from "lucide-react"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
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
  column, projectId, onRefresh, onCardClick,
}: {
  column: BoardColumn
  projectId: string
  onRefresh: () => void
  onCardClick: (task: BoardTask) => void
}) {
  const [adding, setAdding] = useState(false)
  const [newTitle, setNewTitle] = useState("")
  const [saving, setSaving] = useState(false)

  const wipOver = column.wipLimit !== null && column.tasks.length >= column.wipLimit

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
          {column.tasks.length}{column.wipLimit !== null ? `/${column.wipLimit}` : ""}
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="text-muted-foreground hover:text-foreground transition-colors">
              <MoreVertical className="size-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="rounded-[6px] text-[11px]">
            <DropdownMenuItem onClick={() => setAdding(true)}>Görev Ekle</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Kartlar */}
      <ColumnDropZone column={column}>
        <SortableContext items={column.tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {column.tasks.map((task) => (
              <TaskCard key={task.id} task={task} onClick={onCardClick} />
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
  board:     BoardData
  loading:   boolean
  onRefresh: () => void
}

export function KanbanBoard({ board, loading, onRefresh }: Props) {
  const [activeTask, setActiveTask]  = useState<BoardTask | null>(null)
  const [sheetTask,  setSheetTask]   = useState<BoardTask | null>(null)
  const [sheetOpen,  setSheetOpen]   = useState(false)

  // Optimistic state — sadece board prop değiştiğinde (parent refetch) senkronize et
  const [columns, setColumns] = useState<BoardColumn[]>(board.columns)
  const prevBoardRef = React.useRef(board)
  React.useEffect(() => {
    if (prevBoardRef.current !== board) {
      prevBoardRef.current = board
      setColumns(board.columns)
    }
  }, [board])

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

    // Over bir task mı, kolon mu?
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

    // Optimistic state zaten onDragOver'da güncellendi — sadece DB'ye kaydet
    fetch(`/api/projects/${board.id}/tasks/${active.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ columnId: overColId, position: newPos }),
    }).catch(() => {
      toast.error("Taşıma kaydedilemedi")
      onRefresh()  // Sadece hata olursa DB'den gerçek state'e geri dön
    })
  }

  const openSheet = useCallback((task: BoardTask) => {
    setSheetTask(task)
    setSheetOpen(true)
  }, [])

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
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
      >
        <div className="flex gap-3 overflow-x-auto pb-6 min-h-[calc(100vh-220px)]">
          {columns.map((col) => (
            <KanbanColumn
              key={col.id}
              column={col}
              projectId={board.id}
              onRefresh={onRefresh}
              onCardClick={openSheet}
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
    </>
  )
}
