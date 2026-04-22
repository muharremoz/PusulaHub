"use client"

import * as React from "react"
import {
  Activity,
  Building2,
  Database,
  FileText,
  FolderOpen,
  CalendarDays,
  FolderKanban,
  Mail,
  NotebookPen,
  Globe,
  LayoutDashboard,
  MessageSquare,
  Network,
  Plug,
  Server,
  Settings,
  Shield,
  Users,
  Wrench,
  Bell,
  KeyRound,
  Waypoints,
} from "lucide-react"

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

const navGroups: NavGroup[] = [
  {
    label: "Genel",
    items: [
      { title: "Dashboard",  url: "/dashboard",  icon: LayoutDashboard, isActive: true, moduleKey: "dashboard" },
      { title: "Sunucular",  url: "/servers",    icon: Server,       moduleKey: "servers" },
      { title: "İzleme",     url: "/monitoring", icon: Activity,     moduleKey: "monitoring" },
      { title: "Firmalar",   url: "/companies",  icon: Building2,    moduleKey: "companies" },
      { title: "Projeler",    url: "/projects",  icon: FolderKanban, moduleKey: "projects" },
      { title: "Takvim",      url: "/calendar",  icon: CalendarDays, moduleKey: "calendar" },
      { title: "Mail",        url: "/mail",       icon: Mail,        moduleKey: "mail" },
      { title: "Not Defteri", url: "/notes",     icon: NotebookPen,  moduleKey: "notes" },
    ],
  },
  {
    label: "Servisler",
    items: [
      { title: "Pusula Hizmetleri",  url: "/services",       icon: Wrench,   moduleKey: "services" },
      { title: "Demo Veritabanları", url: "/demo-databases", icon: Database, moduleKey: "databases" },
      { title: "IIS",                url: "/iis",            icon: Globe,    moduleKey: "iis" },
      { title: "Active Directory",   url: "/ad",             icon: Shield,   moduleKey: "active-directory" },
      { title: "SQL",                url: "/sql",            icon: Database, moduleKey: "sql" },
      { title: "Port Yönetimi",      url: "/ports",          icon: Waypoints, moduleKey: "ports" },
    ],
  },
  {
    label: "Veri & Raporlar",
    items: [
      { title: "Dosyalar", url: "/files",   icon: FolderOpen, moduleKey: "files" },
      { title: "Loglar",   url: "/logs",    icon: FileText,   moduleKey: "logs" },
      { title: "Raporlar", url: "/reports", icon: Network,    moduleKey: "reports" },
    ],
  },
  {
    label: "Yönetim",
    items: [
      { title: "Mesajlar",         url: "/messages",       icon: MessageSquare, moduleKey: "messages" },
      { title: "Kullanıcılar",     url: "/users",          icon: Users,         moduleKey: "users" },
      { title: "API Bağlantıları", url: "/api-connections",icon: Plug,          moduleKey: "api-connections" },
      { title: "Şifre Kasası",     url: "/vault",          icon: KeyRound,      moduleKey: "vault" },
    ],
  },
  {
    label: "Geliştirici",
    items: [
      { title: "Mesaj Önizleme", url: "/preview", icon: Bell, moduleKey: "preview" },
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
    { title: "Ayarlar", url: "/settings", icon: Settings },
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
            <a href="/companies/setup">
              <RainbowButton className="w-full text-xs font-semibold h-9">
                + Firma Kurulum Sihirbazı
              </RainbowButton>
            </a>
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
