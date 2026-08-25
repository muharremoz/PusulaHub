"use client";

import { useState, useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { PageContainer } from "@/components/layout/page-container";
import { NestedCard } from "@/components/shared/nested-card";
import { copyToClipboard } from "@/lib/clipboard";
import { generateSafePassword } from "@/lib/password-gen";
import { useSession } from "next-auth/react";
import type { AccessInfoResponse } from "@/app/api/companies/[firkod]/access-info/route";
import type { WebServiceUsersDto } from "@/app/api/companies/[firkod]/web-users/route";
import type { WebUserTestResult } from "@/app/api/companies/[firkod]/web-users/test/route";
import { StatusBadge } from "@/components/shared/status-badge";
import { ProgressBar } from "@/components/shared/progress-bar";
import { AnimatedCircularProgressBar } from "@/components/ui/animated-circular-progress-bar";
const WeeklyUsageChart = dynamic(() => import("@/components/companies/weekly-usage-chart").then((m) => m.WeeklyUsageChart), { ssr: false, loading: () => <Skeleton className="h-full w-full" /> });
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@muharremoz/pusula-ui";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@muharremoz/pusula-ui";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tooltip as UiTooltip, TooltipContent, TooltipTrigger } from "@muharremoz/pusula-ui";
import { Popover, PopoverContent, PopoverTrigger } from "@muharremoz/pusula-ui";
import {  } from "@muharremoz/pusula-ui";
import { Combobox } from "@/components/ui/combobox";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@muharremoz/pusula-ui";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/combobox-select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import type { Top5Company } from "@/app/api/companies/top5/route";
import type { CompanyDetail } from "@/app/api/companies/[firkod]/detail/route";
const OldDataRestoreSheet = dynamic(() => import("@/components/companies/old-data-restore-sheet").then((m) => m.OldDataRestoreSheet), { ssr: false });

interface FirmaCompany {
  id: string
  firkod: string
  firma: string
  email: string
  phone: string
  userCount: number
  lisansBitis: string
}

interface TabUser {
  username:    string
  displayName: string
  email:       string
  ou:          string
  enabled:     boolean
  lastLogin:   string
  groups:      string[]
  usageCpu?:   number | null
  usageRamMB?: number | null
  usageDate?:  string | null
}

interface TabIISSite {
  Id:           string
  Name:         string
  Server:       string
  Status:       string
  Binding:      string
  AppPool:      string
  PhysicalPath: string
  Hizmet:       string | null
  ServerIP:     string | null
}

interface TabSQLDatabase {
  Id:            string
  Name:          string
  Server:        string
  ServerIP:      string | null
  SizeMB:        number
  Status:        string
  LastBackup:    string | null
  LastDiffBackup: string | null
  LastBackupStart: string | null
  LastDiffBackupStart: string | null
  Tables:        number
  RecoveryModel: string | null
  Owner:         string | null
  DataFilePath:  string | null
  LogFilePath:   string | null
  ProgramCode:   string | null
}

interface TabCompanyService {
  id:         number
  name:       string
  category:   string
  type:       string
  port:       number | null
  siteName:   string
  server:     string
  status:     string
  appPool:    string
  assignedAt: string
}

function firmaIsActive(f: FirmaCompany): boolean {
  if (!f.lisansBitis) return true
  const parts = f.lisansBitis.split(".")
  if (parts.length === 3) {
    const d = new Date(+parts[2], +parts[1] - 1, +parts[0])
    return d >= new Date()
  }
  return new Date(f.lisansBitis) >= new Date()
}
// Etiket metninden deterministik renk seç (her etiket hep aynı renk)
const TAG_PALETTE = [
  "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/25",
  "bg-violet-500/15 text-violet-700 dark:text-violet-400 border-violet-500/25",
  "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/25",
  "bg-teal-500/15 text-teal-700 dark:text-teal-400 border-teal-500/25",
  "bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/25",
  "bg-indigo-500/15 text-indigo-700 dark:text-indigo-400 border-indigo-500/25",
  "bg-cyan-50 text-cyan-700 border-cyan-200",
  "bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/25",
]
function tagColor(tag: string): string {
  let h = 0
  for (let i = 0; i < tag.length; i++) h = (h * 31 + tag.charCodeAt(i)) >>> 0
  return TAG_PALETTE[h % TAG_PALETTE.length]
}
import { Building2, Users, Server, Mail, Phone, User, Calendar, Cpu, MemoryStick, HardDrive, CheckCircle2, XCircle, Briefcase, StickyNote, Activity, Database, MoreVertical, LogOut, KeyRound, Ban, Globe, Info, Search, ChevronLeft, Play, Square, RotateCw, Trash2, Download, Upload, Terminal, Settings2, ToggleLeft, ToggleRight, Copy, CheckCheck, X, Bookmark, Trash, Save, Bug, Plus, Check, Eye, EyeOff, RefreshCw, UserPlus, ArrowUp, ArrowDown, Tag as TagIcon } from "lucide-react"
import type { AdProvisionService } from "@/components/company-setup/ad-provision-runner";
const AdProvisionRunner = dynamic(() => import("@/components/company-setup/ad-provision-runner").then((m) => m.AdProvisionRunner), { ssr: false });
import { meetsAdComplexity } from "@/components/company-setup/step-users";
import type { WizardServiceDto } from "@/app/api/services/route";
import { Checkbox } from "@/components/shared/form"

