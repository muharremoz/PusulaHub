"use client";

import { use, useState, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { ChevronLeft, Power as IsPower } from "lucide-react";
import {
  Category2 as IsDashboard,
  Monitor as IsMonitor,
  Building as IsBuilding,
  Profile2User as IsUsers,
  SecuritySafe as IsShield,
  DocumentText as IsFile,
  Messages2 as IsMessage,
  FolderOpen as IsFolder,
  Refresh as IsRefresh,
  Logout as IsLogout,
  Setting2 as IsSetting,
} from "iconsax-reactjs";

const mkTabIcon = (I: React.ComponentType<Record<string, unknown>>) => {
  const Wrapped = ({ className }: { className?: string }) => (
    <span className={`inline-flex ${className ?? ""}`}>
      <I size="14" color="currentColor" variant="TwoTone" />
    </span>
  );
  return Wrapped;
};
const DashboardTab = mkTabIcon(IsDashboard);
const MonitorTab   = mkTabIcon(IsMonitor);
const BuildingTab  = mkTabIcon(IsBuilding);
const UsersTab     = mkTabIcon(IsUsers);
const ShieldTab    = mkTabIcon(IsShield);
const FileTab      = mkTabIcon(IsFile);
const MessageTab   = mkTabIcon(IsMessage);
const FolderTab    = mkTabIcon(IsFolder);
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import type { Server } from "@/types";
import type { AgentReport } from "@/lib/agent-types";
import { TabOverview } from "@/components/server-detail/tab-overview";

const TabSessions  = dynamic(() => import("@/components/server-detail/tab-sessions").then((m) => m.TabSessions),    { ssr: false, loading: () => <div className="p-4"><Skeleton className="h-40 w-full" /></div> });
const TabCompanies = dynamic(() => import("@/components/server-detail/tab-companies").then((m) => m.TabCompanies),  { ssr: false, loading: () => <div className="p-4"><Skeleton className="h-40 w-full" /></div> });
const TabUsers     = dynamic(() => import("@/components/server-detail/tab-users").then((m) => m.TabUsers),          { ssr: false, loading: () => <div className="p-4"><Skeleton className="h-40 w-full" /></div> });
const TabSecurity  = dynamic(() => import("@/components/server-detail/tab-security").then((m) => m.TabSecurity),    { ssr: false, loading: () => <div className="p-4"><Skeleton className="h-40 w-full" /></div> });
const TabLogs      = dynamic(() => import("@/components/server-detail/tab-logs").then((m) => m.TabLogs),            { ssr: false, loading: () => <div className="p-4"><Skeleton className="h-40 w-full" /></div> });
const TabMessages  = dynamic(() => import("@/components/server-detail/tab-messages").then((m) => m.TabMessages),    { ssr: false, loading: () => <div className="p-4"><Skeleton className="h-40 w-full" /></div> });
const TabFiles     = dynamic(() => import("@/components/server-detail/tab-files").then((m) => m.TabFiles),          { ssr: false, loading: () => <div className="p-4"><Skeleton className="h-40 w-full" /></div> });
import type { FirmaCompany } from "@/app/api/firma/companies/route";

/** API /detail endpoint'inden dönen veri yapısı */
interface ServerDetailData {
  sessions: NonNullable<AgentReport["sessions"]>;
  security: AgentReport["security"] | null;
  logs: AgentReport["logs"] | null;
  ad: AgentReport["ad"] | null;
  localUsers: AgentReport["localUsers"] | null;
  sql: AgentReport["sql"] | null;
  iis: AgentReport["iis"] | null;
  roles: string[];
}

type TabId =
  | "overview"
  | "sessions"
  | "companies"
  | "users"
  | "security"
  | "logs"
  | "messages"
  | "files";

const STATUS_DOT: Record<string, string> = {
  online: "bg-emerald-500",
  warning: "bg-amber-400",
  offline: "bg-red-400",
};

const EMPTY_DETAIL: ServerDetailData = {
  sessions: [],
  security: null,
  logs: null,
  ad: null,
  localUsers: null,
  sql: null,
  iis: null,
  roles: [],
};

export default function ServerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [server, setServer] = useState<Server | null>(null);
  const [detail, setDetail] = useState<ServerDetailData>(EMPTY_DETAIL);
  const [firmaMap, setFirmaMap] = useState<Record<string, string>>({});
  const [serverLoading, setServerLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchDetail = useCallback(async () => {
    try {
      const res = await fetch(`/api/servers/${id}/detail`);
      if (res.ok) {
        const data = await res.json();
        if (!data.error) setDetail(data);
      }
    } catch { }
  }, [id]);

  const fetchServer = useCallback(async () => {
    try {
      const res = await fetch("/api/servers");
      const data = await res.json();
      if (Array.isArray(data)) {
        const found = data.find((s: Server) => s.id === id || s.slug === id);
        if (found) setServer(found);
      }
    } catch { }
  }, [id]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      // 1) Ajana anlık pull emri ver → hub agent-store'u taze snapshot ile doldurur
      await fetch(`/api/servers/${id}/refresh`, { method: "POST" });
    } catch { }
    // 2) Taze cache'i ekrana oku
    await Promise.all([fetchServer(), fetchDetail()]);
    setRefreshing(false);
  };

  useEffect(() => {
    fetchServer().finally(() => setServerLoading(false));
    fetchDetail().finally(() => setDetailLoading(false));
    const interval = setInterval(() => {
      fetchServer();
      fetchDetail();
    }, 5000);
    return () => clearInterval(interval);
  }, [fetchServer, fetchDetail]);

  useEffect(() => {
    fetch("/api/firma/companies")
      .then((r) => r.ok ? r.json() : [])
      .then((data: FirmaCompany[]) => {
        if (!Array.isArray(data)) return;
        const map: Record<string, string> = {};
        data.forEach((f) => { map[f.firkod] = f.firma; });
        setFirmaMap(map);
      })
      .catch(() => {});
  }, []);

  if (serverLoading) {
    return (
      <div className="p-4 md:p-6 space-y-3">
        <div className="rounded-[8px] p-3" style={{ backgroundColor: "#F4F2F0" }}>
          <div className="rounded-[4px] px-4 py-4 space-y-3" style={{ backgroundColor: "#FFFFFF", boxShadow: "0 2px 4px rgba(0,0,0,0.06)" }}>
            <Skeleton className="h-6 w-48 rounded-[4px]" />
            <Skeleton className="h-4 w-32 rounded-[4px]" />
          </div>
        </div>
      </div>
    );
  }

  if (!server) {
    return (
      <div className="p-6 text-[13px] text-muted-foreground">
        Sunucu bulunamadı.
      </div>
    );
  }

  const sessionCount = detail.sessions?.length ?? 0;
  const userCount = detail.ad?.users?.length ?? 0;

  const tabs: {
    id: TabId;
    label: string;
    icon: React.ElementType;
    count?: number;
  }[] = [
    { id: "overview", label: "Genel Durum", icon: DashboardTab },
    { id: "sessions", label: "Oturumlar", icon: MonitorTab, count: sessionCount },
    { id: "companies", label: "Firmalar", icon: BuildingTab },
    { id: "users", label: "Kullanıcılar", icon: UsersTab, count: userCount },
    { id: "security", label: "Güvenlik", icon: ShieldTab },
    { id: "logs", label: "Kayıtlar", icon: FileTab },
    { id: "messages", label: "Mesaj", icon: MessageTab },
    { id: "files", label: "Dosyalar", icon: FolderTab },
  ];

  return (
    <div className="p-4 md:p-6 space-y-3">
      {/* Page Header */}
      <div className="rounded-[8px] p-3" style={{ backgroundColor: "#F4F2F0" }}>
        <div
          className="rounded-[4px] px-4 py-3"
          style={{ backgroundColor: "#FFFFFF", boxShadow: "0 2px 4px rgba(0,0,0,0.06)" }}
        >
          <div className="flex items-center gap-3">
            {/* Back button */}
            <button
              onClick={() => router.push("/servers")}
              className="flex items-center gap-1 border border-border/60 hover:bg-muted/40 rounded-[5px] text-[11px] font-medium px-2.5 py-1.5 text-muted-foreground transition-colors shrink-0"
            >
              <ChevronLeft className="size-3.5" />
              Geri
            </button>

            {/* Status dot */}
            <span className="relative flex size-2 shrink-0">
              {server.status === "online" && (
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              )}
              <span
                className={cn(
                  "relative inline-flex size-2 rounded-full",
                  STATUS_DOT[server.status]
                )}
              />
            </span>

            {/* Server name */}
            <h1 className="text-sm font-semibold tracking-tight">{server.name}</h1>

            {/* IP + DNS */}
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <span className="text-[11px] font-mono">{server.ip}</span>
              {server.dns && (
                <>
                  <span className="text-[10px]">·</span>
                  <span className="text-[11px] font-mono text-muted-foreground/70">
                    {server.dns}
                  </span>
                </>
              )}
            </div>

            {/* Role chips */}
            <div className="flex items-center gap-1.5">
              {server.roles.map((role) => (
                <span
                  key={role}
                  className="text-[9px] bg-muted px-1.5 py-0.5 rounded-[4px] font-medium"
                >
                  {role}
                </span>
              ))}
            </div>

            {/* Spacer */}
            <div className="flex-1" />

            {/* Power dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-1.5 border border-border/60 hover:bg-muted/40 rounded-[5px] text-[11px] font-medium px-3 py-1.5 text-muted-foreground transition-colors">
                  <IsPower className="size-3.5" />
                  Güç
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="rounded-[6px] min-w-[160px]">
                <DropdownMenuItem className="text-xs flex items-center gap-2 cursor-pointer">
                  <IsRefresh size="14" color="currentColor" variant="TwoTone" />
                  Yeniden Başlat
                </DropdownMenuItem>
                <DropdownMenuItem className="text-xs flex items-center gap-2 cursor-pointer text-destructive">
                  <IsPower className="size-3.5" />
                  Kapat
                </DropdownMenuItem>
                <DropdownMenuItem className="text-xs flex items-center gap-2 cursor-pointer">
                  <IsLogout size="14" color="currentColor" variant="TwoTone" />
                  Oturumları Kapat
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-xs flex items-center gap-2 cursor-pointer">
                  <IsSetting size="14" color="currentColor" variant="TwoTone" />
                  Detayları Düzenle
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex items-end gap-0 border-b border-border/40">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex items-center gap-1.5 px-3.5 py-2 text-[11px] font-medium transition-colors border-b-2 -mb-px",
                isActive
                  ? "text-foreground border-foreground"
                  : "text-muted-foreground hover:text-foreground border-transparent"
              )}
            >
              <Icon className="size-3.5 shrink-0" />
              {tab.label}
              {tab.count !== undefined && (
                <span
                  className={cn(
                    "text-[9px] px-1.5 py-0.5 rounded-[4px] font-medium",
                    isActive ? "bg-foreground/10 text-foreground" : "bg-muted text-muted-foreground"
                  )}
                >
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div>
        {detailLoading && activeTab !== "overview" && activeTab !== "files" ? (
          <div className="rounded-[8px] p-2 pb-0" style={{ backgroundColor: "#F4F2F0" }}>
            <div className="rounded-[4px] overflow-hidden space-y-px" style={{ backgroundColor: "#FFFFFF", boxShadow: "0 2px 4px rgba(0,0,0,0.06)" }}>
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-3 py-3">
                  <Skeleton className="size-2 rounded-full shrink-0" />
                  <Skeleton className="h-3 rounded-[3px] flex-1" />
                  <Skeleton className="h-3 rounded-[3px] w-24" />
                  <Skeleton className="h-3 rounded-[3px] w-16" />
                </div>
              ))}
            </div>
            <div className="h-2" />
          </div>
        ) : (
          <>
            {activeTab === "overview" && (
              <TabOverview server={server} sessionCount={sessionCount} onRefresh={handleRefresh} refreshing={refreshing} />
            )}
            {activeTab === "sessions" && (
              <TabSessions sessions={detail.sessions} serverId={server.id} />
            )}
            {activeTab === "companies" && (
              <TabCompanies companies={detail.ad?.companies ?? []} firmaMap={firmaMap} />
            )}
            {activeTab === "users" && (
              <TabUsers users={detail.ad?.users ?? []} localUsers={detail.localUsers ?? null} firmaMap={firmaMap} />
            )}
            {activeTab === "security" && (
              <TabSecurity security={detail.security} roles={detail.roles} />
            )}
            {activeTab === "logs" && (
              <TabLogs logs={detail.logs} />
            )}
            {activeTab === "messages" && (
              <TabMessages sessions={detail.sessions} serverId={server.id} />
            )}
            {activeTab === "files" && (
              <TabFiles serverId={server.id} />
            )}
          </>
        )}
      </div>
    </div>
  );
}
