"use client"

import * as React from "react"
import Link from "next/link"
import { ChevronRight } from "lucide-react"

export type NavIcon = React.ComponentType<{ className?: string }>

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { usePathname } from "next/navigation"
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar"

interface NavItem {
  title: string
  url: string
  icon: NavIcon
  isActive?: boolean
  moduleKey?: string
  items?: { title: string; url: string }[]
}

export interface NavGroup {
  label: string
  items: NavItem[]
}

function FlatGroupItems({ items }: { items: NavItem[] }) {
  const pathname = usePathname()
  return (
    <SidebarMenu>
      {items.map((item) => {
        const isActive = pathname === item.url || pathname?.startsWith(item.url + "/")
        return (
        <Collapsible key={item.title} asChild defaultOpen={item.isActive}>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              tooltip={item.title}
              isActive={isActive}
              className="group/navitem transition-all duration-300 [transition-timing-function:cubic-bezier(0.34,1.56,0.64,1)]"
            >
              <Link href={item.url}>
                <item.icon />
                <span>{item.title}</span>
              </Link>
            </SidebarMenuButton>
            {item.items?.length ? (
              <>
                <CollapsibleTrigger asChild>
                  <SidebarMenuAction className="data-[state=open]:rotate-90">
                    <ChevronRight />
                    <span className="sr-only">Toggle</span>
                  </SidebarMenuAction>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <SidebarMenuSub className="border-l-0 mx-0 px-1">
                    {item.items.map((subItem) => (
                      <SidebarMenuSubItem key={subItem.title}>
                        <SidebarMenuSubButton asChild>
                          <Link href={subItem.url}>
                            <span>{subItem.title}</span>
                          </Link>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    ))}
                  </SidebarMenuSub>
                </CollapsibleContent>
              </>
            ) : null}
          </SidebarMenuItem>
        </Collapsible>
        )
      })}
    </SidebarMenu>
  )
}

export function NavMain({ groups }: { groups: NavGroup[] }) {
  return (
    <>
      {groups.map((group) => (
        <SidebarGroup key={group.label} className="py-0">
          <SidebarGroupLabel className="text-[10px] uppercase tracking-wider text-neutral-500 px-2">
            {group.label}
          </SidebarGroupLabel>
          <FlatGroupItems items={group.items} />
        </SidebarGroup>
      ))}
    </>
  )
}
