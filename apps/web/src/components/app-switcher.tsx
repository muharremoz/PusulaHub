"use client"

import * as React from "react"
import { createPortal } from "react-dom"
import { ChevronsUpDown, Check, ExternalLink } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@muharremoz/pusula-ui"
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

// Birleşik platform: her uygulama kendi alt-domain'inde, tek Supabase cookie'sini
// (`.pusulanet.net`) paylaşır → externalUrl ile doğrudan gidilir (SSO). basePath yok.
// Sıra tüm uygulamalarda AYNI (crm, hub, spareflow, akademi) — böylece app değiştikçe liste
// sırası değişmez; aktif app sadece tik ile işaretlenir.
const APPS: AppEntry[] = [
  {
    id:          "crm",
    name:        "Pusula CRM",
    description: "Müşteri ilişkileri yönetimi",
    logo:        "/logos/crm.svg",
    externalUrl: "https://crm.pusulanet.net/",
  },
  {
    id:          "hub",
    name:        "PusulaHub",
    description: "Sunucu yönetim paneli",
    logo:        "/logos/hub.svg",
    externalUrl: "https://hub.pusulanet.net/",
  },
  {
    id:          "spareflow",
    name:        "SpareFlow",
    description: "SpareBackup izleme uygulaması",
    logo:        "/logos/spareflow.svg",
    externalUrl: "https://spareflow.pusulanet.net/",
  },
  {
    id:          "akademi",
    name:        "Pusula Akademi",
    description: "Personel eğitim platformu",
    logo:        "/logos/akademi.svg",
    externalUrl: "https://akademi.pusulanet.net/",
  },
]

const CURRENT_ID = "hub"

// Switch (launcher) origin — "Switch ekranına dön" hedefi. Prod: https://app.pusulanet.net.
const SWITCH_URL = process.env.NEXT_PUBLIC_SWITCH_URL || "/"

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

  // Sağ tık → "Yeni pencerede aç" (imleç konumunda küçük menü).
  const [sagTik, setSagTik] = React.useState<{ app: AppEntry; x: number; y: number } | null>(null)
  const hedefUrl = (app: AppEntry) =>
    app.externalUrl ?? (typeof window !== "undefined" ? `${window.location.origin}/apps/${app.id}` : "")

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SidebarMenuButton
          size="lg"
          className="bg-sidebar border border-sidebar-border hover:bg-sidebar-accent data-[state=open]:bg-sidebar-accent rounded-[5px] text-white"
        >
          <div className="flex aspect-square size-8 items-center justify-center rounded-[5px] overflow-hidden shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={current.logo} alt={current.name} className="w-full h-full object-cover" />
          </div>
          <div className="grid flex-1 text-left text-sm leading-tight">
            <span className="truncate font-medium text-white">{current.name}</span>
            <span className="truncate text-xs text-sidebar-foreground/70">{current.description}</span>
          </div>
          <ChevronsUpDown className="ml-auto size-4 text-sidebar-foreground/70" />
        </SidebarMenuButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="w-64 rounded-[5px] bg-sidebar border-sidebar-border text-white"
        align="start"
        sideOffset={4}
      >
        <DropdownMenuLabel className="text-[10px] font-medium text-sidebar-foreground/70 tracking-wide uppercase">
          Pusula Uygulamaları
        </DropdownMenuLabel>
        {visibleApps.map((app) => {
          const isActive = app.id === CURRENT_ID
          return (
            <DropdownMenuItem
              key={app.id}
              onSelect={() => { window.location.href = app.externalUrl ?? `/apps/${app.id}` }}
              onContextMenu={(e) => {
                e.preventDefault()
                e.stopPropagation()
                setSagTik({ app, x: e.clientX, y: e.clientY })
              }}
              className="gap-2 p-2 cursor-pointer text-white focus:bg-sidebar-accent focus:text-white data-[highlighted]:bg-sidebar-accent"
            >
              <div className="flex aspect-square size-7 items-center justify-center rounded-[5px] overflow-hidden shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={app.logo} alt={app.name} className="w-full h-full object-cover" />
              </div>
              <div className="grid flex-1 leading-tight min-w-0">
                <span className="truncate text-[12px] font-medium">{app.name}</span>
                <span className="truncate text-[10px] text-sidebar-foreground/70">{app.description}</span>
              </div>
              {isActive && <Check className="size-3.5 text-primary shrink-0" />}
            </DropdownMenuItem>
          )
        })}
        <DropdownMenuSeparator className="bg-sidebar-accent" />
        <DropdownMenuItem
          onSelect={() => { window.location.href = SWITCH_URL }}
          className="gap-2 p-2 cursor-pointer text-[11px] text-sidebar-foreground/70 focus:bg-sidebar-accent focus:text-white data-[highlighted]:bg-sidebar-accent"
        >
          Switch ekranına dön
        </DropdownMenuItem>
      </DropdownMenuContent>

      {sagTik ? (
        <SagTikMenu
          x={sagTik.x}
          y={sagTik.y}
          onKapat={() => setSagTik(null)}
          onSec={() => {
            const url = hedefUrl(sagTik.app)
            setSagTik(null)
            yeniPencerede(url)
          }}
        />
      ) : null}
    </DropdownMenu>
  )
}

