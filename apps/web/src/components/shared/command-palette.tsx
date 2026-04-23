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
import {
  Category2, Monitor, Building, Messages2, Kanban, Calendar, Note1,
  Setting2, Data2, Global, SecuritySafe, DocumentText, Routing2,
  Profile2User, KeySquare, Notification, Setting, Activity,
} from "iconsax-reactjs"

type NavEntry = { group: string; label: string; url: string; Icon: React.ComponentType<Record<string, unknown>>; keywords?: string }

const NAV: NavEntry[] = [
  { group: "Genel", label: "Dashboard",   url: "/dashboard",   Icon: Category2 },
  { group: "Genel", label: "Sunucular",   url: "/servers",     Icon: Monitor, keywords: "server" },
  { group: "Genel", label: "İzleme",      url: "/monitoring",  Icon: Activity, keywords: "monitoring izleme" },
  { group: "Genel", label: "Firmalar",    url: "/companies",   Icon: Building, keywords: "firma company" },
  { group: "Genel", label: "Mesajlar",    url: "/messages",    Icon: Messages2, keywords: "mesaj message" },
  { group: "Genel", label: "Projeler",    url: "/projects",    Icon: Kanban, keywords: "proje project" },
  { group: "Genel", label: "Takvim",      url: "/calendar",    Icon: Calendar },
  { group: "Genel", label: "Not Defteri", url: "/notes",       Icon: Note1 },
  { group: "Servisler", label: "Pusula Hizmetleri",  url: "/services",       Icon: Setting2 },
  { group: "Servisler", label: "Demo Veritabanları", url: "/demo-databases", Icon: Data2, keywords: "db database" },
  { group: "Servisler", label: "IIS",                url: "/iis",            Icon: Global },
  { group: "Servisler", label: "Active Directory",   url: "/ad",             Icon: SecuritySafe, keywords: "ad active directory" },
  { group: "Servisler", label: "SQL",                url: "/sql",            Icon: DocumentText },
  { group: "Servisler", label: "Port Yönetimi",      url: "/ports",          Icon: Routing2 },
  { group: "Yönetim", label: "Kullanıcılar", url: "/users",    Icon: Profile2User, keywords: "user" },
  { group: "Yönetim", label: "Şifre Kasası", url: "/vault",    Icon: KeySquare, keywords: "password vault" },
  { group: "Yönetim", label: "Ayarlar",      url: "/settings", Icon: Setting },
  { group: "Geliştirici", label: "Mesaj Önizleme", url: "/preview", Icon: Notification },
]

const ItemIcon = ({ I }: { I: React.ComponentType<Record<string, unknown>> }) => (
  <I size="16" color="currentColor" variant="TwoTone" />
)

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
                  <ItemIcon I={n.Icon} />
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
                  <ItemIcon I={Monitor} />
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
                  <ItemIcon I={Building} />
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