function YoğunlukKart({ d, firkod, onSaved }: { d: CompanyDetail; firkod: string; onSaved: () => void }) {
  // MB tabanlı hassas yüzde; küçük değerler yuvarlamada sıfıra düşmesin
  const pctMB = (use: number | undefined, quota: number | undefined): number => {
    const q = quota ?? 0;
    const u = use ?? 0;
    if (!q || q <= 0) return 0;
    const p = (u / q) * 100;
    if (p > 0 && p < 1) return 1;  // ≈%0 gösterme, minimum %1
    return Math.min(100, Math.round(p));
  };
  const pctCpu = (v: number): number => {
    if (!v || v <= 0) return 0;
    if (v < 1) return 1;
    return Math.min(100, Math.round(v));
  };

  // 30 günlük ortalama bazlı bar değerleri (satış konuşması için daha anlamlı).
  // Geçmiş veri yoksa canlı değerlere düş.
  const h = d.history30d;
  const avgRamMB    = h ? h.avgRamGB * 1024 : d.usageRamMB;
  const avgDbMB     = h ? (h.dbStartMB + h.dbEndMB) / 2 : d.dbSizeMB;
  const avgCpuValue = h ? h.avgCpu : d.usageCpu;

  // Manuel kota verildiyse bar o kotaya göre hesaplanır; yoksa mevcut davranış
  // (paylaşımlı sunucu oranı / varsayılan kota).
  const mq = d.manualQuota;
  const cpuPct  = mq?.cpuPct ? pctMB(avgCpuValue,    mq.cpuPct)         : pctCpu(avgCpuValue);
  const ramPct  = mq?.ramGB  ? pctMB(avgRamMB,       mq.ramGB  * 1024)  : pctMB(avgRamMB,      d.quotaRamMB);
  const diskPct = mq?.diskGB ? pctMB(d.usageDiskMB,  mq.diskGB * 1024)  : pctMB(d.usageDiskMB, d.quotaDiskMB);
  const dbPct   = mq?.dbGB   ? pctMB(avgDbMB,        mq.dbGB   * 1024)  : pctMB(avgDbMB,       d.dbTotalMB);

  // Yoğunluk: CPU + RAM + Disk + DB yüzdelerinin ortalaması (User kaldırıldı)
  const active = [d.quotaCpu > 0, d.quotaRam > 0, d.quotaDisk > 0, d.dbQuota > 0].filter(Boolean).length;
  const yogunluk = active === 0
    ? 0
    : Math.round(((d.quotaCpu > 0 ? cpuPct : 0) + (d.quotaRam > 0 ? ramPct : 0) + (d.quotaDisk > 0 ? diskPct : 0) + (d.dbQuota > 0 ? dbPct : 0)) / active);

  const [animValue, setAnimValue] = useState(0);
  const [detailOpen, setDetailOpen] = useState(false);
  // Kota düzenleme
  const [quotaOpen, setQuotaOpen]   = useState(false);
  const [quotaSaving, setQuotaSaving] = useState(false);
  const [qCpu,  setQCpu]  = useState("");
  const [qRam,  setQRam]  = useState("");
  const [qDisk, setQDisk] = useState("");
  const [qDb,   setQDb]   = useState("");
  const openQuota = () => {
    // Mevcut manuel kotaları doldur; yoksa boş bırak (placeholder default gösterir)
    setQCpu(d.manualQuota?.cpuPct ? String(d.manualQuota.cpuPct) : "");
    setQRam(d.manualQuota?.ramGB  ? String(d.manualQuota.ramGB)  : "");
    setQDisk(d.manualQuota?.diskGB ? String(d.manualQuota.diskGB) : "");
    setQDb(d.manualQuota?.dbGB   ? String(d.manualQuota.dbGB)   : "");
    setQuotaOpen(true);
  };
  async function saveQuota() {
    setQuotaSaving(true);
    try {
      const r = await fetch(`/api/companies/${firkod}/quota`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cpuPct: Number(qCpu)  || 0,
          ramGB:  Number(qRam)  || 0,
          diskGB: Number(qDisk) || 25,
          dbGB:   Number(qDb)   || 1,
        }),
      });
      if (!r.ok) { toast.error("Kota kaydedilemedi"); return; }
      toast.success("Kota güncellendi");
      setQuotaOpen(false);
      onSaved();
    } catch {
      toast.error("Kota kaydedilemedi");
    } finally {
      setQuotaSaving(false);
    }
  }
  useEffect(() => {
    const t = setTimeout(() => setAnimValue(yogunluk), 50);
    return () => clearTimeout(t);
  }, [yogunluk]);

  const scoreColor =
    yogunluk >= 80 ? { text: "text-red-600 dark:text-red-400",    primary: "#ef4444" } :
    yogunluk >= 60 ? { text: "text-amber-600 dark:text-amber-400",  primary: "#f59e0b" } :
                     { text: "text-emerald-600 dark:text-emerald-400", primary: "#10b981" };

  const metrics = [
    { label: "CPU",  icon: <Cpu className="h-3.5 w-3.5 text-muted-foreground" />,        pct: cpuPct,  quota: mq?.cpuPct ? `%${mq.cpuPct}`   : null },
    { label: "RAM",  icon: <MemoryStick className="h-3.5 w-3.5 text-muted-foreground" />, pct: ramPct,  quota: mq?.ramGB  ? `${mq.ramGB} GB`  : null },
    { label: "Disk", icon: <HardDrive className="h-3.5 w-3.5 text-muted-foreground" />,   pct: diskPct, quota: mq?.diskGB ? `${mq.diskGB} GB` : null },
    { label: "DB",   icon: <Database className="h-3.5 w-3.5 text-muted-foreground" />,    pct: dbPct,   quota: mq?.dbGB   ? `${mq.dbGB} GB`   : null },
  ];

  return (
    <>
    <NestedCard
      className="h-full flex flex-col"
      innerClassName="flex-1"
      footer={
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-1.5">
            <Activity className="h-3 w-3" />
            <span>Son 30 gün ortalaması · CPU + RAM + Disk + Kullanıcı + Veritabanı</span>
          </div>
          <button
            onClick={() => setDetailOpen(true)}
            className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
          >
            <Info className="h-3 w-3" />
            Detaylar
          </button>
        </div>
      }
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold">Kullanım Yoğunluğu</h3>
        <button
          onClick={openQuota}
          className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors border border-border/50 rounded-[5px] px-2 py-1"
          title="Firma için manuel kota ayarla"
        >
          <Settings2 className="h-3 w-3" />
          Kota Ayarla
        </button>
      </div>

      <div className="flex items-stretch gap-0">
        <div className="flex flex-col items-center justify-center pr-4 shrink-0">
          <div className="relative">
            <AnimatedCircularProgressBar
              value={animValue}
              gaugePrimaryColor={scoreColor.primary}
              gaugeSecondaryColor="#e5e7eb"
              className="size-32 text-transparent"
            />
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className={`text-2xl font-bold tabular-nums leading-none ${scoreColor.text}`}>%{yogunluk}</span>
              <span className="text-[10px] text-muted-foreground mt-1">Yoğunluk</span>
            </div>
          </div>
        </div>

        <div className="w-px bg-border/40 mx-1 self-stretch" />

        <div className="flex-1 flex flex-col justify-center pl-4 space-y-2.5">
          {metrics.map((m) => {
            const barColor =
              m.pct >= 80 ? "bg-red-500" :
              m.pct >= 60 ? "bg-amber-400" :
                            "bg-emerald-500";
            return (
              <div key={m.label} className="flex items-center gap-2">
                {m.icon}
                <span className="text-[11px] text-muted-foreground w-7">{m.label}</span>
                <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${barColor}`} style={{ width: `${m.pct}%` }} />
                </div>
                <span className="text-[10px] font-medium tabular-nums text-right whitespace-nowrap">
                  {m.pct}%
                  {m.quota && (
                    <span className="text-muted-foreground font-normal" title="Manuel kota"> / {m.quota}</span>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* 30 günlük geçmiş özeti — satış için */}
      {d.history30d && (
        <div className="mt-4 pt-3 border-t border-border/40 grid grid-cols-3 gap-3">
          <div className="flex flex-col">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wide">CPU 30g</span>
            {/* Zirve ölçülmemişse (eski hatalı kayıtlar temizlendi) "—" göster,
                sıfır yazıp "hiç yük olmamış" izlenimi verme. */}
            <span className="text-[13px] font-semibold tabular-nums">Ort %{d.history30d.avgCpu} <span className="text-muted-foreground font-normal">/ Peak {d.history30d.peakCpu == null ? "—" : `%${d.history30d.peakCpu}`}</span></span>
            {d.history30d.peakCpu != null && d.history30d.peakCpuDate && (
              <span className="text-[9px] text-muted-foreground">Peak: {d.history30d.peakCpuDate}</span>
            )}
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wide">RAM 30g</span>
            <span className="text-[13px] font-semibold tabular-nums">Ort {d.history30d.avgRamGB} GB <span className="text-muted-foreground font-normal">/ Peak {d.history30d.peakRamGB == null ? "—" : `${d.history30d.peakRamGB} GB`}</span></span>
            {d.history30d.peakRamGB != null && d.history30d.peakRamDate && (
              <span className="text-[9px] text-muted-foreground">Peak: {d.history30d.peakRamDate}</span>
            )}
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wide">DB Büyüme</span>
            <span className="text-[13px] font-semibold tabular-nums">
              {(d.history30d.dbStartMB / 1024).toFixed(1)} → {(d.history30d.dbEndMB / 1024).toFixed(1)} GB
            </span>
            <span className={`text-[9px] ${d.history30d.dbGrowthPct >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
              {d.history30d.dbGrowthPct >= 0 ? "+" : ""}{d.history30d.dbGrowthPct}%
            </span>
          </div>
        </div>
      )}
    </NestedCard>

    <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold">Yoğunluk Skoru Hesaplama</DialogTitle>
        </DialogHeader>

        <p className="text-[11px] text-muted-foreground leading-relaxed">
          Firmanın kaynak kullanımı (son 30 gün ortalaması) ile kotasına oranı.
          4 metriğin ortalaması yoğunluk skorunu oluşturur:
        </p>

        <div className="space-y-1.5 mt-1">
          {[
            { label: "CPU Kullanımı",  icon: <Cpu className="h-3.5 w-3.5" />,        pct: cpuPct,  detail: `Ort %${h?.avgCpu ?? 0} · Peak ${h?.peakCpu == null ? "—" : `%${h.peakCpu}`}` },
            { label: "RAM Kullanımı",  icon: <MemoryStick className="h-3.5 w-3.5" />, pct: ramPct,  detail: `${(avgRamMB/1024).toFixed(1)} / ${d.quotaRam} GB` },
            { label: "Disk Kullanımı", icon: <HardDrive className="h-3.5 w-3.5" />,   pct: diskPct, detail: `${d.usageDisk.toFixed(1)} / ${d.quotaDisk} GB` },
            { label: "Veritabanı",     icon: <Database className="h-3.5 w-3.5" />,    pct: dbPct,   detail: `${(d.dbSizeMB / 1024).toFixed(2)} / ${d.dbQuota} GB` },
          ].map((m) => {
            const color = m.pct >= 80 ? "text-red-600 dark:text-red-400" : m.pct >= 60 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400";
            const bar   = m.pct >= 80 ? "bg-red-500"   : m.pct >= 60 ? "bg-amber-400"   : "bg-emerald-500";
            return (
              <div key={m.label} className="rounded-[5px] border border-border/40 px-3 py-2">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    {m.icon}
                    <span className="text-[11px] font-medium text-foreground">{m.label}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground">{m.detail}</span>
                    <span className={`text-[12px] font-bold tabular-nums ${color}`}>%{m.pct}</span>
                  </div>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${bar}`} style={{ width: `${m.pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-2 rounded-[5px] border border-border/40 px-3 py-2.5 bg-muted/20">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-muted-foreground">
              ({cpuPct} + {ramPct} + {diskPct} + {dbPct}) ÷ 4
            </span>
            <span className={`text-base font-bold tabular-nums ${
              yogunluk >= 80 ? "text-red-600 dark:text-red-400" : yogunluk >= 60 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"
            }`}>= %{yogunluk}</span>
          </div>
        </div>
      </DialogContent>
    </Dialog>

    {/* Kota Ayarla */}
    <Dialog open={quotaOpen} onOpenChange={(o) => { if (!quotaSaving) setQuotaOpen(o); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold">Manuel Kota Ayarla</DialogTitle>
        </DialogHeader>
        <p className="text-[11px] text-muted-foreground leading-relaxed -mt-1">
          Boş bırakılan alan varsayılana döner (kota kaldırılır). Density barında
          kullanım, girilen kotaya oranlanarak gösterilir.
        </p>
        <div className="space-y-2.5 mt-1">
          {[
            { lbl: "CPU limiti (%)", val: qCpu,  set: setQCpu,  ph: "Kota yok",  unit: "%"  },
            { lbl: "RAM (GB)",       val: qRam,  set: setQRam,  ph: "Kota yok",  unit: "GB" },
            { lbl: "Disk (GB)",      val: qDisk, set: setQDisk, ph: "25 (varsayılan)", unit: "GB" },
            { lbl: "Veritabanı (GB)",val: qDb,   set: setQDb,   ph: "1 (varsayılan)",  unit: "GB" },
          ].map((f) => (
            <div key={f.lbl} className="flex items-center gap-2">
              <Label className="text-[11px] text-muted-foreground w-32 shrink-0">{f.lbl}</Label>
              <div className="flex items-center gap-1.5 flex-1">
                <Input
                  type="number" min="0" step="any"
                  value={f.val}
                  onChange={(e) => f.set(e.target.value)}
                  placeholder={f.ph}
                  className="h-8 rounded-[5px] text-[11px]"
                />
                <span className="text-[10px] text-muted-foreground w-5">{f.unit}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-2 mt-3">
          <Button variant="outline" size="sm" onClick={() => setQuotaOpen(false)} disabled={quotaSaving} className="rounded-[5px] h-8 text-[13px]">İptal</Button>
          <Button size="sm" onClick={saveQuota} disabled={quotaSaving} className="rounded-[5px] h-8 text-[13px]">
            {quotaSaving ? "Kaydediliyor…" : "Kaydet"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}

const statusConfig = {
  active:    { label: "Aktif",          variant: "online"  as const, color: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/25/60" },
  suspended: { label: "Askıya Alındı",  variant: "offline" as const, color: "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/25/60" },
  trial:     { label: "Deneme",         variant: "warning" as const, color: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/25/60" },
};

/**
 * Türkçe-duyarlı, diakritik-bağımsız arama normalizasyonu.
 * "FRANSA ELİT" ile "elit" eşleşsin diye: İ/I/ı → i, ş→s, ç→c, ğ→g, ö→o, ü→u.
 * (JS toLowerCase() "İ"yi "i̇" = i + combining dot yapıp aramayı bozuyordu.)
 */
function foldTr(s: string): string {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ı/g, "i");
}

export default function CompaniesPage() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const urlFirkod    = searchParams.get("firkod");
  // Firma detay izni — admin veya 'company-detail' read varsa açılır.
  const { data: session } = useSession();
  const perms = (session?.user?.permissions ?? {}) as Record<string, string>;
  const userRole = session?.user?.role;
  const canViewCompanyDetail = userRole === "admin" || (perms["company-detail"] ?? "none") !== "none";
  const [selectedCompany, setSelectedCompany] = useState<string | null>(null);
  const [top5, setTop5] = useState<Top5Company[]>([]);
  const [top5Loading, setTop5Loading] = useState(true);
  const [selectedFirma, setSelectedFirma] = useState<FirmaCompany | null>(null);
  // Firma etiketleri
  const [firmaTags, setFirmaTags] = useState<string[]>([]);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [tagPopoverOpen, setTagPopoverOpen] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [tagBusy, setTagBusy] = useState(false);
  const [apiCompanies, setApiCompanies] = useState<FirmaCompany[]>([]);
  const [apiLoading, setApiLoading] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [listSearch, setListSearch] = useState("");
  const [listSortKey, setListSortKey] = useState<"firma" | "firkod" | "userCount" | "lisansBitis" | "status">("firma");
  const [listSortDir, setListSortDir] = useState<"asc" | "desc">("asc");

  const [tabUsers, setTabUsers] = useState<TabUser[]>([]);
  const [tabIIS, setTabIIS] = useState<TabIISSite[]>([]);
  const [tabSQL, setTabSQL] = useState<TabSQLDatabase[]>([]);
  // Erişim Bilgileri modal'ı
  const [accessLoading, setAccessLoading]   = useState(false);
  const [accessError, setAccessError]       = useState<string | null>(null);
  const [accessInfo, setAccessInfo]         = useState<AccessInfoResponse | null>(null);
  const [accessCopied, setAccessCopied]     = useState(false);
  // Web hizmetlerinin sunucudaki Config\Users.xml içeriği (kullanıcı/şifre/DB)
  const [webUsers, setWebUsers]             = useState<WebServiceUsersDto[]>([]);
  const [webUsersLoading, setWebUsersLoading] = useState(false);
  // Detay sayfası sekmesi — "access" sekmesi seçilince veri lazy yüklenir
  const [detailTab, setDetailTab]           = useState("users");
  // Erişim sekmesi: soldaki kart listesinde seçili olan blok
  // ("servers" | "users" | "databases" | web hizmetinin key'i)
  const [accessSel, setAccessSel]           = useState("servers");
  // Web hizmeti Users.xml kullanıcısı — ekleme / düzenleme dialog'u
  const [webUserDlg, setWebUserDlg] = useState<
    { siteName: string; dbOptions: string[]; mode: "add" | "edit" | "delete"; original?: string } | null
  >(null);
  const [webUserName, setWebUserName]     = useState("");
  const [webUserPw, setWebUserPw]         = useState("");
  const [webUserDbs, setWebUserDbs]       = useState<string[]>([]);
  const [webUserSaving, setWebUserSaving] = useState(false);
  // Users.xml yazma + IIS restart ilerlemesi (dialog gövdesinde gösterilir)
  const [webUserSteps, setWebUserSteps] = useState<
    { label: string; status: "pending" | "running" | "done" | "error"; error?: string }[] | null
  >(null);
  // Silme onayı
  const [webUserDelTarget, setWebUserDelTarget] = useState<{ siteName: string; username: string } | null>(null);
  // Erişim testi — "site::kullanıcı" anahtarı ile satır bazlı sonuç
  const [webUserTestBusy, setWebUserTestBusy] = useState<string | null>(null);
  const [webUserTestResult, setWebUserTestResult] = useState<Record<string, { ok: boolean; message: string }>>({});
  // Testin döndürdüğü veriyi gösteren dialog
  const [webUserTestDetail, setWebUserTestDetail] = useState<
    (WebUserTestResult & { siteName: string; username: string }) | null
  >(null);
  const [sqlRefreshing, setSqlRefreshing] = useState(false);
  const [tabServices, setTabServices] = useState<TabCompanyService[]>([]);
  const [tabLoading, setTabLoading] = useState(false);

  // SQL aksiyonları
  const [sqlActionBusy, setSqlActionBusy] = useState<string | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<TabSQLDatabase | null>(null);
  const [restorePath, setRestorePath]     = useState("");
  const [queryTarget, setQueryTarget]     = useState<TabSQLDatabase | null>(null);
  const [queryText, setQueryText]         = useState("SELECT TOP 50 * FROM sys.tables");
  const [queryRunning, setQueryRunning]   = useState(false);
  const [queryResult, setQueryResult]     = useState<{ rows: Record<string, unknown>[]; ms: number; affected: number[] } | null>(null);
  const [queryError, setQueryError]       = useState<string | null>(null);
  const [queryGlobalFilter, setQueryGlobalFilter] = useState("");
  const [queryColFilters, setQueryColFilters]     = useState<Record<string, string>>({});
  const [filterHelpOpen, setFilterHelpOpen]       = useState(false);
  const [savedQueriesOpen, setSavedQueriesOpen]   = useState(false);
  const [hoverQueryId, setHoverQueryId]           = useState<string | null>(null);
  const [hoverPos, setHoverPos]                   = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [debugOpen, setDebugOpen]                 = useState(false);
  const [debugRunning, setDebugRunning]           = useState(false);
  const [debugContent, setDebugContent]           = useState("");
  const [debugPath, setDebugPath]                 = useState("");
  const [debugBusy, setDebugBusy]                 = useState(false);
  const [debugError, setDebugError]               = useState<string | null>(null);
  const [debugFolders, setDebugFolders]           = useState<string[]>([]);
  const [debugSubfolder, setDebugSubfolder]       = useState<string>("");
  const [debugServers, setDebugServers]           = useState<{ Id: string; Name: string; IP: string }[]>([]);
  const [debugServerId, setDebugServerId]         = useState<string>("");

  // Yeni Kullanıcı dialog
  const [oldDataOpen, setOldDataOpen]             = useState(false);
  const [newUserOpen, setNewUserOpen]             = useState(false);
  const [newUserAdServers, setNewUserAdServers]   = useState<{ id: string; name: string; ip: string; dns?: string | null; domain?: string | null; rdpPort?: number | null }[]>([]);
  const [newUserRdpServers, setNewUserRdpServers] = useState<{ id: string; name: string; ip: string; dns?: string | null; domain?: string | null; rdpPort?: number | null }[]>([]);
  const [newUserRdpServerId, setNewUserRdpServerId] = useState<string>("");
  const [newUserAdLocked, setNewUserAdLocked]     = useState(false);
  const [newUserRdpLocked, setNewUserRdpLocked]   = useState(false);
  const [newUserDone, setNewUserDone]             = useState(false);
  const [newUserMsgCopied, setNewUserMsgCopied]   = useState(false);
  const [newUserAdServerId, setNewUserAdServerId] = useState<string>("");
  const [newUserUsername, setNewUserUsername]     = useState("");
  const [newUserDisplayName, setNewUserDisplayName] = useState("");
  const [newUserEmail, setNewUserEmail]           = useState("");
  const [newUserPhone, setNewUserPhone]           = useState("");
  const [newUserPassword, setNewUserPassword]     = useState("");
  const [newUserShowPw, setNewUserShowPw]         = useState(false);
  const [newUserStarted, setNewUserStarted]       = useState(false);
  const [newUserError, setNewUserError]           = useState<string | null>(null);

  // Kullanıcı aksiyonları
  const [pwResetUser, setPwResetUser]       = useState<TabUser | null>(null);
  const [pwResetValue, setPwResetValue]     = useState("");
  const [pwResetShow, setPwResetShow]       = useState(false);
  const [pwResetBusy, setPwResetBusy]       = useState(false);
  const [pwResetError, setPwResetError]     = useState<string | null>(null);
  const [pwResetDone, setPwResetDone]       = useState(false);
  const [pwResetMsgCopied, setPwResetMsgCopied] = useState(false);
  const [pwResetAdServer, setPwResetAdServer]   = useState<{ domain?: string | null } | null>(null);
  const [pwResetRdpServer, setPwResetRdpServer] = useState<{ ip: string; rdpPort?: number | null } | null>(null);
  const [toggleUser, setToggleUser]         = useState<TabUser | null>(null);
  const [toggleBusy, setToggleBusy]         = useState(false);
  const [deleteUser, setDeleteUser]         = useState<TabUser | null>(null);
  const [deleteConfirm, setDeleteConfirm]   = useState("");
  const [deleteBusy, setDeleteBusy]         = useState(false);
  const [deleteError, setDeleteError]       = useState<string | null>(null);

  async function openPwReset(usr: TabUser) {
    setPwResetUser(usr); setPwResetValue(""); setPwResetShow(false); setPwResetError(null)
    setPwResetDone(false); setPwResetMsgCopied(false)
    setPwResetAdServer(null); setPwResetRdpServer(null)
    if (!selectedFirma) return
    try {
      const r = await fetch(`/api/companies/${selectedFirma.firkod}/server-options`)
      if (!r.ok) return
      const d = await r.json() as { adServerId?: string | null; windowsServerId?: string | null;
        adServers?: { id: string; domain?: string | null }[];
        rdpServers?: { id: string; ip: string; rdpPort?: number | null }[] }
      const ad  = (d.adServers  ?? []).find((s) => s.id === d.adServerId)
      const rdp = (d.rdpServers ?? []).find((s) => s.id === d.windowsServerId) ?? (d.rdpServers ?? [])[0]
      if (ad)  setPwResetAdServer({ domain: ad.domain ?? null })
      if (rdp) setPwResetRdpServer({ ip: rdp.ip, rdpPort: rdp.rdpPort ?? null })
    } catch {}
  }

  async function submitPasswordReset() {
    if (!selectedFirma || !pwResetUser) return
    if (!meetsAdComplexity(pwResetValue)) { setPwResetError("Şifre AD karmaşıklık kuralını karşılamıyor"); return }
    setPwResetBusy(true); setPwResetError(null)
    try {
      const r = await fetch(`/api/companies/${selectedFirma.firkod}/users/action`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ username: pwResetUser.username, action: "reset-password", password: pwResetValue }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error ?? "Şifre değiştirilemedi")
      toast.success("Şifre sıfırlandı", { description: pwResetUser.username })
      setPwResetDone(true)
    } catch (err) {
      setPwResetError(err instanceof Error ? err.message : String(err))
    } finally {
      setPwResetBusy(false)
    }
  }

  async function submitDeleteUser() {
    if (!selectedFirma || !deleteUser) return
    if (deleteConfirm.trim() !== deleteUser.username) { setDeleteError("Kullanıcı adı eşleşmiyor"); return }
    setDeleteBusy(true); setDeleteError(null)
    try {
      const r = await fetch(`/api/companies/${selectedFirma.firkod}/users/action`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ username: deleteUser.username, action: "delete" }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error ?? "Silinemedi")
      toast.success("Kullanıcı silindi", { description: deleteUser.username })
      setTabUsers((prev) => prev.filter((u) => u.username !== deleteUser.username))
      setDeleteUser(null); setDeleteConfirm("")
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : String(err))
    } finally {
      setDeleteBusy(false)
    }
  }

  async function submitToggleEnabled() {
    if (!selectedFirma || !toggleUser) return
    setToggleBusy(true)
    try {
      const action = toggleUser.enabled ? "disable" : "enable"
      const r = await fetch(`/api/companies/${selectedFirma.firkod}/users/action`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ username: toggleUser.username, action }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error ?? "İşlem başarısız")
      toast.success(toggleUser.enabled ? "Hesap askıya alındı" : "Hesap aktifleştirildi", { description: toggleUser.username })
      // Agent AD verisini 5 dk cache'liyor → UI'yi hemen optimistic güncelle
      const newEnabled = !toggleUser.enabled
      setTabUsers((prev) => prev.map((u) => u.username === toggleUser.username ? { ...u, enabled: newEnabled } : u))
      setToggleUser(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setToggleBusy(false)
    }
  }

  // Yeni Hizmet dialog
  const [newSvcOpen, setNewSvcOpen]                   = useState(false);
  const [newSvcCatalog, setNewSvcCatalog]             = useState<WizardServiceDto[]>([]);
  const [newSvcLoading, setNewSvcLoading]             = useState(false);
  const [newSvcSelectedIds, setNewSvcSelectedIds]     = useState<number[]>([]);
  const [newSvcActiveCat, setNewSvcActiveCat]         = useState<string>("");
  const [newSvcAdServerId, setNewSvcAdServerId]       = useState<string>("");
  const [newSvcWindowsServerId, setNewSvcWindowsServerId] = useState<string>("");
  const [newSvcWindowsLocked, setNewSvcWindowsLocked] = useState(false);
  const [newSvcIisServers, setNewSvcIisServers]       = useState<{ id: string; name: string; ip: string; isOnline: boolean }[]>([]);
  const [newSvcIisServerId, setNewSvcIisServerId]     = useState<string>("");
  const [newSvcDepoServers, setNewSvcDepoServers]     = useState<{ id: string; name: string; ip: string; isOnline: boolean }[]>([]);
  const [newSvcDepoServerId, setNewSvcDepoServerId]   = useState<string>("");
  const [newSvcWindowsList, setNewSvcWindowsList]     = useState<{ id: string; name: string; ip: string }[]>([]);
  const [newSvcStarted, setNewSvcStarted]             = useState(false);
  const [newSvcDone, setNewSvcDone]                   = useState(false);
  const [newSvcError, setNewSvcError]                 = useState<string | null>(null);

  // Şifre üretici — connection string / XML uyumlu karakter seti.
  const generatePassword = () => generateSafePassword(10)

  async function openNewUserDialog() {
    if (!selectedFirma) return
    setNewUserOpen(true)
    setNewUserStarted(false); setNewUserError(null); setNewUserDone(false); setNewUserMsgCopied(false)
    setNewUserUsername(""); setNewUserDisplayName(""); setNewUserEmail(""); setNewUserPhone(""); setNewUserPassword(""); setNewUserShowPw(false)
    setNewUserAdServerId(""); setNewUserRdpServerId(""); setNewUserAdLocked(false); setNewUserRdpLocked(false)
    try {
      const r = await fetch(`/api/companies/${selectedFirma.firkod}/server-options`)
      const d = await r.json()
      if (!r.ok) throw new Error(d.error ?? "Sunucu seçenekleri alınamadı")
      setNewUserAdServers(d.adServers ?? [])
      setNewUserRdpServers(d.rdpServers ?? [])
      if (d.adServerId && (d.adServers ?? []).some((s: { id: string }) => s.id === d.adServerId)) {
        setNewUserAdServerId(d.adServerId); setNewUserAdLocked(true)
      } else if ((d.adServers ?? []).length === 1) {
        setNewUserAdServerId(d.adServers[0].id)
      }
      if (d.windowsServerId && (d.rdpServers ?? []).some((s: { id: string }) => s.id === d.windowsServerId)) {
        setNewUserRdpServerId(d.windowsServerId); setNewUserRdpLocked(true)
      } else if ((d.rdpServers ?? []).length === 1) {
        setNewUserRdpServerId(d.rdpServers[0].id)
      }
    } catch (err) {
      setNewUserError(err instanceof Error ? err.message : String(err))
    }
  }

  async function refreshTabUsers() {
    if (!selectedFirma) return
    try {
      const r = await fetch(`/api/companies/${selectedFirma.firkod}/users?refresh=1`, { cache: "no-store" })
      if (r.ok) {
        const d = await r.json()
        setTabUsers(Array.isArray(d) ? d : [])
      }
    } catch {}
  }

  async function refreshTabServices() {
    if (!selectedFirma) return
    try {
      const r = await fetch(`/api/companies/${selectedFirma.firkod}/services`, { cache: "no-store" })
      if (r.ok) {
        const d = await r.json()
        setTabServices(Array.isArray(d) ? d : [])
      }
    } catch {}
  }

  async function openNewSvcDialog() {
    if (!selectedFirma) return
    setNewSvcOpen(true)
    setNewSvcStarted(false); setNewSvcDone(false); setNewSvcError(null)
    setNewSvcSelectedIds([]); setNewSvcIisServerId(""); setNewSvcDepoServerId("")
    setNewSvcAdServerId(""); setNewSvcWindowsServerId(""); setNewSvcWindowsLocked(false)
    setNewSvcLoading(true)
    try {
      const [svcR, iisR, depoR, optR] = await Promise.all([
        fetch(`/api/services?onlyActive=true`).then(r => r.ok ? r.json() : []),
        fetch(`/api/setup/iis-servers`).then(r => r.ok ? r.json() : []),
        fetch(`/api/setup/depo-servers`).then(r => r.ok ? r.json() : []),
        fetch(`/api/companies/${selectedFirma.firkod}/server-options`).then(r => r.ok ? r.json() : {}) as Promise<{ adServerId?: string | null; windowsServerId?: string | null; adServers?: { id: string; name: string; ip: string }[]; rdpServers?: { id: string; name: string; ip: string }[] }>,
      ])
      const catalog: WizardServiceDto[] = Array.isArray(svcR) ? svcR : []
      setNewSvcCatalog(catalog)
      const cats = [...new Set(catalog.map((s) => s.category))]
      setNewSvcActiveCat(cats[0] ?? "")
      setNewSvcIisServers(Array.isArray(iisR) ? iisR : [])
      setNewSvcDepoServers(Array.isArray(depoR) ? depoR : [])
      const rdpServers = optR.rdpServers ?? []
      setNewSvcWindowsList(rdpServers)
      if (optR.adServerId) setNewSvcAdServerId(optR.adServerId)
      if (optR.windowsServerId && rdpServers.some((s: { id: string }) => s.id === optR.windowsServerId)) {
        setNewSvcWindowsServerId(optR.windowsServerId); setNewSvcWindowsLocked(true)
      } else if (rdpServers.length === 1) {
        setNewSvcWindowsServerId(rdpServers[0].id)
      }
    } catch (err) {
      setNewSvcError(err instanceof Error ? err.message : String(err))
    } finally {
      setNewSvcLoading(false)
    }
  }

  const newSvcSelected         = newSvcCatalog.filter((s) => newSvcSelectedIds.includes(s.id))
  const newSvcHasPusula        = newSvcSelected.some((s) => s.type === "pusula-program")
  const newSvcHasIis           = newSvcSelected.some((s) => s.type === "iis-site")
  const newSvcValid =
    newSvcSelectedIds.length > 0 &&
    !!newSvcAdServerId &&
    (!newSvcHasPusula || (!!newSvcWindowsServerId && !!newSvcDepoServerId)) &&
    (!newSvcHasIis || !!newSvcIisServerId)

  const newUserValid =
    !!newUserAdServerId &&
    !!newUserRdpServerId &&
    !!newUserUsername.trim() &&
    !!newUserPassword.trim() &&
    meetsAdComplexity(newUserPassword)

  // TODO: API hazır olunca /api/saved-queries'den çekilecek. Şimdilik mock.
  const savedQueries: { id: string; name: string; sql: string; category?: string; description?: string }[] = [
    { id: "1", name: "Tüm firmalar", category: "Firma", description: "firma tablosundaki ilk 100 kaydı firma koduna göre sıralı getirir.", sql: "SELECT TOP 100 * FROM firma ORDER BY firmaKodu" },
    { id: "2", name: "Aktif firmalar", category: "Firma", description: "IsActive = 1 olan firmaların kod, tanım ve tip bilgilerini listeler.", sql: "SELECT firmaKodu, firmaTanimi, firmaTipi FROM firma WHERE IsActive = 1" },
    { id: "3", name: "Son değişen tablolar", category: "Sistem", description: "Şema değişikliği son yapılan 20 kullanıcı tablosunu gösterir.", sql: "SELECT TOP 20 name, modify_date FROM sys.tables ORDER BY modify_date DESC" },
    { id: "4", name: "Boyut bazlı en büyük 10 tablo", category: "Sistem", description: "Satır sayısına göre en kalabalık 10 tabloyu döner. Storage planlaması için kullanışlıdır.", sql: "SELECT TOP 10 t.name, SUM(p.rows) AS rows_count\nFROM sys.tables t\nJOIN sys.partitions p ON p.object_id = t.object_id\nWHERE p.index_id IN (0,1)\nGROUP BY t.name\nORDER BY rows_count DESC" },
    { id: "5", name: "Günün siparişleri", category: "Sipariş", description: "Bugüne ait son 100 sipariş kaydını zaman azalan sıralı getirir.", sql: "SELECT TOP 100 * FROM siparis WHERE CAST(CreateDate AS DATE) = CAST(GETDATE() AS DATE) ORDER BY CreateDate DESC" },
    { id: "6", name: "Bu ay fatura toplamı", category: "Fatura", description: "İçinde bulunulan ayın toplam fatura tutarı ve adedini hesaplar.", sql: "SELECT SUM(tutar) AS toplam, COUNT(*) AS adet FROM fatura WHERE MONTH(tarih) = MONTH(GETDATE()) AND YEAR(tarih) = YEAR(GETDATE())" },
  ]

  function loadSavedQuery(sql: string) {
    setQueryText(sql)
    setSavedQueriesOpen(false)
  }

  async function loadDebugFolders(serverId?: string) {
    if (!selectedFirma) return
    setDebugBusy(true); setDebugError(null); setDebugFolders([]); setDebugSubfolder("")
    try {
      const qs = serverId ? `?folders=1&serverId=${encodeURIComponent(serverId)}` : `?folders=1`
      const r = await fetch(`/api/companies/${selectedFirma.firkod}/debug${qs}`)
      const d = await r.json()
      if (r.status === 404 && d.needServer) {
        const sr = await fetch(`/api/companies/${selectedFirma.firkod}/debug?servers=1`)
        const sd = await sr.json()
        setDebugServers(sd.servers ?? [])
        setDebugError("Bu firmaya Windows sunucusu tanımlı değil. Lütfen bir sunucu seçin.")
        return
      }
      if (!r.ok) throw new Error(d.error ?? "Klasörler listelenemedi")
      if (d.missing) { setDebugError(`C:\\MUSTERI\\${selectedFirma.firkod} bulunamadı — firma kurulumu yapılmamış olabilir.`); return }
      const folders: string[] = d.folders ?? []
      setDebugFolders(folders)
      if (folders.length === 1) setDebugSubfolder(folders[0])
    } catch (err) {
      setDebugError(err instanceof Error ? err.message : String(err))
    } finally {
      setDebugBusy(false)
    }
  }

  async function debugOpenDialog() {
    if (!selectedFirma) return
    setDebugOpen(true)
    setDebugContent(""); setDebugRunning(false); setDebugServers([]); setDebugServerId("")
    await loadDebugFolders()
  }

  async function debugStart() {
    if (!selectedFirma || !debugSubfolder) return
    setDebugBusy(true); setDebugError(null)
    try {
      const r = await fetch(`/api/companies/${selectedFirma.firkod}/debug`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start", subfolder: debugSubfolder, serverId: debugServerId || undefined }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error ?? "Debug başlatılamadı")
      setDebugPath(d.path ?? "")
      setDebugRunning(true); setDebugContent("")
    } catch (err) {
      setDebugError(err instanceof Error ? err.message : String(err))
    } finally {
      setDebugBusy(false)
    }
  }

  async function debugStop() {
    if (!selectedFirma || !debugSubfolder) return
    setDebugBusy(true)
    try {
      await fetch(`/api/companies/${selectedFirma.firkod}/debug`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "stop", subfolder: debugSubfolder, serverId: debugServerId || undefined }),
      })
    } catch {}
    setDebugRunning(false)
    setDebugBusy(false)
  }

  async function debugFetch() {
    if (!selectedFirma || !debugSubfolder) return
    try {
      const sidQs = debugServerId ? `&serverId=${encodeURIComponent(debugServerId)}` : ""
      const r = await fetch(`/api/companies/${selectedFirma.firkod}/debug?subfolder=${encodeURIComponent(debugSubfolder)}${sidQs}`)
      const d = await r.json()
      if (!r.ok) { setDebugError(d.error ?? "Okunamadı"); return }
      setDebugContent(d.content ?? "")
      setDebugError(null)
    } catch (err) {
      setDebugError(err instanceof Error ? err.message : String(err))
    }
  }

  useEffect(() => {
    if (!debugOpen || !debugRunning) return
    debugFetch()
    const t = setInterval(debugFetch, 5000)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debugOpen, debugRunning, debugSubfolder, selectedFirma?.firkod])

  /* Akıllı filtre değerlendiricisi:
     - "is:null" / "not:null" / "!null"
     - >N, <N, >=N, <=N, =N  (sayısal karşılaştırma)
     - "a..b"               (sayısal ya da lexicografik aralık)
     - "\"x\""              (tam eşleşme, case-insensitive)
     - "!x"                 (içermez)
     - diğer                (contains, case-insensitive) */
  function matchCell(value: unknown, filterRaw: string): boolean {
    const f = filterRaw.trim()
    if (!f) return true
    const isNull = value === null || value === undefined
    const lf = f.toLowerCase()
    if (lf === "is:null" || lf === "null") return isNull
    if (lf === "not:null" || lf === "!null") return !isNull
    const s = isNull ? "" : String(value)
    const sl = s.toLowerCase()

    // Sayısal karşılaştırma
    const cmp = f.match(/^(>=|<=|>|<|=)\s*(-?\d+(\.\d+)?)$/)
    if (cmp) {
      const n = Number(s); const t = Number(cmp[2])
      if (Number.isNaN(n)) return false
      switch (cmp[1]) { case ">": return n > t; case "<": return n < t; case ">=": return n >= t; case "<=": return n <= t; case "=": return n === t }
    }
    // Aralık
    const range = f.match(/^(.+?)\.\.(.+)$/)
    if (range) {
      const a = range[1].trim(); const b = range[2].trim()
      const na = Number(a); const nb = Number(b); const nv = Number(s)
      if (!Number.isNaN(na) && !Number.isNaN(nb) && !Number.isNaN(nv)) return nv >= na && nv <= nb
      return sl >= a.toLowerCase() && sl <= b.toLowerCase()
    }
    // Tam eşleşme
    const exact = f.match(/^"(.*)"$/)
    if (exact) return sl === exact[1].toLowerCase()
    // Negatif contains
    if (f.startsWith("!")) return !sl.includes(f.slice(1).toLowerCase())
    // Varsayılan: contains
    return sl.includes(lf)
  }

  /**
   * Firma listesini Excel'e aktar.
   *
   * EKRANDA NE VARSA O aktarılır: arama/filtre uygulanmış ve seçili sıraya
   * göre dizilmiş liste (`listSorted`). "Gördüğüm tablo ile dosya farklı"
   * şaşkınlığı olmasın diye tüm firmalar değil.
   */
  async function exportCompanyList() {
    if (!listSorted.length) return
    const XLSX = await import("xlsx")

    const header = ["Firma", "Firma Kodu", "E-posta", "Telefon", "Kullanıcı", "Lisans Bitiş", "Durum"]
    const rows = listSorted.map((c) => [
      c.firma,
      c.firkod,
      c.email || "",
      c.phone || "",
      c.userCount,
      c.lisansBitis || "",
      firmaIsActive(c) ? "Aktif" : "Süresi Doldu",
    ])

    const ws = XLSX.utils.aoa_to_sheet([header, ...rows])
    ws["!cols"] = header.map((h, i) => ({
      wch: Math.min(50, Math.max(h.length, ...rows.map((r) => String(r[i] ?? "").length))) + 2,
    }))
    ws["!freeze"] = { xSplit: 0, ySplit: 1 } as unknown as undefined

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Firmalar")
    const ts = new Date().toISOString().slice(0, 10)
    XLSX.writeFile(wb, `firmalar_${ts}.xlsx`)
    toast.success("Excel indirildi", { description: `${rows.length} firma` })
  }

  async function exportQueryResult(format: "xlsx" | "txt" | "pdf") {
    if (!queryResult?.rows.length) return
    const rows = filteredQueryRows.length ? filteredQueryRows : queryResult.rows
    const cols = Object.keys(queryResult.rows[0])
    const dbName = queryTarget?.Name ?? "sorgu"
    const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")
    const fname = `${dbName}_${ts}`
    const cellStr = (v: unknown) => (v === null || v === undefined ? "" : String(v))

    if (format === "xlsx") {
      const XLSX = await import("xlsx")
      const data: unknown[][] = [cols, ...rows.map((r) => cols.map((c) => {
        const v = r[c]
        if (v === null || v === undefined) return ""
        if (typeof v === "number" || typeof v === "boolean") return v
        if (v instanceof Date) return v
        const s = String(v)
        // ISO tarih ise Date'e çevir — Excel'de tarih hücresi olur
        if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(s)) {
          const d = new Date(s)
          if (!isNaN(d.getTime())) return d
        }
        return s
      }))]
      const ws = XLSX.utils.aoa_to_sheet(data)
      // Sütun genişliklerini içerik uzunluğuna göre ayarla (max 60)
      ws["!cols"] = cols.map((c, i) => ({
        wch: Math.min(60, Math.max(c.length, ...rows.map((r) => cellStr(r[c]).length))) + 2,
      }))
      // Header satırını dondur + bold
      ws["!freeze"] = { xSplit: 0, ySplit: 1 } as unknown as undefined
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, "Sonuc")
      XLSX.writeFile(wb, `${fname}.xlsx`)
      return
    }

    if (format === "txt") {
      // TAB ayraçlı: her satır tek satırda kalsın; newline/tab karakterleri temizlenir.
      const clean = (s: string) => s.replace(/[\r\n\t]+/g, " ")
      const body = [
        cols.join("\t"),
        ...rows.map((r) => cols.map((c) => clean(cellStr(r[c]))).join("\t")),
      ].join("\r\n")
      const blob = new Blob(["\uFEFF" + body], { type: "text/plain;charset=utf-8" })
      triggerDownload(blob, `${fname}.txt`)
      return
    }

    if (format === "pdf") {
      const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(fname)}</title>
<style>
body{font-family:system-ui,-apple-system,sans-serif;margin:16px;color:#111}
h1{font-size:14px;margin:0 0 8px}
.meta{font-size:10px;color:#666;margin-bottom:12px}
table{border-collapse:collapse;width:100%;font-size:10px;font-family:Consolas,monospace}
th,td{border:1px solid #ccc;padding:4px 6px;text-align:left;vertical-align:top;white-space:nowrap}
th{background:#f3f3f3}
tr:nth-child(even) td{background:#fafafa}
@media print{@page{size:A4 landscape;margin:10mm}}
</style></head><body>
<h1>${esc(dbName)} — Sorgu Sonucu</h1>
<div class="meta">${rows.length} satır • ${new Date().toLocaleString("tr-TR")}</div>
<table><thead><tr>${cols.map((c) => `<th>${esc(c)}</th>`).join("")}</tr></thead>
<tbody>${rows.map((r) => `<tr>${cols.map((c) => `<td>${esc(cellStr(r[c]))}</td>`).join("")}</tr>`).join("")}</tbody></table>
<script>window.onload=()=>setTimeout(()=>window.print(),200)</script>
</body></html>`
      const w = window.open("", "_blank", "width=1000,height=700")
      if (w) { w.document.write(html); w.document.close() }
      return
    }
  }

  function triggerDownload(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url; a.download = filename
    document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const filteredQueryRows = useMemo(() => {
    if (!queryResult) return [] as Record<string, unknown>[]
    const rows = queryResult.rows
    const g = queryGlobalFilter.trim().toLowerCase()
    const activeCols = Object.entries(queryColFilters).filter(([, v]) => v.trim() !== "")
    if (!g && !activeCols.length) return rows
    return rows.filter((r) => {
      if (g) {
        const any = Object.values(r).some((v) => (v === null || v === undefined ? "" : String(v)).toLowerCase().includes(g))
        if (!any) return false
      }
      for (const [k, v] of activeCols) {
        if (!matchCell(r[k], v)) return false
      }
      return true
    })
  }, [queryResult, queryGlobalFilter, queryColFilters]);

  const [companyDetail, setCompanyDetail] = useState<CompanyDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    fetch("/api/firma/companies")
      .then((r) => r.ok ? r.json() : Promise.reject(r))
      .then((data: FirmaCompany[]) => setApiCompanies(data))
      .catch(() => setApiCompanies([]))
      .finally(() => setApiLoading(false))
  }, [])

  useEffect(() => {
    fetch("/api/companies/top5")
      .then((r) => r.ok ? r.json() : Promise.reject(r))
      .then((data: Top5Company[]) => setTop5(Array.isArray(data) ? data : []))
      .catch(() => setTop5([]))
      .finally(() => setTop5Loading(false))
  }, [])

  useEffect(() => {
    if (!selectedFirma) return
    // company-detail yetkisi olmayan kullanıcılar için detay tablarını fetch etme —
    // hepsi 403 döner ve gereksiz yük olur. Bu kullanıcılar firmaya tıklayınca
    // doğrudan Erişim Bilgileri modal'ı açılır (selectFirma içinde).
    if (!canViewCompanyDetail) return
    const firkod = selectedFirma.firkod
    setTabUsers([]); setTabIIS([]); setTabSQL([]); setTabServices([])
    // Firma değişti — Erişim sekmesi verisi bayat, sekmeyi de başa al.
    setDetailTab("users"); setAccessInfo(null); setAccessError(null); setWebUsers([])
    setAccessSel("servers")
    setCompanyDetail(null)
    setTabLoading(true)
    setDetailLoading(true)
    Promise.all([
      fetch(`/api/companies/${firkod}/users`).then(r => r.ok ? r.json() : []),
      fetch(`/api/companies/${firkod}/iis`).then(r => r.ok ? r.json() : []),
      fetch(`/api/companies/${firkod}/sql`).then(r => r.ok ? r.json() : []),
      fetch(`/api/companies/${firkod}/detail`).then(r => r.ok ? r.json() : null),
      fetch(`/api/companies/${firkod}/services`).then(r => r.ok ? r.json() : []),
    ]).then(([users, iis, sql, detail, services]) => {
      setTabUsers(Array.isArray(users) ? users : [])
      setTabIIS(Array.isArray(iis) ? iis : [])
      setTabSQL(Array.isArray(sql) ? sql : [])
      setTabServices(Array.isArray(services) ? services : [])
      if (detail && !detail.error) setCompanyDetail(detail)
    }).catch(() => {}).finally(() => { setTabLoading(false); setDetailLoading(false) })
  }, [selectedFirma?.firkod])

  // Firma etiketlerini yükle
  useEffect(() => {
    if (!selectedFirma || !canViewCompanyDetail) { setFirmaTags([]); return }
    let alive = true
    fetch(`/api/companies/${selectedFirma.firkod}/tags`)
      .then(r => r.ok ? r.json() : { tags: [], allTags: [] })
      .then((d: { tags?: string[]; allTags?: string[] }) => {
        if (!alive) return
        setFirmaTags(Array.isArray(d.tags) ? d.tags : [])
        setAllTags(Array.isArray(d.allTags) ? d.allTags : [])
      })
      .catch(() => { if (alive) setFirmaTags([]) })
    return () => { alive = false }
  }, [selectedFirma?.firkod, canViewCompanyDetail])

  async function addTag(raw: string) {
    if (!selectedFirma) return
    const tag = raw.trim()
    if (!tag) return
    if (firmaTags.some(t => t.toLowerCase() === tag.toLowerCase())) { setTagInput(""); return }
    setTagBusy(true)
    try {
      const r = await fetch(`/api/companies/${selectedFirma.firkod}/tags`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tag }),
      })
      if (!r.ok) { toast.error("Etiket eklenemedi"); return }
      const d = await r.json() as { tag: string }
      setFirmaTags(prev => [...prev, d.tag].sort((a, b) => a.localeCompare(b, "tr")))
      setAllTags(prev => prev.includes(d.tag) ? prev : [...prev, d.tag].sort((a, b) => a.localeCompare(b, "tr")))
      setTagInput("")
    } catch {
      toast.error("Etiket eklenemedi")
    } finally {
      setTagBusy(false)
    }
  }

  async function removeTag(tag: string) {
    if (!selectedFirma) return
    setFirmaTags(prev => prev.filter(t => t !== tag)) // optimistic
    try {
      await fetch(`/api/companies/${selectedFirma.firkod}/tags?tag=${encodeURIComponent(tag)}`, { method: "DELETE" })
    } catch {
      toast.error("Etiket silinemedi")
    }
  }

  function selectFirma(f: FirmaCompany) {
    // company-detail yetkisi olmayan (rol: kullanıcı) firmayı seçemez: erişim
    // bilgileri artık yalnız detay sayfasındaki "Erişim" sekmesinde.
    if (!canViewCompanyDetail) return
    setSelectedFirma(f)
    setSearchOpen(false)
    setSearchQuery("")
    router.replace(`/companies?firkod=${encodeURIComponent(f.firkod)}`, { scroll: false })
  }

  // URL'deki firkod → firma otomatik seçimi (F5 / direkt link)
  // NOT: selectedFirma dependency'DEN ÇIKARILDI. Aksi halde "Geri"de
  // setSelectedFirma(null) yapıldığında, router.replace URL'i güncellemeden
  // önce effect eski urlFirkod ile tekrar çalışıp firmayı geri seçiyordu
  // (2 tık gerektiren bug). Functional update ile zaten seçiliyse tekrar set
  // edilmez; URL temizlenince (urlFirkod=null) effect erken döner.
  useEffect(() => {
    if (!urlFirkod) return
    if (!apiCompanies.length) return
    if (!canViewCompanyDetail) {
      // URL ile direkt detay açmaya çalışıyor — engelle, URL'i temizle
      router.replace("/companies", { scroll: false })
      return
    }
    const match = apiCompanies.find((c) => c.firkod === urlFirkod)
    if (match) setSelectedFirma((prev) => (prev?.firkod === urlFirkod ? prev : match))
  }, [urlFirkod, apiCompanies, canViewCompanyDetail, router])

  async function sqlBackup(db: TabSQLDatabase) {
    if (!selectedFirma) return
    setSqlActionBusy(db.Id)
    const id = toast.loading("Yedek alınıyor…", { description: db.Name })
    try {
      const r = await fetch(`/api/companies/${selectedFirma.firkod}/sql/backup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ server: db.Server, dbName: db.Name }),
      })
      const data = await r.json()
      if (!r.ok) {
        toast.error("Yedek alınamadı", { id, description: data?.error ?? "" })
        return
      }
      toast.success("Yedek alındı", { id, description: data.path })
    } catch (e) {
      toast.error("Yedek alınamadı", { id, description: e instanceof Error ? e.message : "Bağlantı hatası" })
    } finally {
      setSqlActionBusy(null)
    }
  }

  function openRestore(db: TabSQLDatabase) {
    setRestorePath("")
    setRestoreTarget(db)
  }

  async function runRestore() {
    if (!selectedFirma || !restoreTarget || !restorePath.trim()) return
    const db = restoreTarget
    setRestoreTarget(null)
    setSqlActionBusy(db.Id)
    const id = toast.loading("Geri yükleniyor…", { description: db.Name })
    try {
      const r = await fetch(`/api/companies/${selectedFirma.firkod}/sql/restore`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ server: db.Server, dbName: db.Name, backupPath: restorePath.trim() }),
      })
      const data = await r.json()
      if (!r.ok) { toast.error("Geri yükleme başarısız", { id, description: data?.error ?? "" }); return }
      toast.success("Geri yükleme tamamlandı", { id, description: db.Name })
    } catch (e) {
      toast.error("Geri yükleme başarısız", { id, description: e instanceof Error ? e.message : "Bağlantı hatası" })
    } finally {
      setSqlActionBusy(null)
    }
  }

  function openQuery(db: TabSQLDatabase) {
    setQueryResult(null)
    setQueryError(null)
    setQueryGlobalFilter("")
    setQueryColFilters({})
    setQueryTarget(db)
  }

  async function runQuery() {
    if (!selectedFirma || !queryTarget || !queryText.trim()) return
    setQueryRunning(true)
    setQueryError(null)
    setQueryResult(null)
    setQueryGlobalFilter("")
    setQueryColFilters({})
    try {
      const r = await fetch(`/api/companies/${selectedFirma.firkod}/sql/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ server: queryTarget.Server, dbName: queryTarget.Name, sql: queryText }),
      })
      const data = await r.json()
      if (!r.ok) { setQueryError(data?.error ?? "Bilinmeyen hata"); return }
      setQueryResult({ rows: data.recordset ?? [], ms: data.durationMs ?? 0, affected: data.rowsAffected ?? [] })
    } catch (e) {
      setQueryError(e instanceof Error ? e.message : "Bağlantı hatası")
    } finally {
      setQueryRunning(false)
    }
  }

  function clearSelection() {
    setSelectedFirma(null)
    setCompanyDetail(null)
    setTabUsers([]); setTabIIS([]); setTabSQL([]); setTabServices([])
    router.replace(`/companies`, { scroll: false })
  }

  /**
   * Web hizmetlerinin sunucudaki `Config\Users.xml` içeriğini çeker.
   *
   * Agent'a gidiyor (yavaş olabilir) — bu yüzden modal'ın geri kalanını
   * bekletmeden AYRI yükleniyor, hata durumunda modal çalışmaya devam eder.
   */
  async function loadWebUsers(firkod: string) {
    setWebUsers([])
    setWebUsersLoading(true)
    try {
      const r = await fetch(`/api/companies/${encodeURIComponent(firkod)}/web-users`)
      const d = await r.json()
      setWebUsers(r.ok && Array.isArray(d) ? d : [])
    } catch {
      setWebUsers([])
    } finally {
      setWebUsersLoading(false)
    }
  }

  /**
   * "Kullanıcı Ekle" dialog'unu aç.
   *
   * DB seçenekleri FİRMANIN veritabanlarıdır (Veritabanları sekmesi) — hizmetin
   * Users.xml <DB> listesi değil: o liste dosya en son yazıldığı andaki
   * durumu yansıtıyor, sonradan eklenen veritabanları orada görünmüyor.
   * Users.xml boş/eksikse bile firma DB'lerinden seçilebilsin.
   * Hepsi varsayılan işaretli — pratikte kullanıcı tüm firma DB'lerine erişiyor.
   */
  function openWebUserDialog(siteName: string, xmlDbs: string[]) {
    const firmaDbs = tabSQL.map((d) => d.Name)
    const opts = firmaDbs.length > 0 ? firmaDbs : xmlDbs
    setWebUserDlg({ siteName, dbOptions: opts, mode: "add" })
    setWebUserName("")
    setWebUserPw(generateSafePassword())
    setWebUserDbs(opts)
    setWebUserSteps(null)
  }

  /** Mevcut Users.xml kullanıcısını düzenlemek için dialog'u aç. */
  function editWebUserDialog(
    siteName: string,
    xmlDbs: string[],
    user: { username: string; password: string; dbs: string[] },
  ) {
    const firmaDbs = tabSQL.map((d) => d.Name)
    const base = firmaDbs.length > 0 ? firmaDbs : xmlDbs
    // Kullanıcıda firma listesinde olmayan bir DB varsa onu da seçenek olarak göster
    const opts = [...new Set([...base, ...user.dbs])]
    setWebUserDlg({ siteName, dbOptions: opts, mode: "edit", original: user.username })
    setWebUserName(user.username)
    setWebUserPw(user.password)
    setWebUserDbs(user.dbs)
    setWebUserSteps(null)
  }

  /**
   * Users.xml yazma işlemi + ardından IIS sitesinin yeniden başlatılması.
   *
   * Restart ŞART: uygulama Users.xml'i açılışta okuyor, dosyayı değiştirmek
   * tek başına yeni kullanıcıyı geçerli kılmıyor. İki adım ayrı isteklerle
   * yürütülüyor ki kullanıcı ilerlemeyi görebilsin ve restart patlarsa
   * "dosya yazıldı ama restart olmadı" ayrımı net olsun.
   */
  async function runWebUserOp(
    op: {
      method: "POST" | "PUT" | "DELETE"
      body: Record<string, unknown>
      siteName: string
      okMsg: string
      /** Ekleme/düzenlemede son adım: kimlik bilgileriyle gerçekten giriş denenir */
      verify?: { username: string; password: string; database: string }
    },
  ) {
    if (!selectedFirma) return
    const firkod = selectedFirma.firkod
    const steps: { label: string; status: "pending" | "running" | "done" | "error"; error?: string }[] = [
      { label: "Users.xml güncelleniyor", status: "running" },
      { label: `IIS sitesi yeniden başlatılıyor (${op.siteName})`, status: "pending" },
      ...(op.verify ? [{ label: "Erişim test ediliyor", status: "pending" as const }] : []),
    ]
    setWebUserSteps([...steps])
    setWebUserSaving(true)

    const fail = (i: number, msg: string) => {
      steps[i] = { ...steps[i], status: "error", error: msg }
      setWebUserSteps([...steps])
      toast.error(msg)
    }

    try {
      const r = await fetch(`/api/companies/${encodeURIComponent(firkod)}/web-users`, {
        method:  op.method,
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(op.body),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { fail(0, d?.error ?? "İşlem başarısız"); return }
      steps[0] = { ...steps[0], status: "done" }
      steps[1] = { ...steps[1], status: "running" }
      setWebUserSteps([...steps])

      const rr = await fetch(`/api/companies/${encodeURIComponent(firkod)}/web-users/restart`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ siteName: op.siteName }),
      })
      const dd = await rr.json().catch(() => ({}))
      if (!rr.ok) {
        // Dosya yazıldı — kullanıcı bunu bilmeli, işlem yarım değil.
        fail(1, dd?.error ?? "Site yeniden başlatılamadı")
        return
      }
      steps[1] = { ...steps[1], status: "done" }
      setWebUserSteps([...steps])

      if (op.verify) {
        steps[2] = { ...steps[2], status: "running" }
        setWebUserSteps([...steps])
        const tr = await fetch(`/api/companies/${encodeURIComponent(firkod)}/web-users/test`, {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ siteName: op.siteName, ...op.verify }),
        })
        const td = await tr.json().catch(() => ({}))
        if (!tr.ok || !td?.ok) {
          // Kayıt yazıldı ve site restart oldu — sadece giriş doğrulanamadı
          fail(2, td?.error ?? td?.message ?? "Giriş doğrulanamadı")
          return
        }
        steps[2] = { ...steps[2], status: "done", error: undefined }
        setWebUserSteps([...steps])
      }

      toast.success(op.okMsg, { description: op.siteName })
    } catch (err) {
      const msg = err instanceof Error ? err.message : "İşlem başarısız"
      const at = steps.findIndex((s) => s.status === "running")
      fail(at >= 0 ? at : 0, msg)
    } finally {
      setWebUserSaving(false)
      // Sunucudaki dosya değişmiş olabilir — listeyi her durumda tazele
      await loadWebUsers(firkod)
    }
  }

  async function saveWebUser() {
    if (!webUserDlg || !selectedFirma) return
    const username = webUserName.trim()
    if (!username || !webUserPw) {
      toast.error("Kullanıcı adı ve şifre zorunludur")
      return
    }
    const edit = webUserDlg.mode === "edit"
    await runWebUserOp({
      method:   edit ? "PUT" : "POST",
      siteName: webUserDlg.siteName,
      okMsg:    edit ? "Kullanıcı güncellendi" : "Kullanıcı eklendi",
      // Kayıt + restart sonrası kimlik bilgileriyle gerçekten giriş yapılabiliyor mu
      verify:   { username, password: webUserPw, database: webUserDbs[0] ?? "" },
      body: edit
        ? {
            siteName:    webUserDlg.siteName,
            username:    webUserDlg.original,
            newUsername: username,
            password:    webUserPw,
            dbs:         webUserDbs,
          }
        : { siteName: webUserDlg.siteName, username, password: webUserPw, dbs: webUserDbs },
    })
  }

  /**
   * Kullanıcının hizmete gerçekten giriş yapabildiğini dışarıdan dener —
   * servisin login ucuna istek atar. Users.xml'de kayıt olması yeterli değil:
   * site restart edilmediyse veya DB adı yanlışsa giriş yine reddedilir.
   */
  async function testWebUser(
    siteName: string,
    u: { username: string; password: string; dbs: string[] },
    via: "lan" | "wan" = "lan",
  ) {
    if (!selectedFirma) return
    const key = `${siteName}::${u.username}`
    setWebUserTestBusy(key)
    setWebUserTestResult((prev) => { const n = { ...prev }; delete n[key]; return n })
    try {
      const r = await fetch(`/api/companies/${encodeURIComponent(selectedFirma.firkod)}/web-users/test`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          siteName,
          username: u.username,
          password: u.password,
          database: u.dbs[0] ?? "",
          via,
        }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d?.error ?? "Test yapılamadı")

      const ok = !!d.ok
      setWebUserTestResult((prev) => ({ ...prev, [key]: { ok, message: d.message ?? "" } }))
      // Servisten dönen veriyi (erişilebilen DB'ler + ham yanıt) göster
      setWebUserTestDetail({ ...(d as WebUserTestResult), siteName, username: u.username })
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Test yapılamadı"
      setWebUserTestResult((prev) => ({ ...prev, [key]: { ok: false, message: msg } }))
      toast.error(msg)
    } finally {
      setWebUserTestBusy(null)
    }
  }

  async function deleteWebUser() {
    const t = webUserDelTarget
    if (!t) return
    setWebUserDelTarget(null)
    // Silmenin ilerlemesi de aynı dialog gövdesinde gösterilir
    setWebUserDlg({ siteName: t.siteName, dbOptions: [], mode: "delete", original: t.username })
    await runWebUserOp({
      method:   "DELETE",
      siteName: t.siteName,
      okMsg:    "Kullanıcı silindi",
      body:     { siteName: t.siteName, username: t.username },
    })
  }

  /**
   * Detay sayfasındaki "Erişim" sekmesinin verisi: access-info (sunucular +
   * şifreler) + web hizmetlerinin Users.xml'i. Sekmeye ilk geçişte bir kez
   * çalışır; zaten yüklüyse tekrar istek atmaz.
   */
  async function loadAccessTab(firkod: string) {
    if (accessLoading) return
    if (accessInfo?.firmaId === firkod) return
    setAccessError(null)
    setAccessLoading(true)
    setAccessInfo(null)
    void loadWebUsers(firkod)
    try {
      const r = await fetch(`/api/companies/${encodeURIComponent(firkod)}/access-info`)
      const d = await r.json()
      if (!r.ok) throw new Error(d?.error ?? "Erişim bilgileri alınamadı")
      setAccessInfo(d as AccessInfoResponse)
    } catch (err) {
      setAccessError(err instanceof Error ? err.message : "İstek başarısız")
    } finally {
      setAccessLoading(false)
    }
  }

  // Username'in firma prefix'inden sonraki kısa kısmını döner.
  // "2507.vefa1" → "vefa1"  ·  "vefa1" → "vefa1"
  function shortUsername(firkod: string, fullUsername: string): string {
    const prefix = `${firkod}.`
    return fullUsername.startsWith(prefix) ? fullUsername.slice(prefix.length) : fullUsername
  }

  /**
   * "Hizmetler" sekmesinin listesi — sihirbaz atamaları (`tabServices`) +
   * atama kaydı OLMAYAN IIS siteleri (`tabIIS`).
   *
   * Neden: sihirbazdan önce elle kurulmuş siteler `wizard_port_assignments`'ta
   * yok (örn. 4646_RESIM). Bunlar eskiden ayrı "IIS Siteler" sekmesinde
   * görünüyordu; o sekme kaldırılınca firmanın hizmet listesinden tamamen
   * düştüler. Atamasız siteler `assigned: false` ile işaretlenir — sihirbaz
   * kaydı olmadığı için "Hizmeti Kaldır" gibi atama işlemleri onlara uygulanmaz.
   */
  function collectServices(): (TabCompanyService & { assigned: boolean })[] {
    const out: (TabCompanyService & { assigned: boolean })[] = []
    const seen = new Set<string>()

    tabServices.forEach((svc) => {
      seen.add((svc.siteName || svc.name).trim().toLowerCase())
      out.push({ ...svc, assigned: true })
    })

    tabIIS.forEach((s) => {
      if (seen.has(s.Name.trim().toLowerCase())) return
      const port = (s.Binding || "").match(/:(\d+)/)?.[1]
      out.push({
        id:         -1 * (out.length + 1),   // sentetik: atama kaydı yok
        name:       s.Name,
        category:   "",
        type:       "iis-site",
        port:       port ? Number(port) : null,
        siteName:   s.Name,
        server:     s.Server,
        status:     s.Status,
        appPool:    s.AppPool,
        assignedAt: "",
        assigned:   false,
      })
    })

    return out.sort((a, b) => a.name.localeCompare(b.name))
  }

  /**
   * Erişim modal'ındaki "Web Hizmetleri" listesi.
   *
   * Sadece `tabIIS`'e bakmak eksikti: firmaya atanmış hizmetler (Hizmetler
   * sekmesi — Pusula MOBIL/RFID gibi) IIS sekmesinde görünmeyebiliyor
   * (site farklı sunucuda ya da IIS taraması firmayla eşleşmemiş olabilir),
   * bu yüzden müşteriye giden listede eksik kalıyorlardı. İki kaynağı site
   * adına göre birleştiriyoruz.
   */
  function collectWebServices(): { key: string; name: string; url: string }[] {
    const iisHost = accessInfo?.iis?.dns?.trim() || ""
    const out: { key: string; name: string; url: string }[] = []
    const seen = new Set<string>()

    const mkUrl = (host: string, port: string | number | null | undefined) =>
      host && port ? `http://${host}:${port}` : (port ? `Port: ${port}` : "—")

    tabIIS.forEach((s) => {
      // Binding iki formatta gelebilir: "http://*:26001" veya "*:26001:host"
      const port = (s.Binding || "").match(/:(\d+)/)?.[1]
      const host = iisHost || s.ServerIP || ""
      seen.add(s.Name.trim().toLowerCase())
      out.push({ key: `iis-${s.Id}`, name: s.Name, url: mkUrl(host, port) })
    })

    tabServices.forEach((svc) => {
      // Port'u da site adı da olmayan kayıt web'den erişilebilir değil — atla.
      if (!svc.port && !svc.siteName) return
      const siteKey = (svc.siteName || svc.name).trim().toLowerCase()
      if (seen.has(siteKey)) return
      seen.add(siteKey)
      out.push({
        key: `svc-${svc.id}`,
        name: svc.siteName || svc.name,
        url: mkUrl(iisHost, svc.port),
      })
    })

    return out
  }

  // Modal'daki bilgileri tek metin halinde derle — sihirbazdaki (step-run.tsx)
  // "customerMessage" ile BİREBİR aynı müşteri mesajı formatı.
  function buildAccessText(): string {
    if (!accessInfo || !selectedFirma) return ""
    const firkod = selectedFirma.firkod
    const domainShort = (accessInfo.ad?.domain ?? "").split(".")[0]?.trim() ?? ""
    const rdpHost = accessInfo.windows?.dns?.trim() || accessInfo.windows?.name || ""
    const rdpTarget = `${rdpHost}${accessInfo.windows?.rdpPort ? `:${accessInfo.windows.rdpPort}` : ""}`
    const credentials = accessInfo.credentials ?? {}
    const webServices = collectWebServices()

    const lines: string[] = [
      "Merhaba,",
      "",
      "Sunucu erişim bilgileriniz aşağıdadır.",
      "Öncesinde Forticlient uygulaması ile VPN bağlantısını sağlamanız gerekiyor.",
      "",
    ]

    tabUsers.forEach((u, i) => {
      // AD'den gelen username zaten "2507.vefa1" formatında
      const vpnUser = u.username
      const fullUser = domainShort ? `${domainShort}\\${vpnUser}` : vpnUser
      const pw = credentials[u.username] ?? ""

      lines.push("VPN Bilgileri:")
      lines.push(`Kullanıcı Adı: ${vpnUser}`)
      lines.push(`Şifre: ${pw}`)
      lines.push("")
      lines.push("RDP Bilgileri:")
      lines.push(`Sunucu: ${rdpTarget}`)
      lines.push(`Kullanıcı Adı: ${fullUser}`)
      lines.push(`Şifre: ${pw}`)
      lines.push("")

      // API / Web uygulama kimlik bilgileri — Users.xml ile uyumlu ({firmaId}_{kısa})
      if (webServices.length > 0) {
        const apiUser = `${firkod}_${shortUsername(firkod, u.username)}`
        lines.push("API / Web Uygulama Bilgileri:")
        lines.push(`Kullanıcı Adı: ${apiUser}`)
        lines.push(`Şifre: ${pw}`)
        lines.push("")
      }

      if (i < tabUsers.length - 1) {
        lines.push("—")
        lines.push("")
      }
    })

    // Web hizmet URL'leri — IIS siteleri + firmaya atanmış hizmetler
    if (webServices.length > 0) {
      lines.push("Web Hizmetleri:")
      webServices.forEach((s) => lines.push(`${s.name}: ${s.url === "—" ? "" : s.url}`))
      lines.push("")
    }

    // SQL Veritabanı — login yalnız 1. kullanıcı için oluşturulur (tek blok)
    if (tabSQL.length > 0 && tabUsers[0]) {
      const firstUser = tabUsers[0]
      const sqlIp = tabSQL[0]?.ServerIP || ""
      const sqlLogin = `${firkod}_${shortUsername(firkod, firstUser.username)}`
      const sqlPw = credentials[firstUser.username] ?? ""
      lines.push("SQL Veritabanı Bilgileri:")
      if (sqlIp) lines.push(`Sunucu: ${sqlIp}`)
      lines.push(`Kullanıcı Adı: ${sqlLogin}`)
      if (sqlPw) lines.push(`Şifre: ${sqlPw}`)
      lines.push("Veritabanları:")
      tabSQL.forEach((d) => lines.push(`  • ${d.Name}`))
      lines.push("")
    }

    lines.push("İyi çalışmalar.")

    return lines.join("\n")
  }

  async function handleCopyAccessText() {
    const text = buildAccessText()
    if (!text) return
    const ok = await copyToClipboard(text)
    if (ok) {
      setAccessCopied(true)
      setTimeout(() => setAccessCopied(false), 2000)
    }
  }

  const apiFiltered = searchQuery.trim()
    ? apiCompanies.filter((c) => foldTr(c.firma).includes(foldTr(searchQuery))).slice(0, 50)
    : apiCompanies.slice(0, 50);

  // Firma listesi (empty-state) için arama + sıralama
  function parseLisansDate(s: string): number {
    if (!s) return Number.POSITIVE_INFINITY;
    const parts = s.split(".");
    if (parts.length === 3) {
      const d = new Date(+parts[2], +parts[1] - 1, +parts[0]).getTime();
      return isNaN(d) ? Number.POSITIVE_INFINITY : d;
    }
    const d = new Date(s).getTime();
    return isNaN(d) ? Number.POSITIVE_INFINITY : d;
  }
  const listFiltered = listSearch.trim()
    ? apiCompanies.filter((c) => {
        const q = foldTr(listSearch);
        return foldTr(c.firma).includes(q) || foldTr(c.firkod || "").includes(q);
      })
    : apiCompanies.slice();
  const listSorted = listFiltered.slice().sort((a, b) => {
    let cmp = 0;
    switch (listSortKey) {
      case "firma":       cmp = a.firma.localeCompare(b.firma, "tr"); break;
      case "firkod":      cmp = (a.firkod || "").localeCompare(b.firkod || "", "tr"); break;
      case "userCount":   cmp = a.userCount - b.userCount; break;
      case "lisansBitis": cmp = parseLisansDate(a.lisansBitis) - parseLisansDate(b.lisansBitis); break;
      case "status": {
        const av = firmaIsActive(a) ? 1 : 0;
        const bv = firmaIsActive(b) ? 1 : 0;
        cmp = bv - av;
        break;
      }
    }
    return listSortDir === "asc" ? cmp : -cmp;
  });

  return (
    <PageContainer title="Firma Yönetimi" description="Firmaların sunucu kullanım durumları">
      {/* Company Selector / Header Bar */}
      <div className="mb-6">
        {/* No-perm modunda selectedFirma yalnızca modal'ı beslemek için set
            ediliyor — detay header'ını ve panelini render etme, liste görünür kalsın. */}
        {selectedFirma && canViewCompanyDetail ? (
          /* Seçili firma: kompakt header bar */
          <div className="rounded-[8px] p-2" style={{ backgroundColor: "var(--section-bg)" }}>
            <div className="rounded-[5px] px-4 py-2.5" style={{ backgroundColor: "var(--card)", boxShadow: "var(--card-shadow)" }}>
              <div className="flex items-center gap-3">
                <button
                  onClick={clearSelection}
                  className="flex items-center gap-1 border border-border/60 hover:bg-muted/40 rounded-[5px] text-[11px] font-medium px-2.5 py-1.5 text-muted-foreground transition-colors shrink-0"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  Geri
                </button>

                <>
                  <span className={`h-2 w-2 rounded-full shrink-0 ${firmaIsActive(selectedFirma) ? "bg-emerald-500" : "bg-red-500"}`} />
                  <h2 className="text-sm font-semibold tracking-tight">{selectedFirma.firma}</h2>
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    {selectedFirma.email && <span className="text-[11px]">{selectedFirma.email}</span>}
                    {selectedFirma.email && selectedFirma.phone && <span className="text-[10px]">·</span>}
                    {selectedFirma.phone && <span className="text-[11px] font-mono">{selectedFirma.phone}</span>}
                    {(selectedFirma.email || selectedFirma.phone) && selectedFirma.lisansBitis && <span className="text-[10px]">·</span>}
                    {selectedFirma.lisansBitis && <span className="text-[11px]">Lisans: {selectedFirma.lisansBitis}</span>}
                  </div>
                  <span className={`shrink-0 inline-flex items-center rounded-[5px] border px-1.5 py-0.5 text-[9px] font-medium ${
                    firmaIsActive(selectedFirma)
                      ? "text-emerald-700 dark:text-emerald-400 border-emerald-500/25 bg-emerald-500/15"
                      : "text-red-700 dark:text-red-400 border-red-500/25 bg-red-500/15"
                  }`}>
                    {firmaIsActive(selectedFirma) ? "Aktif" : "Pasif"}
                  </span>

                  {/* Firma etiketleri */}
                  {canViewCompanyDetail && (
                    <div className="flex items-center gap-1.5">
                      {firmaTags.map((tag) => (
                        <span
                          key={tag}
                          className={`group/tag shrink-0 inline-flex items-center gap-1 rounded-[5px] border px-1.5 py-0.5 text-[9px] font-medium ${tagColor(tag)}`}
                        >
                          {tag}
                          <button
                            onClick={() => removeTag(tag)}
                            className="opacity-50 hover:opacity-100 transition-opacity"
                            title="Etiketi kaldır"
                          >
                            <X className="h-2.5 w-2.5" />
                          </button>
                        </span>
                      ))}

                      <Popover open={tagPopoverOpen} onOpenChange={(o) => { setTagPopoverOpen(o); if (!o) setTagInput(""); }}>
                        <PopoverTrigger asChild>
                          <button
                            className="shrink-0 inline-flex items-center justify-center h-5 w-5 rounded-[5px] border border-dashed border-border/70 text-muted-foreground hover:bg-muted/40 hover:text-foreground transition-colors"
                            title="Etiket ekle"
                          >
                            <Plus className="h-3 w-3" />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-56 p-0 rounded-[5px]" align="start">
                          <div className="p-2 border-b border-border/40">
                            <div className="flex items-center gap-1.5">
                              <Input
                                value={tagInput}
                                onChange={(e) => setTagInput(e.target.value)}
                                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(tagInput); } }}
                                placeholder="Yeni etiket yaz..."
                                maxLength={50}
                                className="h-7 text-[11px] rounded-[5px]"
                                autoFocus
                              />
                              <Button
                                size="sm"
                                disabled={tagBusy || !tagInput.trim()}
                                onClick={() => addTag(tagInput)}
                                className="h-7 px-2 rounded-[5px] text-[11px] shrink-0"
                              >
                                <Plus className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                          <div className="max-h-48 overflow-y-auto p-1" onWheel={(e) => e.stopPropagation()}>
                            {(() => {
                              const suggestions = allTags.filter(
                                (t) => !firmaTags.some((ft) => ft.toLowerCase() === t.toLowerCase())
                              )
                              if (suggestions.length === 0) {
                                return <p className="text-[10px] text-muted-foreground text-center py-3">Mevcut etiket yok — yukarıdan yeni ekleyin</p>
                              }
                              return (
                                <>
                                  <p className="text-[9px] font-medium text-muted-foreground tracking-wide uppercase px-1.5 py-1">Mevcut Etiketler</p>
                                  {suggestions.map((t) => (
                                    <button
                                      key={t}
                                      onClick={() => addTag(t)}
                                      disabled={tagBusy}
                                      className="w-full flex items-center gap-1.5 px-1.5 py-1 rounded-[5px] hover:bg-muted/50 transition-colors text-left"
                                    >
                                      <span className={`inline-flex items-center rounded-[5px] border px-1.5 py-0.5 text-[9px] font-medium ${tagColor(t)}`}>{t}</span>
                                    </button>
                                  ))}
                                </>
                              )
                            })()}
                          </div>
                        </PopoverContent>
                      </Popover>
                    </div>
                  )}
                </>

                <div className="flex-1" />

                <Combobox
                  items={apiFiltered}
                  getKey={(c) => c.id}
                  getLabel={(c) => c.firma}
                  onChange={(id) => {
                    const c = apiFiltered.find((x) => x.id === id)
                    if (c) selectFirma(c)
                  }}
                  search={searchQuery}
                  onSearchChange={setSearchQuery}
                  loading={apiLoading}
                  emptyText="Firma bulunamadı"
                  searchPlaceholder="Firma ara..."
                  align="end"
                  contentClassName="w-64"
                  maxListHeight="max-h-56"
                  renderItem={(c) => (
                    <span className="flex w-full min-w-0 items-center justify-between gap-2">
                      <span className="truncate">{c.firma}</span>
                      <span className="text-[10px] text-muted-foreground tabular-nums font-mono shrink-0">{c.firkod}</span>
                    </span>
                  )}
                  trigger={
                    <button className="flex items-center gap-1.5 border border-border/60 hover:bg-muted/40 rounded-[5px] text-[11px] font-medium px-2.5 py-1.5 text-muted-foreground transition-colors">
                      <Search className="h-3.5 w-3.5" />
                      Firma Değiştir
                    </button>
                  }
                />
              </div>
            </div>
                </div>
        ) : (
          /* Seçili firma yok: kart grid */
          <NestedCard>
            <p className="text-[11px] font-medium text-muted-foreground tracking-wide mb-3">EN YOĞUN 5 FİRMA</p>
            {top5Loading ? (
              <div className="grid grid-cols-5 gap-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="rounded-[8px] p-2" style={{ backgroundColor: "var(--section-bg)" }}>
                    <div className="rounded-[5px] px-3 py-3" style={{ backgroundColor: "var(--card)", boxShadow: "var(--card-shadow)" }}>
                      <Skeleton className="h-3 w-3/4 mb-3 rounded-[5px]" />
                      <div className="flex gap-1.5">
                        <Skeleton className="flex-1 h-8 rounded-[5px]" />
                        <Skeleton className="flex-1 h-8 rounded-[5px]" />
                        <Skeleton className="flex-1 h-8 rounded-[5px]" />
                      </div>
                    </div>
                                </div>
                ))}
              </div>
            ) : top5.length === 0 ? (
              <p className="text-[11px] text-muted-foreground py-4 text-center">Henüz firma verisi yok</p>
            ) : (
              <div className="grid grid-cols-5 gap-2">
                {top5.map((comp) => {
                  const st = statusConfig[comp.status] ?? statusConfig.active;
                  const yogunlukColor = comp.yogunluk >= 80 ? "text-red-600 dark:text-red-400" : comp.yogunluk >= 60 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400";
                  return (
                    <button
                      key={comp.id}
                      onClick={() => {
                        const apiMatch = apiCompanies.find((a) => a.firkod === comp.id)
                        setSelectedFirma(apiMatch ?? null)
                        setSelectedCompany(apiMatch?.id ?? null)
                      }}
                      className="rounded-[8px] p-2 text-left transition-all flex flex-col hover:brightness-[0.97]"
                      style={{ backgroundColor: "var(--section-bg)" }}
                    >
                      <div
                        className="rounded-[5px] px-3 py-3 w-full"
                        style={{ backgroundColor: "var(--card)", boxShadow: "var(--card-shadow)" }}
                      >
                        <div className="flex items-start justify-between gap-1 mb-3">
                          <p className="text-[11px] font-semibold leading-tight line-clamp-2">{comp.name}</p>
                          <span className={`shrink-0 inline-flex items-center rounded-[5px] border px-1 py-0 text-[9px] font-medium ${st.color}`}>
                            {st.label}
                          </span>
                        </div>
                        <div className="flex gap-1.5">
                          <div className="flex-1 flex flex-col items-center gap-0.5 rounded-[5px] py-1.5 bg-muted/40">
                            <span className={`text-[12px] font-bold tabular-nums leading-none ${yogunlukColor}`}>%{comp.yogunluk}</span>
                            <span className="text-[9px] text-muted-foreground">Yoğunluk</span>
                          </div>
                          <div className="flex-1 flex flex-col items-center gap-0.5 rounded-[5px] py-1.5 bg-muted/40">
                            <Database className="h-3 w-3 text-muted-foreground" />
                            <span className="text-[11px] font-semibold tabular-nums">{comp.dbCount}</span>
                          </div>
                          <div className="flex-1 flex flex-col items-center gap-0.5 rounded-[5px] py-1.5 bg-muted/40">
                            <Users className="h-3 w-3 text-muted-foreground" />
                            <span className="text-[11px] font-semibold tabular-nums">{comp.userCount}</span>
                          </div>
                        </div>
                      </div>
                                    </button>
                  );
                })}
              </div>
            )}
          </NestedCard>
        )}
      </div>

      {/* Company Detail */}
      {selectedFirma && canViewCompanyDetail ? (
        <div className="space-y-3">
          {/* Yoğunluk Skoru + Haftalık Kullanım */}
          <div className="grid grid-cols-[1fr_1fr] gap-3">
            {detailLoading ? (
              <div className="rounded-[8px] p-2" style={{ backgroundColor: "var(--section-bg)" }}>
                <div className="rounded-[5px] px-4 py-4 space-y-3" style={{ backgroundColor: "var(--card)", boxShadow: "var(--card-shadow)" }}>
                  <Skeleton className="h-4 w-36 rounded-[5px]" />
                  <div className="flex gap-4 items-center">
                    <Skeleton className="size-32 rounded-full shrink-0" />
                    <div className="flex-1 space-y-2.5">
                      {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-2 w-full rounded-full" />)}
                    </div>
                  </div>
                </div>
                        </div>
            ) : companyDetail ? (
              <YoğunlukKart
                key={selectedFirma.firkod}
                d={companyDetail}
                firkod={selectedFirma.firkod}
                onSaved={async () => {
                  try {
                    const r = await fetch(`/api/companies/${selectedFirma.firkod}/detail`)
                    if (r.ok) { const dt = await r.json(); if (dt && !dt.error) setCompanyDetail(dt) }
                  } catch { /* sessiz */ }
                }}
              />
            ) : (
              <div className="rounded-[8px] p-2" style={{ backgroundColor: "var(--section-bg)" }}>
                <div className="rounded-[5px] px-4 py-8 flex items-center justify-center" style={{ backgroundColor: "var(--card)", boxShadow: "var(--card-shadow)" }}>
                  <p className="text-[12px] text-muted-foreground">Kullanım verisi bulunamadı</p>
                </div>
                        </div>
            )}

            <NestedCard
              className="h-full flex flex-col"
              innerClassName="flex-1 flex flex-col"
              footer={
                <>
                  <Activity className="h-3 w-3" />
                  <span>Firmanın tüm kullanıcılarının günlük toplam kullanımı</span>
                </>
              }
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold">Haftalık Kullanım</h3>
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1 text-[10px] text-muted-foreground"><span className="inline-block h-2 w-2 rounded-full bg-emerald-400" />RAM (GB)</span>
                  <span className="flex items-center gap-1 text-[10px] text-muted-foreground"><span className="inline-block h-2 w-2 rounded-full bg-amber-400" />Disk (GB)</span>
                  <span className="flex items-center gap-1 text-[10px] text-muted-foreground"><span className="inline-block h-2 w-2 rounded-full bg-blue-400" />CPU (%)</span>
                </div>
              </div>
              <div className="flex-1 min-h-0">
                <WeeklyUsageChart data={companyDetail?.weeklyUsage ?? []} />
              </div>
            </NestedCard>
          </div>

          {/* Tab Kartı */}
          <NestedCard>
            <Tabs
              value={detailTab}
              onValueChange={(v) => {
                setDetailTab(v)
                // Erişim sekmesi ağır: access-info + agent'tan Users.xml okuma.
                // Sekmeye geçilene kadar hiç istek atmıyoruz, sonra bir kez.
                if (v === "access" && selectedFirma) loadAccessTab(selectedFirma.firkod)
              }}
            >
              <TabsList className="mb-3 h-8">
                <TabsTrigger value="users" className="text-[11px] h-7 gap-1.5">
                  <Users className="h-3.5 w-3.5" />
                  Kullanıcılar
                  <span className="ml-0.5 text-[10px] bg-muted rounded-[5px] px-1.5 py-0.5 font-medium">{tabUsers.length}</span>
                </TabsTrigger>
                <TabsTrigger value="services" className="text-[11px] h-7 gap-1.5">
                  <Briefcase className="h-3.5 w-3.5" />
                  Hizmetler
                  <span className="ml-0.5 text-[10px] bg-muted rounded-[5px] px-1.5 py-0.5 font-medium">{collectServices().length}</span>
                </TabsTrigger>
                <TabsTrigger value="databases" className="text-[11px] h-7 gap-1.5">
                  <Database className="h-3.5 w-3.5" />
                  Veritabanları
                  <span className="ml-0.5 text-[10px] bg-muted rounded-[5px] px-1.5 py-0.5 font-medium">{tabSQL.length}</span>
                </TabsTrigger>
                <TabsTrigger value="access" className="text-[11px] h-7 gap-1.5">
                  <KeyRound className="h-3.5 w-3.5" />
                  Erişim
                </TabsTrigger>
              </TabsList>

              {/* Kullanıcılar */}
              <TabsContent value="users" className="mt-0 space-y-2">
                <div className="flex items-center justify-end">
                  <Button
                    size="sm"
                    onClick={openNewUserDialog}
                    className="rounded-[5px] h-7 text-[11px] gap-1.5"
                  >
                    <UserPlus className="h-3.5 w-3.5" /> Yeni Kullanıcı Ekle
                  </Button>
                </div>
                <div className="rounded-[5px] overflow-hidden border border-border/40">
                  <div className="grid grid-cols-[1fr_1fr_80px_90px_120px_70px_32px] gap-3 px-3 py-1.5 bg-muted/20 border-b border-border">
                    <span className="text-[10px] font-medium text-muted-foreground tracking-wider uppercase">Kullanıcı</span>
                    <span className="text-[10px] font-medium text-muted-foreground tracking-wider uppercase">Ad Soyad</span>
                    <span className="text-[10px] font-medium text-muted-foreground tracking-wider uppercase text-right">CPU</span>
                    <span className="text-[10px] font-medium text-muted-foreground tracking-wider uppercase text-right">RAM</span>
                    <span className="text-[10px] font-medium text-muted-foreground tracking-wider uppercase">Son Giriş</span>
                    <span className="text-[10px] font-medium text-muted-foreground tracking-wider uppercase">Durum</span>
                    <span />
                  </div>
                  <div className="divide-y divide-border/40">
                    {tabLoading ? (
                      Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="grid grid-cols-[1fr_1fr_80px_90px_120px_70px_32px] px-3 py-2.5 items-center gap-3">
                          <Skeleton className="h-3 rounded-[5px]" />
                          <Skeleton className="h-3 rounded-[5px] w-3/4" />
                          <Skeleton className="h-3 rounded-[5px]" />
                          <Skeleton className="h-3 rounded-[5px]" />
                          <Skeleton className="h-3 rounded-[5px]" />
                          <Skeleton className="h-3 rounded-[5px] w-12" />
                        </div>
                      ))
                    ) : tabUsers.length === 0 ? (
                      <div className="flex items-center justify-center py-8">
                        <p className="text-xs text-muted-foreground">Kullanıcı bulunamadı</p>
                      </div>
                    ) : tabUsers.map((usr) => (
                      <div key={usr.username} className="grid grid-cols-[1fr_1fr_80px_90px_120px_70px_32px] px-3 py-1.5 hover:bg-muted/20 transition-colors items-center gap-3">
                        <span className="text-[11px] font-mono truncate">{usr.username}</span>
                        <span className="text-[11px] truncate">{usr.displayName}</span>
                        <span
                          className="text-[10px] tabular-nums text-muted-foreground text-right"
                          title={usr.usageDate ? `Son ölçüm: ${usr.usageDate}` : "Ölçüm yok"}
                        >{usr.usageCpu != null ? `%${usr.usageCpu}` : "—"}</span>
                        <span
                          className="text-[10px] tabular-nums text-muted-foreground text-right"
                          title={usr.usageDate ? `Son ölçüm: ${usr.usageDate}` : "Ölçüm yok"}
                        >{usr.usageRamMB != null ? (usr.usageRamMB >= 1024 ? `${(usr.usageRamMB / 1024).toFixed(1)} GB` : `${Math.round(usr.usageRamMB)} MB`) : "—"}</span>
                        <span className="text-[10px] tabular-nums text-muted-foreground">{usr.lastLogin || "—"}</span>
                        <div className="flex items-center gap-1.5">
                          <div className={`h-1.5 w-1.5 rounded-full ${usr.enabled ? "bg-emerald-500" : "bg-gray-300"}`} />
                          <span className={`text-[10px] ${usr.enabled ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`}>
                            {usr.enabled ? "Aktif" : "Pasif"}
                          </span>
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button className="h-6 w-6 flex items-center justify-center rounded-[5px] hover:bg-muted/60 transition-colors">
                              <MoreVertical className="h-3.5 w-3.5 text-muted-foreground" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-44 text-[11px]">
                            <DropdownMenuItem
                              className="text-[11px] gap-2"
                              onClick={() => openPwReset(usr)}
                            >
                              <KeyRound className="h-3.5 w-3.5" /> Şifre Sıfırla
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className={`text-[11px] gap-2 ${usr.enabled ? "text-destructive focus:text-destructive" : ""}`}
                              onClick={() => setToggleUser(usr)}
                            >
                              <Ban className="h-3.5 w-3.5" /> {usr.enabled ? "Hesabı Askıya Al" : "Hesabı Aktifleştir"}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-[11px] gap-2 text-destructive focus:text-destructive"
                              onClick={() => { setDeleteUser(usr); setDeleteConfirm(""); setDeleteError(null) }}
                            >
                              <Trash2 className="h-3.5 w-3.5" /> Kullanıcıyı Sil
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    ))}
                  </div>
                </div>
              </TabsContent>

              {/* Hizmetler */}
              <TabsContent value="services" className="mt-0 space-y-2">
                <div className="flex items-center justify-end">
                  <Button
                    size="sm"
                    onClick={openNewSvcDialog}
                    className="rounded-[5px] h-7 text-[11px] gap-1.5"
                  >
                    <Plus className="h-3.5 w-3.5" /> Yeni Hizmet Ekle
                  </Button>
                </div>
                <div className="rounded-[5px] overflow-hidden border border-border/40">
                  <div className="grid grid-cols-[1fr_110px_140px_60px_90px_32px] px-3 py-1.5 bg-muted/20 border-b border-border">
                    <span className="text-[10px] font-medium text-muted-foreground tracking-wider uppercase">Hizmet</span>
                    <span className="text-[10px] font-medium text-muted-foreground tracking-wider uppercase">Tip</span>
                    <span className="text-[10px] font-medium text-muted-foreground tracking-wider uppercase">Sunucu</span>
                    <span className="text-[10px] font-medium text-muted-foreground tracking-wider uppercase">Port</span>
                    <span className="text-[10px] font-medium text-muted-foreground tracking-wider uppercase">Durum</span>
                    <span />
                  </div>
                  <div className="divide-y divide-border/40">
                    {tabLoading ? (
                      Array.from({ length: 3 }).map((_, i) => (
                        <div key={i} className="grid grid-cols-[1fr_110px_140px_60px_90px_32px] px-3 py-2.5 items-center gap-3">
                          <Skeleton className="h-3 rounded-[5px]" />
                          <Skeleton className="h-3 rounded-[5px] w-2/3" />
                          <Skeleton className="h-3 rounded-[5px]" />
                          <Skeleton className="h-3 rounded-[5px] w-10" />
                          <Skeleton className="h-3 rounded-[5px] w-14" />
                        </div>
                      ))
                    ) : collectServices().length === 0 ? (
                      <div className="flex items-center justify-center py-8">
                        <p className="text-xs text-muted-foreground">Firmaya atanmış hizmet bulunamadı</p>
                      </div>
                    ) : collectServices().map((svc) => {
                      const running = svc.status === "Started"
                      const typeLabel = svc.type === "iis-site" ? "IIS Site" : svc.type === "pusula-program" ? "Pusula Program" : (svc.type || "—")
                      return (
                        <div key={svc.id} className="grid grid-cols-[1fr_110px_140px_60px_90px_32px] px-3 py-1.5 hover:bg-muted/20 transition-colors items-center gap-3">
                          <div className="flex items-center gap-2 min-w-0">
                            {svc.assigned
                              ? <Briefcase className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                              : <Globe className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                            <div className="flex flex-col min-w-0">
                              <span className="text-[13px] font-medium truncate">{svc.name}</span>
                              {svc.siteName && <span className="text-[10px] font-mono text-muted-foreground truncate">{svc.siteName}</span>}
                            </div>
                          </div>
                          <span className="text-[10px] text-muted-foreground truncate">{typeLabel}</span>
                          <span className="text-[11px] font-mono text-muted-foreground truncate">{svc.server || "—"}</span>
                          <span className="text-[11px] tabular-nums text-muted-foreground">{svc.port ?? "—"}</span>
                          {svc.status ? (
                            <div className="flex items-center gap-1.5">
                              <div className={`h-1.5 w-1.5 rounded-full ${running ? "bg-emerald-500" : "bg-gray-300"}`} />
                              <span className={`text-[10px] ${running ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`}>
                                {running ? "Çalışıyor" : "Durdu"}
                              </span>
                            </div>
                          ) : (
                            <span className="text-[10px] text-muted-foreground">—</span>
                          )}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button className="h-6 w-6 flex items-center justify-center rounded-[5px] hover:bg-muted/60 transition-colors">
                                <MoreVertical className="h-3.5 w-3.5 text-muted-foreground" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56 text-[11px]">
                              {/* Sihirbaz ataması olmayan site: kaldıracak atama kaydı yok */}
                              <DropdownMenuItem
                                className="text-[11px] gap-2 text-destructive focus:text-destructive"
                                disabled={!svc.assigned}
                              >
                                <Trash2 className="h-3.5 w-3.5" /> Hizmeti Kaldır
                              </DropdownMenuItem>
                              {!svc.assigned && (
                                <div className="px-2 py-1.5 text-[10px] text-muted-foreground border-t border-border/40">
                                  Sihirbaz kaydı yok — IIS&apos;te elle kurulmuş site
                                </div>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </TabsContent>

              {/* Veritabanları */}
              <TabsContent value="databases" className="mt-0">
                <div className="flex justify-end gap-2 mb-2">
                  <Button
                    size="sm"
                    onClick={() => setOldDataOpen(true)}
                    className="rounded-[5px] h-7 text-[11px] gap-1.5"
                  >
                    <Plus className="h-3.5 w-3.5" /> Yeni Veritabanı Ekle
                  </Button>
                  <button
                    onClick={async () => {
                      if (!selectedFirma || sqlRefreshing) return
                      setSqlRefreshing(true)
                      try {
                        const r = await fetch(`/api/companies/${selectedFirma.firkod}/sql?refresh=1`)
                        const data = r.ok ? await r.json() : []
                        setTabSQL(Array.isArray(data) ? data : [])
                        toast.success("Veritabanı listesi güncellendi")
                      } catch {
                        toast.error("Yenileme başarısız")
                      } finally {
                        setSqlRefreshing(false)
                      }
                    }}
                    disabled={sqlRefreshing}
                    className="h-7 px-2.5 inline-flex items-center gap-1.5 text-[11px] rounded-[5px] border border-border/50 bg-card hover:bg-muted/40 transition-colors disabled:opacity-50"
                  >
                    <RefreshCw className={`h-3 w-3 ${sqlRefreshing ? "animate-spin" : ""}`} />
                    {sqlRefreshing ? "Yenileniyor…" : "Yenile"}
                  </button>
                </div>
                <div className="rounded-[5px] overflow-hidden border border-border/40">
                  <div className="grid grid-cols-[minmax(220px,1fr)_180px_80px_95px_140px_120px_120px_85px_32px] gap-3 px-3 py-1.5 bg-muted/20 border-b border-border">
                    <span className="text-[10px] font-medium text-muted-foreground tracking-wider uppercase pl-[22px]">Veritabanı</span>
                    <span className="text-[10px] font-medium text-muted-foreground tracking-wider uppercase">Sunucu</span>
                    <span className="text-[10px] font-medium text-muted-foreground tracking-wider uppercase">Boyut</span>
                    <span className="text-[10px] font-medium text-muted-foreground tracking-wider uppercase">Recovery</span>
                    <span className="text-[10px] font-medium text-muted-foreground tracking-wider uppercase">Owner</span>
                    <span className="text-[10px] font-medium text-muted-foreground tracking-wider uppercase">Tam Yedek</span>
                    <span className="text-[10px] font-medium text-muted-foreground tracking-wider uppercase">Diff Yedek</span>
                    <span className="text-[10px] font-medium text-muted-foreground tracking-wider uppercase">Durum</span>
                    <span />
                  </div>
                  <div className="divide-y divide-border/40">
                    {tabLoading ? (
                      Array.from({ length: 3 }).map((_, i) => (
                        <div key={i} className="grid grid-cols-[minmax(220px,1fr)_180px_80px_95px_140px_120px_120px_85px_32px] gap-3 px-3 py-2.5 items-center">
                          <Skeleton className="h-3 rounded-[5px]" />
                          <Skeleton className="h-3 rounded-[5px] w-2/3" />
                          <Skeleton className="h-3 rounded-[5px]" />
                          <Skeleton className="h-3 rounded-[5px]" />
                          <Skeleton className="h-3 rounded-[5px]" />
                          <Skeleton className="h-3 rounded-[5px]" />
                          <Skeleton className="h-3 rounded-[5px]" />
                          <Skeleton className="h-3 rounded-[5px] w-12" />
                          <span />
                        </div>
                      ))
                    ) : tabSQL.length === 0 ? (
                      <div className="flex items-center justify-center py-8">
                        <p className="text-xs text-muted-foreground">Veritabanı bulunamadı</p>
                      </div>
                    ) : tabSQL.map((db) => {
                      const tooltipLines = [
                        db.DataFilePath ? `MDF: ${db.DataFilePath}` : null,
                        db.LogFilePath  ? `LDF: ${db.LogFilePath}`  : null,
                        db.ProgramCode  ? `Program: ${db.ProgramCode}` : null,
                      ].filter(Boolean).join("\n")
                      return (
                      <div key={db.Id} title={tooltipLines} className="grid grid-cols-[minmax(220px,1fr)_180px_80px_95px_140px_120px_120px_85px_32px] gap-3 px-3 py-1.5 hover:bg-muted/20 transition-colors items-center">
                        <div className="flex items-center gap-2 min-w-0">
                          <Database className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span className="text-[13px] font-medium truncate">{db.Name}</span>
                        </div>
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-[11px] font-mono truncate">{db.Server}</span>
                          {db.ServerIP && <span className="text-[10px] font-mono text-muted-foreground truncate">{db.ServerIP}</span>}
                        </div>
                        <span className="text-[11px] tabular-nums text-muted-foreground">{db.SizeMB >= 1024 ? `${(db.SizeMB / 1024).toFixed(1)} GB` : `${db.SizeMB} MB`}</span>
                        <span className="text-[10px] text-muted-foreground truncate">{db.RecoveryModel ?? "—"}</span>
                        <span className="text-[10px] text-muted-foreground truncate font-mono">{db.Owner ?? "—"}</span>
                        <span
                          className="text-[10px] tabular-nums text-muted-foreground cursor-help"
                          title={db.LastBackupStart ? `Başlangıç: ${db.LastBackupStart}\nBitiş:      ${db.LastBackup ?? "—"}` : ""}
                        >{db.LastBackup ?? "—"}</span>
                        <span
                          className="text-[10px] tabular-nums text-muted-foreground cursor-help"
                          title={db.LastDiffBackupStart ? `Başlangıç: ${db.LastDiffBackupStart}\nBitiş:      ${db.LastDiffBackup ?? "—"}` : ""}
                        >{db.LastDiffBackup ?? "—"}</span>
                        <div className="flex items-center gap-1.5">
                          <div className={`h-1.5 w-1.5 rounded-full ${db.Status === "ONLINE" || db.Status === "Online" ? "bg-emerald-500" : "bg-gray-300"}`} />
                          <span className={`text-[10px] ${db.Status === "ONLINE" || db.Status === "Online" ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`}>
                            {(db.Status === "ONLINE" || db.Status === "Online") ? "Çevrimiçi" : "Çevrimdışı"}
                          </span>
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button className="h-6 w-6 flex items-center justify-center rounded-[5px] hover:bg-muted/60 transition-colors">
                              <MoreVertical className="h-3.5 w-3.5 text-muted-foreground" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-44">
                            <DropdownMenuItem className="text-[11px] gap-2" onClick={() => sqlBackup(db)}>
                              <Download className="h-3.5 w-3.5" /> Yedek Al
                            </DropdownMenuItem>
                            <DropdownMenuItem className="text-[11px] gap-2" onClick={() => openQuery(db)}>
                              <Terminal className="h-3.5 w-3.5" /> Sorgu Çalıştır
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    )})}
                  </div>
                </div>
              </TabsContent>

              {/* ── Erişim ─────────────────────────────────────────────────
                  Modal'a sığmayan erişim bilgileri burada, sayfa genişliğinde
                  ve kompakt tablo düzeninde. Veri sekmeye geçilince yükleniyor. */}
              <TabsContent value="access" className="mt-0 space-y-2">
                <div className="flex items-center justify-end gap-2">
                  <button
                    onClick={handleCopyAccessText}
                    disabled={!accessInfo || accessLoading}
                    className={`h-7 px-2.5 inline-flex items-center gap-1.5 text-[11px] rounded-[5px] border transition-colors disabled:opacity-50 ${
                      accessCopied
                        ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/25"
                        : "bg-card border-border/50 hover:bg-muted/40"
                    }`}
                  >
                    {accessCopied
                      ? (<><CheckCheck className="h-3 w-3" /> Kopyalandı</>)
                      : (<><Copy className="h-3 w-3" /> Metin Olarak Kopyala</>)}
                  </button>
                </div>

                {accessLoading && (
                  <div className="space-y-2">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <Skeleton key={i} className="h-16 w-full rounded-[5px]" />
                    ))}
                  </div>
                )}

                {!accessLoading && accessError && (
                  <div className="flex items-center gap-2 px-3 py-2.5 rounded-[5px] border border-red-500/25 bg-red-500/15 text-[11px] text-red-700 dark:text-red-400">
                    {accessError}
                  </div>
                )}

                {!accessLoading && !accessError && accessInfo && selectedFirma && (() => {
                  const firkod      = selectedFirma.firkod
                  const domainShort = (accessInfo.ad?.domain ?? "").split(".")[0]?.trim() ?? ""
                  const rdpHost     = accessInfo.windows?.dns?.trim() || accessInfo.windows?.name || ""
                  const rdpTarget   = `${rdpHost}${accessInfo.windows?.rdpPort ? `:${accessInfo.windows.rdpPort}` : ""}`
                  const sqlIp       = tabSQL[0]?.ServerIP || ""
                  const credentials = accessInfo.credentials ?? {}
                  const webServices = collectWebServices()
                  return (
                    <div className="flex gap-2 min-h-[320px]">
                      {/* ── Sol: kart listesi ─────────────────────────────── */}
                      <div className="w-[220px] shrink-0 space-y-1">
                        <AccessNavCard
                          active={accessSel === "servers"}
                          onClick={() => setAccessSel("servers")}
                          icon={<Server className="h-3.5 w-3.5" />}
                          title="Sunucular"
                          subtitle={[accessInfo.ad && "AD", accessInfo.windows && "RDP", sqlIp && "SQL"].filter(Boolean).join(" · ") || "—"}
                        />
                        <AccessNavCard
                          active={accessSel === "users"}
                          onClick={() => setAccessSel("users")}
                          icon={<Users className="h-3.5 w-3.5" />}
                          title="Kullanıcılar"
                          count={tabUsers.length}
                          subtitle="VPN · RDP · API"
                        />
                        <AccessNavCard
                          active={accessSel === "databases"}
                          onClick={() => setAccessSel("databases")}
                          icon={<Database className="h-3.5 w-3.5" />}
                          title="Veritabanları"
                          count={tabSQL.length}
                          subtitle="SQL login + DB"
                        />

                        {webServices.length > 0 && (
                          <div className="pt-1.5 pb-0.5 px-1 text-[10px] font-medium text-muted-foreground tracking-wider uppercase">
                            Web Hizmetleri
                          </div>
                        )}
                        {webServices.map((s) => {
                          const xml = webUsers.find(
                            (w) => w.siteName.trim().toLowerCase() === s.name.trim().toLowerCase(),
                          )
                          const uc = xml && !xml.notFound && !xml.error ? xml.users.length : 0
                          return (
                            <AccessNavCard
                              key={s.key}
                              active={accessSel === s.key}
                              onClick={() => setAccessSel(s.key)}
                              icon={<Globe className="h-3.5 w-3.5" />}
                              title={s.name}
                              count={uc || undefined}
                              subtitle={s.url.replace(/^https?:\/\//, "")}
                              loading={webUsersLoading && !xml}
                            />
                          )
                        })}
                      </div>

                      {/* ── Sağ: seçilenin detayı ─────────────────────────── */}
                      <div className="flex-1 min-w-0 rounded-[5px] border border-border/60 bg-card overflow-hidden">
                        {accessSel === "servers" && (
                          <>
                            <AccessDetailHeader title="Sunucular" />
                            <div className="divide-y divide-border/40">
                              {accessInfo.ad && (
                                <AccessDetailRow
                                  label="AD Sunucusu"
                                  value={`${accessInfo.ad.domain || accessInfo.ad.name} · ${accessInfo.ad.ip}`}
                                  copyValue={accessInfo.ad.ip}
                                />
                              )}
                              {accessInfo.windows && (
                                <AccessDetailRow
                                  label="RDP"
                                  value={rdpTarget || `${accessInfo.windows.name} · ${accessInfo.windows.ip}`}
                                  copyValue={rdpTarget || accessInfo.windows.ip}
                                />
                              )}
                              {sqlIp && <AccessDetailRow label="SQL Sunucusu" value={sqlIp} copyValue={sqlIp} />}
                              {!accessInfo.ad && !accessInfo.windows && !sqlIp && <AccessEmpty text="Sunucu ataması yok" />}
                            </div>
                          </>
                        )}

                        {accessSel === "users" && (
                          <>
                            <AccessDetailHeader title={`Kullanıcılar (${tabUsers.length})`} />
                            {tabUsers.length === 0 ? (
                              <AccessEmpty text="Firmaya ait kullanıcı bulunamadı" />
                            ) : (
                              <>
                                <div className={ACCESS_USER_COLS + " px-3 py-1.5 bg-muted/40 border-b border-border/50"}>
                                  <span className="text-[10px] font-semibold text-foreground/70 tracking-wide uppercase">VPN / Kullanıcı</span>
                                  <span className="text-[10px] font-semibold text-foreground/70 tracking-wide uppercase">Şifre</span>
                                  <span className="text-[10px] font-semibold text-foreground/70 tracking-wide uppercase">RDP</span>
                                  <span className="text-[10px] font-semibold text-foreground/70 tracking-wide uppercase">API</span>
                                </div>
                                <div className="divide-y divide-border/40">
                                  {tabUsers.map((u) => {
                                    const fullUser = domainShort ? `${domainShort}\\${u.username}` : u.username
                                    const apiUser  = `${firkod}_${shortUsername(firkod, u.username)}`
                                    const pw       = credentials[u.username] ?? ""
                                    return (
                                      <div
                                        key={u.username}
                                        className={ACCESS_USER_COLS + " group px-3 py-2 items-center hover:bg-muted/20 transition-colors"}
                                      >
                                        <AccessCell value={u.username} muted={!u.enabled} />
                                        {pw
                                          ? <AccessPwCell value={pw} />
                                          : <span className="text-[10px] text-muted-foreground italic">saklanmamış</span>}
                                        <AccessCell value={fullUser} />
                                        <AccessCell value={webServices.length > 0 ? apiUser : "—"} />
                                      </div>
                                    )
                                  })}
                                </div>
                              </>
                            )}
                          </>
                        )}

                        {accessSel === "databases" && (
                          <>
                            <AccessDetailHeader title={`Veritabanları (${tabSQL.length})`} />
                            <div className="divide-y divide-border/40">
                              {tabUsers[0] && (() => {
                                const sqlLogin = `${firkod}_${shortUsername(firkod, tabUsers[0].username)}`
                                const sqlPw    = credentials[tabUsers[0].username] ?? ""
                                return (
                                  <>
                                    <AccessDetailRow label="SQL Login" value={sqlLogin} copyValue={sqlLogin} />
                                    {sqlPw && (
                                      <div className="group flex items-center gap-3 px-3 py-2">
                                        <span className="text-[11px] text-foreground/60 w-[110px] shrink-0">Şifre</span>
                                        <AccessPwCell value={sqlPw} />
                                      </div>
                                    )}
                                  </>
                                )
                              })()}
                              {tabSQL.length === 0
                                ? <AccessEmpty text="Firmaya ait veritabanı bulunamadı" />
                                : tabSQL.map((d) => (
                                    <AccessDetailRow key={d.Id} label="DB" value={d.Name} copyValue={d.Name} />
                                  ))}
                            </div>
                          </>
                        )}

                        {(() => {
                          const svc = webServices.find((s) => s.key === accessSel)
                          if (!svc) return null
                          const xml = webUsers.find(
                            (w) => w.siteName.trim().toLowerCase() === svc.name.trim().toLowerCase(),
                          )
                          const users = xml && !xml.notFound && !xml.error ? xml.users : []
                          return (
                            <>
                              <div className="flex items-center gap-2 px-3 py-2 bg-muted/20 border-b border-border">
                                <span className="text-[11px] font-semibold flex-1 truncate">{svc.name}</span>
                                {/* Users.xml'i olmayan hizmete kullanıcı eklenemez */}
                                {!xml?.notFound && !xml?.error && (
                                  <Button
                                    size="sm"
                                    className="rounded-[5px] h-6 text-[10px] gap-1"
                                    onClick={() => openWebUserDialog(svc.name, xml?.dbs ?? [])}
                                  >
                                    <UserPlus className="h-3 w-3" /> Kullanıcı Ekle
                                  </Button>
                                )}
                              </div>
                              <div className="divide-y divide-border/40">
                                <AccessDetailRow label="Adres" value={svc.url} copyValue={svc.url} link />
                                {xml?.path && <AccessDetailRow label="Klasör" value={xml.path} copyValue={xml.path} />}
                              </div>

                              {webUsersLoading && !xml && (
                                <div className="px-3 py-3 space-y-2">
                                  <Skeleton className="h-3 w-1/2 rounded-[5px]" />
                                  <Skeleton className="h-3 w-2/3 rounded-[5px]" />
                                </div>
                              )}

                              {xml?.error && <AccessEmpty text={xml.error} />}
                              {xml?.notFound && (
                                <AccessEmpty text="Bu hizmette Users.xml yok — uygulama içi kullanıcı tutmuyor" />
                              )}

                              {users.length > 0 && (
                                <>
                                  <div className={ACCESS_SVC_COLS + " px-3 py-1.5 bg-muted/40 border-y border-border/50"}>
                                    <span className="text-[10px] font-semibold text-foreground/70 tracking-wide uppercase">Kullanıcı</span>
                                    <span className="text-[10px] font-semibold text-foreground/70 tracking-wide uppercase">Şifre</span>
                                    <span className="text-[10px] font-semibold text-foreground/70 tracking-wide uppercase">Veritabanı</span>
                                    <span />
                                  </div>
                                  <div className="divide-y divide-border/40">
                                    {users.map((u) => (
                                      <div
                                        key={u.username}
                                        className={ACCESS_SVC_COLS + " group px-3 py-2 items-center hover:bg-muted/20 transition-colors"}
                                      >
                                        <AccessCell value={u.username} />
                                        {u.password
                                          ? <AccessPwCell value={u.password} />
                                          : <span className="text-[11px] text-muted-foreground">—</span>}
                                        <span className="inline-flex items-center gap-1.5 min-w-0">
                                          <AccessCell value={u.dbs.length > 0 ? u.dbs.join(", ") : "—"} />
                                          {(() => {
                                            const key = `${svc.name}::${u.username}`
                                            if (webUserTestBusy === key) {
                                              return <RefreshCw className="h-3 w-3 shrink-0 text-blue-600 dark:text-blue-400 animate-spin" />
                                            }
                                            const res = webUserTestResult[key]
                                            if (!res) return null
                                            return res.ok
                                              ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-label="Erişim başarılı" />
                                              : <XCircle className="h-3.5 w-3.5 shrink-0 text-destructive" aria-label={res.message} />
                                          })()}
                                        </span>
                                        <DropdownMenu>
                                          <DropdownMenuTrigger asChild>
                                            <button className="h-6 w-6 flex items-center justify-center rounded-[5px] hover:bg-muted/60 transition-colors">
                                              <MoreVertical className="h-3.5 w-3.5 text-muted-foreground" />
                                            </button>
                                          </DropdownMenuTrigger>
                                          <DropdownMenuContent align="end" className="w-44 text-[11px]">
                                            <DropdownMenuItem
                                              className="text-[11px] gap-2"
                                              onSelect={() => testWebUser(svc.name, u, "lan")}
                                              disabled={!u.password}
                                            >
                                              <Play className="h-3.5 w-3.5" /> Test Et (LAN)
                                            </DropdownMenuItem>
                                            <DropdownMenuItem
                                              className="text-[11px] gap-2"
                                              onSelect={() => testWebUser(svc.name, u, "wan")}
                                              disabled={!u.password}
                                            >
                                              <Globe className="h-3.5 w-3.5" /> Dışarıdan Test Et
                                            </DropdownMenuItem>
                                            <DropdownMenuSeparator />
                                            <DropdownMenuItem
                                              className="text-[11px] gap-2"
                                              onSelect={() => editWebUserDialog(svc.name, xml?.dbs ?? [], u)}
                                            >
                                              <Settings2 className="h-3.5 w-3.5" /> Düzenle
                                            </DropdownMenuItem>
                                            <DropdownMenuSeparator />
                                            <DropdownMenuItem
                                              className="text-[11px] gap-2 text-destructive focus:text-destructive"
                                              onSelect={(e) => {
                                                e.preventDefault()
                                                setWebUserDelTarget({ siteName: svc.name, username: u.username })
                                              }}
                                            >
                                              <Trash2 className="h-3.5 w-3.5" /> Sil
                                            </DropdownMenuItem>
                                          </DropdownMenuContent>
                                        </DropdownMenu>
                                      </div>
                                    ))}
                                  </div>
                                </>
                              )}
                            </>
                          )
                        })()}

                        {Object.keys(credentials).length === 0 && accessSel === "users" && (
                          <div className="m-3 text-[11px] text-amber-800 bg-amber-500/15 border border-amber-500/25 rounded-[5px] px-3 py-2">
                            Bu firma için şifreler henüz saklanmamış. Sihirbazdan yeniden çalıştırma veya kullanıcının
                            şifresini sıfırlama sonrası burada görünür.
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })()}
              </TabsContent>
            </Tabs>
          </NestedCard>

          {/* SQL Restore */}
          <AlertDialog open={restoreTarget !== null} onOpenChange={(o) => { if (!o) setRestoreTarget(null) }}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Veritabanını Geri Yükle</AlertDialogTitle>
                <AlertDialogDescription>
                  <span className="font-mono font-medium">{restoreTarget?.Name}</span> üzerine yazılacak. Mevcut veriler kaybolur.
                  SQL sunucusunda yer alan .bak dosyasının tam yolunu girin.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="space-y-2">
                <Label htmlFor="restore-path" className="text-[11px]">.bak Dosya Yolu</Label>
                <Input
                  id="restore-path"
                  value={restorePath}
                  onChange={(e) => setRestorePath(e.target.value)}
                  placeholder="C:\Backup\firma_20260414.bak"
                  className="rounded-[5px] h-8 text-[13px] font-mono"
                />
              </div>
              <AlertDialogFooter>
                <AlertDialogCancel>İptal</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-white hover:bg-destructive/90"
                  onClick={runRestore}
                  disabled={!restorePath.trim()}
                >
                  Geri Yükle
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* Yeni Veritabanı Ekle — Eski Datalar restore sheet */}
          {selectedFirma && (
            <OldDataRestoreSheet
              open={oldDataOpen}
              onOpenChange={setOldDataOpen}
              firkod={selectedFirma.firkod}
              firma={selectedFirma.firma}
              onComplete={async () => {
                if (!selectedFirma) return
                try {
                  const r = await fetch(`/api/companies/${selectedFirma.firkod}/sql?refresh=1`)
                  const data = r.ok ? await r.json() : []
                  setTabSQL(Array.isArray(data) ? data : [])
                } catch { /* sessiz */ }
              }}
            />
          )}

          {/* SQL Query Console */}
          <Dialog open={queryTarget !== null} onOpenChange={(o) => { if (!o) setQueryTarget(null) }}>
            <DialogContent className="p-0 gap-0 flex flex-col sm:max-w-[95vw] w-[95vw] h-[90vh] max-h-[90vh] overflow-hidden">
              <DialogHeader className="px-5 py-4 border-b border-border/50">
                <DialogTitle className="text-sm">
                  Sorgu Çalıştır — <span className="font-mono">{queryTarget?.Name}</span>
                </DialogTitle>
              </DialogHeader>
              <div className="flex-1 flex flex-col overflow-hidden min-h-0">
                <div className="px-4 py-3 space-y-2 border-b border-border/40">
                  <Textarea
                    value={queryText}
                    onChange={(e) => setQueryText(e.target.value)}
                    rows={8}
                    spellCheck={false}
                    className="rounded-[5px] text-[11px] font-mono resize-none"
                    placeholder="SELECT TOP 50 * FROM ..."
                  />
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] text-muted-foreground">Yalnızca SELECT sorgularına izin verilir (salt-okunur)</span>
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="outline" onClick={() => setSavedQueriesOpen(true)} className="rounded-[5px] h-7 text-[11px] gap-1">
                        <Bookmark className="h-3 w-3" /> Kayıtlı Sorgular {savedQueries.length > 0 && <span className="text-muted-foreground">({savedQueries.length})</span>}
                      </Button>
                      <Button size="sm" variant="outline" onClick={debugOpenDialog} className="rounded-[5px] h-7 text-[11px] gap-1">
                        <Bug className="h-3 w-3" /> Debug
                      </Button>
                      <Button size="sm" onClick={runQuery} disabled={queryRunning || !queryText.trim()} className="rounded-[5px] h-7 text-[11px]">
                        {queryRunning ? "Çalışıyor…" : "Çalıştır"}
                      </Button>
                    </div>
                  </div>
                </div>
                <div className="flex-1 min-h-0 overflow-auto">
                  <div className="px-4 py-3">
                    {queryError ? (
                      <div className="rounded-[5px] border border-destructive/40 bg-destructive/5 px-3 py-2 text-[11px] font-mono text-destructive whitespace-pre-wrap">
                        {queryError}
                      </div>
                    ) : queryResult ? (
                      <>
                        {(() => {
                          const activeCols = Object.entries(queryColFilters).filter(([, v]) => v.trim())
                          const hasActive = !!queryGlobalFilter.trim() || activeCols.length > 0
                          return (
                            <div className="mb-3 rounded-[5px] border border-border/50 bg-muted/20 p-2">
                              <div className="flex items-center gap-2 flex-wrap">
                                <Input
                                  value={queryGlobalFilter}
                                  onChange={(e) => setQueryGlobalFilter(e.target.value)}
                                  placeholder="Tüm sütunlarda ara…"
                                  className="rounded-[5px] h-7 text-[11px] w-64"
                                />
                                {hasActive && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 px-2 text-[11px] rounded-[5px]"
                                    onClick={() => { setQueryGlobalFilter(""); setQueryColFilters({}) }}
                                  >Filtreleri temizle</Button>
                                )}
                                <span className="text-[10px] text-muted-foreground ml-auto tabular-nums">
                                  {filteredQueryRows.length} / {queryResult.rows.length} satır • {queryResult.ms} ms
                                </span>
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button size="sm" variant="outline" className="h-7 px-2 text-[11px] rounded-[5px] gap-1" disabled={!queryResult.rows.length}>
                                      <Download className="h-3 w-3" /> Dışa Aktar
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" className="w-36 text-[11px]">
                                    <DropdownMenuItem onClick={() => exportQueryResult("xlsx")} className="gap-2 text-[11px]">
                                      <Download className="h-3 w-3" /> Excel (.xlsx)
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => exportQueryResult("pdf")} className="gap-2 text-[11px]">
                                      <Download className="h-3 w-3" /> PDF
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => exportQueryResult("txt")} className="gap-2 text-[11px]">
                                      <Download className="h-3 w-3" /> TXT
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </div>
                              {hasActive && (
                                <div className="flex items-center gap-1.5 flex-wrap mt-2">
                                  {queryGlobalFilter.trim() && (
                                    <span className="group inline-flex items-stretch text-[10px] rounded-[5px] border border-border/60 bg-background font-mono overflow-hidden">
                                      <span className="flex items-center gap-1 px-2 py-0.5">
                                        <span className="text-muted-foreground">tümü:</span>
                                        <span>{queryGlobalFilter}</span>
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() => setQueryGlobalFilter("")}
                                        aria-label="Filtreyi kaldır"
                                        className="flex items-center justify-center bg-destructive text-white hover:bg-destructive/90 max-w-0 group-hover:max-w-[22px] overflow-hidden transition-[max-width] duration-200 ease-out"
                                      >
                                        <span className="flex items-center justify-center w-[22px] shrink-0"><X className="h-3 w-3" strokeWidth={3} /></span>
                                      </button>
                                    </span>
                                  )}
                                  {activeCols.map(([k, v]) => (
                                    <span key={k} className="group inline-flex items-stretch text-[10px] rounded-[5px] border border-border/60 bg-background font-mono overflow-hidden">
                                      <span className="flex items-center gap-1 px-2 py-0.5">
                                        <span className="text-muted-foreground">{k}:</span>
                                        <span>{v}</span>
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() => setQueryColFilters((f) => { const n = { ...f }; delete n[k]; return n })}
                                        aria-label="Filtreyi kaldır"
                                        className="flex items-center justify-center bg-destructive text-white hover:bg-destructive/90 max-w-0 group-hover:max-w-[22px] overflow-hidden transition-[max-width] duration-200 ease-out"
                                      >
                                        <span className="flex items-center justify-center w-[22px] shrink-0"><X className="h-3 w-3" strokeWidth={3} /></span>
                                      </button>
                                    </span>
                                  ))}
                                </div>
                              )}
                              <div className="mt-2">
                                <button
                                  type="button"
                                  onClick={() => setFilterHelpOpen(true)}
                                  className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                                >
                                  <Info className="h-3 w-3" />
                                  Filtre nasıl kullanılır?
                                </button>
                              </div>
                            </div>
                          )
                        })()}
                        {queryResult.rows.length === 0 ? (
                          <div className="text-[11px] text-muted-foreground py-4 text-center">Sonuç boş</div>
                        ) : (
                          <div className="rounded-[5px] border border-border/40">
                            <table className="text-[10px] w-max min-w-full">
                              <thead className="sticky top-0 z-10">
                                <tr>
                                  {Object.keys(queryResult.rows[0]).map((k) => (
                                    <th key={k} className="px-2 py-1 text-left font-medium text-muted-foreground border-b border-border/40 align-top bg-muted shadow-[inset_0_-1px_0_var(--border)]">
                                      <div className="flex flex-col gap-1 min-w-[100px]">
                                        <span>{k}</span>
                                        <input
                                          value={queryColFilters[k] ?? ""}
                                          onChange={(e) => setQueryColFilters((f) => ({ ...f, [k]: e.target.value }))}
                                          placeholder="filtre…"
                                          className="h-5 px-1 text-[10px] font-mono font-normal border border-border/60 rounded-[5px] bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                                        />
                                      </div>
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-border/30">
                                {filteredQueryRows.slice(0, 200).map((row, i) => (
                                  <tr key={i} className="hover:bg-muted/20">
                                    {Object.keys(queryResult.rows[0]).map((k, j) => {
                                      const v = row[k]
                                      return (
                                        <td key={j} className="px-2 py-1 font-mono whitespace-nowrap">{v === null || v === undefined ? <span className="text-muted-foreground/60">NULL</span> : String(v)}</td>
                                      )
                                    })}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            {filteredQueryRows.length > 200 && (
                              <div className="text-[10px] text-muted-foreground p-2 text-center">İlk 200 satır gösteriliyor ({filteredQueryRows.length} eşleşen)</div>
                            )}
                            {filteredQueryRows.length === 0 && (
                              <div className="text-[11px] text-muted-foreground py-4 text-center">Filtreye uyan satır yok</div>
                            )}
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="text-[11px] text-muted-foreground py-4 text-center">Sorgu çalıştırın</div>
                    )}
                  </div>
                </div>
                {/* İstatistik Barı — scroll'dan bağımsız, dialog altına sabit */}
                {queryResult && queryResult.rows.length > 0 && (() => {
                  const cols = Object.keys(queryResult.rows[0])
                  const rows = filteredQueryRows
                  const activeFilterCount = (queryGlobalFilter.trim() ? 1 : 0) + Object.values(queryColFilters).filter((v) => v.trim()).length
                  return (
                    <div className="border-t border-border/50 bg-muted/30 px-4 py-2 flex items-center gap-4 text-[10px]">
                      <span><span className="text-muted-foreground">Satır:</span> <span className="font-mono tabular-nums font-medium">{rows.length.toLocaleString("tr-TR")}</span><span className="text-muted-foreground"> / {queryResult.rows.length.toLocaleString("tr-TR")}</span></span>
                      <span><span className="text-muted-foreground">Sütun:</span> <span className="font-mono tabular-nums font-medium">{cols.length}</span></span>
                      <span><span className="text-muted-foreground">Filtre:</span> <span className="font-mono tabular-nums font-medium">{activeFilterCount}</span></span>
                      <span><span className="text-muted-foreground">Süre:</span> <span className="font-mono tabular-nums font-medium">{queryResult.ms} ms</span></span>
                    </div>
                  )
                })()}
              </div>
            </DialogContent>
          </Dialog>

          {/* Kayıtlı Sorgular Dialog */}
          <Dialog open={savedQueriesOpen} onOpenChange={setSavedQueriesOpen}>
            <DialogContent className="sm:max-w-[640px] p-0 gap-0 overflow-hidden">
              <DialogHeader className="px-5 py-4 border-b border-border/50">
                <DialogTitle className="text-sm">Kayıtlı Sorgular</DialogTitle>
              </DialogHeader>
              <div className="px-5 py-4 min-w-0">
                <div className="max-h-[60vh] overflow-auto rounded-[5px] border border-border/40">
                  {savedQueries.length === 0 ? (
                    <div className="text-[11px] text-muted-foreground py-8 text-center">Henüz kayıtlı sorgu yok</div>
                  ) : (
                    <div className="divide-y divide-border/40">
                      {savedQueries.map((q) => (
                        <button
                          key={q.id}
                          type="button"
                          onClick={() => loadSavedQuery(q.sql)}
                          onMouseEnter={(e) => { setHoverQueryId(q.id); setHoverPos({ x: e.clientX, y: e.clientY }) }}
                          onMouseMove={(e) => setHoverPos({ x: e.clientX, y: e.clientY })}
                          onMouseLeave={() => setHoverQueryId((id) => (id === q.id ? null : id))}
                          className="w-full min-w-0 px-3 py-2 hover:bg-muted/30 transition-colors flex items-start gap-3 text-left"
                        >
                          <div className="flex-1 min-w-0 overflow-hidden">
                            <div className="flex items-center gap-2">
                              <span className="text-[13px] font-medium truncate">{q.name}</span>
                              {q.category && <span className="text-[9px] rounded-[5px] bg-muted px-1.5 py-0.5 text-muted-foreground shrink-0">{q.category}</span>}
                            </div>
                            <div className="text-[10px] text-muted-foreground font-mono truncate mt-0.5 whitespace-nowrap overflow-hidden text-ellipsis">{q.sql.replace(/\s+/g, " ")}</div>
                          </div>
                          <Play className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="px-5 py-3 border-t border-border/50 flex justify-end">
                <Button size="sm" variant="outline" onClick={() => setSavedQueriesOpen(false)} className="rounded-[5px] h-7 text-[11px]">Kapat</Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* Debug İzleme Dialog */}
          <Dialog open={debugOpen} onOpenChange={(o) => { if (!o) { setDebugOpen(false); if (debugRunning) debugStop() } }}>
            <DialogContent className="p-0 gap-0 flex flex-col sm:max-w-[90vw] w-[90vw] h-[85vh] max-h-[85vh] overflow-hidden">
              <DialogHeader className="px-5 py-4 border-b border-border/50">
                <DialogTitle className="text-sm flex items-center gap-2">
                  <Bug className="h-4 w-4" /> Debug İzleme — <span className="font-mono">{selectedFirma?.firkod}</span>
                  {debugRunning && (
                    <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400 font-normal">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" /> canlı
                    </span>
                  )}
                </DialogTitle>
              </DialogHeader>
              <div className="px-5 py-3 border-b border-border/40 flex items-center gap-2 flex-wrap text-[11px]">
                {debugServers.length > 0 && (
                  <>
                    <Label className="text-foreground/80 text-[12px] font-medium">Sunucu:</Label>
                    <Select
                      value={debugServerId}
                      onValueChange={(v) => { setDebugServerId(v); loadDebugFolders(v) }}
                      disabled={debugRunning}
                    >
                      <SelectTrigger className="h-7 text-[11px] rounded-[5px] w-[220px]">
                        <SelectValue placeholder="Windows sunucusu seçin…" />
                      </SelectTrigger>
                      <SelectContent>
                        {debugServers.map((s) => (
                          <SelectItem key={s.Id} value={s.Id} className="text-[13px]">
                            {s.Name} <span className="text-muted-foreground font-mono ml-1">{s.IP}</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <span className="text-muted-foreground">·</span>
                  </>
                )}
                <Label className="text-foreground/80 text-[12px] font-medium">Program:</Label>
                <Select value={debugSubfolder} onValueChange={setDebugSubfolder} disabled={debugRunning || !debugFolders.length}>
                  <SelectTrigger className="h-7 text-[11px] rounded-[5px] w-[200px]">
                    <SelectValue placeholder={debugFolders.length ? "Seçin…" : "Klasör yok"} />
                  </SelectTrigger>
                  <SelectContent>
                    {debugFolders.map((f) => <SelectItem key={f} value={f} className="text-[13px]">{f}</SelectItem>)}
                  </SelectContent>
                </Select>
                {debugPath && <span className="font-mono text-muted-foreground truncate text-[10px]" title={debugPath}>{debugPath}</span>}
                <div className="ml-auto flex items-center gap-2">
                  <Button size="sm" variant="outline" onClick={debugFetch} disabled={!debugRunning} className="rounded-[5px] h-7 text-[11px] gap-1">
                    <RotateCw className="h-3 w-3" /> Yenile
                  </Button>
                  {debugRunning ? (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" disabled={debugBusy} className="rounded-[5px] h-7 text-[11px] gap-1 bg-destructive hover:bg-destructive/90 text-white">
                          <Square className="h-3 w-3" /> Durdur
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Debug durdurulsun mu?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Debug izleme sonlandırılacak ve <span className="font-mono">debugsql.txt</span> dosyası sunucudan silinecek. Devam edilsin mi?
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Vazgeç</AlertDialogCancel>
                          <AlertDialogAction onClick={debugStop} className="bg-destructive text-white hover:bg-destructive/90">Durdur ve Sil</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  ) : (
                    <Button size="sm" onClick={debugStart} disabled={debugBusy || !debugSubfolder} className="rounded-[5px] h-7 text-[11px] gap-1">
                      <Play className="h-3 w-3" /> Başlat
                    </Button>
                  )}
                </div>
              </div>
              <div className="flex-1 min-h-0 overflow-auto bg-zinc-950 text-zinc-100 font-mono text-[11px] leading-relaxed p-4 whitespace-pre-wrap">
                {debugError ? (
                  <div className="text-red-400">{debugError}</div>
                ) : debugContent ? (
                  debugContent
                ) : (
                  <div className="text-zinc-500 italic">
                    {debugRunning ? "Dosya boş — 5 sn içinde yeniden denenecek…" : "Debug durduruldu."}
                  </div>
                )}
              </div>
              <div className="px-5 py-2 border-t border-border/50 text-[10px] text-muted-foreground">
                5 saniyede bir otomatik yenilenir. Pencere kapatılınca debug otomatik durur ve dosya silinir.
              </div>
            </DialogContent>
          </Dialog>

          {/* Yeni Kullanıcı Dialog */}
          <Dialog open={newUserOpen} onOpenChange={(o) => { if (!newUserStarted) setNewUserOpen(o) }}>
            <DialogContent className="sm:max-w-[560px] p-0 gap-0">
              <DialogHeader className="px-5 py-4 border-b border-border/50">
                <DialogTitle className="text-sm flex items-center gap-2">
                  <UserPlus className="h-4 w-4" /> Yeni Kullanıcı — <span className="font-mono">{selectedFirma?.firkod}</span>
                </DialogTitle>
              </DialogHeader>
              <ScrollArea className="max-h-[70vh]">
                <div className="px-5 py-4 space-y-3">
                  {!newUserStarted ? (
                    <>
                      {/* AD + RDP sunucu seçiciler */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label className="text-[11px] flex items-center gap-1">AD Sunucusu {newUserAdLocked && <span className="text-[9px] text-muted-foreground font-normal">(firma kaydından)</span>}</Label>
                          <Select value={newUserAdServerId} onValueChange={setNewUserAdServerId} disabled={newUserAdLocked}>
                            <SelectTrigger className="h-8 text-[13px] rounded-[5px]">
                              <SelectValue placeholder={newUserAdServers.length ? "Seçin…" : "Yükleniyor…"} />
                            </SelectTrigger>
                            <SelectContent>
                              {newUserAdServers.map((s) => (
                                <SelectItem key={s.id} value={s.id} className="text-[13px]">
                                  {s.name} <span className="text-muted-foreground font-mono ml-1">{s.ip}</span>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-[11px] flex items-center gap-1">RDP Sunucusu {newUserRdpLocked && <span className="text-[9px] text-muted-foreground font-normal">(firma kaydından)</span>}</Label>
                          <Select value={newUserRdpServerId} onValueChange={setNewUserRdpServerId} disabled={newUserRdpLocked}>
                            <SelectTrigger className="h-8 text-[13px] rounded-[5px]">
                              <SelectValue placeholder={newUserRdpServers.length ? "Seçin…" : "Yükleniyor…"} />
                            </SelectTrigger>
                            <SelectContent>
                              {newUserRdpServers.map((s) => (
                                <SelectItem key={s.id} value={s.id} className="text-[13px]">
                                  {s.name} <span className="text-muted-foreground font-mono ml-1">{s.ip}</span>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      {/* Kullanıcı adı */}
                      <div className="space-y-1.5">
                        <Label className="text-foreground/80 text-[12px] font-medium">Kullanıcı Adı</Label>
                        <div className="flex items-center rounded-[5px] border border-border bg-background overflow-hidden focus-within:border-foreground/60 transition-colors h-8">
                          <span className="text-[11px] text-muted-foreground bg-muted px-2 h-full flex items-center border-r border-border shrink-0 font-mono">
                            {selectedFirma?.firkod}.
                          </span>
                          <input
                            value={newUserUsername}
                            onChange={(e) => setNewUserUsername(e.target.value)}
                            placeholder="kullanici"
                            className="flex-1 px-2 text-[11px] bg-transparent outline-none min-w-0 h-full"
                          />
                        </div>
                      </div>

                      {/* Ad Soyad */}
                      <div className="space-y-1.5">
                        <Label className="text-foreground/80 text-[12px] font-medium">Ad Soyad</Label>
                        <Input value={newUserDisplayName} onChange={(e) => setNewUserDisplayName(e.target.value)} placeholder="Adı Soyadı" className="h-8 rounded-[5px] text-[11px]" />
                      </div>

                      {/* Şifre */}
                      <div className="space-y-1.5">
                        <Label className="text-foreground/80 text-[12px] font-medium">Şifre</Label>
                        <div className={`flex items-center rounded-[5px] border bg-background h-8 ${newUserPassword && !meetsAdComplexity(newUserPassword) ? "border-red-400" : "border-border"}`}>
                          <input
                            type={newUserShowPw ? "text" : "password"}
                            value={newUserPassword}
                            onChange={(e) => setNewUserPassword(e.target.value)}
                            placeholder="••••••••"
                            className="flex-1 px-2 text-[11px] bg-transparent outline-none min-w-0 h-full"
                          />
                          <button type="button" onClick={() => setNewUserShowPw((v) => !v)} className="px-2 text-muted-foreground hover:text-foreground">
                            {newUserShowPw ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                          </button>
                          <button type="button" onClick={() => setNewUserPassword(generatePassword())} title="Şifre oluştur" className="px-2 border-l border-border text-muted-foreground hover:text-foreground">
                            <RefreshCw className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        {newUserPassword && !meetsAdComplexity(newUserPassword) && (
                          <p className="text-[10px] text-red-500">En az 7 karakter, büyük/küçük harf + rakam/özel karakter (3 kategori)</p>
                        )}
                      </div>

                      {/* E-posta + Telefon */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label className="text-foreground/80 text-[12px] font-medium">E-posta</Label>
                          <Input type="email" value={newUserEmail} onChange={(e) => setNewUserEmail(e.target.value)} placeholder="ad@sirket.com" className="h-8 rounded-[5px] text-[11px]" />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-foreground/80 text-[12px] font-medium">Telefon</Label>
                          <Input type="tel" value={newUserPhone} onChange={(e) => setNewUserPhone(e.target.value)} placeholder="05xx xxx xx xx" className="h-8 rounded-[5px] text-[11px]" />
                        </div>
                      </div>

                      {newUserError && <p className="text-[11px] text-red-500">{newUserError}</p>}
                    </>
                  ) : (
                    selectedFirma && (
                      <AdProvisionRunner
                        payload={{
                          serverId:  newUserAdServerId,
                          firmaId:   selectedFirma.firkod,
                          firmaName: selectedFirma.firma,
                          skipDepo:  true,
                          users: [{
                            username:    newUserUsername.trim(),
                            displayName: newUserDisplayName.trim(),
                            email:       newUserEmail.trim(),
                            phone:       newUserPhone.trim(),
                            password:    newUserPassword,
                          }],
                        }}
                        onComplete={() => {
                          toast.success("Kullanıcı oluşturuldu", { description: `${selectedFirma.firkod}.${newUserUsername} AD'ye eklendi` })
                          setNewUserDone(true)
                          refreshTabUsers()
                        }}
                        onError={(msg) => setNewUserError(msg)}
                      />
                    )
                  )}

                  {newUserDone && selectedFirma && (() => {
                    const adSrv  = newUserAdServers.find((s) => s.id === newUserAdServerId)
                    const rdpSrv = newUserRdpServers.find((s) => s.id === newUserRdpServerId)
                    const srvAddr = rdpSrv?.ip ?? ""
                    const portSfx = rdpSrv?.rdpPort ? `:${rdpSrv.rdpPort}` : ""
                    const domainShort = (adSrv?.domain ?? "").split(".")[0]?.trim() ?? ""
                    const userPart = `${selectedFirma.firkod}.${newUserUsername.trim()}`
                    const fullUser = domainShort ? `${domainShort}\\${userPart}` : userPart
                    const msg = [
                      "Merhaba,",
                      "",
                      "Sunucu erişim bilgileriniz aşağıdadır.",
                      "",
                      `Sunucu: ${srvAddr}${portSfx}`,
                      "",
                      `Kullanıcı Adı: ${fullUser}`,
                      `Şifre: ${newUserPassword}`,
                      "",
                      "İyi çalışmalar.",
                    ].join("\n")
                    return (
                      <div className="space-y-2 mt-2">
                        <Label className="text-foreground/80 text-[12px] font-medium">Müşteri Bilgilendirme Mesajı</Label>
                        <pre className="text-[11px] font-mono whitespace-pre-wrap leading-relaxed bg-muted/30 rounded-[5px] border border-border/50 p-3">{msg}</pre>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={async () => { if (await copyToClipboard(msg)) { setNewUserMsgCopied(true); setTimeout(() => setNewUserMsgCopied(false), 2000) } }}
                          className="w-full rounded-[5px] h-8 text-[13px] gap-1.5"
                        >
                          {newUserMsgCopied ? <><CheckCircle2 className="h-3.5 w-3.5" /> Kopyalandı</> : <><Save className="h-3.5 w-3.5" /> Kopyala</>}
                        </Button>
                      </div>
                    )
                  })()}
                </div>
              </ScrollArea>
              <div className="px-5 py-3 border-t border-border/50 flex items-center justify-end gap-2">
                {!newUserStarted ? (
                  <>
                    <Button size="sm" variant="outline" onClick={() => setNewUserOpen(false)} className="rounded-[5px] h-7 text-[11px]">Vazgeç</Button>
                    <Button size="sm" disabled={!newUserValid} onClick={() => { setNewUserError(null); setNewUserStarted(true) }} className="rounded-[5px] h-7 text-[11px] gap-1.5">
                      <UserPlus className="h-3.5 w-3.5" /> Oluştur
                    </Button>
                  </>
                ) : (
                  <Button size="sm" onClick={() => { setNewUserOpen(false); setNewUserStarted(false) }} className="rounded-[5px] h-7 text-[11px]">Kapat</Button>
                )}
              </div>
            </DialogContent>
          </Dialog>

          {/* Şifre Sıfırla Dialog */}
          <Dialog open={!!pwResetUser} onOpenChange={(o) => { if (!o && !pwResetBusy) { setPwResetUser(null); setPwResetValue(""); setPwResetError(null); setPwResetDone(false); setPwResetMsgCopied(false) } }}>
            <DialogContent className="sm:max-w-[480px] p-0 gap-0">
              <DialogHeader className="px-5 py-4 border-b border-border/50">
                <DialogTitle className="text-sm flex items-center gap-2">
                  <KeyRound className="h-4 w-4" /> Şifre Sıfırla — <span className="font-mono">{pwResetUser?.username}</span>
                </DialogTitle>
              </DialogHeader>
              <div className="px-5 py-4 space-y-3">
                {!pwResetDone ? (
                  <>
                    <div className="space-y-1.5">
                      <Label className="text-foreground/80 text-[12px] font-medium">Yeni Şifre</Label>
                      <div className={`flex items-center rounded-[5px] border bg-background h-8 ${pwResetValue && !meetsAdComplexity(pwResetValue) ? "border-red-400" : "border-border"}`}>
                        <input
                          type={pwResetShow ? "text" : "password"}
                          value={pwResetValue}
                          onChange={(e) => setPwResetValue(e.target.value)}
                          placeholder="••••••••"
                          className="flex-1 px-2 text-[11px] bg-transparent outline-none min-w-0 h-full"
                        />
                        <button type="button" onClick={() => setPwResetShow((v) => !v)} className="px-2 text-muted-foreground hover:text-foreground">
                          {pwResetShow ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        </button>
                        <button type="button" onClick={() => setPwResetValue(generatePassword())} title="Şifre oluştur" className="px-2 border-l border-border text-muted-foreground hover:text-foreground">
                          <RefreshCw className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      {pwResetValue && !meetsAdComplexity(pwResetValue) && (
                        <p className="text-[10px] text-red-500">En az 7 karakter, büyük/küçük harf + rakam/özel karakter (3 kategori)</p>
                      )}
                    </div>
                    {pwResetError && <p className="text-[11px] text-red-500">{pwResetError}</p>}
                  </>
                ) : (() => {
                  const srvAddr = pwResetRdpServer?.ip ?? ""
                  const portSfx = pwResetRdpServer?.rdpPort ? `:${pwResetRdpServer.rdpPort}` : ""
                  const domainShort = (pwResetAdServer?.domain ?? "").split(".")[0]?.trim() ?? ""
                  const fullUser = domainShort ? `${domainShort}\\${pwResetUser?.username}` : (pwResetUser?.username ?? "")
                  const msg = [
                    "Merhaba,",
                    "",
                    "Şifreniz sıfırlandı. Güncel erişim bilgileriniz aşağıdadır.",
                    "",
                    srvAddr ? `Sunucu: ${srvAddr}${portSfx}` : null,
                    "",
                    `Kullanıcı Adı: ${fullUser}`,
                    `Şifre: ${pwResetValue}`,
                    "",
                    "Bağlantı Rehberi: https://www.youtube.com/watch?v=sclrNkCJ734",
                    "",
                    "İyi çalışmalar.",
                  ].filter((l) => l !== null).join("\n")
                  return (
                    <div className="space-y-2">
                      <Label className="text-foreground/80 text-[12px] font-medium">Müşteri Bilgilendirme Mesajı</Label>
                      <pre className="text-[11px] font-mono whitespace-pre-wrap leading-relaxed bg-muted/30 rounded-[5px] border border-border/50 p-3">{msg}</pre>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={async () => { if (await copyToClipboard(msg)) { setPwResetMsgCopied(true); setTimeout(() => setPwResetMsgCopied(false), 2000) } }}
                        className="w-full rounded-[5px] h-8 text-[13px] gap-1.5"
                      >
                        {pwResetMsgCopied ? <><CheckCircle2 className="h-3.5 w-3.5" /> Kopyalandı</> : <><Save className="h-3.5 w-3.5" /> Kopyala</>}
                      </Button>
                    </div>
                  )
                })()}
              </div>
              <div className="px-5 py-3 border-t border-border/50 flex items-center justify-end gap-2">
                {!pwResetDone ? (
                  <>
                    <Button size="sm" variant="outline" disabled={pwResetBusy} onClick={() => { setPwResetUser(null); setPwResetValue(""); setPwResetError(null) }} className="rounded-[5px] h-7 text-[11px]">Vazgeç</Button>
                    <Button size="sm" disabled={pwResetBusy || !meetsAdComplexity(pwResetValue)} onClick={submitPasswordReset} className="rounded-[5px] h-7 text-[11px] gap-1.5">
                      <KeyRound className="h-3.5 w-3.5" /> {pwResetBusy ? "Uygulanıyor…" : "Sıfırla"}
                    </Button>
                  </>
                ) : (
                  <Button size="sm" onClick={() => { setPwResetUser(null); setPwResetValue(""); setPwResetDone(false); setPwResetMsgCopied(false) }} className="rounded-[5px] h-7 text-[11px]">Kapat</Button>
                )}
              </div>
            </DialogContent>
          </Dialog>

          {/* Hesabı Askıya Al / Aktifleştir */}
          <AlertDialog open={!!toggleUser} onOpenChange={(o) => { if (!o && !toggleBusy) setToggleUser(null) }}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle className="text-sm">
                  {toggleUser?.enabled ? "Hesap askıya alınsın mı?" : "Hesap aktifleştirilsin mi?"}
                </AlertDialogTitle>
                <AlertDialogDescription className="text-[11px]">
                  <span className="font-mono">{toggleUser?.username}</span> hesabı {toggleUser?.enabled ? "AD üzerinde devre dışı bırakılacak" : "AD üzerinde yeniden etkinleştirilecek"}.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={toggleBusy} className="text-[11px] h-7 rounded-[5px]">Vazgeç</AlertDialogCancel>
                <AlertDialogAction
                  disabled={toggleBusy}
                  onClick={(e) => { e.preventDefault(); submitToggleEnabled() }}
                  className={`text-[11px] h-7 rounded-[5px] ${toggleUser?.enabled ? "bg-destructive text-white hover:bg-destructive/90" : ""}`}
                >
                  {toggleBusy ? "İşleniyor…" : (toggleUser?.enabled ? "Askıya Al" : "Aktifleştir")}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* Kullanıcıyı Sil Dialog */}
          <Dialog open={!!deleteUser} onOpenChange={(o) => { if (!o && !deleteBusy) { setDeleteUser(null); setDeleteConfirm(""); setDeleteError(null) } }}>
            <DialogContent className="sm:max-w-[440px] p-0 gap-0">
              <DialogHeader className="px-5 py-4 border-b border-border/50">
                <DialogTitle className="text-sm flex items-center gap-2 text-destructive">
                  <Trash2 className="h-4 w-4" /> Kullanıcıyı Sil
                </DialogTitle>
              </DialogHeader>
              <div className="px-5 py-4 space-y-3">
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  <span className="font-mono text-foreground">{deleteUser?.username}</span> kullanıcısı AD üzerinden <b>kalıcı olarak</b> silinecek.
                  Bu işlem geri alınamaz. Onaylamak için aşağıya kullanıcı adını aynen yaz.
                </p>
                <div className="space-y-1.5">
                  <Label className="text-foreground/80 text-[12px] font-medium">Kullanıcı Adı Onayı</Label>
                  <Input
                    value={deleteConfirm}
                    onChange={(e) => setDeleteConfirm(e.target.value)}
                    placeholder={deleteUser?.username}
                    className="h-8 rounded-[5px] text-[11px] font-mono"
                    autoFocus
                  />
                </div>
                {deleteError && <p className="text-[11px] text-red-500">{deleteError}</p>}
              </div>
              <div className="px-5 py-3 border-t border-border/50 flex items-center justify-end gap-2">
                <Button size="sm" variant="outline" disabled={deleteBusy} onClick={() => { setDeleteUser(null); setDeleteConfirm(""); setDeleteError(null) }} className="rounded-[5px] h-7 text-[11px]">Vazgeç</Button>
                <Button
                  size="sm"
                  disabled={deleteBusy || deleteConfirm.trim() !== deleteUser?.username}
                  onClick={submitDeleteUser}
                  className="rounded-[5px] h-7 text-[11px] gap-1.5 bg-destructive text-white hover:bg-destructive/90"
                >
                  <Trash2 className="h-3.5 w-3.5" /> {deleteBusy ? "Siliniyor…" : "Kalıcı Olarak Sil"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* Yeni Hizmet Ekle Dialog */}
          <Dialog open={newSvcOpen} onOpenChange={(o) => { if (!newSvcStarted) setNewSvcOpen(o) }}>
            <DialogContent className="sm:max-w-[640px] p-0 gap-0">
              <DialogHeader className="px-5 py-4 border-b border-border/50">
                <DialogTitle className="text-sm flex items-center gap-2">
                  <Plus className="h-4 w-4" /> Yeni Hizmet — <span className="font-mono">{selectedFirma?.firkod}</span>
                </DialogTitle>
              </DialogHeader>
              <ScrollArea className="max-h-[72vh]">
                <div className="px-5 py-4 space-y-3">
                  {!newSvcStarted ? (
                    <>
                      {newSvcLoading ? (
                        <div className="space-y-2">
                          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-8 w-full rounded-[5px]" />)}
                        </div>
                      ) : newSvcCatalog.length === 0 ? (
                        <p className="text-[11px] text-muted-foreground text-center py-6">Kayıtlı hizmet bulunamadı.</p>
                      ) : (
                        <>
                          {/* Kategori sekmeleri */}
                          <div className="flex items-center gap-1 border-b border-border/50">
                            {[...new Set(newSvcCatalog.map((s) => s.category))].map((cat) => {
                              const count = newSvcCatalog.filter((s) => s.category === cat && newSvcSelectedIds.includes(s.id)).length
                              const isActive = newSvcActiveCat === cat
                              return (
                                <button
                                  key={cat}
                                  onClick={() => setNewSvcActiveCat(cat)}
                                  className={`flex items-center gap-1.5 px-3 py-2 text-[11px] font-medium border-b-2 -mb-px transition-colors ${isActive ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
                                >
                                  {cat}
                                  {count > 0 && (
                                    <span className="size-4 rounded-full bg-primary text-primary-foreground text-[9px] flex items-center justify-center font-bold">{count}</span>
                                  )}
                                </button>
                              )
                            })}
                          </div>

                          {/* Hizmet listesi */}
                          <div className="rounded-[5px] border border-border/50 overflow-hidden">
                            <div className="px-3 py-2 bg-muted/20 border-b border-border">
                              <span className="text-[10px] font-medium text-muted-foreground tracking-wider uppercase">
                                {newSvcActiveCat} — {newSvcCatalog.filter((s) => s.category === newSvcActiveCat).length} hizmet
                              </span>
                            </div>
                            <div className="divide-y divide-border/40 max-h-[240px] overflow-y-auto">
                              {newSvcCatalog.filter((s) => s.category === newSvcActiveCat).map((svc) => {
                                const isSelected = newSvcSelectedIds.includes(svc.id)
                                return (
                                  <button
                                    key={svc.id}
                                    onClick={() => setNewSvcSelectedIds((p) => p.includes(svc.id) ? p.filter((x) => x !== svc.id) : [...p, svc.id])}
                                    className={`w-full flex items-center gap-3 px-3 py-2 text-left transition-colors ${isSelected ? "bg-foreground/[0.03]" : "hover:bg-muted/20"}`}
                                  >
                                    <span className={`size-4 rounded-[5px] border-2 flex items-center justify-center shrink-0 ${isSelected ? "bg-foreground border-foreground" : "border-border"}`}>
                                      {isSelected && <Check className="size-2.5 text-background" strokeWidth={3} />}
                                    </span>
                                    {svc.type === "iis-site" ? <Globe className="h-3 w-3 text-muted-foreground shrink-0" /> : <Server className="h-3 w-3 text-muted-foreground shrink-0" />}
                                    <span className={`text-[11px] font-medium flex-1 ${isSelected ? "text-foreground" : "text-muted-foreground"}`}>{svc.name}</span>
                                    <span className="text-[10px] text-muted-foreground font-mono truncate max-w-[200px]">
                                      {svc.config && "sourceFolderPath" in svc.config ? svc.config.sourceFolderPath : "—"}
                                    </span>
                                  </button>
                                )
                              })}
                            </div>
                          </div>

                          {/* Pusula: Windows + Depo sunucusu */}
                          {newSvcHasPusula && (
                            <div className="grid grid-cols-2 gap-3">
                              <div className="space-y-1.5">
                                <Label className="text-[11px] flex items-center gap-1">
                                  Windows/RDP Sunucusu {newSvcWindowsLocked && <span className="text-[9px] text-muted-foreground font-normal">(firma kaydından)</span>}
                                </Label>
                                <Select value={newSvcWindowsServerId} onValueChange={setNewSvcWindowsServerId} disabled={newSvcWindowsLocked}>
                                  <SelectTrigger className="h-8 text-[13px] rounded-[5px]">
                                    <SelectValue placeholder={newSvcWindowsList.length ? "Seçin…" : "Sunucu yok"} />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {newSvcWindowsList.map((s) => (
                                      <SelectItem key={s.id} value={s.id} className="text-[13px]">
                                        {s.name} <span className="text-muted-foreground font-mono ml-1">{s.ip}</span>
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="space-y-1.5">
                                <Label className="text-foreground/80 text-[12px] font-medium">Depo Sunucusu</Label>
                                <Select value={newSvcDepoServerId} onValueChange={setNewSvcDepoServerId}>
                                  <SelectTrigger className="h-8 text-[13px] rounded-[5px]">
                                    <SelectValue placeholder={newSvcDepoServers.length ? "Seçin…" : "Sunucu yok"} />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {newSvcDepoServers.map((s) => (
                                      <SelectItem key={s.id} value={s.id} className="text-[13px]" disabled={!s.isOnline}>
                                        {s.name} <span className="text-muted-foreground font-mono ml-1">{s.ip}</span>
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                          )}

                          {/* IIS sunucusu */}
                          {newSvcHasIis && (
                            <div className="space-y-1.5">
                              <Label className="text-foreground/80 text-[12px] font-medium">IIS Sunucusu</Label>
                              <Select value={newSvcIisServerId} onValueChange={setNewSvcIisServerId}>
                                <SelectTrigger className="h-8 text-[13px] rounded-[5px]">
                                  <SelectValue placeholder={newSvcIisServers.length ? "Seçin…" : "Sunucu yok"} />
                                </SelectTrigger>
                                <SelectContent>
                                  {newSvcIisServers.map((s) => (
                                    <SelectItem key={s.id} value={s.id} className="text-[13px]" disabled={!s.isOnline}>
                                      {s.name} <span className="text-muted-foreground font-mono ml-1">{s.ip}</span>
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          )}

                          {!newSvcAdServerId && (
                            <p className="text-[10px] text-amber-600 dark:text-amber-400">Uyarı: Bu firma için AD sunucusu tanımlı değil — hizmet kurulumu OU/grup adımları için AD ister.</p>
                          )}
                          {newSvcError && <p className="text-[11px] text-red-500">{newSvcError}</p>}
                        </>
                      )}
                    </>
                  ) : (
                    selectedFirma && (
                      <AdProvisionRunner
                        payload={{
                          serverId:         newSvcAdServerId,
                          windowsServerId:  newSvcHasPusula ? newSvcWindowsServerId : undefined,
                          iisServerId:      newSvcHasIis ? newSvcIisServerId : undefined,
                          depoServerId:     newSvcHasPusula ? newSvcDepoServerId : undefined,
                          firmaId:          selectedFirma.firkod,
                          firmaName:        selectedFirma.firma,
                          users:            [],
                          services:         newSvcSelected.map<AdProvisionService>((s) => ({
                            id:     s.id,
                            name:   s.name,
                            type:   s.type,
                            config: s.config,
                          })),
                          skipDepo:         !newSvcHasPusula,
                        }}
                        onComplete={() => {
                          toast.success("Hizmet kuruldu", { description: `${newSvcSelected.length} hizmet firmaya eklendi` })
                          setNewSvcDone(true)
                          refreshTabServices()
                        }}
                        onError={(msg) => setNewSvcError(msg)}
                      />
                    )
                  )}
                </div>
              </ScrollArea>
              <div className="px-5 py-3 border-t border-border/50 flex items-center justify-end gap-2">
                {!newSvcStarted ? (
                  <>
                    <Button size="sm" variant="outline" onClick={() => setNewSvcOpen(false)} className="rounded-[5px] h-7 text-[11px]">Vazgeç</Button>
                    <Button size="sm" disabled={!newSvcValid} onClick={() => { setNewSvcError(null); setNewSvcStarted(true) }} className="rounded-[5px] h-7 text-[11px] gap-1.5">
                      <Plus className="h-3.5 w-3.5" /> Oluştur
                    </Button>
                  </>
                ) : (
                  <Button size="sm" disabled={!newSvcDone && !newSvcError} onClick={() => { setNewSvcOpen(false); setNewSvcStarted(false) }} className="rounded-[5px] h-7 text-[11px]">Kapat</Button>
                )}
              </div>
            </DialogContent>
          </Dialog>

          {/* Mouse-takipli tooltip (kayıtlı sorgu için) */}
          {savedQueriesOpen && hoverQueryId && (() => {
            const q = savedQueries.find((x) => x.id === hoverQueryId)
            if (!q) return null
            const PAD = 14
            const W = 340
            const maxX = typeof window !== "undefined" ? window.innerWidth - W - 8 : 0
            const x = Math.min(hoverPos.x + PAD, maxX)
            const y = hoverPos.y + PAD
            return (
              <div
                className="fixed z-[200] pointer-events-none rounded-[5px] bg-popover text-popover-foreground border border-border shadow-lg p-3 space-y-2"
                style={{ left: x, top: y, width: W }}
              >
                {q.description && <p className="text-[11px] leading-relaxed">{q.description}</p>}
                <div>
                  <div className="text-[9px] uppercase tracking-wide text-muted-foreground mb-1">SQL</div>
                  <pre className="text-[10px] font-mono whitespace-pre-wrap bg-muted/50 rounded-[5px] p-2 max-h-40 overflow-auto">{q.sql}</pre>
                </div>
              </div>
            )
          })()}

          {/* Filtre Yardım Dialog */}
          <Dialog open={filterHelpOpen} onOpenChange={setFilterHelpOpen}>
            <DialogContent className="sm:max-w-[560px] p-0 gap-0">
              <DialogHeader className="px-5 py-4 border-b border-border/50">
                <DialogTitle className="text-sm">Filtre Nasıl Kullanılır?</DialogTitle>
              </DialogHeader>
              <div className="px-5 py-4 space-y-4 text-[12px] leading-relaxed max-h-[70vh] overflow-auto">
                <p className="text-muted-foreground">
                  Her tablo başlığının altındaki küçük <span className="font-mono text-foreground">filtre…</span> kutusuna aşağıdaki ifadeleri yazarak
                  o sütunu filtreleyebilirsin. Birden fazla sütunda yazılırsa hepsi <b>VE</b> mantığıyla birleşir.
                </p>

                <section>
                  <h4 className="font-medium mb-1.5">Sayısal karşılaştırma</h4>
                  <ul className="space-y-1 text-muted-foreground">
                    <li><code className="font-mono text-foreground">&gt;10</code> — 10&apos;dan büyük</li>
                    <li><code className="font-mono text-foreground">&lt;5</code> — 5&apos;ten küçük</li>
                    <li><code className="font-mono text-foreground">&gt;=100</code> — 100 ve üstü</li>
                    <li><code className="font-mono text-foreground">&lt;=0</code> — 0 ve altı</li>
                    <li><code className="font-mono text-foreground">=42</code> — tam 42</li>
                  </ul>
                </section>

                <section>
                  <h4 className="font-medium mb-1.5">Aralık</h4>
                  <ul className="space-y-1 text-muted-foreground">
                    <li><code className="font-mono text-foreground">1..100</code> — 1 ile 100 arası (iki uç dahil)</li>
                    <li><code className="font-mono text-foreground">2020-01-01..2020-12-31</code> — tarih/metin aralığı</li>
                  </ul>
                </section>

                <section>
                  <h4 className="font-medium mb-1.5">Metin eşleştirme</h4>
                  <ul className="space-y-1 text-muted-foreground">
                    <li><code className="font-mono text-foreground">fatura</code> — içerir (varsayılan, büyük/küçük harf duyarsız)</li>
                    <li><code className="font-mono text-foreground">&quot;USER_TABLE&quot;</code> — birebir eşitlik</li>
                    <li><code className="font-mono text-foreground">!kar</code> — içermez</li>
                  </ul>
                </section>

                <section>
                  <h4 className="font-medium mb-1.5">NULL kontrolü</h4>
                  <ul className="space-y-1 text-muted-foreground">
                    <li><code className="font-mono text-foreground">is:null</code> — sadece NULL olanlar</li>
                    <li><code className="font-mono text-foreground">not:null</code> — NULL olmayanlar</li>
                  </ul>
                </section>

                <section>
                  <h4 className="font-medium mb-1.5">Tüm sütunlarda ara</h4>
                  <p className="text-muted-foreground">
                    Üstteki <span className="font-mono text-foreground">Tüm sütunlarda ara…</span> kutusu her satırın herhangi bir hücresinde
                    substring araması yapar; sütun filtreleri ile birlikte kullanılabilir.
                  </p>
                </section>

                <section>
                  <h4 className="font-medium mb-1.5">Örnekler</h4>
                  <ul className="space-y-1 text-muted-foreground">
                    <li><code className="font-mono text-foreground">type_desc: &quot;USER_TABLE&quot;</code> + <code className="font-mono text-foreground">object_id: &gt;100000000</code> → id&apos;si büyük kullanıcı tabloları</li>
                    <li><code className="font-mono text-foreground">name: fatura</code> + <code className="font-mono text-foreground">modify_date: 2025..2026</code> → adında &quot;fatura&quot; geçen, bu yıl değişenler</li>
                    <li><code className="font-mono text-foreground">principal_id: is:null</code> → sahibi sistem olanlar</li>
                  </ul>
                </section>
              </div>
              <div className="px-5 py-3 border-t border-border/50 flex justify-end">
                <Button size="sm" onClick={() => setFilterHelpOpen(false)} className="rounded-[5px] h-7 text-[11px]">Kapat</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      ) : (
        <NestedCard>
          <div className="flex flex-col gap-0">
            {/* Üst bar: arama + sıralama */}
            <div className="flex items-center gap-2 px-3 py-2 border-b border-border/40 bg-muted/20">
              <div className="relative flex-1">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={listSearch}
                  onChange={(e) => setListSearch(e.target.value)}
                  placeholder="Firma adı veya kodu ara..."
                  className="h-8 pl-7 text-[11px] rounded-[5px]"
                />
              </div>
              <Select value={listSortKey} onValueChange={(v) => setListSortKey(v as typeof listSortKey)}>
                <SelectTrigger className="h-8 w-[160px] text-[11px] rounded-[5px]">
                  <SelectValue placeholder="Sırala..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="firma" className="text-[13px]">Firma Adı</SelectItem>
                  <SelectItem value="firkod" className="text-[13px]">Firma Kodu</SelectItem>
                  <SelectItem value="userCount" className="text-[13px]">Kullanıcı Sayısı</SelectItem>
                  <SelectItem value="lisansBitis" className="text-[13px]">Lisans Bitiş</SelectItem>
                  <SelectItem value="status" className="text-[13px]">Durum</SelectItem>
                </SelectContent>
              </Select>
              <Button
                size="sm"
                variant="outline"
                className="h-8 w-8 p-0 rounded-[5px]"
                onClick={() => setListSortDir((d) => (d === "asc" ? "desc" : "asc"))}
                title={listSortDir === "asc" ? "Artan" : "Azalan"}
              >
                {listSortDir === "asc" ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8 rounded-[5px] text-[11px] gap-1.5"
                onClick={exportCompanyList}
                disabled={apiLoading || listSorted.length === 0}
                title="Listelenen firmaları Excel olarak indir"
              >
                <Download className="h-3.5 w-3.5" />
                Excel
              </Button>
            </div>

            {/* Liste başlığı */}
            <div className="grid grid-cols-[1fr_100px_90px_110px_80px] gap-2 px-3 py-1.5 bg-muted/20 border-b border-border text-[10px] font-medium text-muted-foreground tracking-wider uppercase">
              <div>Firma</div>
              <div className="text-right">Firma Kodu</div>
              <div className="text-right">Kullanıcı</div>
              <div className="text-right">Lisans Bitiş</div>
              <div className="text-right">Durum</div>
            </div>

            {/* Liste satırları */}
            <div className="divide-y divide-border/40 max-h-[520px] overflow-y-auto">
              {apiLoading ? (
                <div className="p-3 space-y-1.5">
                  {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-8 w-full rounded-[5px]" />)}
                </div>
              ) : listSorted.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Building2 className="h-10 w-10 text-muted-foreground/30 mb-2" />
                  <p className="text-[12px] font-medium text-muted-foreground">
                    {listSearch.trim() ? "Arama sonucu bulunamadı" : "Kayıtlı firma yok"}
                  </p>
                </div>
              ) : (
                listSorted.map((comp) => {
                  const active = firmaIsActive(comp);
                  return (
                    <button
                      key={comp.id}
                      onClick={() => selectFirma(comp)}
                      className="grid grid-cols-[1fr_100px_90px_110px_80px] gap-2 px-3 py-2 text-[11px] hover:bg-muted/20 transition-colors text-left items-center w-full"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="truncate">{comp.firma}</span>
                      </div>
                      <div className="text-right font-mono text-[10px] text-muted-foreground tabular-nums">{comp.firkod || "—"}</div>
                      <div className="text-right tabular-nums">
                        <span className="inline-flex items-center gap-1 text-muted-foreground">
                          <Users className="h-3 w-3" />
                          {comp.userCount}
                        </span>
                      </div>
                      <div className="text-right text-muted-foreground tabular-nums">{comp.lisansBitis || "—"}</div>
                      <div className="flex justify-end">
                        <span className={`inline-flex items-center gap-1 text-[10px] font-medium ${active ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${active ? "bg-emerald-500" : "bg-red-500"}`} />
                          {active ? "Aktif" : "Süresi Doldu"}
                        </span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            {/* Footer */}
            <div className="px-3 py-2 border-t border-border/40 bg-muted/20 flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <Building2 className="h-3 w-3" />
              {listSorted.length} / {apiCompanies.length} firma listeleniyor
            </div>
          </div>
        </NestedCard>
      )}

      {/* Web hizmeti Users.xml kullanıcısı — ekle / düzenle / silme ilerlemesi */}
      <Dialog
        open={webUserDlg !== null}
        onOpenChange={(o) => { if (!o && !webUserSaving) { setWebUserDlg(null); setWebUserSteps(null) } }}
      >
        <DialogContent className="max-w-md p-0 gap-0">
          <DialogHeader className="px-5 py-3.5 border-b border-border/50">
            <DialogTitle className="flex items-center gap-2 text-[13px]">
              <UserPlus className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground font-normal">
                {webUserDlg?.mode === "edit" ? "Kullanıcı Düzenle"
                  : webUserDlg?.mode === "delete" ? "Kullanıcı Siliniyor"
                  : "Kullanıcı Ekle"}
              </span>
              <span className="text-foreground">— {webUserDlg?.siteName}</span>
            </DialogTitle>
          </DialogHeader>

          {/* İşlem başladıysa form yerine adım listesi */}
          {webUserSteps ? (
            <div className="px-5 py-4 space-y-2">
              {webUserSteps.map((s, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="mt-0.5 shrink-0">
                    {s.status === "done"    && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />}
                    {s.status === "running" && <RefreshCw className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400 animate-spin" />}
                    {s.status === "error"   && <XCircle className="h-3.5 w-3.5 text-destructive" />}
                    {s.status === "pending" && <span className="block h-3.5 w-3.5 rounded-full border border-border" />}
                  </span>
                  <div className="min-w-0">
                    <p className={`text-[11px] ${s.status === "pending" ? "text-muted-foreground" : ""}`}>{s.label}</p>
                    {s.error && <p className="text-[10px] text-destructive mt-0.5">{s.error}</p>}
                  </div>
                </div>
              ))}
              {webUserSteps.some((s) => s.status === "error") && webUserSteps[0].status === "done" && (
                <p className="text-[10px] text-amber-800 bg-amber-500/15 border border-amber-500/25 rounded-[5px] px-2.5 py-1.5">
                  Users.xml güncellendi ama site yeniden başlatılamadı — değişiklik uygulama yeniden
                  başlatılana kadar geçerli olmayabilir.
                </p>
              )}
            </div>
          ) : (
          <div className="px-5 py-4 space-y-3">
            <div className="space-y-1">
              <Label className="text-foreground/80 text-[12px] font-medium">Kullanıcı Adı</Label>
              <Input
                value={webUserName}
                onChange={(e) => setWebUserName(e.target.value)}
                placeholder="örn. MERKEZ"
                className="rounded-[5px] h-8 text-[13px] font-mono"
                autoFocus
              />
            </div>

            <div className="space-y-1">
              <Label className="text-foreground/80 text-[12px] font-medium">Şifre</Label>
              <div className="flex items-center gap-1.5">
                <Input
                  value={webUserPw}
                  onChange={(e) => setWebUserPw(e.target.value)}
                  className="rounded-[5px] h-8 text-[13px] font-mono"
                />
                <button
                  type="button"
                  onClick={() => setWebUserPw(generateSafePassword())}
                  className="h-8 px-2.5 shrink-0 inline-flex items-center gap-1 text-[11px] rounded-[5px] border border-border/60 hover:bg-muted/40 transition-colors"
                  title="Yeni şifre üret"
                >
                  <RefreshCw className="h-3 w-3" /> Üret
                </button>
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-foreground/80 text-[12px] font-medium">Veritabanları</Label>
              {webUserDlg?.dbOptions.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">Bu hizmet için veritabanı listesi bulunamadı.</p>
              ) : (
                <div className="rounded-[5px] border border-border/50 divide-y divide-border/40 max-h-40 overflow-y-auto">
                  {webUserDlg?.dbOptions.map((db) => {
                    const on = webUserDbs.includes(db)
                    return (
                      <label
                        key={db}
                        className="flex items-center gap-2 px-2.5 py-1.5 text-[11px] font-mono cursor-pointer hover:bg-muted/20"
                      >
                        <Checkbox
                          checked={on}
                          onCheckedChange={() =>
                            setWebUserDbs((prev) => (on ? prev.filter((x) => x !== db) : [...prev, db]))
                          }
                          className="size-3.5"
                        />
                        {db}
                      </label>
                    )
                  })}
                </div>
              )}
            </div>

            <p className="text-[10px] text-muted-foreground">
              Değişiklik sunucudaki <span className="font-mono">Config\Users.xml</span> dosyasına yazılır
              (önceki hali <span className="font-mono">.bak</span> olarak yedeklenir) ve ardından IIS
              sitesi yeniden başlatılır.
            </p>
          </div>
          )}

          <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border/50 bg-muted/10">
            {webUserSteps ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => { setWebUserDlg(null); setWebUserSteps(null) }}
                disabled={webUserSaving}
                className="rounded-[5px] h-7 text-[11px]"
              >
                {webUserSaving ? "Lütfen bekleyin…" : "Kapat"}
              </Button>
            ) : (
              <>
                <button
                  onClick={() => setWebUserDlg(null)}
                  disabled={webUserSaving}
                  className="px-3 py-1.5 rounded-[5px] border border-border/60 hover:bg-muted/40 text-[11px] font-medium text-muted-foreground transition-colors disabled:opacity-50"
                >
                  Vazgeç
                </button>
                <Button
                  size="sm"
                  onClick={saveWebUser}
                  disabled={webUserSaving || !webUserName.trim() || !webUserPw}
                  className="rounded-[5px] h-7 text-[11px] gap-1.5"
                >
                  {webUserDlg?.mode === "edit" ? "Kaydet" : "Ekle"}
                </Button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Erişim testi sonucu — servisten dönen veri */}
      <Dialog open={webUserTestDetail !== null} onOpenChange={(o) => { if (!o) setWebUserTestDetail(null) }}>
        <DialogContent className="max-w-lg p-0 gap-0">
          <DialogHeader className="px-5 py-3.5 border-b border-border/50">
            <DialogTitle className="flex items-center gap-2 text-[13px]">
              {webUserTestDetail?.ok
                ? <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                : <XCircle className="h-4 w-4 text-destructive" />}
              <span className="text-muted-foreground font-normal">Erişim Testi</span>
              <span className="text-foreground font-mono">{webUserTestDetail?.username}</span>
            </DialogTitle>
          </DialogHeader>

          <div className="px-5 py-4 space-y-3">
            <div
              className={`rounded-[5px] border px-3 py-2 text-[11px] ${
                webUserTestDetail?.ok
                  ? "border-emerald-500/25 bg-emerald-500/15 text-emerald-800"
                  : "border-red-500/25 bg-red-500/15 text-red-700 dark:text-red-400"
              }`}
            >
              {webUserTestDetail?.message}
            </div>

            <div className="rounded-[5px] border border-border/50 divide-y divide-border/40">
              <div className="flex items-center gap-3 px-3 py-1.5">
                <span className="text-[11px] text-foreground/60 w-[90px] shrink-0">Hizmet</span>
                <span className="text-[11px] font-mono truncate">{webUserTestDetail?.siteName}</span>
              </div>
              <div className="flex items-center gap-3 px-3 py-1.5">
                <span className="text-[11px] text-foreground/60 w-[90px] shrink-0">Hedef</span>
                <span className="text-[11px] font-mono truncate">
                  {webUserTestDetail?.host ?? "—"}
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-[5px] border border-border/50 bg-muted/30 shrink-0">
                  {webUserTestDetail?.via === "wan" ? "dışarıdan (DNS)" : "LAN (IP)"}
                </span>
              </div>
              {webUserTestDetail?.endpoint && (
                <div className="flex items-center gap-3 px-3 py-1.5">
                  <span className="text-[11px] text-foreground/60 w-[90px] shrink-0">Uç</span>
                  <span className="text-[11px] font-mono truncate">{webUserTestDetail.endpoint}</span>
                </div>
              )}
              {webUserTestDetail?.ms !== undefined && (
                <div className="flex items-center gap-3 px-3 py-1.5">
                  <span className="text-[11px] text-foreground/60 w-[90px] shrink-0">Süre</span>
                  <span className="text-[11px] font-mono tabular-nums">{webUserTestDetail.ms} ms</span>
                </div>
              )}
            </div>

            {/* Asıl kanıt: servisin bu kullanıcı için döndürdüğü veritabanları */}
            {webUserTestDetail?.databases && (
              <div className="space-y-1">
                <Label className="text-foreground/80 text-[12px] font-medium">
                  Servisin döndürdüğü veritabanları ({webUserTestDetail.databases.length})
                </Label>
                {webUserTestDetail.databases.length === 0 ? (
                  <p className="text-[11px] text-amber-800 bg-amber-500/15 border border-amber-500/25 rounded-[5px] px-2.5 py-1.5">
                    Giriş geçti ama kullanıcıya hiç veritabanı dönmedi — Users.xml&apos;deki DB adları
                    sunucudakilerle eşleşmiyor olabilir.
                  </p>
                ) : (
                  <div className="rounded-[5px] border border-border/50 divide-y divide-border/40">
                    {webUserTestDetail.databases.map((db) => (
                      <div key={db} className="px-3 py-1.5 text-[11px] font-mono">{db}</div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {webUserTestDetail?.raw && (
              <details className="rounded-[5px] border border-border/50">
                <summary className="px-3 py-1.5 text-[11px] cursor-pointer select-none hover:bg-muted/30">
                  Ham yanıt
                </summary>
                <div className="px-3 py-2 space-y-2 border-t border-border/40">
                  {Object.entries(webUserTestDetail.raw).map(([k, v]) => (
                    <div key={k}>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{k}</p>
                      <pre className="mt-0.5 text-[10px] font-mono whitespace-pre-wrap break-all max-h-40 overflow-y-auto bg-muted/20 rounded-[5px] px-2 py-1.5">
                        {v}
                      </pre>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border/50 bg-muted/10">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setWebUserTestDetail(null)}
              className="rounded-[5px] h-7 text-[11px]"
            >
              Kapat
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Users.xml kullanıcısı silme onayı */}
      <AlertDialog
        open={webUserDelTarget !== null}
        onOpenChange={(o) => { if (!o) setWebUserDelTarget(null) }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Kullanıcı silinsin mi?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-mono">{webUserDelTarget?.username}</span> kullanıcısı{" "}
              <span className="font-mono">{webUserDelTarget?.siteName}</span> hizmetinin Users.xml
              dosyasından silinecek ve site yeniden başlatılacak. Bu kullanıcı uygulamaya giriş yapamaz hale gelir.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Vazgeç</AlertDialogCancel>
            <AlertDialogAction onClick={deleteWebUser} className="bg-destructive text-white">
              Sil
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageContainer>
  );
}

/* ─── Erişim Bilgileri modal'ı için küçük helper component'ler ──────────── */

function CopyIconButton({ value, subtle }: { value: string; subtle?: boolean }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      onClick={async (e) => {
        e.stopPropagation()
        if (!value) return
        const ok = await copyToClipboard(value)
        if (ok) {
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        }
      }}
      disabled={!value}
      // subtle: her hücrede tam görünür ikon ekranı kalabalıklaştırıyordu —
      // sönük duruyor, satırın üstüne gelince netleşiyor.
      className={`shrink-0 inline-flex items-center justify-center size-6 rounded-[5px] hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-opacity disabled:opacity-30 ${
        subtle ? "opacity-30 group-hover:opacity-100 focus-visible:opacity-100" : ""
      }`}
      title="Kopyala"
    >
      {copied
        ? <CheckCheck className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
        : <Copy className="h-3.5 w-3.5" />}
    </button>
  )
}

/* ─── "Erişim" sekmesi — kompakt tablo bileşenleri ─────────────────────── */

/** Hizmet detayındaki Users.xml tablosunun kolon şablonu (son kolon: aksiyon menüsü). */
const ACCESS_SVC_COLS = "grid grid-cols-[minmax(120px,200px)_130px_minmax(160px,1fr)_32px] gap-3"

/** Kullanıcılar tablosunun kolon şablonu. */
const ACCESS_USER_COLS =
  "grid grid-cols-[minmax(120px,200px)_130px_minmax(150px,240px)_minmax(120px,1fr)] gap-3"

/**
 * Sol listedeki seçilebilir kart. Seçili olan belirgin (beyaz zemin + sol
 * vurgu çizgisi); diğerleri sakin ama okunur — "soluk" görünmemesi için
 * başlıklar foreground, alt bilgi muted.
 */
function AccessNavCard({
  active, onClick, icon, title, subtitle, count, loading,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  title: string
  subtitle?: string
  count?: number
  loading?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left rounded-[5px] border px-2.5 py-2 transition-colors ${
        active
          ? "border-primary/40 bg-primary/[0.06] shadow-[inset_2px_0_0_0_var(--primary)]"
          : "border-border/60 bg-card hover:bg-muted/30"
      }`}
    >
      <span className="flex items-center gap-1.5 min-w-0">
        <span className={active ? "text-primary" : "text-muted-foreground"}>{icon}</span>
        <span className="text-[13px] font-medium truncate flex-1">{title}</span>
        {loading
          ? <Skeleton className="h-3 w-6 rounded-[5px]" />
          : count !== undefined && (
              <span className="text-[10px] bg-muted rounded-[5px] px-1.5 py-0.5 font-medium tabular-nums">{count}</span>
            )}
      </span>
      {subtitle && (
        <span className="block mt-0.5 pl-5 text-[10px] font-mono text-muted-foreground truncate">{subtitle}</span>
      )}
    </button>
  )
}

/** Sağ paneldeki blok başlığı. */
function AccessDetailHeader({ title }: { title: string }) {
  return (
    <div className="px-3 py-2 bg-muted/20 border-b border-border">
      <span className="text-[11px] font-semibold">{title}</span>
    </div>
  )
}

/** Sağ panelde "etiket — değer — kopyala" satırı. */
function AccessDetailRow({
  label, value, copyValue, link,
}: { label: string; value: string; copyValue: string; link?: boolean }) {
  return (
    <div className="group flex items-center gap-3 px-3 py-2 hover:bg-muted/20 transition-colors">
      <span className="text-[11px] text-foreground/60 w-[110px] shrink-0">{label}</span>
      {link && value.startsWith("http") ? (
        <a
          href={value}
          target="_blank"
          rel="noreferrer"
          className="text-[11px] font-mono text-blue-600 dark:text-blue-400 hover:underline truncate flex-1"
        >
          {value}
        </a>
      ) : (
        <span className="text-[11px] font-mono truncate flex-1" title={value}>{value}</span>
      )}
      <CopyIconButton value={copyValue} subtle />
    </div>
  )
}

function AccessEmpty({ text }: { text: string }) {
  return <div className="px-3 py-6 text-center text-[11px] text-muted-foreground">{text}</div>
}

/** Tablo hücresi — mono değer, kopyala ikonu satır hover'ında belirir. */
function AccessCell({ value, muted }: { value: string; muted?: boolean }) {
  if (!value || value === "—") {
    return <span className="text-[11px] text-muted-foreground/50">—</span>
  }
  return (
    <span className="inline-flex items-center gap-1 min-w-0" title={value}>
      <span className={`text-[11px] font-mono truncate ${muted ? "text-muted-foreground line-through" : ""}`}>
        {value}
      </span>
      <CopyIconButton value={value} subtle />
    </span>
  )
}

/** Şifre hücresi — varsayılan gizli, göz ikonu ile açılır. */
function AccessPwCell({ value }: { value: string }) {
  const [show, setShow] = useState(false)
  return (
    <span className="inline-flex items-center gap-0.5 min-w-0">
      <span className="text-[11px] font-mono truncate select-all tracking-wider">
        {show ? value : "••••••••"}
      </span>
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="shrink-0 inline-flex items-center justify-center size-6 rounded-[5px] hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-opacity opacity-30 group-hover:opacity-100 focus-visible:opacity-100"
        title={show ? "Gizle" : "Göster"}
      >
        {show ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
      </button>
      <CopyIconButton value={value} subtle />
    </span>
  )
}
