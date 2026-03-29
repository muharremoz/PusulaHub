"use client"

import * as React from "react"
import {
  LayoutDashboard,
  Server,
  Activity,
  Users,
  Database,
  Globe,
  FolderOpen,
  FileText,
  UserCog,
  BarChart3,
  Settings,
  Compass,
  Briefcase,
  MessageSquare,
  Building2,
  Cable,
  Monitor,
  Wrench,
  Shield,
} from "lucide-react"

import { NavMain } from "@/components/nav-main"
import { NavUser } from "@/components/nav-user"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar"

const data = {
  user: {
    name: "Admin",
    email: "admin@pusulahub.local",
    avatar: "",
  },
  navGroups: [
    {
      label: "Genel",
      icon: Monitor,
      defaultOpen: true,
      items: [
        { title: "Kontrol Paneli", url: "/", icon: LayoutDashboard },
        { title: "Sunucular", url: "/servers", icon: Server },
        { title: "Monitoring", url: "/monitoring", icon: Activity },
      ],
    },
    {
      label: "Yonetim",
      icon: Wrench,
      items: [
        { title: "Active Directory", url: "/ad", icon: Users },
        { title: "SQL Server", url: "/sql", icon: Database },
        { title: "IIS Yonetimi", url: "/iis", icon: Globe },
        { title: "Dosya Yonetimi", url: "/files", icon: FolderOpen },
      ],
    },
    {
      label: "Sistem",
      icon: Shield,
      items: [
        { title: "Loglar", url: "/logs", icon: FileText },
        { title: "Mesajlar", url: "/messages", icon: MessageSquare },
        { title: "Kullanici Yonetimi", url: "/users", icon: UserCog },
        { title: "Raporlar", url: "/reports", icon: BarChart3 },
        { title: "Ayarlar", url: "/settings", icon: Settings },
      ],
    },
    {
      label: "Pusula",
      icon: Compass,
      items: [
        { title: "Hizmetler", url: "/services", icon: Briefcase },
        { title: "Firma Yonetimi", url: "/companies", icon: Building2 },
        { title: "API Baglantilari", url: "/api-connections", icon: Cable },
      ],
    },
  ],
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <a href="/">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                  <Compass className="size-4" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">PusulaHub</span>
                  <span className="truncate text-xs">Sunucu Yonetim Paneli</span>
                </div>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        {data.navGroups.map((group) => (
          <NavMain
            key={group.label}
            label={group.label}
            icon={group.icon}
            items={group.items}
            defaultOpen={group.defaultOpen}
          />
        ))}
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={data.user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
