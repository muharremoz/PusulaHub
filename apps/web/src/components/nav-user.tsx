"use client"

import { ChevronsUpDown, LogOut, Settings, Shield, User } from "lucide-react"
import { useSession, signOut } from "next-auth/react"
import { useRouter }           from "next/navigation"
import {
  Avatar, AvatarFallback,
} from "@/components/ui/avatar"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup,
  DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar,
} from "@/components/ui/sidebar"
import { Badge } from "@/components/ui/badge"

function avatarInitials(name: string) {
  return name.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase() || "?"
}

export function NavUser() {
  const { data: session } = useSession()
  const { isMobile }      = useSidebar()
  const router            = useRouter()

  const name     = session?.user?.fullName ?? session?.user?.name ?? "Kullanıcı"
  const email    = session?.user?.email    ?? ""
  const role     = session?.user?.role     ?? "user"
  const initials = avatarInitials(name)

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <Avatar className="h-8 w-8 rounded-lg">
                <AvatarFallback className="rounded-lg bg-foreground text-background text-[11px] font-bold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{name}</span>
                <span className="truncate text-xs text-muted-foreground">{email || role}</span>
              </div>
              <ChevronsUpDown className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>

          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                <Avatar className="h-8 w-8 rounded-lg">
                  <AvatarFallback className="rounded-lg bg-foreground text-background text-[11px] font-bold">
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
                <User className="size-3.5" />Profil
              </DropdownMenuItem>
              {role === "admin" && (
                <DropdownMenuItem onClick={() => router.push("/users")} className="gap-2 text-[12px]">
                  <Shield className="size-3.5" />Kullanıcı Yönetimi
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => router.push("/settings")} className="gap-2 text-[12px]">
                <Settings className="size-3.5" />Ayarlar
              </DropdownMenuItem>
            </DropdownMenuGroup>

            <DropdownMenuSeparator />

            <DropdownMenuItem
              onClick={async () => {
                // NextAuth v5'in server-side redirect'i bazı koşullarda
                // localhost:3000'e düşüyor. redirect:false ile bypass edip
                // manuel olarak kendi origin'imize yönlendiriyoruz.
                await signOut({ redirect: false })
                window.location.href = `${window.location.origin}/login`
              }}
              className="gap-2 text-[12px] text-destructive focus:text-destructive"
            >
              <LogOut className="size-3.5" />Çıkış Yap
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
