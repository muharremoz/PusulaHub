"use client"

import { useState, useEffect } from "react"
import { X, Activity, RefreshCw } from "lucide-react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

interface ActivityItem {
  id: string
  taskId: string | null
  userName: string | null
  action: string
  detail: string | null
  createdAt: string
}

const ACTION_ICONS: Record<string, string> = {
  "task_created": "Görev oluşturuldu",
  "task_updated": "Görev güncellendi",
  "task_moved":   "Görev taşındı",
  "task_deleted": "Görev silindi",
  "comment_added":"Yorum eklendi",
  "column_added": "Kolon eklendi",
  "column_deleted":"Kolon silindi",
}

interface Props {
  projectId: string
  onClose: () => void
}

export function ActivityPanel({ projectId, onClose }: Props) {
  const [activities, setActivities] = useState<ActivityItem[]>([])
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    try {
      const r = await fetch(`/api/projects/${projectId}/activity?limit=100`)
      if (r.ok) setActivities(await r.json())
    } catch { /* */ } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [projectId])

  return (
    <div className="w-[300px] shrink-0 rounded-[8px] p-2 pb-0" style={{ backgroundColor: "#F4F2F0" }}>
      <div className="rounded-[4px] overflow-hidden flex flex-col h-[calc(100vh-280px)]"
        style={{ backgroundColor: "#FFFFFF", boxShadow: "0 2px 4px rgba(0,0,0,0.06)" }}>
        {/* Header */}
        <div className="px-3 py-2.5 border-b border-border/40 flex items-center gap-2 shrink-0">
          <Activity className="size-3.5 text-muted-foreground" />
          <span className="text-[11px] font-semibold flex-1">Aktivite Geçmişi</span>
          <button onClick={load} className="text-muted-foreground hover:text-foreground transition-colors">
            <RefreshCw className={cn("size-3", loading && "animate-spin")} />
          </button>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="size-3.5" />
          </button>
        </div>

        {/* Content */}
        <ScrollArea className="flex-1">
          <div className="px-3 py-3">
            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="space-y-1">
                    <Skeleton className="h-3 w-full rounded-[3px]" />
                    <Skeleton className="h-2.5 w-1/2 rounded-[3px]" />
                  </div>
                ))}
              </div>
            ) : activities.length === 0 ? (
              <p className="text-[11px] text-muted-foreground text-center py-8">
                Henüz aktivite kaydı yok
              </p>
            ) : (
              <div className="space-y-3">
                {activities.map((a, i) => {
                  // Group by date
                  const date = new Date(a.createdAt).toLocaleDateString("tr-TR", { day: "2-digit", month: "long" })
                  const prevDate = i > 0 ? new Date(activities[i-1].createdAt).toLocaleDateString("tr-TR", { day: "2-digit", month: "long" }) : null
                  const showDate = date !== prevDate

                  return (
                    <div key={a.id}>
                      {showDate && (
                        <p className="text-[9px] font-medium text-muted-foreground uppercase tracking-wide mb-2 mt-1">
                          {date}
                        </p>
                      )}
                      <div className="flex items-start gap-2">
                        <div className="size-1.5 rounded-full bg-muted-foreground/40 mt-1.5 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] leading-relaxed">
                            {a.userName && <span className="font-medium">{a.userName} </span>}
                            <span className="text-muted-foreground">
                              {ACTION_ICONS[a.action] || a.action}
                            </span>
                          </p>
                          {a.detail && (
                            <p className="text-[9px] text-muted-foreground/70 line-clamp-2">{a.detail}</p>
                          )}
                          <p className="text-[9px] text-muted-foreground/50">
                            {new Date(a.createdAt).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}
                          </p>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </ScrollArea>
      </div>
      <div className="h-2" />
    </div>
  )
}
