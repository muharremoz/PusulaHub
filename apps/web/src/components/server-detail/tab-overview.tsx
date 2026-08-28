"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { AnimatedCircularProgressBar } from "@/components/ui/animated-circular-progress-bar";
import type { Server } from "@/types";
import type { AgentReport } from "@/lib/agent-types";
import type { AnalizYanit } from "@/app/api/servers/[id]/analiz/route";

type RamPayload = AgentReport["metrics"]["ram"] | null;

interface Props {
  server: Server;
  sessionCount: number;
  ram?: RamPayload;
  onRefresh?: () => void;
  refreshing?: boolean;
  /** Özet kartından Analiz sekmesine geçiş. */
  onAnalizAc?: () => void;
  /** Kullanım geçmişi var mı — sayfa Analiz sekmesini buna göre gösteriyor. */
  onAnalizVeri?: (varMi: boolean) => void;
}

function fmtGB(mb: number) {
  return `${(mb / 1024).toFixed(2)} GB`;
}

function gaugeColor(value: number) {
  if (value >= 90) return { primary: "#ef4444", secondary: "#fee2e2" };
  if (value >= 75) return { primary: "#f59e0b", secondary: "#fef3c7" };
  return { primary: "#10b981", secondary: "#d1fae5" };
}

function AnimatedGauge({ value, className }: { value: number; className?: string }) {
  const [displayed, setDisplayed] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setDisplayed(value), 80);
    return () => clearTimeout(t);
  }, [value]);
  const { primary, secondary } = gaugeColor(value);
  return (
    <AnimatedCircularProgressBar
      value={displayed}
      gaugePrimaryColor={primary}
      gaugeSecondaryColor={secondary}
      className={className}
    />
  );
}

function loadScore(cpu: number, ram: number, disk: number) {
  const raw = Math.round(cpu * 0.4 + ram * 0.4 + disk * 0.2);
  const score = 100 - raw;
  if (score >= 70) return { score, label: "Düşük Yük", color: "#10b981", bg: "#d1fae5", bar: "#10b981" };
  if (score >= 40) return { score, label: "Orta Yük", color: "#f59e0b", bg: "#fef3c7", bar: "#f59e0b" };
  return { score, label: "Yüksek Yük", color: "#ef4444", bg: "#fee2e2", bar: "#ef4444" };
}

