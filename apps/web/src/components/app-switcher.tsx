"use client"

import * as React from "react"
import { ChevronsUpDown, Check } from "lucide-react"
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
  logo:        string
  /** Cloud uygulaması — verilirse /apps/<id> proxy yerine doğrudan bu adrese gider. */
  externalUrl?: string
}

// basePath /apps/hub altında sunulduğumuz için /apps/hub/logos/... ile başlatıyoruz.
const APPS: AppEntry[] = [
  {
    id:          "hub",
    name:        "PusulaHub",
    description: "Sunucu yönetim paneli",
    logo:        "/apps/hub/logos/hub.svg",
  },
  {
    id:          "spareflow",
    name:        "SpareFlow",
    description: "SpareBackup izleme uygulaması",
    logo:        "/apps/hub/logos/spareflow.svg",
  },
  {
    id:          "crm",
    name:        "Pusula CRM",
    description: "Müşteri ilişkileri yönetimi",
    logo:        "/apps/hub/logos/crm.svg",
    externalUrl: "https://crm.bilkar.net",
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

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SidebarMenuButton
          size="lg"
          className="bg-[#082c6b] border border-[#0d3380] hover:bg-[#0d3380] data-[state=open]:bg-[#0d3380] rounded-[6px] text-white"
        >
          <div className="flex aspect-square size-8 items-center justify-center rounded-[5px] overflow-hidden shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={current.logo} alt={current.name} className="w-full h-full object-cover" />
          </div>
          <div className="grid flex-1 text-left text-sm leading-tight">
            <span className="truncate font-medium text-white">{current.name}</span>
            <span className="truncate text-xs text-[#b4c8ff]">{current.description}</span>
          </div>
          <ChevronsUpDown className="ml-auto size-4 text-[#b4c8ff]" />
        </SidebarMenuButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="w-64 rounded-[5px] bg-[#082c6b] border-[#0d3380] text-white"
        align="start"
        sideOffset={4}
      >
        <DropdownMenuLabel className="text-[10px] font-medium text-[#b4c8ff] tracking-wide uppercase">
          Pusula Uygulamaları
        </DropdownMenuLabel>
        {visibleApps.map((app) => {
          const isActive = app.id === CURRENT_ID
          return (
            <DropdownMenuItem
              key={app.id}
              asChild
              className="gap-2 p-2 cursor-pointer text-white focus:bg-[#0d3380] focus:text-white data-[highlighted]:bg-[#0d3380]"
            >
              <a href={app.externalUrl ?? `/apps/${app.id}`}>
                <div className="flex aspect-square size-7 items-center justify-center rounded-[5px] overflow-hidden shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={app.logo} alt={app.name} className="w-full h-full object-cover" />
                </div>
                <div className="grid flex-1 leading-tight min-w-0">
                  <span className="truncate text-[12px] font-medium">{app.name}</span>
                  <span className="truncate text-[10px] text-[#b4c8ff]">{app.description}</span>
                </div>
                {isActive && <Check className="size-3.5 text-[#1d64ff] shrink-0" />}
              </a>
            </DropdownMenuItem>
          )
        })}
        <DropdownMenuSeparator className="bg-[#0d3380]" />
        <DropdownMenuItem asChild className="gap-2 p-2 cursor-pointer text-[11px] text-[#b4c8ff] focus:bg-[#0d3380] focus:text-white data-[highlighted]:bg-[#0d3380]">
          <a href="/">
            Switch ekranına dön
          </a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
