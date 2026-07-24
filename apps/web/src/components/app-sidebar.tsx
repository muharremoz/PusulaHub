"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Category2,
  Monitor,
  Building,
  Activity,
  Messages2,
  Kanban,
  Calendar,
  Note1,
  Setting2,
  Data2,
  Global,
  SecuritySafe,
  DocumentText,
  Routing2,
  Profile2User,
  KeySquare,
  Notification,
  Setting,
  Code,
  MagicStar,
} from "iconsax-reactjs"

import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { LogOut, Shield, User as UserLucide } from "lucide-react"
import { AppSwitcher } from "@/components/app-switcher"
import type { PermissionLevel, PermissionMap } from "@/lib/permissions"
import { BorderBeam } from "border-beam"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Tooltip, TooltipContent, TooltipTrigger } from "@muharremoz/pusula-ui"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup,
  DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@muharremoz/pusula-ui"
import { Badge } from "@/components/ui/badge"

// ---------- Icon helper ----------
type IconComp = React.ComponentType<Record<string, unknown>>

function Ic({ I, size = 18, className = "" }: { I: IconComp; size?: number; className?: string }) {
  return (
    <span className={`inline-flex ${className}`}>
      <I size={String(size)} color="currentColor" variant="Bulk" />
    </span>
  )
}

// ---------- Data ----------
interface NavItem {
  title: string
  url: string
  icon: IconComp
  moduleKey?: string
}

interface NavGroupDef {
  key: string
  label: string
  railIcon: IconComp
  items: NavItem[]
}

const navGroups: NavGroupDef[] = [
  {
    key: "general",
    label: "Genel",
    railIcon: Category2,
    items: [
      { title: "Dashboard",   url: "/dashboard",  icon: Category2, moduleKey: "dashboard" },
      { title: "Sunucular",   url: "/servers",    icon: Monitor,   moduleKey: "servers" },
      { title: "İzleme",      url: "/monitoring", icon: Activity,  moduleKey: "monitoring" },
      { title: "Firmalar",    url: "/companies",  icon: Building,  moduleKey: "companies" },
      { title: "Aktarım",     url: "/aktarim",    icon: Building,  moduleKey: "aktarim" },
      { title: "Mesajlar",    url: "/messages",   icon: Messages2, moduleKey: "messages" },
      { title: "Projeler",    url: "/projects",   icon: Kanban,    moduleKey: "projects" },
      { title: "Takvim",      url: "/calendar",   icon: Calendar,  moduleKey: "calendar" },
      { title: "Not Defteri", url: "/notes",      icon: Note1,     moduleKey: "notes" },
    ],
  },
  {
    key: "services",
    label: "Servisler",
    railIcon: Setting2,
    items: [
      { title: "Pusula Hizmetleri",  url: "/services",       icon: Setting2,     moduleKey: "services" },
      { title: "Demo Veritabanları", url: "/demo-databases", icon: Data2,        moduleKey: "databases" },
      { title: "IIS",                url: "/iis",            icon: Global,       moduleKey: "iis" },
      { title: "Active Directory",   url: "/ad",             icon: SecuritySafe, moduleKey: "active-directory" },
      { title: "SQL",                url: "/sql",            icon: DocumentText, moduleKey: "sql" },
      { title: "Port Yönetimi",      url: "/ports",          icon: Routing2,     moduleKey: "ports" },
    ],
  },
  {
    key: "admin",
    label: "Yönetim",
    railIcon: Profile2User,
    items: [
      { title: "Kullanıcılar", url: "/users", icon: Profile2User, moduleKey: "users" },
      { title: "Şifre Kasası", url: "/vault", icon: KeySquare,    moduleKey: "vault" },
    ],
  },
  {
    key: "dev",
    label: "Geliştirici",
    railIcon: Code,
    items: [
      { title: "Mesaj Önizleme", url: "/preview", icon: Notification, moduleKey: "preview" },
    ],
  },
]

function avatarInitials(name: string) {
  return name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase() || "?"
}

