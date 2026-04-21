"use client"

import { useMemo, useState, useRef } from "react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { ChevronLeft, ChevronRight, Calendar, AlertCircle } from "lucide-react"
import type { BoardData, BoardTask } from "@/app/api/projects/[id]/route"

/* ═══════════════════════════════════════════════
   Gantt Chart — Proje zaman çizelgesi
═══════════════════════════════════════════════ */

const PRIORITY_COLORS: Record<string, string> = {
  critical: "#ef4444",
  high:     "#f59e0b",
  medium:   "#3b82f6",
  low:      "#6b7280",
}

const DAY_WIDTH = 36
const ROW_HEIGHT = 32
const HEADER_HEIGHT = 56
const LEFT_PANEL_WIDTH = 260

interface GanttTask extends BoardTask {
  columnName: string
  columnColor: string
}

function parseDate(s: string | null): Date | null {
  if (!s) return null
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

function diffDays(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24))
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("tr-TR", { day: "2-digit", month: "short" })
}

function formatDateFull(d: Date): string {
  return d.toLocaleDateString("tr-TR", { day: "2-digit", month: "long", year: "numeric" })
}

interface Props {
  board: BoardData
  loading: boolean
}

export function GanttChart({ board, loading }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [weekOffset, setWeekOffset] = useState(0)

  // Görevleri düzleştir
  const tasks: GanttTask[] = useMemo(() => {
    return board.columns.flatMap((col) =>
      col.tasks.map((t) => ({
        ...t,
        columnName: col.name,
        columnColor: col.color,
      }))
    )
  }, [board])

  // Tarih aralığını hesapla
  const { startDate, endDate, totalDays } = useMemo(() => {
    const now = new Date()
    now.setHours(0, 0, 0, 0)

    const dates: Date[] = [now]
    for (const t of tasks) {
      const start = parseDate(t.startDate) || parseDate(t.createdAt)
      const due = parseDate(t.dueDate)
      if (start) dates.push(start)
      if (due) dates.push(due)
    }

    const minDate = new Date(Math.min(...dates.map((d) => d.getTime())))
    const maxDate = new Date(Math.max(...dates.map((d) => d.getTime())))

    // Minimum 4 hafta göster
    const start = addDays(minDate, -3 + weekOffset * 7)
    const end = addDays(maxDate, 10 + weekOffset * 7)
    const days = Math.max(diffDays(start, end), 28)

    return { startDate: start, endDate: end, totalDays: days }
  }, [tasks, weekOffset])

  // Günleri oluştur
  const days = useMemo(() => {
    return Array.from({ length: totalDays }, (_, i) => addDays(startDate, i))
  }, [startDate, totalDays])

  // Hafta grupları
  const weeks = useMemo(() => {
    const result: { start: number; label: string; days: number }[] = []
    let currentWeek = -1
    for (let i = 0; i < days.length; i++) {
      const d = days[i]
      const weekNum = getWeekNumber(d)
      if (weekNum !== currentWeek) {
        result.push({
          start: i,
          label: `${d.toLocaleDateString("tr-TR", { month: "short" })} — Hafta ${weekNum}`,
          days: 1,
        })
        currentWeek = weekNum
      } else {
        result[result.length - 1].days++
      }
    }
    return result
  }, [days])

  // Bugünün pozisyonu
  const todayIndex = useMemo(() => {
    const now = new Date()
    now.setHours(0, 0, 0, 0)
    return diffDays(startDate, now)
  }, [startDate])

  if (loading) {
    return (
      <div className="rounded-[8px] p-2 pb-0" style={{ backgroundColor: "#F4F2F0" }}>
        <div className="rounded-[4px] p-4" style={{ backgroundColor: "#FFFFFF", boxShadow: "0 2px 4px rgba(0,0,0,0.06)" }}>
          <div className="space-y-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full rounded-[3px]" />
            ))}
          </div>
        </div>
        <div className="h-2" />
      </div>
    )
  }

  if (tasks.length === 0) {
    return (
      <div className="rounded-[8px] p-2 pb-0" style={{ backgroundColor: "#F4F2F0" }}>
        <div className="rounded-[4px] px-6 py-16 text-center"
          style={{ backgroundColor: "#FFFFFF", boxShadow: "0 2px 4px rgba(0,0,0,0.06)" }}>
          <Calendar className="size-8 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-[12px] font-medium text-muted-foreground">Henüz görev yok</p>
          <p className="text-[11px] text-muted-foreground/60 mt-1">
            Kanban görünümünden görev ekleyin
          </p>
        </div>
        <div className="h-2" />
      </div>
    )
  }

  const chartWidth = totalDays * DAY_WIDTH
  const chartHeight = tasks.length * ROW_HEIGHT + HEADER_HEIGHT

  return (
    <div className="rounded-[8px] p-2 pb-0" style={{ backgroundColor: "#F4F2F0" }}>
      <div className="rounded-[4px] overflow-hidden"
        style={{ backgroundColor: "#FFFFFF", boxShadow: "0 2px 4px rgba(0,0,0,0.06)" }}>

        {/* Toolbar */}
        <div className="px-3 py-2 border-b border-border/40 flex items-center gap-2">
          <Calendar className="size-3.5 text-muted-foreground" />
          <span className="text-[11px] font-semibold flex-1">Zaman Çizelgesi</span>
          <span className="text-[10px] text-muted-foreground tabular-nums">
            {tasks.length} görev
          </span>
          <div className="flex items-center gap-1 ml-2">
            <button
              onClick={() => setWeekOffset((o) => o - 2)}
              className="size-6 flex items-center justify-center rounded-[4px] hover:bg-muted/40 text-muted-foreground transition-colors"
            >
              <ChevronLeft className="size-3.5" />
            </button>
            <button
              onClick={() => setWeekOffset(0)}
              className="px-2 py-0.5 text-[9px] font-medium rounded-[4px] hover:bg-muted/40 text-muted-foreground transition-colors"
            >
              Bugün
            </button>
            <button
              onClick={() => setWeekOffset((o) => o + 2)}
              className="size-6 flex items-center justify-center rounded-[4px] hover:bg-muted/40 text-muted-foreground transition-colors"
            >
              <ChevronRight className="size-3.5" />
            </button>
          </div>
        </div>

        {/* Chart area */}
        <div className="flex" style={{ height: `min(${chartHeight + 20}px, calc(100vh - 300px))` }}>
          {/* Sol panel — görev isimleri */}
          <div className="shrink-0 border-r border-border/40" style={{ width: LEFT_PANEL_WIDTH }}>
            {/* Sol header */}
            <div className="h-[56px] border-b border-border/40 px-3 flex items-end pb-2">
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                Görev
              </span>
            </div>
            {/* Sol body */}
            <ScrollArea className="flex-1" style={{ height: `calc(100% - 56px)` }}>
              {tasks.map((task) => {
                const isOverdue = task.dueDate && new Date(task.dueDate) < new Date() &&
                  !["Tamamlandı", "Done", "Bitti"].includes(task.columnName)
                return (
                  <div
                    key={task.id}
                    className="flex items-center gap-2 px-3 border-b border-border/20 hover:bg-muted/20 transition-colors"
                    style={{ height: ROW_HEIGHT }}
                  >
                    <div
                      className="size-2 rounded-full shrink-0"
                      style={{ backgroundColor: PRIORITY_COLORS[task.priority] || "#6b7280" }}
                    />
                    <span className="text-[10px] truncate flex-1 font-medium">{task.title}</span>
                    {isOverdue && <AlertCircle className="size-3 text-red-500 shrink-0" />}
                    <span
                      className="text-[8px] px-1.5 py-0.5 rounded-[3px] shrink-0 font-medium"
                      style={{
                        backgroundColor: task.columnColor + "18",
                        color: task.columnColor,
                      }}
                    >
                      {task.columnName}
                    </span>
                  </div>
                )
              })}
            </ScrollArea>
          </div>

          {/* Sağ panel — zaman çizelgesi */}
          <div className="flex-1 min-w-0 overflow-auto" ref={scrollRef}>
            <div style={{ width: chartWidth, minHeight: "100%" }}>
              {/* Hafta header */}
              <div className="sticky top-0 z-10 bg-white border-b border-border/40">
                {/* Hafta satırı */}
                <div className="flex h-[28px]">
                  {weeks.map((w, i) => (
                    <div
                      key={i}
                      className="border-r border-border/20 px-1 flex items-center"
                      style={{ width: w.days * DAY_WIDTH }}
                    >
                      <span className="text-[8px] font-medium text-muted-foreground truncate">
                        {w.label}
                      </span>
                    </div>
                  ))}
                </div>
                {/* Gün satırı */}
                <div className="flex h-[28px]">
                  {days.map((d, i) => {
                    const isToday = i === todayIndex
                    const isWeekend = d.getDay() === 0 || d.getDay() === 6
                    return (
                      <div
                        key={i}
                        className={cn(
                          "flex items-center justify-center border-r border-border/20",
                          isToday && "bg-blue-50 font-bold",
                          isWeekend && !isToday && "bg-muted/20",
                        )}
                        style={{ width: DAY_WIDTH }}
                      >
                        <span className={cn(
                          "text-[8px]",
                          isToday ? "text-blue-600" : "text-muted-foreground/60",
                        )}>
                          {d.getDate()}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Grid + bars */}
              <TooltipProvider delayDuration={200}>
                <div className="relative">
                  {/* Background grid */}
                  {days.map((d, i) => {
                    const isToday = i === todayIndex
                    const isWeekend = d.getDay() === 0 || d.getDay() === 6
                    return (
                      <div
                        key={i}
                        className={cn(
                          "absolute top-0 border-r border-border/10",
                          isWeekend && "bg-muted/10",
                        )}
                        style={{
                          left: i * DAY_WIDTH,
                          width: DAY_WIDTH,
                          height: tasks.length * ROW_HEIGHT,
                        }}
                      />
                    )
                  })}

                  {/* Today line */}
                  {todayIndex >= 0 && todayIndex < totalDays && (
                    <div
                      className="absolute top-0 w-[2px] bg-blue-500 z-10"
                      style={{
                        left: todayIndex * DAY_WIDTH + DAY_WIDTH / 2,
                        height: tasks.length * ROW_HEIGHT,
                      }}
                    />
                  )}

                  {/* Task bars */}
                  {tasks.map((task, rowIdx) => {
                    const start = parseDate(task.startDate) || parseDate(task.createdAt) || new Date()
                    const due = parseDate(task.dueDate)
                    const barStart = diffDays(startDate, start)
                    const barEnd = due ? diffDays(startDate, due) : barStart + 3
                    const barDuration = Math.max(barEnd - barStart, 1)

                    const isCompleted = ["Tamamlandı", "Done", "Bitti"].includes(task.columnName)
                    const isOverdue = due && due < new Date() && !isCompleted
                    const color = isCompleted
                      ? "#10b981"
                      : isOverdue
                        ? "#ef4444"
                        : PRIORITY_COLORS[task.priority] || "#3b82f6"

                    // Progress based on subtasks
                    const progress = task.subtaskTotal > 0
                      ? task.subtaskDone / task.subtaskTotal
                      : isCompleted ? 1 : 0

                    return (
                      <Tooltip key={task.id}>
                        <TooltipTrigger asChild>
                          <div
                            className="absolute flex items-center"
                            style={{
                              left: barStart * DAY_WIDTH + 2,
                              top: rowIdx * ROW_HEIGHT + 6,
                              width: barDuration * DAY_WIDTH - 4,
                              height: ROW_HEIGHT - 12,
                            }}
                          >
                            {/* Bar background */}
                            <div
                              className={cn(
                                "absolute inset-0 rounded-[3px] transition-all",
                                isCompleted && "opacity-60",
                              )}
                              style={{ backgroundColor: color + "25" }}
                            />
                            {/* Progress fill */}
                            <div
                              className="absolute left-0 top-0 bottom-0 rounded-[3px] transition-all"
                              style={{
                                width: `${progress * 100}%`,
                                backgroundColor: color + "50",
                              }}
                            />
                            {/* Border */}
                            <div
                              className="absolute inset-0 rounded-[3px] border"
                              style={{ borderColor: color + "60" }}
                            />
                            {/* Label */}
                            {barDuration * DAY_WIDTH > 80 && (
                              <span
                                className="relative z-10 text-[8px] font-medium truncate px-1.5"
                                style={{ color }}
                              >
                                {task.title}
                              </span>
                            )}
                          </div>
                        </TooltipTrigger>
                        <TooltipContent
                          className="rounded-[6px] text-[10px] p-2 max-w-[200px]"
                          side="top"
                        >
                          <p className="font-semibold">{task.title}</p>
                          <p className="text-muted-foreground mt-0.5">
                            {formatDateFull(start)}
                            {due ? ` → ${formatDateFull(due)}` : ""}
                          </p>
                          <p className="text-muted-foreground mt-0.5">
                            Kolon: {task.columnName}
                            {task.assignedTo ? ` · ${task.assignedTo}` : ""}
                          </p>
                          {task.subtaskTotal > 0 && (
                            <p className="text-muted-foreground">
                              Alt görev: {task.subtaskDone}/{task.subtaskTotal}
                            </p>
                          )}
                        </TooltipContent>
                      </Tooltip>
                    )
                  })}
                </div>
              </TooltipProvider>
            </div>
          </div>
        </div>
      </div>
      <div className="h-2" />
    </div>
  )
}

/* Hafta numarası hesaplama */
function getWeekNumber(d: Date): number {
  const oneJan = new Date(d.getFullYear(), 0, 1)
  const days = Math.floor((d.getTime() - oneJan.getTime()) / (86400000))
  return Math.ceil((days + oneJan.getDay() + 1) / 7)
}
