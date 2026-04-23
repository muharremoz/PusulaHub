"use client"

import * as React from "react"
import Link from "next/link"
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
} from "iconsax-reactjs"

import { useSession } from "next-auth/react"
import { AppSwitcher } from "@/components/app-switcher"
import { NavMain, type NavGroup } from "@/components/nav-main"
import { NavSecondary } from "@/components/nav-secondary"
import { NavUser } from "@/components/nav-user"
import type { PermissionLevel, PermissionMap } from "@/lib/permissions"
import { RainbowButton } from "@/components/ui/rainbow-button"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"

// Tüm sidebar ikonları için ortak TwoTone + pulse-scale wrapper
function makeIcon(Icon: React.ComponentType<Record<string, unknown>>) {
  const Wrapped = ({ className }: { className?: string }) => (
    <span
      className={`inline-flex transition-transform duration-500 ease-out group-hover/navitem:scale-125 ${className ?? ""}`}
    >
      <Icon size="16" color="currentColor" variant="TwoTone" />
    </span>
  )
  Wrapped.displayName = `Icon(${Icon.displayName ?? Icon.name ?? "anon"})`
  return Wrapped
}

const DashboardIcon = makeIcon(Category2)
const ServerIcon    = makeIcon(Monitor)
const MonitoringIcon= makeIcon(Activity)
const CompanyIcon   = makeIcon(Building)
const MessageIcon   = makeIcon(Messages2)
const ProjectIcon   = makeIcon(Kanban)
const CalendarIcon  = makeIcon(Calendar)
const NoteIcon      = makeIcon(Note1)
const ServiceIcon   = makeIcon(Setting2)
const DatabaseIcon  = makeIcon(Data2)
const IISIcon       = makeIcon(Global)
const ADIcon        = makeIcon(SecuritySafe)
const SQLIcon       = makeIcon(DocumentText)
const PortIcon      = makeIcon(Routing2)
const UsersIcon     = makeIcon(Profile2User)
const VaultIcon     = makeIcon(KeySquare)
const PreviewIcon   = makeIcon(Notification)
const SettingsIcon  = makeIcon(Setting)

const navGroups: NavGroup[] = [
  {
    label: "Genel",
    items: [
      { title: "Dashboard",   url: "/dashboard",  icon: DashboardIcon, isActive: true, moduleKey: "dashboard" },
      { title: "Sunucular",   url: "/servers",    icon: ServerIcon,    moduleKey: "servers" },
      { title: "İzleme",      url: "/monitoring", icon: MonitoringIcon,moduleKey: "monitoring" },
      { title: "Firmalar",    url: "/companies",  icon: CompanyIcon,   moduleKey: "companies" },
      { title: "Mesajlar",    url: "/messages",   icon: MessageIcon,   moduleKey: "messages" },
      { title: "Projeler",    url: "/projects",   icon: ProjectIcon,   moduleKey: "projects" },
      { title: "Takvim",      url: "/calendar",   icon: CalendarIcon,  moduleKey: "calendar" },
      { title: "Not Defteri", url: "/notes",      icon: NoteIcon,      moduleKey: "notes" },
    ],
  },
  {
    label: "Servisler",
    items: [
      { title: "Pusula Hizmetleri",  url: "/services",       icon: ServiceIcon,  moduleKey: "services" },
      { title: "Demo Veritabanları", url: "/demo-databases", icon: DatabaseIcon, moduleKey: "databases" },
      { title: "IIS",                url: "/iis",            icon: IISIcon,      moduleKey: "iis" },
      { title: "Active Directory",   url: "/ad",             icon: ADIcon,       moduleKey: "active-directory" },
      { title: "SQL",                url: "/sql",            icon: SQLIcon,      moduleKey: "sql" },
      { title: "Port Yönetimi",      url: "/ports",          icon: PortIcon,     moduleKey: "ports" },
    ],
  },
  {
    label: "Yönetim",
    items: [
      { title: "Kullanıcılar",   url: "/users", icon: UsersIcon, moduleKey: "users" },
      { title: "Şifre Kasası",   url: "/vault", icon: VaultIcon, moduleKey: "vault" },
    ],
  },
  {
    label: "Geliştirici",
    items: [
      { title: "Mesaj Önizleme", url: "/preview", icon: PreviewIcon, moduleKey: "preview" },
    ],
  },
]

const data = {
  user: {
    name: "Admin",
    email: "admin@pusula.com",
    avatar: "",
  },
  navSecondary: [
    { title: "Ayarlar", url: "/settings", icon: SettingsIcon },
  ],
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { data: session } = useSession()
  const role = session?.user?.role
  const perms = (session?.user?.permissions ?? {}) as PermissionMap
  const isAdmin = role === "admin"

  const visibleGroups: NavGroup[] = navGroups
    .map((g) => ({
      label: g.label,
      items: g.items.filter((it) => {
        if (isAdmin) return true
        if (!it.moduleKey) return true
        const lvl = (perms[it.moduleKey] ?? "none") as PermissionLevel
        return lvl !== "none"
      }),
    }))
    .filter((g) => g.items.length > 0)

  return (
    <Sidebar variant="inset" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <AppSwitcher />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        {(isAdmin || (perms["companies"] ?? "none") === "write") && (
          <div className="px-3 pt-3">
            <Link href="/companies/setup">
              <RainbowButton className="w-full text-xs font-semibold h-9">
                + Firma Kurulum Sihirbazı
              </RainbowButton>
            </Link>
          </div>
        )}
        <NavMain groups={visibleGroups} />
        <NavSecondary items={data.navSecondary} className="mt-auto" />
      </SidebarContent>
      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
    </Sidebar>
  )
}
