"use client";

import { useState } from "react";
import { PageContainer } from "@/components/layout/page-container";
import { NestedCard } from "@/components/shared/nested-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { ProgressBar } from "@/components/shared/progress-bar";
import { companies, messageRecipients, servers } from "@/lib/mock-data";
import type { Company } from "@/types";
import {
  Building2,
  Users,
  Server,
  Mail,
  Phone,
  User,
  Calendar,
  Cpu,
  MemoryStick,
  HardDrive,
  CheckCircle2,
  XCircle,
  Clock,
  Briefcase,
  StickyNote,
} from "lucide-react";

const statusConfig = {
  active: { label: "Aktif", variant: "online" as const, color: "bg-emerald-50 text-emerald-700 border-emerald-200/60" },
  suspended: { label: "Askiya Alindi", variant: "offline" as const, color: "bg-red-50 text-red-700 border-red-200/60" },
  trial: { label: "Deneme", variant: "warning" as const, color: "bg-amber-50 text-amber-700 border-amber-200/60" },
};

export default function CompaniesPage() {
  const [selectedCompany, setSelectedCompany] = useState<string | null>(null);

  const selected: Company | undefined = selectedCompany
    ? companies.find((c) => c.id === selectedCompany)
    : undefined;

  const companyUsers = selected
    ? messageRecipients.filter((r) => r.company === selected.name)
    : [];

  const companyServers = selected
    ? servers.filter((s) => selected.servers.includes(s.name))
    : [];

  return (
    <PageContainer title="Firma Yonetimi" description="Firmalarin sunucu kullanim durumlari">
      {/* Company Selector */}
      <div className="mb-6">
        <NestedCard>
          <p className="text-[11px] font-medium text-muted-foreground tracking-wide mb-3">FIRMA SECIN</p>
          <div className="grid grid-cols-5 gap-2">
            {companies.map((comp) => {
              const isSelected = selectedCompany === comp.id;
              const st = statusConfig[comp.status];
              const onlineUsers = messageRecipients.filter((r) => r.company === comp.name && r.online).length;
              const diskPercent = Math.round((comp.currentUsage.disk / comp.monthlyQuota.disk) * 100);
              return (
                <button
                  key={comp.id}
                  onClick={() => setSelectedCompany(comp.id)}
                  className={`relative rounded-[6px] border p-3 text-left transition-all ${
                    isSelected
                      ? "border-foreground bg-foreground/[0.03] ring-1 ring-foreground/20"
                      : "border-border/40 hover:border-border hover:bg-muted/20"
                  }`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center justify-center h-8 w-8 rounded-[6px] bg-muted/50 shrink-0">
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <span className={`inline-flex items-center rounded-[5px] border px-1.5 py-0.5 text-[9px] font-medium ${st.color}`}>
                      {st.label}
                    </span>
                  </div>
                  <p className="text-xs font-semibold mb-0.5">{comp.name}</p>
                  <p className="text-[10px] text-muted-foreground mb-2">{comp.sector}</p>
                  <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      {comp.userCount}
                    </span>
                    <span className="flex items-center gap-1">
                      <Server className="h-3 w-3" />
                      {comp.servers.length}
                    </span>
                    <span className="flex items-center gap-1">
                      <span className={`h-1.5 w-1.5 rounded-full ${onlineUsers > 0 ? "bg-emerald-500" : "bg-gray-300"}`} />
                      {onlineUsers} online
                    </span>
                  </div>
                  {/* Mini disk bar */}
                  <div className="mt-2">
                    <div className="flex items-center justify-between text-[9px] text-muted-foreground mb-0.5">
                      <span>Disk</span>
                      <span>%{diskPercent}</span>
                    </div>
                    <div className="h-1 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${diskPercent >= 90 ? "bg-red-500" : diskPercent >= 70 ? "bg-amber-500" : "bg-emerald-500"}`}
                        style={{ width: `${diskPercent}%` }}
                      />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </NestedCard>
      </div>

      {/* Company Detail */}
      {selected ? (
        <div className="space-y-3">
          {/* Header + Contact */}
          <div className="grid grid-cols-[1fr_1fr] gap-3">
            {/* Company Info */}
            <NestedCard
              footer={
                <>
                  <Calendar className="h-3 w-3" />
                  <span>Sozlesme: {selected.contractStart} — {selected.contractEnd}</span>
                </>
              }
            >
              <div className="flex items-start gap-3 mb-4">
                <div className="flex items-center justify-center h-11 w-11 rounded-[6px] bg-muted/50 shrink-0">
                  <Building2 className="h-5.5 w-5.5 text-muted-foreground" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-semibold">{selected.name}</h3>
                    <StatusBadge status={statusConfig[selected.status].variant} label={statusConfig[selected.status].label} />
                  </div>
                  <p className="text-[11px] text-muted-foreground">{selected.sector}</p>
                </div>
              </div>

              <div className="space-y-2.5">
                <div className="flex items-center gap-2.5">
                  <User className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs">{selected.contactPerson}</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">{selected.contactEmail}</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">{selected.contactPhone}</span>
                </div>
              </div>

              {selected.notes && (
                <div className="mt-4 pt-3 border-t border-border/40">
                  <div className="flex items-start gap-2">
                    <StickyNote className="h-3.5 w-3.5 text-muted-foreground mt-0.5" />
                    <p className="text-[11px] text-muted-foreground leading-relaxed">{selected.notes}</p>
                  </div>
                </div>
              )}
            </NestedCard>

            {/* Resource Usage */}
            <NestedCard
              footer={
                <>
                  <Cpu className="h-3 w-3" />
                  <span>Aylik kota kullanimi</span>
                </>
              }
            >
              <h3 className="text-sm font-semibold mb-4">Kaynak Kullanimi</h3>
              <div className="space-y-4">
                {/* CPU */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                      <Cpu className="h-3.5 w-3.5" /> CPU
                    </span>
                    <span className="text-xs font-medium tabular-nums">
                      {selected.currentUsage.cpu} / {selected.monthlyQuota.cpu} vCPU
                    </span>
                  </div>
                  <ProgressBar value={Math.round((selected.currentUsage.cpu / selected.monthlyQuota.cpu) * 100)} />
                  <p className="text-[10px] text-muted-foreground mt-1">
                    %{Math.round((selected.currentUsage.cpu / selected.monthlyQuota.cpu) * 100)} kullaniliyor
                  </p>
                </div>

                {/* RAM */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                      <MemoryStick className="h-3.5 w-3.5" /> RAM
                    </span>
                    <span className="text-xs font-medium tabular-nums">
                      {selected.currentUsage.ram} / {selected.monthlyQuota.ram} GB
                    </span>
                  </div>
                  <ProgressBar value={Math.round((selected.currentUsage.ram / selected.monthlyQuota.ram) * 100)} />
                  <p className="text-[10px] text-muted-foreground mt-1">
                    %{Math.round((selected.currentUsage.ram / selected.monthlyQuota.ram) * 100)} kullaniliyor
                  </p>
                </div>

                {/* Disk */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                      <HardDrive className="h-3.5 w-3.5" /> Disk
                    </span>
                    <span className="text-xs font-medium tabular-nums">
                      {selected.currentUsage.disk} / {selected.monthlyQuota.disk} GB
                    </span>
                  </div>
                  <ProgressBar value={Math.round((selected.currentUsage.disk / selected.monthlyQuota.disk) * 100)} />
                  <p className="text-[10px] text-muted-foreground mt-1">
                    %{Math.round((selected.currentUsage.disk / selected.monthlyQuota.disk) * 100)} kullaniliyor
                  </p>
                </div>
              </div>
            </NestedCard>
          </div>

          {/* Servers + Services + Users */}
          <div className="grid grid-cols-3 gap-3">
            {/* Servers */}
            <NestedCard
              footer={
                <>
                  <Server className="h-3 w-3" />
                  <span>{companyServers.length} sunucu atanmis</span>
                </>
              }
            >
              <h3 className="text-sm font-semibold mb-3">Sunucular</h3>
              <div className="space-y-1.5">
                {companyServers.map((srv) => (
                  <div
                    key={srv.id}
                    className="flex items-center justify-between px-2.5 py-2 rounded-[5px] bg-muted/20"
                  >
                    <div className="flex items-center gap-2">
                      <div className={`h-2 w-2 rounded-full ${srv.status === "online" ? "bg-emerald-500" : srv.status === "warning" ? "bg-amber-500" : "bg-red-500"}`} />
                      <div>
                        <p className="text-xs font-medium">{srv.name}</p>
                        <p className="text-[10px] text-muted-foreground">{srv.ip}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] text-muted-foreground">{srv.os}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-[9px] text-muted-foreground">CPU %{srv.cpu}</span>
                        <span className="text-[9px] text-muted-foreground">RAM %{srv.ram}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </NestedCard>

            {/* Services */}
            <NestedCard
              footer={
                <>
                  <Briefcase className="h-3 w-3" />
                  <span>{selected.services.length} hizmet tanimli</span>
                </>
              }
            >
              <h3 className="text-sm font-semibold mb-3">Hizmetler</h3>
              <div className="space-y-1">
                {selected.services.map((svc) => (
                  <div
                    key={svc.name}
                    className="flex items-center justify-between px-2.5 py-2 rounded-[5px] hover:bg-muted/20 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      {svc.status === "active" ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                      ) : (
                        <XCircle className="h-3.5 w-3.5 text-muted-foreground/40" />
                      )}
                      <span className={`text-xs ${svc.status === "active" ? "font-medium" : "text-muted-foreground"}`}>
                        {svc.name}
                      </span>
                    </div>
                    <span className={`text-[10px] ${svc.status === "active" ? "text-emerald-600" : "text-muted-foreground"}`}>
                      {svc.status === "active" ? "Aktif" : "Pasif"}
                    </span>
                  </div>
                ))}
              </div>
            </NestedCard>

            {/* Users */}
            <NestedCard
              footer={
                <>
                  <Users className="h-3 w-3" />
                  <span>{companyUsers.length} kullanici</span>
                </>
              }
            >
              <h3 className="text-sm font-semibold mb-3">Kullanicilar</h3>
              <div className="space-y-1">
                {companyUsers.map((usr) => (
                  <div
                    key={usr.id}
                    className="flex items-center justify-between px-2.5 py-2 rounded-[5px] hover:bg-muted/20 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <div className={`h-1.5 w-1.5 rounded-full ${usr.online ? "bg-emerald-500" : "bg-gray-300"}`} />
                      <div>
                        <p className="text-xs font-medium">{usr.name}</p>
                        <p className="text-[10px] text-muted-foreground">{usr.email}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded-[4px] font-medium">
                        {usr.server}
                      </span>
                    </div>
                  </div>
                ))}
                {companyUsers.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-4">Kullanici bulunamadi</p>
                )}
              </div>
            </NestedCard>
          </div>
        </div>
      ) : (
        <NestedCard>
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Building2 className="h-12 w-12 text-muted-foreground/30 mb-3" />
            <p className="text-sm font-medium text-muted-foreground">Detaylari gormek icin bir firma secin</p>
            <p className="text-[11px] text-muted-foreground/60 mt-1">Yukaridaki kartlardan bir firmaya tiklayin</p>
          </div>
        </NestedCard>
      )}
    </PageContainer>
  );
}
