"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  AppShell,
  UserMenuShell,
  ItemBadge,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuSeparator,
  type NavEntry,
  type AppDescriptor,
  type AppShellIcon,
} from "@muharremoz/pusula-ui";
import {
  LayoutGrid,
  Server,
  Activity,
  Building2,
  ArrowLeftRight,
  MessageSquare,
  Kanban,
  Calendar,
  NotebookText,
  Settings2,
  Database,
  Globe,
  ShieldCheck,
  FileText,
  Network,
  Users,
  KeyRound,
  Bell,
  Code2,
  Headset,
  Package,
  Rocket,
  ChevronsUpDown,
  LogOut,
  User as UserIcon,
  Shield,
} from "lucide-react";

// ---- Nav grupları (eski app-sidebar ile aynı; yetkiye göre filtrelenir) ----
type Lvl = string;
type NavItemDef = { title: string; url: string; icon: AppShellIcon; moduleKey?: string };
type NavGroupDef = { key: string; label: string; icon: AppShellIcon; items: NavItemDef[] };

const NAV: NavGroupDef[] = [
  {
    key: "general",
    label: "Genel",
    icon: LayoutGrid,
    items: [
      { title: "Dashboard", url: "/dashboard", icon: LayoutGrid, moduleKey: "dashboard" },
      { title: "Sunucular", url: "/servers", icon: Server, moduleKey: "servers" },
      { title: "İzleme", url: "/monitoring", icon: Activity, moduleKey: "monitoring" },
      { title: "Firmalar", url: "/companies", icon: Building2, moduleKey: "companies" },
      { title: "Aktarım", url: "/aktarim", icon: ArrowLeftRight, moduleKey: "aktarim" },
      { title: "Mesajlar", url: "/messages", icon: MessageSquare, moduleKey: "messages" },
      { title: "Projeler", url: "/projects", icon: Kanban, moduleKey: "projects" },
      { title: "Takvim", url: "/calendar", icon: Calendar, moduleKey: "calendar" },
      { title: "Not Defteri", url: "/notes", icon: NotebookText, moduleKey: "notes" },
    ],
  },
  {
    key: "services",
    label: "Servisler",
    icon: Settings2,
    items: [
      { title: "Pusula Hizmetleri", url: "/services", icon: Settings2, moduleKey: "services" },
      { title: "Demo Veritabanları", url: "/demo-databases", icon: Database, moduleKey: "databases" },
      { title: "IIS", url: "/iis", icon: Globe, moduleKey: "iis" },
      { title: "Active Directory", url: "/ad", icon: ShieldCheck, moduleKey: "active-directory" },
      { title: "SQL", url: "/sql", icon: FileText, moduleKey: "sql" },
      { title: "Port Yönetimi", url: "/ports", icon: Network, moduleKey: "ports" },
    ],
  },
  {
    key: "admin",
    label: "Yönetim",
    icon: Users,
    items: [
      { title: "Kullanıcılar", url: "/users", icon: Users, moduleKey: "users" },
      { title: "Şifre Kasası", url: "/vault", icon: KeyRound, moduleKey: "vault" },
    ],
  },
  {
    key: "dev",
    label: "Geliştirici",
    icon: Code2,
    items: [{ title: "Mesaj Önizleme", url: "/preview", icon: Bell, moduleKey: "preview" }],
  },
];

// ---- Platform uygulamaları (CRM ile aynı liste; marka renk + SSO geçiş) ----
const SWITCH_URL = process.env.NEXT_PUBLIC_SWITCH_URL || "https://switch.pusulanet.net/";
type PlatformApp = {
  id: string;
  name: string;
  desc: string;
  color: string;
  icon: AppShellIcon;
  url: string | null;
  newTab?: boolean;
};
const APPS: PlatformApp[] = [
  { id: "crm", name: "Pusula CRM", desc: "Destek & müşteri yönetimi", color: "#181175", icon: Headset, url: "https://crm.pusulanet.net/" },
  { id: "hub", name: "PusulaHub", desc: "Sunucu yönetim paneli", color: "#1d64ff", icon: Server, url: null },
  { id: "spareflow", name: "SpareFlow", desc: "Lisans / kurulum / yedek", color: "#0F4841", icon: Package, url: "https://spareflow.pusulanet.net/" },
  { id: "supabase", name: "Supabase", desc: "Veritabanı yönetimi", color: "#3ECF8E", icon: Database, url: "https://supabase.pusulanet.net/", newTab: true },
  { id: "coolify", name: "Coolify", desc: "Sunucu & uygulama dağıtımı", color: "#8B5CF6", icon: Rocket, url: "http://10.15.2.7:8000/", newTab: true },
];

function initialsOf(name: string) {
  return name.split(" ").map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "?";
}

function itemVisible(it: NavItemDef, isAdmin: boolean, perms: Record<string, Lvl>): boolean {
  if (isAdmin) return true;
  if (!it.moduleKey) return true;
  return (perms[it.moduleKey] ?? "none") !== "none";
}

