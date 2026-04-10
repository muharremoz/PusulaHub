"use client"

import * as React from "react"
import {
  Activity,
  Building2,
  Database,
  FileText,
  FolderOpen,
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

import { NavMain, type NavGroup } from "@/components/nav-main"
import { NavSecondary } from "@/components/nav-secondary"
import { NavUser } from "@/components/nav-user"
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
      { title: "Dashboard",  url: "/dashboard",  icon: LayoutDashboard, isActive: true },
      { title: "Sunucular",  url: "/servers",    icon: Server },
      { title: "İzleme",     url: "/monitoring", icon: Activity },
      { title: "Firmalar",   url: "/companies",  icon: Building2 },
    ],
  },
  {
    label: "Servisler",
    items: [
      { title: "Pusula Hizmetleri",  url: "/services",       icon: Wrench },
      { title: "Demo Veritabanları", url: "/demo-databases", icon: Database },
      { title: "IIS",                url: "/iis",            icon: Globe },
      { title: "Active Directory",   url: "/ad",             icon: Shield },
      { title: "SQL",                url: "/sql",            icon: Database },
      { title: "Port Yönetimi",      url: "/ports",          icon: Waypoints },
    ],
  },
  {
    label: "Veri & Raporlar",
    items: [
      { title: "Dosyalar", url: "/files",   icon: FolderOpen },
      { title: "Loglar",   url: "/logs",    icon: FileText },
      { title: "Raporlar", url: "/reports", icon: Network },
    ],
  },
  {
    label: "Yönetim",
    items: [
      { title: "Mesajlar",         url: "/messages",       icon: MessageSquare },
      { title: "Kullanıcılar",     url: "/users",          icon: Users },
      { title: "API Bağlantıları", url: "/api-connections",icon: Plug },
      { title: "Şifre Kasası",     url: "/vault",          icon: KeyRound },
    ],
  },
  {
    label: "Geliştirici",
    items: [
      { title: "Mesaj Önizleme", url: "/preview", icon: Bell },
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
  return (
    <Sidebar variant="inset" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <a href="/dashboard">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                  <Server className="size-4" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">PusulaHub</span>
                  <span className="truncate text-xs">Sunucu Yönetim Paneli</span>
                </div>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <div className="px-3 pt-3">
          <a href="/companies/setup">
            <RainbowButton className="w-full text-xs font-semibold h-9">
              + Firma Kurulum Sihirbazı
            </RainbowButton>
          </a>
        </div>
        <NavMain groups={navGroups} />
        <NavSecondary items={data.navSecondary} className="mt-auto" />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={data.user} />
      </SidebarFooter>
    </Sidebar>
  )
}