function LoadScoreCard({ cpu, ram, disk }: { cpu: number; ram: number; disk: number }) {
  const { score, label, color, bg } = loadScore(cpu, ram, disk);
  const [displayed, setDisplayed] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setDisplayed(score), 80);
    return () => clearTimeout(t);
  }, [score]);

  return (
    <div className="rounded-[8px] p-2 flex flex-col" style={{ backgroundColor: "var(--section-bg)" }}>
      <div
        className="rounded-[5px] flex-1 flex flex-col"
        style={{ backgroundColor: "var(--card)", boxShadow: "var(--card-shadow)" }}
      >
        <div className="px-3 py-2 bg-muted/20 border-b border-border">
          <span className="text-[10px] font-medium text-muted-foreground tracking-wider uppercase">
            Sunucu Yük Skoru
          </span>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center py-4 gap-3">
          <AnimatedCircularProgressBar
            value={displayed}
            gaugePrimaryColor={color}
            gaugeSecondaryColor={bg}
            className="size-20 text-[15px] font-bold"
          />
          <div className="flex flex-col items-center gap-0.5">
            <span
              className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full"
              style={{ color, backgroundColor: bg }}
            >
              {label}
            </span>
            <span className="text-[10px] text-muted-foreground mt-1">genel performans skoru</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function RamBreakdownCard({ ram }: { ram: NonNullable<RamPayload> }) {
  const total = ram.totalMB || 1;
  const cache = ram.cacheMB ?? 0;
  // pureFreeMB varsa onu kullan — WMI freeMB bazı sürümlerde standby'ı da içeriyor
  const free  = ram.pureFreeMB ?? ram.freeMB;
  // realUsedMB agent'tan gelmiyorsa client-side hesapla
  const real  = ram.realUsedMB ?? Math.max(0, ram.totalMB - free - cache);

  const realPct  = (real / total) * 100;
  const cachePct = (cache / total) * 100;
  const freePct  = (free / total) * 100;

  // Eski agent (cacheMB göndermiyor) — kırılım kartı yerine basit "Toplam / Kullanılan / Boş" göster
  const hasCache = ram.cacheMB != null;

  return (
    <div className="rounded-[8px] p-2" style={{ backgroundColor: "var(--section-bg)" }}>
      <div
        className="rounded-[5px]"
        style={{ backgroundColor: "var(--card)", boxShadow: "var(--card-shadow)" }}
      >
        <div className="px-3 py-2 bg-muted/20 border-b border-border">
          <span className="text-[10px] font-medium text-muted-foreground tracking-wider uppercase">
            RAM Detayı
          </span>
        </div>
        <div className="px-3 py-3 space-y-3">
          {/* Stacked bar */}
          <div className="h-2 w-full rounded-full overflow-hidden bg-muted/30 flex">
            <div style={{ width: `${realPct}%`, backgroundColor: "#10b981" }} title={`Gerçek: ${fmtGB(real)}`} />
            {hasCache && (
              <div style={{ width: `${cachePct}%`, backgroundColor: "var(--chart-3)" }} title={`Cache: ${fmtGB(cache)}`} />
            )}
            <div style={{ width: `${freePct}%`, backgroundColor: "var(--muted)" }} title={`Boş: ${fmtGB(free)}`} />
          </div>

          {/* Legend / values */}
          <div className={cn("grid gap-2 text-[11px]", hasCache ? "grid-cols-4" : "grid-cols-3")}>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-muted-foreground/40" />
                <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Toplam</span>
              </div>
              <div className="font-semibold tabular-nums mt-0.5">{fmtGB(ram.totalMB)}</div>
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="size-2 rounded-full" style={{ backgroundColor: "#10b981" }} />
                <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Gerçek</span>
              </div>
              <div className="font-semibold tabular-nums mt-0.5">
                {fmtGB(real)} <span className="text-muted-foreground font-normal">({realPct.toFixed(1)}%)</span>
              </div>
            </div>
            {hasCache && (
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full" style={{ backgroundColor: "var(--chart-3)" }} />
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Cache</span>
                </div>
                <div className="font-semibold tabular-nums mt-0.5">
                  {fmtGB(cache)} <span className="text-muted-foreground font-normal">({cachePct.toFixed(1)}%)</span>
                </div>
              </div>
            )}
            <div>
              <div className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-neutral-300" />
                <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Boş</span>
              </div>
              <div className="font-semibold tabular-nums mt-0.5">
                {fmtGB(free)} <span className="text-muted-foreground font-normal">({freePct.toFixed(1)}%)</span>
              </div>
            </div>
          </div>

          {hasCache && (
            <p className="text-[10px] text-muted-foreground leading-relaxed">
              <span className="font-medium text-foreground">Cache</span> Windows&apos;un dosya sistemi cache&apos;idir; uygulamalar RAM ihtiyacı duyduğunda anında serbest bırakılır. Sunucunun gerçek yükünü <span className="font-medium text-foreground">Gerçek</span> rakamı yansıtır.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   Kullanım özeti — Analiz sekmesinin kısa hâli
   ══════════════════════════════════════════════════════════
   Burada eskiden "Haftalık Ortalama (CPU)" başlıklı, içi hiç
   doldurulmamış ("Veri toplanıyor...") bir panel duruyordu.
   Yerine sunucunun asıl merak edilen tarafı kondu: kaç kişi
   kullanıyor, yoğunluğu ne. Ayrıntı Analiz sekmesinde. */
function AnalizOzeti({ serverId, onAc, onVeri }: {
  serverId: string; onAc?: () => void; onVeri?: (varMi: boolean) => void;
}) {
  const [veri, setVeri] = useState<AnalizYanit | null>(null);
  const [yukleniyor, setYukleniyor] = useState(true);

  useEffect(() => {
    let iptal = false;
    (async () => {
      try {
        const r = await fetch(`/api/servers/${serverId}/analiz`);
        const d = await r.json();
        if (!iptal && r.ok) { setVeri(d); onVeri?.(!!d?.veriVar); }
      } catch { /* sessiz: ozet kritik degil */ }
      finally { if (!iptal) setYukleniyor(false); }
    })();
    return () => { iptal = true; };
  }, [serverId, onVeri]);

  const kabuk = (ic: React.ReactNode) => (
    <div
      className="rounded-[5px] flex-1 flex flex-col overflow-hidden"
      style={{ backgroundColor: "var(--card)", boxShadow: "var(--card-shadow)" }}
    >
      <div className="px-3 py-2 bg-muted/20 border-b border-border shrink-0 flex items-center justify-between">
        <span className="text-[10px] font-medium text-muted-foreground tracking-wider uppercase">
          Kullanım Özeti
        </span>
        {veri?.veriVar && onAc && (
          <button
            onClick={onAc}
            className="text-primary text-[10px] font-medium hover:underline"
          >
            Ayrıntı →
          </button>
        )}
      </div>
      {ic}
    </div>
  );

  if (yukleniyor)
    return kabuk(
      <div className="flex-1 px-3 py-3 space-y-2">
        <div className="h-14 rounded-[5px] bg-muted/40 animate-pulse" />
        <div className="h-20 rounded-[5px] bg-muted/40 animate-pulse" />
      </div>,
    );

  if (!veri || !veri.veriVar)
    return kabuk(
      <div className="flex-1 flex items-center justify-center px-4 py-8 text-center">
        <span className="text-[11px] text-muted-foreground">
          Bu sunucuda kullanıcı oturumu geçmişi yok.
        </span>
      </div>,
    );

  const o = veri.ozet;
  const enCok = Math.max(...veri.gunler.map((g) => g.kisi), 1);
  const ilk3 = veri.firmalar.filter((f) => f.kullanan > 0).slice(0, 3);

  return kabuk(
    <div className="flex-1 flex flex-col gap-3 px-3 py-3">
      <div className="grid grid-cols-3 gap-2">
        {[
          { s: o.suAnBagli, e: "Şu an bağlı", vurgu: true },
          { s: o.gunlukOrtKisi, e: "Günlük ort." },
          { s: `${o.kisiBasiSaat} sa`, e: "Kişi başı" },
        ].map((k) => (
          <div key={k.e} className="text-center">
            <div className={cn("text-xl font-bold tabular-nums",
              k.vurgu && "text-emerald-600 dark:text-emerald-400")}>{k.s}</div>
            <div className="text-[10px] text-muted-foreground tracking-wide uppercase mt-0.5">{k.e}</div>
          </div>
        ))}
      </div>

      {/* Son 30 günün kişi sayısı — Analiz sekmesindeki grafiğin küçüğü.
          items-stretch şart: items-end olsaydı yüzde yükseklik 0'a düşer,
          çubuklar görünmezdi (aynı hata Analiz sekmesinde yaşandı). */}
      {veri.gunler.length > 0 && (
        <div>
          <div className="flex h-14 items-stretch gap-[2px]">
            {veri.gunler.map((g) => (
              <div key={g.tarih} className="flex min-w-0 flex-1 flex-col justify-end" title={`${g.kisi} kişi`}>
                <div
                  className={cn("w-full rounded-t-[1px]",
                    g.haftaSonu ? "bg-muted-foreground/25" : "bg-primary/70")}
                  style={{ height: `${Math.max(2, (g.kisi / enCok) * 100)}%` }}
                />
              </div>
            ))}
          </div>
          <div className="text-[10px] text-muted-foreground mt-1">
            son {veri.gunler.length} gün · en yüksek {enCok} kişi
          </div>
        </div>
      )}

      {ilk3.length > 0 && (
        <div className="border-t pt-2">
          <div className="text-[10px] font-medium text-muted-foreground tracking-wider uppercase mb-1.5">
            En çok kullanan
          </div>
          <div className="space-y-1">
            {ilk3.map((f) => (
              <div key={f.firma} className="flex items-baseline justify-between gap-2 text-[12px]">
                <span className="truncate">
                  <span className="text-primary font-mono text-[11px] font-semibold">{f.firma}</span>
                  <span className="ml-1.5">{f.ad ?? "—"}</span>
                </span>
                <span className="text-muted-foreground shrink-0 tabular-nums">{f.gunlukOrt} kişi/gün</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {o.atil > 0 && (
        <div className="text-[11px] text-amber-600 dark:text-amber-400">
          {o.atil} hesap 30 gündür bağlanmamış
        </div>
      )}
    </div>,
  );
}

export function TabOverview({ server, sessionCount, ram, onRefresh, refreshing, onAnalizAc, onAnalizVeri }: Props) {

  return (
    <div className="space-y-3">
      {/* Main 2-column layout: left = KPI + Server Info, right = Chart */}
      <div className="grid grid-cols-2 gap-3">
        {/* Left column */}
        <div className="flex flex-col gap-3">
          {/* Sunucu Bilgileri */}
          <div className="rounded-[8px] p-2" style={{ backgroundColor: "var(--section-bg)" }}>
            <div
              className="rounded-[5px]"
              style={{ backgroundColor: "var(--card)", boxShadow: "var(--card-shadow)" }}
            >
              <div className="px-3 py-2 bg-muted/20 border-b border-border">
                <span className="text-[10px] font-medium text-muted-foreground tracking-wider uppercase">
                  Sunucu Bilgileri
                </span>
              </div>
              <div className="divide-y divide-border/40">
                {[
                  { label: "Sunucu Adı", value: server.name },
                  { label: "IP Adresi", value: server.ip, mono: true },
                  { label: "DNS Adresi", value: server.dns ?? "—", mono: true },
                  { label: "İşletim Sistemi", value: server.os },
                  { label: "Çalışma Süresi", value: server.uptime },
                  { label: "Son Kontrol", value: (() => {
                    try {
                      const d = new Date(server.lastChecked);
                      if (isNaN(d.getTime())) return server.lastChecked;
                      return d.toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });
                    } catch { return server.lastChecked; }
                  })() },
                ].map(({ label, value, mono }) => (
                  <div key={label} className="px-3 py-2.5 flex items-center justify-between gap-4">
                    <span className="text-[10px] font-medium text-muted-foreground tracking-wider uppercase shrink-0">
                      {label}
                    </span>
                    <span className={cn("text-[11px] text-right truncate", mono && "font-mono")}>
                      {value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
                </div>

          {/* Anlık Durum + Sunucu Yük Skoru */}
          <div className="grid grid-cols-2 gap-3 items-stretch">
            {/* Anlık Durum */}
            <div className="rounded-[8px] p-2 flex flex-col" style={{ backgroundColor: "var(--section-bg)" }}>
              <div
                className="rounded-[5px] flex-1 flex flex-col"
                style={{ backgroundColor: "var(--card)", boxShadow: "var(--card-shadow)" }}
              >
                <div className="px-3 py-2 bg-muted/20 border-b border-border flex items-center justify-between">
                  <span className="text-[10px] font-medium text-muted-foreground tracking-wider uppercase">
                    Anlık Durum
                  </span>
                  {onRefresh && (
                    <button
                      onClick={onRefresh}
                      disabled={refreshing}
                      className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                    >
                      <RefreshCw className={cn("size-3", refreshing && "animate-spin")} />
                      Yenile
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-4 divide-x divide-border/40 flex-1">
                  {[
                    { label: "CPU", value: server.cpu },
                    {
                      label: "RAM",
                      value: ram && ram.totalMB
                        ? Math.round(((ram.realUsedMB ?? Math.max(0, ram.usedMB - (ram.cacheMB ?? 0))) / ram.totalMB) * 100)
                        : server.ram,
                    },
                    { label: "Disk", value: server.disk },
                  ].map(({ label, value }) => (
                    <div key={label} className="flex flex-col items-center justify-center py-3 gap-1.5">
                      <AnimatedGauge value={value} className="size-14 text-[10px] font-semibold" />
                      <span className="text-[10px] font-medium text-muted-foreground tracking-wider uppercase">
                        {label}
                      </span>
                      <span className="text-[10px] text-muted-foreground">%{value}</span>
                    </div>
                  ))}
                  <div className="flex flex-col items-center justify-center py-3 gap-1.5">
                    <div className="size-14 flex items-center justify-center">
                      <span className="text-3xl font-bold tabular-nums">{sessionCount}</span>
                    </div>
                    <span className="text-[10px] font-medium text-muted-foreground tracking-wider uppercase">
                      Oturum
                    </span>
                    <span className="text-[10px] text-muted-foreground">aktif</span>
                  </div>
                </div>
              </div>
                    </div>

            {/* Sunucu Yük Skoru */}
            <LoadScoreCard cpu={server.cpu} ram={server.ram} disk={server.disk} />
          </div>

          {/* RAM Detayı (cache kırılımı) */}
          {ram && ram.totalMB > 0 && <RamBreakdownCard ram={ram} />}
        </div>

        {/* Sağ kolon: kullanım özeti (Analiz sekmesinin kısa hâli) */}
        <div className="rounded-[8px] p-2 flex flex-col" style={{ backgroundColor: "var(--section-bg)" }}>
          <AnalizOzeti serverId={server.id} onAc={onAnalizAc} onVeri={onAnalizVeri} />
            </div>
      </div>

    </div>
  );
}