/** Footer user-menu — ortak UserMenuShell + ItemBadge deseni. */
function HubUserMenu() {
  const { data: session } = useSession();
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const u = (session?.user ?? {}) as { fullName?: string; name?: string; email?: string; role?: string };
  const name = u.fullName ?? u.name ?? "Kullanıcı";
  const email = u.email ?? "";
  const isAdmin = u.role === "admin";
  const initials = initialsOf(name);

  return (
    <UserMenuShell
      open={open}
      onOpenChange={setOpen}
      align="start"
      side="right"
      trigger={
        <button
          type="button"
          className="hover:bg-sidebar-accent flex w-full items-center gap-2.5 rounded-md p-2 text-left outline-none transition-colors"
          aria-label={name}
        >
          <span className="bg-sidebar-primary text-sidebar-primary-foreground flex size-8 shrink-0 items-center justify-center rounded-lg text-xs font-semibold">
            {initials}
          </span>
          <div className="grid flex-1 text-left leading-tight">
            <span className="truncate text-sm font-semibold">{name}</span>
            <span className="text-muted-foreground truncate text-xs">{email}</span>
          </div>
          <ChevronsUpDown className="ml-auto size-4 shrink-0 opacity-60" />
        </button>
      }
    >
      <DropdownMenuLabel className="p-0 font-normal">
        <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
          <span className="bg-primary text-primary-foreground flex size-8 shrink-0 items-center justify-center rounded-lg text-[11px] font-semibold">
            {initials}
          </span>
          <div className="grid flex-1 leading-tight">
            <span className="truncate text-sm font-medium">{name}</span>
            <span className="text-muted-foreground truncate text-xs">{email}</span>
          </div>
        </div>
      </DropdownMenuLabel>
      <DropdownMenuSeparator />
      <DropdownMenuItem className="gap-2 p-2" onClick={() => router.push("/profile")}>
        <ItemBadge>
          <UserIcon className="text-muted-foreground size-3.5" />
        </ItemBadge>
        <span className="flex-1 truncate">Profil</span>
      </DropdownMenuItem>
      {isAdmin && (
        <DropdownMenuItem className="gap-2 p-2" onClick={() => router.push("/users")}>
          <ItemBadge>
            <Shield className="text-muted-foreground size-3.5" />
          </ItemBadge>
          <span className="flex-1 truncate">Kullanıcı Yönetimi</span>
        </DropdownMenuItem>
      )}
      <DropdownMenuSeparator />
      <DropdownMenuItem
        variant="destructive"
        className="gap-2 p-2"
        onClick={async () => {
          await fetch("/api/auth/logout", { method: "POST" });
          window.location.href = "/login";
        }}
      >
        <ItemBadge>
          <LogOut className="size-3.5" />
        </ItemBadge>
        Çıkış Yap
      </DropdownMenuItem>
    </UserMenuShell>
  );
}

export function PusulaAppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "";
  const { data: session } = useSession();
  const u = (session?.user ?? {}) as {
    role?: string;
    permissions?: Record<string, Lvl>;
    apps?: Array<{ id: string }>;
  };
  const isAdmin = u.role === "admin";
  const perms = React.useMemo(() => u.permissions ?? {}, [u.permissions]);
  const grantedApps = u.apps ? u.apps.map((a) => a.id) : null;

  const nav: NavEntry[] = React.useMemo(
    () =>
      NAV.map((g) => {
        const items = g.items
          .filter((it) => itemVisible(it, isAdmin, perms))
          .map((it) => ({ key: it.url, label: it.title, href: it.url, icon: it.icon }));
        const open = items.some(
          (it) => pathname === it.href || pathname.startsWith(it.href + "/"),
        );
        return {
          type: "item" as const,
          key: g.key,
          label: g.label,
          href: "",
          icon: g.icon,
          defaultOpen: open,
          items,
        };
      }).filter((g) => g.items.length > 0),
    [isAdmin, perms, pathname],
  );

  const apps: AppDescriptor[] = React.useMemo(
    () =>
      APPS.filter((a) => (grantedApps === null ? a.id === "hub" : grantedApps.includes(a.id))).map(
        (a) => ({
          id: a.id,
          name: a.name,
          description: a.desc,
          color: a.color,
          icon: a.icon,
          external: !!a.url,
          newTab: a.newTab,
        }),
      ),
    [grantedApps],
  );

  const onSwitchApp = React.useCallback((app: AppDescriptor) => {
    const def = APPS.find((a) => a.id === app.id);
    if (!def?.url) return;
    if (def.newTab) window.open(def.url, "_blank", "noopener,noreferrer");
    else window.location.href = def.url;
  }, []);

  const onBackToSwitch = React.useCallback(() => {
    window.location.href = SWITCH_URL;
  }, []);

  return (
    <AppShell
      currentAppId="hub"
      apps={apps}
      nav={nav}
      pathname={pathname}
      linkComponent={Link}
      onSwitchApp={onSwitchApp}
      onBackToSwitch={onBackToSwitch}
      footer={<HubUserMenu />}
    >
      {children}
    </AppShell>
  );
}
