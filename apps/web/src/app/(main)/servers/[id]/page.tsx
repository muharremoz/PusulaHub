"use client";

import { use, useState, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { Building2, ChevronLeft, Pencil, RefreshCw } from "lucide-react";
import { Icon } from "@/components/shared/icon";
import type { IconName } from "@/components/shared/icon-registry";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ServerSheet } from "@/components/servers/server-sheet";
import type { Server } from "@/types";
import type { AgentReport } from "@/lib/agent-types";
import type { FirmaCompany } from "@/app/api/firma/companies/route";

/**
 * Sunucu detayı — rapor odaklı (16.10.2026).
 * Genel Bakış: dönem raporu + anlık kaynaklar + sağlık. Firma kullanımı: yalnız
 * terminallerde. Diğer sekmeler eski bileşenler (2. aşamada yenilenecek).
 */

/** Sekme ikonu — animasyonlu registry ikonundan. */
const mkTabIcon = (name: IconName) => {
  const Wrapped = ({ className }: { className?: string }) => (
    <Icon name={name} size={14} className={`inline-flex ${className ?? ""}`} />
  );
  return Wrapped;
};

/** Registry'de muadili olmayanlar için statik lucide fallback. */
const mkStaticTabIcon = (I: React.ElementType) => {
  const Wrapped = ({ className }: { className?: string }) => (
    <span className={`inline-flex ${className ?? ""}`}><I className="size-3.5" /></span>
  );
  return Wrapped;
};
const DashboardTab = mkTabIcon("layers");
const MonitorTab   = mkTabIcon("monitor-check");
const BuildingTab  = mkStaticTabIcon(Building2);
const ChartTab     = mkTabIcon("chart-bar-increasing");
const UsersTab     = mkTabIcon("users");

const yukleme = () => <div className="p-4"><Skeleton className="h-40 w-full" /></div>;
const TabRapor          = dynamic(() => import("@/components/server-detail/tab-rapor").then((m) => m.TabRapor),                   { ssr: false, loading: yukleme });
const TabFirmaKullanim  = dynamic(() => import("@/components/server-detail/tab-firma-kullanim").then((m) => m.TabFirmaKullanim), { ssr: false, loading: yukleme });
const TabSessions  = dynamic(() => import("@/components/server-detail/tab-sessions").then((m) => m.TabSessions),    { ssr: false, loading: yukleme });
const TabAnaliz    = dynamic(() => import("@/components/server-detail/tab-analiz").then((m) => m.TabAnaliz),        { ssr: false, loading: yukleme });
const TabCompanies = dynamic(() => import("@/components/server-detail/tab-companies").then((m) => m.TabCompanies),  { ssr: false, loading: yukleme });
const TabUsers     = dynamic(() => import("@/components/server-detail/tab-users").then((m) => m.TabUsers),          { ssr: false, loading: yukleme });

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
  ram: AgentReport["metrics"]["ram"] | null;
}

type TabId = "overview" | "kullanim" | "sessions" | "analiz" | "companies" | "users";

const EMPTY_DETAIL: ServerDetailData = {
  sessions: [], security: null, logs: null, ad: null, localUsers: null, sql: null, iis: null, roles: [], ram: null,
};

const ROL_ETIKET: Record<string, string> = { RDP: "Terminal", File: "Depo", General: "Genel" };
/** "17s 58d" / "3g 4s" (API) → "17 sa 58 dk" / "3 gün 4 sa" */
const sureOku = (u: string | undefined) =>
  !u || u === "—" ? "—" : u.replace(/(\d+)g/, "$1 gün").replace(/(\d+)s\b/, "$1 sa").replace(/(\d+)d\b/, "$1 dk");
const YENILEME_MS = 10_000;

