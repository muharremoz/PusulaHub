"use client"

import { useState } from "react"
import { ServiceItem } from "@/lib/setup-mock-data"
import { Check } from "lucide-react"
import { cn } from "@/lib/utils"

interface Props {
  services: ServiceItem[]
  selectedIds: number[]
  onToggle: (id: number) => void
  onToggleAll: (category: string, selected: boolean) => void
}

export function StepServices({ services, selectedIds, onToggle, onToggleAll }: Props) {
  const categories = [...new Set(services.map((s) => s.category))]
  const [activeTab, setActiveTab] = useState(categories[0])

  const catItems = services.filter((s) => s.category === activeTab)
  const allSelected = catItems.every((s) => selectedIds.includes(s.id))

  return (
    <div className="space-y-3">

      {/* Özet satırı */}
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-muted-foreground">
          {selectedIds.length > 0
            ? <><span className="font-semibold text-foreground">{selectedIds.length}</span> hizmet seçildi</>
            : "Firmaya atanacak hizmetleri seçin"}
        </span>
        {selectedIds.length > 0 && (
          <span className="text-[10px] text-muted-foreground">
            {categories.map((cat) => {
              const n = services.filter((s) => s.category === cat && selectedIds.includes(s.id)).length
              return n > 0 ? `${cat}: ${n}` : null
            }).filter(Boolean).join(" · ")}
          </span>
        )}
      </div>

      {/* Kategori sekmeleri */}
      <div className="flex items-center gap-1 border-b border-border/50 pb-0">
        {categories.map((cat) => {
          const count = services.filter((s) => s.category === cat && selectedIds.includes(s.id)).length
          const isActive = activeTab === cat
          return (
            <button
              key={cat}
              onClick={() => setActiveTab(cat)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-2 text-[11px] font-medium border-b-2 -mb-px transition-colors",
                isActive
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {cat}
              {count > 0 && (
                <span className="size-4 rounded-full bg-foreground text-background text-[9px] flex items-center justify-center font-bold">
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Hizmet listesi */}
      <div className="rounded-[5px] border border-border/50 overflow-hidden">
        {/* Liste başlık satırı */}
        <div className="flex items-center justify-between px-3 py-2 bg-muted/30 border-b border-border/40">
          <span className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase">
            {activeTab} — {catItems.length} hizmet
          </span>
          <button
            onClick={() => onToggleAll(activeTab, !allSelected)}
            className="text-[10px] font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            {allSelected ? "Tümünü Kaldır" : "Tümünü Seç"}
          </button>
        </div>

        {/* Satırlar */}
        <div className="divide-y divide-border/40">
          {catItems.map((service) => {
            const isSelected = selectedIds.includes(service.id)
            return (
              <button
                key={service.id}
                onClick={() => onToggle(service.id)}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors",
                  isSelected ? "bg-foreground/[0.03]" : "hover:bg-muted/20"
                )}
              >
                {/* Checkbox */}
                <span className={cn(
                  "size-4 rounded-[3px] border-2 flex items-center justify-center shrink-0 transition-all",
                  isSelected ? "bg-foreground border-foreground" : "border-border"
                )}>
                  {isSelected && <Check className="size-2.5 text-background" strokeWidth={3} />}
                </span>

                {/* İsim */}
                <span className={cn(
                  "text-[11px] font-medium flex-1",
                  isSelected ? "text-foreground" : "text-muted-foreground"
                )}>
                  {service.name}
                </span>

                {/* Klasör yolu */}
                <span className="text-[10px] text-muted-foreground font-mono truncate max-w-[240px]">
                  {service.folderPath}
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
