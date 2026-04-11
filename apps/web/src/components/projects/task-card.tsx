"use client"

import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { Calendar, MessageSquare, User, GripVertical } from "lucide-react"
import { cn } from "@/lib/utils"
import type { BoardTask } from "@/app/api/projects/[id]/route"

const PRIORITY_CONFIG = {
  critical: { label: "Kritik",  bar: "bg-red-500",    text: "text-red-600",    badge: "bg-red-50 text-red-700 border-red-200" },
  high:     { label: "Yüksek",  bar: "bg-orange-500",  text: "text-orange-600", badge: "bg-orange-50 text-orange-700 border-orange-200" },
  medium:   { label: "Orta",    bar: "bg-amber-400",   text: "text-amber-600",  badge: "bg-amber-50 text-amber-700 border-amber-200" },
  low:      { label: "Düşük",   bar: "bg-slate-300",   text: "text-slate-500",  badge: "bg-slate-50 text-slate-500 border-slate-200" },
}

function isOverdue(dueDate: string | null): boolean {
  if (!dueDate) return false
  return new Date(dueDate) < new Date()
}

interface Props {
  task:     BoardTask
  onClick:  (task: BoardTask) => void
  overlay?: boolean
}

export function TaskCard({ task, onClick, overlay }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id:   task.id,
    data: { type: "task", task },
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const p      = PRIORITY_CONFIG[task.priority]
  const overdue = isOverdue(task.dueDate)

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group rounded-[4px] bg-white border border-border/40 overflow-hidden transition-shadow cursor-pointer select-none",
        isDragging   && "opacity-40 shadow-none",
        overlay      && "shadow-xl rotate-[1.5deg] border-border/60",
        !isDragging  && "hover:shadow-md hover:border-border/70",
      )}
      onClick={() => !isDragging && onClick(task)}
    >
      {/* Öncelik çizgisi */}
      <div className={cn("h-0.5 w-full", p.bar)} />

      <div className="px-3 pt-2.5 pb-2.5">
        {/* Başlık + sürükle */}
        <div className="flex items-start gap-1.5">
          <div
            {...attributes}
            {...listeners}
            className="mt-0.5 text-muted-foreground/30 hover:text-muted-foreground/70 cursor-grab active:cursor-grabbing shrink-0 transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            <GripVertical className="size-3.5" />
          </div>
          <p className="text-[12px] font-medium leading-snug flex-1 line-clamp-2">{task.title}</p>
        </div>

        {/* Etiketler */}
        {task.labels.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2 ml-5">
            {task.labels.map((l) => (
              <span key={l} className="text-[9px] px-1.5 py-0.5 rounded-full bg-muted/60 text-muted-foreground font-medium">
                {l}
              </span>
            ))}
          </div>
        )}

        {/* Meta */}
        <div className="flex items-center justify-between mt-2.5 ml-5">
          <div className="flex items-center gap-2">
            {/* Öncelik badge */}
            <span className={cn("text-[9px] font-semibold border rounded-[3px] px-1.5 py-0.5", p.badge)}>
              {p.label}
            </span>

            {/* Bitiş tarihi */}
            {task.dueDate && (
              <span className={cn(
                "flex items-center gap-0.5 text-[9px] font-medium",
                overdue ? "text-red-500" : "text-muted-foreground"
              )}>
                <Calendar className="size-2.5" />
                {new Date(task.dueDate).toLocaleDateString("tr-TR", { day: "2-digit", month: "short" })}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Yorum sayısı */}
            {task.commentCount > 0 && (
              <span className="flex items-center gap-0.5 text-[9px] text-muted-foreground">
                <MessageSquare className="size-2.5" />
                {task.commentCount}
              </span>
            )}
            {/* Atanan */}
            {task.assignedTo && (
              <span className="flex items-center gap-0.5 text-[9px] text-muted-foreground font-mono">
                <User className="size-2.5" />
                {task.assignedTo.split(" ")[0]}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