/**
 * Uygulamayı ayrı pencerede açar.
 *
 * Masaüstü agent (Electron) içinde `window.open` gömülü view'a yönleniyor —
 * agent köprüsü varsa (`window.pusulaAgent.yeniPencere`) o kullanılır.
 */
function yeniPencerede(href: string): void {
  if (typeof window === "undefined" || !href) return
  const w = window as unknown as { pusulaAgent?: { yeniPencere?: (u: string) => void } }
  if (typeof w.pusulaAgent?.yeniPencere === "function") {
    w.pusulaAgent.yeniPencere(href)
    return
  }
  window.open(href, "_blank", "noopener,noreferrer")
}

const MENU_W = 190
const MENU_H = 44

/**
 * İmleç konumunda açılan tek maddelik menü (body'ye portal).
 *
 * Dropdown içinde `absolute` çizilirse panel kenarından kırpılıyor; ayrıca
 * Radix modal dropdown açıkken body'ye `pointer-events:none` koyduğu için
 * menünün kendi `pointerEvents: auto` demesi gerekiyor.
 */
function SagTikMenu({
  x,
  y,
  onKapat,
  onSec,
}: {
  x: number
  y: number
  onKapat: () => void
  onSec: () => void
}) {
  const kutuRef = React.useRef<HTMLDivElement | null>(null)

  React.useEffect(() => {
    const kapat = (e: Event) => {
      if (kutuRef.current?.contains(e.target as Node)) return
      onKapat()
    }
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onKapat()
    }
    window.addEventListener("pointerdown", kapat, true)
    window.addEventListener("scroll", kapat, true)
    window.addEventListener("keydown", esc, true)
    return () => {
      window.removeEventListener("pointerdown", kapat, true)
      window.removeEventListener("scroll", kapat, true)
      window.removeEventListener("keydown", esc, true)
    }
  }, [onKapat])

  if (typeof document === "undefined") return null

  const sol = Math.max(8, Math.min(x, window.innerWidth - MENU_W - 8))
  const ust = Math.max(8, Math.min(y, window.innerHeight - MENU_H - 8))

  return createPortal(
    <div
      ref={kutuRef}
      className="fixed rounded-[5px] border border-sidebar-border bg-sidebar p-1 text-white shadow-lg"
      style={{ left: sol, top: ust, zIndex: 1200, minWidth: MENU_W, pointerEvents: "auto" }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <button
        type="button"
        onPointerDown={(e) => {
          e.stopPropagation()
          onSec()
        }}
        className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[12px] outline-none transition-colors hover:bg-sidebar-accent"
      >
        <ExternalLink className="size-3.5 shrink-0 opacity-70" />
        Yeni pencerede aç
      </button>
    </div>,
    document.body,
  )
}
