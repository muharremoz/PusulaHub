"use client";

import { cn } from "@/lib/utils";
import { ShieldCheck, ShieldOff } from "lucide-react";
import type { DetailSecurity } from "@/lib/mock-server-detail";

interface Props {
  security: DetailSecurity;
}

export function TabSecurity({ security }: Props) {
  return (
    <div className="space-y-3">
      {/* Firewall — full width */}
      <div className="rounded-[8px] p-2 pb-0" style={{ backgroundColor: "#F4F2F0" }}>
        <div
          className="rounded-[4px]"
          style={{ backgroundColor: "#FFFFFF", boxShadow: "0 2px 4px rgba(0,0,0,0.06)" }}
        >
          <div className="px-3 py-2 bg-muted/30 border-b border-border/40 flex items-center gap-3">
            <span className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase flex-1">
              Güvenlik Duvarı
            </span>
            <div className="flex items-center gap-1.5">
              {security.firewall.enabled ? (
                <ShieldCheck className="size-3.5 text-emerald-500" />
              ) : (
                <ShieldOff className="size-3.5 text-red-400" />
              )}
              <span
                className={cn(
                  "text-[10px] font-medium",
                  security.firewall.enabled ? "text-emerald-600" : "text-red-500"
                )}
              >
                {security.firewall.enabled ? "Etkin" : "Devre Dışı"}
              </span>
              <span className="text-[10px] text-muted-foreground ml-2">
                {security.firewall.rulesCount} kural
              </span>
            </div>
          </div>

          {/* Firewall rules header */}
          <div className="grid grid-cols-[1fr_60px_60px_50px] gap-3 px-3 py-2 bg-muted/10 border-b border-border/40">
            {["Kural Adı", "Yön", "Eylem", "Durum"].map((h) => (
              <span
                key={h}
                className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase"
              >
                {h}
              </span>
            ))}
          </div>

          <div className="divide-y divide-border/40">
            {security.firewallRules.map((rule, i) => (
              <div
                key={i}
                className="grid grid-cols-[1fr_60px_60px_50px] gap-3 px-3 py-2.5 hover:bg-muted/20 transition-colors items-center"
              >
                <span className="text-[11px] truncate">{rule.name}</span>
                <span className="text-[10px] text-muted-foreground">{rule.direction}</span>
                <span
                  className={cn(
                    "text-[10px] font-medium",
                    rule.action === "Allow" ? "text-emerald-600" : "text-red-500"
                  )}
                >
                  {rule.action === "Allow" ? "İzin Ver" : "Engelle"}
                </span>
                <span className="flex items-center gap-1">
                  <span
                    className={cn(
                      "size-1.5 rounded-full",
                      rule.enabled ? "bg-emerald-500" : "bg-muted-foreground"
                    )}
                  />
                  <span className="text-[10px] text-muted-foreground">
                    {rule.enabled ? "Aktif" : "Pasif"}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="h-2" />
      </div>

      {/* Adapters + Ports — 2 column */}
      <div className="grid grid-cols-2 gap-3">
        {/* Network Adapters */}
        <div className="rounded-[8px] p-2 pb-0" style={{ backgroundColor: "#F4F2F0" }}>
          <div
            className="rounded-[4px]"
            style={{ backgroundColor: "#FFFFFF", boxShadow: "0 2px 4px rgba(0,0,0,0.06)" }}
          >
            <div className="px-3 py-2 bg-muted/30 border-b border-border/40">
              <span className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase">
                Ağ Adaptörleri
              </span>
            </div>
            <div className="divide-y divide-border/40">
              {security.adapters.map((adapter) => (
                <div key={adapter.name} className="px-3 py-3 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-medium">{adapter.name}</span>
                    <span className="text-[9px] bg-muted px-1.5 py-0.5 rounded-[4px] font-medium">
                      {adapter.status}
                    </span>
                  </div>
                  <div className="space-y-0.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-muted-foreground">IP</span>
                      <span className="text-[11px] font-mono">{adapter.ip}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-muted-foreground">MAC</span>
                      <span className="text-[10px] font-mono text-muted-foreground">{adapter.mac}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-muted-foreground">Hız</span>
                      <span className="text-[10px] text-muted-foreground">{adapter.speed}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="h-2" />
        </div>

        {/* Open Ports */}
        <div className="rounded-[8px] p-2 pb-0" style={{ backgroundColor: "#F4F2F0" }}>
          <div
            className="rounded-[4px]"
            style={{ backgroundColor: "#FFFFFF", boxShadow: "0 2px 4px rgba(0,0,0,0.06)" }}
          >
            <div className="px-3 py-2 bg-muted/30 border-b border-border/40">
              <span className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase">
                Açık Portlar
              </span>
            </div>
            <div className="grid grid-cols-[60px_60px_1fr_60px] gap-3 px-3 py-2 bg-muted/10 border-b border-border/40">
              {["Port", "Protokol", "Süreç", "PID"].map((h) => (
                <span
                  key={h}
                  className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase"
                >
                  {h}
                </span>
              ))}
            </div>
            <div className="divide-y divide-border/40">
              {security.ports.map((port) => (
                <div
                  key={`${port.port}-${port.protocol}`}
                  className="grid grid-cols-[60px_60px_1fr_60px] gap-3 px-3 py-2.5 hover:bg-muted/20 transition-colors items-center"
                >
                  <span className="text-[11px] font-mono font-semibold tabular-nums">{port.port}</span>
                  <span className="text-[10px] text-muted-foreground">{port.protocol}</span>
                  <span className="text-[11px] truncate">{port.process}</span>
                  <span className="text-[10px] text-muted-foreground font-mono tabular-nums">
                    {port.pid}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div className="h-2" />
        </div>
      </div>

      {/* Shares — full width */}
      <div className="rounded-[8px] p-2 pb-0" style={{ backgroundColor: "#F4F2F0" }}>
        <div
          className="rounded-[4px]"
          style={{ backgroundColor: "#FFFFFF", boxShadow: "0 2px 4px rgba(0,0,0,0.06)" }}
        >
          <div className="px-3 py-2 bg-muted/30 border-b border-border/40">
            <span className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase">
              Paylaşılan Klasörler
            </span>
          </div>
          <div className="grid grid-cols-[120px_1fr_1fr] gap-3 px-3 py-2 bg-muted/10 border-b border-border/40">
            {["Paylaşım Adı", "Yol", "Erişim"].map((h) => (
              <span
                key={h}
                className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase"
              >
                {h}
              </span>
            ))}
          </div>
          <div className="divide-y divide-border/40">
            {security.shares.map((share) => (
              <div
                key={share.name}
                className="grid grid-cols-[120px_1fr_1fr] gap-3 px-3 py-2.5 hover:bg-muted/20 transition-colors items-center"
              >
                <span className="text-[11px] font-mono font-medium">{share.name}</span>
                <span className="text-[11px] font-mono text-muted-foreground truncate">
                  {share.path}
                </span>
                <span className="text-[11px] text-muted-foreground">{share.access}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="h-2" />
      </div>
    </div>
  );
}
