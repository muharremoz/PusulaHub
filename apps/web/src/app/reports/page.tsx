import { PageContainer } from "@/components/layout/page-container";
import { StatsCard } from "@/components/shared/stats-card";
import { NestedCard } from "@/components/shared/nested-card";
import { dashboardStats, servers, sqlDatabases, iisSites, adUsers } from "@/lib/mock-data";
import { BarChart3, Server, Database, Globe, Users, HardDrive } from "lucide-react";

export default function ReportsPage() {
  const windowsCount = servers.filter((s) => s.os.startsWith("Windows")).length;
  const ubuntuCount = servers.filter((s) => s.os.startsWith("Ubuntu")).length;
  const totalDbSizeGB = (sqlDatabases.reduce((a, d) => a + d.sizeMB, 0) / 1024).toFixed(1);
  const activeSites = iisSites.filter((s) => s.status === "Started").length;
  const activeUsers = adUsers.filter((u) => u.enabled).length;

  return (
    <PageContainer title="Raporlar" description="Sistem ozet raporu ve istatistikler">
      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        <StatsCard title="TOPLAM SUNUCU" value={dashboardStats.totalServers} icon={<Server className="h-4 w-4" />} subtitle={`${windowsCount} Windows, ${ubuntuCount} Ubuntu`} />
        <StatsCard title="VERITABANI" value={sqlDatabases.length} icon={<Database className="h-4 w-4" />} subtitle={`Toplam ${totalDbSizeGB} GB`} />
        <StatsCard title="WEB SITELERI" value={iisSites.length} icon={<Globe className="h-4 w-4" />} subtitle={`${activeSites} aktif`} />
        <StatsCard title="AD KULLANICILARI" value={adUsers.length} icon={<Users className="h-4 w-4" />} subtitle={`${activeUsers} aktif`} />
      </div>

      {/* Server Distribution */}
      <div className="grid grid-cols-2 gap-3">
        <NestedCard
          footer={
            <>
              <BarChart3 className="h-3 w-3" />
              <span>Isletim sistemi dagilimi</span>
            </>
          }
        >
          <h3 className="text-sm font-semibold mb-3">Sunucu Dagilimi</h3>
          <div className="space-y-2.5">
            {[
              { label: "Windows Server 2022", count: servers.filter((s) => s.os === "Windows Server 2022").length },
              { label: "Windows Server 2019", count: servers.filter((s) => s.os === "Windows Server 2019").length },
              { label: "Ubuntu 24.04", count: servers.filter((s) => s.os === "Ubuntu 24.04").length },
              { label: "Ubuntu 22.04", count: servers.filter((s) => s.os === "Ubuntu 22.04").length },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-3">
                <span className="text-xs w-40 truncate">{item.label}</span>
                <div className="flex-1 h-5 bg-muted/40 rounded-[4px] overflow-hidden">
                  <div
                    className="h-full bg-foreground/80 rounded-[4px]"
                    style={{ width: `${(item.count / servers.length) * 100}%` }}
                  />
                </div>
                <span className="text-xs font-medium tabular-nums w-6 text-right">{item.count}</span>
              </div>
            ))}
          </div>
        </NestedCard>

        <NestedCard
          footer={
            <>
              <HardDrive className="h-3 w-3" />
              <span>Veritabani boyutlari</span>
            </>
          }
        >
          <h3 className="text-sm font-semibold mb-3">Veritabani Boyutlari</h3>
          <div className="space-y-2.5">
            {sqlDatabases
              .sort((a, b) => b.sizeMB - a.sizeMB)
              .map((db) => (
                <div key={db.id} className="flex items-center gap-3">
                  <span className="text-xs w-36 truncate">{db.name}</span>
                  <div className="flex-1 h-5 bg-muted/40 rounded-[4px] overflow-hidden">
                    <div
                      className="h-full bg-foreground/80 rounded-[4px]"
                      style={{ width: `${(db.sizeMB / 25600) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground tabular-nums w-14 text-right">
                    {db.sizeMB >= 1024 ? `${(db.sizeMB / 1024).toFixed(1)} GB` : `${db.sizeMB} MB`}
                  </span>
                </div>
              ))}
          </div>
        </NestedCard>
      </div>
    </PageContainer>
  );
}
