import { PageContainer } from "@/components/layout/page-container";
import { StatsCard } from "@/components/shared/stats-card";
import { NestedCard } from "@/components/shared/nested-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { ProgressBar } from "@/components/shared/progress-bar";
import { dashboardStats, servers, recentEvents } from "@/lib/mock-data";
import {
  Server,
  Activity,
  AlertTriangle,
  XCircle,
  Clock,
  HardDrive,
} from "lucide-react";

export default function DashboardPage() {
  return (
    <PageContainer
      title="Kontrol Paneli"
      description="Sunucu durumlarinin genel gorunumu"
    >
      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-3 items-stretch mb-6">
        <StatsCard
          title="TOPLAM SUNUCU"
          value={dashboardStats.totalServers}
          icon={<Server className="h-4 w-4" />}
          subtitle="Tum sunucular"
        />
        <StatsCard
          title="AKTIF"
          value={dashboardStats.activeServers}
          icon={<Activity className="h-4 w-4" />}
          trend={{ value: "Tumu calisiyor", positive: true }}
          subtitle="Son kontrol: 2 dk once"
        />
        <StatsCard
          title="UYARI"
          value={dashboardStats.warningServers}
          icon={<AlertTriangle className="h-4 w-4" />}
          trend={{ value: "Dikkat gerektiriyor", positive: false }}
          subtitle="Yuksek kaynak kullanimi"
        />
        <StatsCard
          title="KAPALI"
          value={dashboardStats.offlineServers}
          icon={<XCircle className="h-4 w-4" />}
          subtitle="Erisim yok"
        />
      </div>

      <div className="grid grid-cols-3 gap-3">
        {/* Recent Events */}
        <div className="col-span-2">
          <NestedCard
            footer={
              <>
                <Clock className="h-3 w-3" />
                <span>Son 24 saat icindeki olaylar</span>
              </>
            }
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold">Son Olaylar</h3>
              <span className="text-[10px] bg-muted px-2 py-0.5 rounded-[5px] text-muted-foreground font-medium">
                {recentEvents.length} olay
              </span>
            </div>
            <div className="space-y-0">
              {recentEvents.map((event) => (
                <div
                  key={event.id}
                  className="flex items-center gap-3 px-1 py-1.5 border-b border-border/40 last:border-0"
                >
                  <span className="text-[11px] text-muted-foreground tabular-nums w-10 shrink-0">
                    {event.timestamp}
                  </span>
                  <StatusBadge status={event.type} />
                  <span className="text-[11px] font-medium w-24 shrink-0 truncate">
                    {event.server}
                  </span>
                  <span className="text-[11px] text-muted-foreground truncate">
                    {event.message}
                  </span>
                </div>
              ))}
            </div>
          </NestedCard>
        </div>

        {/* Server Resource Overview */}
        <div className="col-span-1">
          <NestedCard
            footer={
              <>
                <HardDrive className="h-3 w-3" />
                <span>Kaynak kullanim ozeti</span>
              </>
            }
          >
            <h3 className="text-sm font-semibold mb-3">Disk Kullanimi</h3>
            <div className="space-y-3">
              {servers
                .filter((s) => s.status !== "offline")
                .sort((a, b) => b.disk - a.disk)
                .slice(0, 6)
                .map((srv) => (
                  <div key={srv.id}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[11px] font-medium">{srv.name}</span>
                      <span className="text-[11px] text-muted-foreground">%{srv.disk}</span>
                    </div>
                    <ProgressBar value={srv.disk} />
                  </div>
                ))}
            </div>
          </NestedCard>
        </div>
      </div>

      {/* Server Status Table */}
      <div className="mt-3">
        <NestedCard
          footer={
            <>
              <Server className="h-3 w-3" />
              <span>{servers.length} sunucu kayitli</span>
            </>
          }
        >
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold">Sunucu Durumu</h3>
          </div>
          {/* Table Header */}
          <div className="grid grid-cols-[1.5fr_1fr_1.2fr_0.8fr_0.6fr_0.6fr_0.6fr_1fr] gap-2 px-1 py-1.5 bg-muted/30 rounded-[4px] border-b">
            <span className="text-[11px] font-medium text-muted-foreground tracking-wide">SUNUCU</span>
            <span className="text-[11px] font-medium text-muted-foreground tracking-wide">IP ADRES</span>
            <span className="text-[11px] font-medium text-muted-foreground tracking-wide">ISLETIM SISTEMI</span>
            <span className="text-[11px] font-medium text-muted-foreground tracking-wide">DURUM</span>
            <span className="text-[11px] font-medium text-muted-foreground tracking-wide">CPU</span>
            <span className="text-[11px] font-medium text-muted-foreground tracking-wide">RAM</span>
            <span className="text-[11px] font-medium text-muted-foreground tracking-wide">DISK</span>
            <span className="text-[11px] font-medium text-muted-foreground tracking-wide">UPTIME</span>
          </div>
          {/* Table Rows */}
          {servers.map((srv) => (
            <div
              key={srv.id}
              className="grid grid-cols-[1.5fr_1fr_1.2fr_0.8fr_0.6fr_0.6fr_0.6fr_1fr] gap-2 px-1 py-1.5 border-b border-border/40 last:border-0 hover:bg-muted/20 transition-colors"
            >
              <span className="text-xs font-medium truncate">{srv.name}</span>
              <span className="text-xs text-muted-foreground tabular-nums">{srv.ip}</span>
              <span className="text-xs text-muted-foreground truncate">{srv.os}</span>
              <StatusBadge status={srv.status} />
              <span className="text-xs tabular-nums">%{srv.cpu}</span>
              <span className="text-xs tabular-nums">%{srv.ram}</span>
              <span className="text-xs tabular-nums">%{srv.disk}</span>
              <span className="text-xs text-muted-foreground">{srv.uptime}</span>
            </div>
          ))}
        </NestedCard>
      </div>
    </PageContainer>
  );
}