function CompactUserAvatar() {
  const { data: session } = useSession()
  const router = useRouter()
  const name = session?.user?.fullName ?? session?.user?.name ?? "Kullanıcı"
  const email = session?.user?.email ?? ""
  const role = session?.user?.role ?? "user"
  const initials = avatarInitials(name)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="flex h-9 w-9 items-center justify-center rounded-[8px] hover:bg-[#0d3380] transition-colors"
          title={name}
        >
          <Avatar className="h-7 w-7 rounded-[6px]">
            <AvatarFallback className="rounded-[6px] bg-neutral-200 text-neutral-900 text-[10px] font-bold">
              {initials}
            </AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="right" align="end" sideOffset={8} className="min-w-56 rounded-lg">
        <DropdownMenuLabel className="p-0 font-normal">
          <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
            <Avatar className="h-8 w-8 rounded-lg">
              <AvatarFallback className="rounded-lg bg-[#1d64ff] text-white text-[11px] font-bold">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium">{name}</span>
              <span className="truncate text-xs text-muted-foreground">{email}</span>
            </div>
            <Badge variant="outline" className="text-[9px] h-4 px-1.5 shrink-0">
              {role === "admin" ? "Admin" : "Kullanıcı"}
            </Badge>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={() => router.push("/profile")} className="gap-2 text-[12px]">
            <UserLucide className="size-3.5" />Profil
          </DropdownMenuItem>
          {role === "admin" && (
            <DropdownMenuItem onClick={() => router.push("/users")} className="gap-2 text-[12px]">
              <Shield className="size-3.5" />Kullanıcı Yönetimi
            </DropdownMenuItem>
          )}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={async () => {
            await fetch("/api/auth/logout", { method: "POST" })
            window.location.href = "/login"
          }}
          className="gap-2 text-[12px] text-destructive focus:text-destructive"
        >
          <LogOut className="size-3.5" />Çıkış Yap
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function findGroupByPath(pathname: string | null, groups: NavGroupDef[]): number {
  if (!pathname) return 0
  for (let i = 0; i < groups.length; i++) {
    if (groups[i].items.some((it) => pathname === it.url || pathname.startsWith(it.url + "/"))) {
      return i
    }
  }
  return 0
}

// ---------- Sidebar root ----------
export function AppSidebar() {
  const { data: session } = useSession()
  const role = session?.user?.role
  const perms = (session?.user?.permissions ?? {}) as PermissionMap
  const isAdmin = role === "admin"
  const pathname = usePathname()

  // Yetkiye göre filtrelenmiş gruplar
  const visibleGroups: NavGroupDef[] = React.useMemo(() => {
    return navGroups
      .map((g) => ({
        ...g,
        items: g.items.filter((it) => {
          if (isAdmin) return true
          if (!it.moduleKey) return true
          const lvl = (perms[it.moduleKey] ?? "none") as PermissionLevel
          return lvl !== "none"
        }),
      }))
      .filter((g) => g.items.length > 0)
  }, [isAdmin, perms])

  // Aktif grup — pathname değişince güncelle
  const [activeIdx, setActiveIdx] = React.useState(() => findGroupByPath(pathname, visibleGroups))
  React.useEffect(() => {
    const idx = findGroupByPath(pathname, visibleGroups)
    setActiveIdx(idx)
  }, [pathname, visibleGroups])

  const activeGroup = visibleGroups[activeIdx] ?? visibleGroups[0]
  const canWriteCompanies = isAdmin || (perms["companies"] ?? "none") === "write"
  const [panelOpen, setPanelOpen] = React.useState(true)
  const openGroup = (i: number) => {
    if (i === activeIdx) setPanelOpen((o) => !o)
    else { setActiveIdx(i); setPanelOpen(true) }
  }

  return (
    <>
      <aside className="group/sidebar sticky top-0 flex h-svh shrink-0 self-stretch bg-[#061a48] text-[#eef3ff]">
        {/* -------- RAIL (sol) — ikon + altında isim -------- */}
        <nav className="flex w-[64px] shrink-0 flex-col items-center gap-1 border-r border-[#0d3380] py-3">
          {canWriteCompanies && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Link href="/companies/setup" className="mb-2 block">
                  <BorderBeam size="sm" colorVariant="ocean" theme="dark" borderRadius={6}>
                    <span className="flex h-9 w-9 items-center justify-center rounded-[6px] bg-black text-white hover:bg-neutral-800 transition-colors">
                      <MagicStar size="16" color="currentColor" variant="Bold" />
                    </span>
                  </BorderBeam>
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={8}>Firma Kurulum Sihirbazı</TooltipContent>
            </Tooltip>
          )}
          <div className="flex flex-col gap-1">
            {visibleGroups.map((g, i) => {
              const active = i === activeIdx && panelOpen
              return (
                <button
                  key={g.key}
                  onClick={() => openGroup(i)}
                  title={g.label}
                  className={`flex w-14 flex-col items-center gap-1 rounded-[8px] px-1 py-1.5 transition-colors ${
                    active ? "bg-white text-[#1d64ff]" : "text-[#b4c8ff] hover:bg-[#0d3380] hover:text-white"
                  }`}
                >
                  <Ic I={g.railIcon} size={18} />
                  <span className="w-full truncate text-center text-[9px] leading-tight">{g.label}</span>
                </button>
              )
            })}
          </div>
          {/* bottom: settings + avatar */}
          <div className="mt-auto flex flex-col items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  href="/settings"
                  className="flex h-9 w-9 items-center justify-center rounded-[8px] text-[#b4c8ff] hover:bg-[#0d3380] hover:text-white transition-colors"
                >
                  <Ic I={Setting} size={18} />
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={8}>Ayarlar</TooltipContent>
            </Tooltip>
            <CompactUserAvatar />
          </div>
        </nav>

        {/* -------- PANEL (sağ) — seçim yapılınca animasyonla gizlenir -------- */}
        <div
          className={`flex min-w-0 flex-col overflow-hidden bg-[#061a48] transition-[width,opacity] duration-300 ease-out ${
            panelOpen ? "w-[232px] opacity-100" : "w-0 opacity-0"
          }`}
        >
        <div className="flex h-full w-[232px] min-w-0 flex-col">
          {/* Header: AppSwitcher */}
          <div className="px-2 pt-2">
            <AppSwitcher />
          </div>

          {/* Grup içeriği — grup değişince soldan kayarak giriyor */}
          <div
            key={activeGroup?.key}
            className="flex min-h-0 flex-1 flex-col animate-in slide-in-from-left-3 fade-in duration-300 ease-out"
          >
            {/* Group title */}
            <div className="px-3 pt-4 pb-2">
              <h2 className="text-[15px] font-semibold text-[#b4c8ff]">
                {activeGroup?.label ?? "Menü"}
              </h2>
            </div>

            {/* Items list */}
            <nav className="flex-1 overflow-y-auto px-2 pt-3 pb-3">
              <div className="flex flex-col gap-0.5">
                {activeGroup?.items.map((it, idx) => {
                  const active = pathname === it.url || pathname?.startsWith(it.url + "/")
                  return (
                    <Link
                      key={it.url}
                      href={it.url}
                      onClick={() => setPanelOpen(false)}
                      style={{ animationDelay: `${idx * 30}ms`, animationFillMode: "both" }}
                      className={`group/navitem flex items-center gap-2.5 rounded-[6px] px-2.5 py-2 text-[13px] transition-colors animate-in slide-in-from-left-2 fade-in duration-300 ease-out ${
                        active
                          ? "bg-[#1d64ff] text-white"
                          : "text-[#b4c8ff] hover:bg-[#0d3380] hover:text-white"
                      }`}
                    >
                      <span className="inline-flex transition-transform duration-300 ease-out group-hover/navitem:scale-110">
                        <it.icon size="16" color="currentColor" variant="Bulk" />
                      </span>
                      <span className="flex-1 truncate">{it.title}</span>
                    </Link>
                  )
                })}
              </div>
            </nav>
          </div>
        </div>
        </div>
      </aside>
    </>
  )
}