export default function ServerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [server, setServer] = useState<Server | null>(null);
  const [detail, setDetail] = useState<ServerDetailData>(EMPTY_DETAIL);
  const [firmaMap, setFirmaMap] = useState<Record<string, string>>({});
  const [serverLoading, setServerLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [duzenleAcik, setDuzenleAcik] = useState(false);

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
      if (document.visibilityState !== "visible") return;
      void fetchServer();
      void fetchDetail();
    }, YENILEME_MS);
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
        <div className="rounded-[8px] bg-[var(--section-bg)] p-2">
          <div className="space-y-2 rounded-[5px] bg-card px-4 py-3" style={{ boxShadow: "var(--card-shadow)" }}>
            <Skeleton className="h-5 w-48 rounded-[5px]" />
            <Skeleton className="h-3.5 w-72 rounded-[5px]" />
          </div>
        </div>
        <Skeleton className="h-8 w-full rounded-[5px]" />
        <Skeleton className="h-[420px] w-full rounded-[8px]" />
      </div>
    );
  }

  if (!server) {
    return (
      <div className="p-4 md:p-6">
        <div className="flex flex-col items-center gap-3 rounded-[8px] bg-[var(--section-bg)] p-8 text-center">
          <p className="text-[13px] text-muted-foreground">Sunucu bulunamadı.</p>
          <Button variant="outline" size="sm" className="h-8 rounded-[5px] text-[12px]" onClick={() => router.push("/servers")}>Sunuculara dön</Button>
        </div>
      </div>
    );
  }

  const terminal = server.roles.includes("RDP" as Server["roles"][number]);
  const acik = server.status === "online";
  const sessionCount = detail.sessions?.length ?? 0;
  const userCount = detail.ad?.users?.length ?? 0;

  const tabs: { id: TabId; label: string; icon: React.ElementType; count?: number }[] = [
    { id: "overview", label: "Genel Bakış", icon: DashboardTab },
    /*  Terminalde Firmalar = atanmış + kullanan firmalar ve kullanımları (eski "Firma kullanımı"
     *  ile AD OU listesi birleşti); diğer sunucularda AD OU listesi.                              */
    ...(terminal ? [{ id: "kullanim" as TabId, label: "Firmalar", icon: BuildingTab }] : []),
    { id: "sessions", label: "Oturumlar", icon: MonitorTab, count: sessionCount },
    /*  Analiz oturum geçmişi olan sunucularda anlamlı (pratikte terminaller). */
    ...(terminal || sessionCount > 0 ? [{ id: "analiz" as TabId, label: "Analiz", icon: ChartTab }] : []),
    ...(!terminal ? [{ id: "companies" as TabId, label: "Firmalar", icon: BuildingTab }] : []),
    { id: "users", label: "Kullanıcılar", icon: UsersTab, count: userCount },
  ];

  return (
    <div className="p-4 md:p-6 space-y-3">
      <ServerSheet open={duzenleAcik} onOpenChange={setDuzenleAcik} onSaved={() => void fetchServer()} editServerId={duzenleAcik ? server.id : null} />

      {/* Başlık */}
      <div className="rounded-[8px] bg-[var(--section-bg)] p-2">
        <div className="flex flex-wrap items-center gap-3 rounded-[5px] bg-card px-4 py-3" style={{ boxShadow: "var(--card-shadow)" }}>
          <Button variant="outline" size="sm" className="h-8 shrink-0 gap-1 rounded-[5px] px-2.5 text-[12px]" onClick={() => router.push("/servers")}>
            <ChevronLeft className="size-3.5" /> Sunucular
          </Button>

          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h1 className="truncate text-[15px] font-semibold tracking-tight">{server.name}</h1>
              <span className={cn(
                "inline-flex shrink-0 items-center gap-1 rounded-[5px] px-2 py-0.5 text-[11px] font-medium",
                acik ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" : "bg-red-500/15 text-red-700 dark:text-red-400",
              )}>
                <span className={`size-1.5 rounded-full ${acik ? "bg-emerald-500" : "bg-red-500"}`} />
                {acik ? "Çevrimiçi" : "Ulaşılamıyor"}
              </span>
              {server.roles.map((role) => (
                <span key={role} className="inline-flex shrink-0 rounded-[5px] bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                  {ROL_ETIKET[role] ?? role}
                </span>
              ))}
            </div>
            <p className="mt-0.5 truncate text-[12px] tabular-nums text-muted-foreground">
              {server.ip}
              {server.dns && <> · {server.dns}</>}
              {server.os && <> · {server.os}</>}
              {acik && <> · {sureOku(server.uptime)} açık</>}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <Button variant="outline" size="sm" className="h-8 gap-1.5 rounded-[5px] text-[12px]" onClick={() => void handleRefresh()} disabled={refreshing}
              title="Agent'tan anlık rapor ister">
              <RefreshCw className={`size-3.5 ${refreshing ? "animate-spin" : ""}`} /> Yenile
            </Button>
            <Button variant="outline" size="sm" className="h-8 gap-1.5 rounded-[5px] text-[12px]" onClick={() => setDuzenleAcik(true)}>
              <Pencil className="size-3.5" /> Düzenle
            </Button>
          </div>
        </div>
      </div>

      {/* Sekmeler */}
      <div className="flex items-end gap-0 overflow-x-auto border-b border-border/60">
        {tabs.map((tab) => {
          const TabIcon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3.5 py-2 text-[12px] font-medium transition-colors",
                isActive ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              <TabIcon className="size-3.5 shrink-0" />
              {tab.label}
              {tab.count !== undefined && (
                <span className={cn(
                  "rounded-[5px] px-1.5 py-0.5 text-[10px] font-medium tabular-nums",
                  isActive ? "bg-foreground/10 text-foreground" : "bg-muted text-muted-foreground",
                )}>
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* İçerik */}
      <div>
        {activeTab === "overview" && <TabRapor server={server} />}
        {activeTab === "kullanim" && <TabFirmaKullanim serverId={server.id} />}
        {activeTab === "analiz" && <TabAnaliz serverId={server.id} />}
        {detailLoading && ["sessions", "companies", "users"].includes(activeTab) ? (
          <div className="rounded-[8px] bg-[var(--section-bg)] p-2">
            <div className="space-y-px overflow-hidden rounded-[5px] bg-card" style={{ boxShadow: "var(--card-shadow)" }}>
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-3 py-3">
                  <Skeleton className="size-2 shrink-0 rounded-full" />
                  <Skeleton className="h-3 flex-1 rounded-[5px]" />
                  <Skeleton className="h-3 w-24 rounded-[5px]" />
                  <Skeleton className="h-3 w-16 rounded-[5px]" />
                </div>
              ))}
            </div>
          </div>
        ) : (
          <>
            {activeTab === "sessions" && <TabSessions sessions={detail.sessions} serverId={server.id} firmaMap={firmaMap} />}
            {activeTab === "companies" && <TabCompanies companies={detail.ad?.companies ?? []} firmaMap={firmaMap} />}
            {activeTab === "users" && <TabUsers users={detail.ad?.users ?? []} localUsers={detail.localUsers ?? null} firmaMap={firmaMap} />}
          </>
        )}
      </div>
    </div>
  );
}
