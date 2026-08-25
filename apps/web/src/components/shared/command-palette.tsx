"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command"
import { Building2, Database, Globe, Network } from "lucide-react"
import { Icon } from "@/components/shared/icon"
import type { IconName } from "@/components/shared/icon-registry"

/**
 * `icon` ya registry adı (animasyonlu, lucide-animated) ya da statik lucide
 * bileşeni — proje kuralı: animasyonlu muadili olmayan ikonlarda lucide fallback.
 */
type NavIcon  = IconName | React.ComponentType<{ className?: string }>
type NavEntry = { group: string; label: string; url: string; icon: NavIcon; keywords?: string }

const NAV: NavEntry[] = [
  { group: "Genel", label: "Dashboard",   url: "/dashboard",   icon: "layers" },
  { group: "Genel", label: "Sunucular",   url: "/servers",     icon: "monitor-check", keywords: "server" },
  { group: "Genel", label: "Firmalar",    url: "/companies",   icon: Building2, keywords: "firma company" },
  { group: "Genel", label: "Mesajlar",    url: "/messages",    icon: "message-square", keywords: "mesaj message" },
  { group: "Genel", label: "Takvim",      url: "/calendar",    icon: "calendar-days" },
  { group: "Genel", label: "Not Defteri", url: "/notes",       icon: "square-pen" },
  { group: "Servisler", label: "Pusula Hizmetleri",  url: "/services",       icon: "settings" },
  { group: "Servisler", label: "Demo Veritabanları", url: "/demo-databases", icon: Database, keywords: "db database" },
  { group: "Servisler", label: "IIS",                url: "/iis",            icon: Globe },
  { group: "Servisler", label: "Active Directory",   url: "/ad",             icon: "shield-check", keywords: "ad active directory" },
  { group: "Servisler", label: "SQL",                url: "/sql",            icon: "file-text" },
  { group: "Servisler", label: "Port Yönetimi",      url: "/ports",          icon: Network },
  { group: "Yönetim", label: "Kullanıcılar", url: "/users",    icon: "users", keywords: "user" },
  { group: "Yönetim", label: "Şifre Kasası", url: "/vault",    icon: "lock-keyhole", keywords: "password vault" },
  { group: "Yönetim", label: "Ayarlar",      url: "/settings", icon: "settings" },
  { group: "Geliştirici", label: "Mesaj Önizleme", url: "/preview", icon: "bell" },
]

const ItemIcon = ({ icon }: { icon: NavIcon }) =>
  typeof icon === "string"
    ? <Icon name={icon} size={16} className="inline-flex" />
    : (() => { const I = icon; return <I className="size-4" /> })()

interface ServerHit { id: string; slug?: string; name: string; ip: string }
interface CompanyHit { id: string; firkod: string; firma: string }

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const router = useRouter()
  const [query, setQuery] = React.useState("")
  const [servers, setServers] = React.useState<ServerHit[]>([])
  const [companies, setCompanies] = React.useState<CompanyHit[]>([])

  // Global Ctrl/Cmd+K keyboard shortcut
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        onOpenChange(!open)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onOpenChange])

  // Clear query when dialog closes
  React.useEffect(() => {
    if (!open) setQuery("")
  }, [open])

  // Load dynamic lists when dialog opens
  React.useEffect(() => {
    if (!open) return
    let cancelled = false
    ;(async () => {
      try {
        const [sRes, cRes] = await Promise.all([
          fetch("/api/servers", { cache: "no-store" }).then((r) => r.ok ? r.json() : []).catch(() => []),
          fetch("/api/firma/companies", { cache: "no-store" }).then((r) => r.ok ? r.json() : []).catch(() => []),
        ])
        if (cancelled) return
        setServers(Array.isArray(sRes) ? sRes.slice(0, 50) : [])
        const cArr = Array.isArray(cRes) ? cRes : cRes?.items ?? []
        setCompanies(cArr.slice(0, 50))
      } catch { /* ignore */ }
    })()
    return () => { cancelled = true }
  }, [open])

  const go = (url: string) => {
    onOpenChange(false)
    setQuery("")
    router.push(url)
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Arama"
      description="Sayfa, sunucu veya firma arayın (Ctrl+K)"
      className="max-w-xl"
    >
      <CommandInput
        placeholder="Ara: sayfa, sunucu, firma..."
        value={query}
        onValueChange={setQuery}
      />
      <CommandList className="max-h-[360px]">
        <CommandEmpty>Sonuç bulunamadı.</CommandEmpty>

        {["Genel", "Servisler", "Yönetim", "Geliştirici"].map((g) => {
          const items = NAV.filter((n) => n.group === g)
          if (items.length === 0) return null
          return (
            <CommandGroup key={g} heading={g}>
              {items.map((n) => (
                <CommandItem
                  key={n.url}
                  value={`${n.label} ${n.keywords ?? ""} ${n.url}`}
                  onSelect={() => go(n.url)}
                >
                  <ItemIcon icon={n.icon} />
                  <span>{n.label}</span>
                  <span className="ml-auto text-[10px] text-muted-foreground">{n.url}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )
        })}

        {servers.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Sunucular">
              {servers.map((s) => (
                <CommandItem
                  key={s.id}
                  value={`sunucu ${s.name} ${s.ip}`}
                  onSelect={() => go(`/servers/${s.slug ?? s.id}`)}
                >
                  <ItemIcon icon="monitor-check" />
                  <span>{s.name}</span>
                  <span className="ml-auto text-[10px] font-mono text-muted-foreground">{s.ip}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {companies.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Firmalar">
              {companies.map((c) => (
                <CommandItem
                  key={c.id}
                  value={`firma ${c.firkod} ${c.firma}`}
                  onSelect={() => go(`/companies/${c.firkod}`)}
                >
                  <ItemIcon icon={Building2} />
                  <span>{c.firma}</span>
                  <span className="ml-auto text-[10px] text-muted-foreground">{c.firkod}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  )
}
