"use client"

import * as React from "react"
import { Server, Package, ChevronsUpDown, Check } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { SidebarMenuButton } from "@/components/ui/sidebar"

/**
 * Pusula uygulamaları arasında geçiş yapar.
 * Liste her uygulamada lokal olarak kopyalanır; yeni app eklendikçe
 * üç yerde (Switch + Hub + Flow) güncellenir.
 *
 * Tıklama = full page navigation (window.location.href).
 * Aynı origin (gateway: localhost:4000) olduğu için cookie korunur ama
 * her uygulamanın kendi auth cookie'si farklıdır → A planı: ayrı login.
 */

interface AppEntry {
  id:          string
  name:        string
  description: string
  icon:        React.ComponentType<{ className?: string }>
  color:       string
}

const APPS: AppEntry[] = [
  {
    id:          "hub",
    name:        "PusulaHub",
    description: "Sunucu yönetim paneli",
    icon:        Server,
    color:       "#082F49",
  },
  {
    id:          "spareflow",
    name:        "SpareFlow",
    description: "SpareBackup izleme uygulaması",
    icon:        Package,
    color:       "#0C4A6E",
  },
]

const CURRENT_ID = "hub"

export function AppSwitcher() {
  const [accessibleApps, setAccessibleApps] = React.useState<string[] | null>(null)

  // Kullanıcının erişebildiği app id'lerini session endpoint'inden al —
  // yetki olmayan uygulamalar dropdown'da görünmesin.
  React.useEffect(() => {
    fetch("/api/auth/session")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const apps = d?.user?.apps as Array<{ id: string }> | undefined
        setAccessibleApps(apps?.map((a) => a.id) ?? [])
      })
  }, [])

  const visibleApps = React.useMemo(() => {
    if (accessibleApps === null) return APPS.filter((a) => a.id === CURRENT_ID)
    return APPS.filter((a) => accessibleApps.includes(a.id))
  }, [accessibleApps])

  const current = APPS.find((a) => a.id === CURRENT_ID) ?? APPS[0]
  const Icon    = current.icon

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SidebarMenuButton
          size="lg"
          className="bg-white border border-sky-100 hover:bg-sky-50 data-[state=open]:bg-sky-50 rounded-[6px]"
        >
          <div
            className="flex aspect-square size-8 items-center justify-center rounded-lg"
            style={{ background: current.color }}
          >
            <Icon className="size-4 text-white" />
          </div>
          <div className="grid flex-1 text-left text-sm leading-tight">
            <span className="truncate font-medium text-sky-950">{current.name}</span>
            <span className="truncate text-xs text-sky-900/60">{current.description}</span>
          </div>
          <ChevronsUpDown className="ml-auto size-4 text-sky-900/60" />
        </SidebarMenuButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="w-64 rounded-[5px]"
        align="start"
        sideOffset={4}
      >
        <DropdownMenuLabel className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase">
          Pusula Uygulamaları
        </DropdownMenuLabel>
        {visibleApps.map((app) => {
          const ItemIcon = app.icon
          const isActive = app.id === CURRENT_ID
          return (
            <DropdownMenuItem
              key={app.id}
              asChild
              className="gap-2 p-2 cursor-pointer"
            >
              <a href={`/apps/${app.id}`}>
                <div
                  className="flex aspect-square size-7 items-center justify-center rounded-[5px] shrink-0"
                  style={{ background: app.color }}
                >
                  <ItemIcon className="size-3.5 text-white" />
                </div>
                <div className="grid flex-1 leading-tight min-w-0">
                  <span className="truncate text-[12px] font-medium">{app.name}</span>
                  <span className="truncate text-[10px] text-muted-foreground">{app.description}</span>
                </div>
                {isActive && <Check className="size-3.5 text-emerald-600 shrink-0" />}
              </a>
            </DropdownMenuItem>
          )
        })}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild className="gap-2 p-2 cursor-pointer text-[11px] text-muted-foreground">
          <a href="/">
            Switch ekranına dön
          </a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
