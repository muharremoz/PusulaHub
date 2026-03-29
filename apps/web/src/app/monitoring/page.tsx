"use client";

import { PageContainer } from "@/components/layout/page-container";
import { NestedCard } from "@/components/shared/nested-card";
import { StatsCard } from "@/components/shared/stats-card";
import { ProgressBar } from "@/components/shared/progress-bar";
import { servers } from "@/lib/mock-data";
import { Cpu, MemoryStick, HardDrive, Clock, Activity } from "lucide-react";

export default function MonitoringPage() {
  const onlineServers = servers.filter((s) => s.status !== "offline");
  const avgCpu = Math.round(onlineServers.reduce((a, s) => a + s.cpu, 0) / onlineServers.length);
  const avgRam = Math.round(onlineServers.reduce((a, s) => a + s.ram, 0) / onlineServers.length);
  const avgDisk = Math.round(onlineServers.reduce((a, s) => a + s.disk, 0) / onlineServers.length);

  return (
    <PageContainer title="Monitoring" description="Sunucu performans izleme">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <StatsCard
          title="ORTALAMA CPU"
          value={`%${avgCpu}`}
          icon={<Cpu className="h-4 w-4" />}
          subtitle={`${onlineServers.length} aktif sunucu`}
        />
        <StatsCard
          title="ORTALAMA RAM"
          value={`%${avgRam}`}
          icon={<MemoryStick className="h-4 w-4" />}
          subtitle={`${onlineServers.length} aktif sunucu`}
        />
        <StatsCard
          title="ORTALAMA DISK"
          value={`%${avgDisk}`}
          icon={<HardDrive className="h-4 w-4" />}
          subtitle={`${onlineServers.length} aktif sunucu`}
        />
      </div>

      {/* Per-server details */}
      <div className="grid grid-cols-2 gap-3">
        {onlineServers.map((srv) => (
          <NestedCard
            key={srv.id}
            footer={
              <>
                <Clock className="h-3 w-3" />
                <span>Uptime: {srv.uptime} | Son kontrol: {srv.lastChecked}</span>
              </>
            }
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold">{srv.name}</h3>
                <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded-[4px] font-medium text-muted-foreground">
                  {srv.ip}
                </span>
              </div>
              <div className={`h-2 w-2 rounded-full ${srv.status === "online" ? "bg-emerald-500" : "bg-amber-500"}`} />
            </div>

            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                    <Cpu className="h-3 w-3" /> CPU
                  </span>
                  <span className="text-[11px] font-medium tabular-nums">%{srv.cpu}</span>
                </div>
                <ProgressBar value={srv.cpu} />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                    <MemoryStick className="h-3 w-3" /> RAM
                  </span>
                  <span className="text-[11px] font-medium tabular-nums">%{srv.ram}</span>
                </div>
                <ProgressBar value={srv.ram} />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                    <HardDrive className="h-3 w-3" /> Disk
                  </span>
                  <span className="text-[11px] font-medium tabular-nums">%{srv.disk}</span>
                </div>
                <ProgressBar value={srv.disk} />
              </div>
            </div>
          </NestedCard>
        ))}
      </div>
    </PageContainer>
  );
}
