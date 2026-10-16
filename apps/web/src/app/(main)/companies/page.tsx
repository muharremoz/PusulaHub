"use client";

import { useState, useEffect, useMemo, useRef } from "react";
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
const WeeklyUsageChart = dynamic(() => import("@/components/companies/weekly-usage-chart").then((m) => m.WeeklyUsageChart), { ssr: false, loading: () => <Skeleton className="h-full w-full" /> });
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@muharremoz/pusula-ui";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@muharremoz/pusula-ui";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tooltip as UiTooltip, TooltipContent, TooltipTrigger, Table, InlineTextFilter, InlineSelectFilter, type TableColumn, type SortState } from "@muharremoz/pusula-ui";
import { Popover, PopoverContent, PopoverTrigger } from "@muharremoz/pusula-ui";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ListeKarti, ListeThead, ListeBosSatir, ListeSayfalama, ListeAksiyonButonu } from "@/components/shared/liste-karti";
import { MetinFiltre, SecimFiltre, SayiAralikFiltre, TarihFiltre, tarihUygun, type SayiAralikDeger, type TarihFiltreDeger } from "@/components/shared/liste-filtreleri";
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
import type { CompanyDetail } from "@/app/api/companies/[firkod]/detail/route";
const GirisSirasiSheet = dynamic(() => import("@/components/companies/giris-sirasi-sheet").then((m) => m.GirisSirasiSheet), { ssr: false });
const OldDataRestoreDialog = dynamic(() => import("@/components/companies/old-data-restore-dialog").then((m) => m.OldDataRestoreDialog), { ssr: false });

interface FirmaCompany {
  id: string
  firkod: string
  firma: string
  email: string
  phone: string
  userCount: number
  lisansBitis: string
  /** CRM'deki müşteri temsilcisi — CRM'e ulaşılamazsa null */
  temsilci?: { id: string; ad: string; parsKodu: number | null; aktif: boolean } | null
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
  /** guvenlik.YedekAl — null: guvenlik'te satırı yok */
  YedekAl:       boolean | null
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
  /** Pars satırı: yönetim panelinin açılacağı hizmet id'si (satır id'si sentetik) */
  parsServiceId?: number
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
import { Building2, Users, Server, Mail, Phone, User, Calendar, Cpu, MemoryStick, HardDrive, CheckCircle2, XCircle, Briefcase, StickyNote, Activity, Database, MoreVertical, LogOut, KeyRound, Laptop, Ban, Globe, Info, Play, Square, RotateCw, Trash2, Download, Upload, Terminal, Settings2, ToggleLeft, ToggleRight, Copy, CheckCheck, X, Bookmark, Trash, Save, Bug, Plus, Check, Eye, EyeOff, RefreshCw, UserPlus, Tag as TagIcon, FileText, ListOrdered, ShieldCheck, ListFilter, ArrowRight, Pencil, Network } from "lucide-react"
import type { AdProvisionService } from "@/components/company-setup/ad-provision-runner";
import { StepServicesPars } from "@/components/company-setup/step-services-pars";
import { ConnectKoduDialog } from "@/components/companies/connect-kodu-dialog";
import { hizmetGorunum, HizmetIkonu } from "@/components/companies/hizmet-gorunum";
import { Combobox } from "@/components/ui/combobox";
import { ConnectCihazlarDialog } from "@/components/companies/connect-cihazlar-dialog";
import { TerminalDegistirSheet } from "@/components/companies/terminal-degistir-sheet";
const ParsYonetimSheet = dynamic(() => import("@/components/companies/pars-yonetim-sheet").then((m) => m.ParsYonetimSheet), { ssr: false });
import { PARS_TIPLER, parsSifreUret, parsSifreGecerliMi, parsKullaniciAdiGecerliMi, parsTipFromProgramCode, parsMesajSatirlari, type ParsKatalog, type ParsWizardUser } from "@/lib/pars-katalog";
import type { PusulaProgramConfig } from "@/app/api/services/route";
import { apiKimlikAlanHatalari, apiKimlikHatasi, apiSifreUret } from "@/lib/setup-iisops";
const AdProvisionRunner = dynamic(() => import("@/components/company-setup/ad-provision-runner").then((m) => m.AdProvisionRunner), { ssr: false });
import { meetsAdComplexity } from "@/components/company-setup/step-users";
import type { WizardServiceDto } from "@/app/api/services/route";
import { Checkbox, Field } from "@/components/shared/form"
import { FirmaAnaliz } from "@/components/companies/firma-analiz";
import { sqlLoginAdi } from "@/lib/firma-adlandirma";

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
  // CPU/RAM: 30 günün firma TOPLAMI (y30) — yoksa eski geçmiş özeti / canlı değer.
  const mq = d.manualQuota;
  const h = d.history30d;
  const y30 = d.yogunluk30d;
  const avgRamMB    = y30 ? y30.ramMB : h ? h.avgRamGB * 1024 : d.usageRamMB;
  const avgDbMB     = h ? (h.dbStartMB + h.dbEndMB) / 2 : d.dbSizeMB;
  const avgCpuValue = y30 ? y30.cpu : h ? h.avgCpu : d.usageCpu;
  // Varsayılan kota: kullanıcı başı CPU %5 / RAM 2 GB (sunucunun tamamına oranlamak her firmayı %5 gösteriyordu)
  const cpuKota   = mq?.cpuPct || y30?.quotaCpu || 100;
  const ramKotaMB = (mq?.ramGB ? mq.ramGB * 1024 : 0) || y30?.quotaRamMB || d.quotaRamMB;

  // Manuel kota verildiyse bar o kotaya göre hesaplanır; yoksa mevcut davranış
  // (paylaşımlı sunucu oranı / varsayılan kota).
  const cpuPct  = cpuKota === 100 ? pctCpu(avgCpuValue) : pctMB(avgCpuValue, cpuKota);
  const ramPct  = pctMB(avgRamMB, ramKotaMB);
  const diskPct = mq?.diskGB ? pctMB(d.usageDiskMB,  mq.diskGB * 1024)  : pctMB(d.usageDiskMB, d.quotaDiskMB);
  const dbPct   = mq?.dbGB   ? pctMB(avgDbMB,        mq.dbGB   * 1024)  : pctMB(avgDbMB,       d.dbTotalMB);

  // Yoğunluk: CPU + RAM + Disk + DB yüzdelerinin ortalaması (User kaldırıldı)
  const active = [d.quotaCpu > 0, d.quotaRam > 0, d.quotaDisk > 0, d.dbQuota > 0].filter(Boolean).length;
  const yogunluk = active === 0
    ? 0
    : Math.round(((d.quotaCpu > 0 ? cpuPct : 0) + (d.quotaRam > 0 ? ramPct : 0) + (d.quotaDisk > 0 ? diskPct : 0) + (d.dbQuota > 0 ? dbPct : 0)) / active);

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
          dbGB:   Number(qDb)   || 5,
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

  // Seviye: renk + etiket — skor, metrik kutuları ve çubuklar aynı eşikleri kullanır
  const seviye = (p: number) =>
    p >= 80 ? { etiket: "Kritik", metin: "text-red-600 dark:text-red-400",       cubuk: "bg-red-500",     rozet: "bg-red-500/15 text-red-700 dark:text-red-400" } :
    p >= 60 ? { etiket: "Yoğun",  metin: "text-amber-600 dark:text-amber-400",   cubuk: "bg-amber-500",   rozet: "bg-amber-500/15 text-amber-700 dark:text-amber-400" } :
              { etiket: "Normal", metin: "text-emerald-600 dark:text-emerald-400", cubuk: "bg-emerald-500", rozet: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" };
  const sayi = (n: number, basamak = 1) => n.toLocaleString("tr-TR", { maximumFractionDigits: basamak });
  const tarih = (s: string | null | undefined) => {
    if (!s) return "";
    const [y, a, g] = s.slice(0, 10).split("-");
    return y && a && g ? `${g}.${a}.${y}` : s;
  };
  const skor = seviye(yogunluk);

  const metrics = [
    { label: "CPU",        icon: <Cpu className="size-3.5" />,         pct: cpuPct,
      detay: `Ort %${sayi(avgCpuValue)} / %${sayi(cpuKota)}${!mq?.cpuPct && y30 ? ` · ${y30.users} kişi` : ""}`, manuel: !!mq?.cpuPct },
    { label: "RAM",        icon: <MemoryStick className="size-3.5" />, pct: ramPct,
      detay: `${sayi(avgRamMB / 1024)} / ${sayi(ramKotaMB / 1024)} GB${!mq?.ramGB && y30 ? ` · ${y30.users} kişi` : ""}`, manuel: !!mq?.ramGB },
    { label: "Disk",       icon: <HardDrive className="size-3.5" />,   pct: diskPct,
      detay: `${sayi(d.usageDiskMB / 1024)} / ${sayi(mq?.diskGB ?? d.quotaDiskMB / 1024)} GB`, manuel: !!mq?.diskGB },
    { label: "Veritabanı", icon: <Database className="size-3.5" />,    pct: dbPct,
      detay: `${sayi(avgDbMB / 1024, 2)} / ${sayi(mq?.dbGB ?? d.dbTotalMB / 1024)} GB`, manuel: !!mq?.dbGB },
  ];

  return (
    <>
    <NestedCard
      className="h-full flex flex-col"
      innerClassName="flex-1 flex flex-col gap-3"
      footer={
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-1.5">
            <Activity className="size-3" />
            <span>Son 30 gün ortalamasının kotaya oranı · CPU, RAM, Disk, Veritabanı</span>
          </div>
          <button
            onClick={() => setDetailOpen(true)}
            className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
          >
            <Info className="size-3" />
            Hesaplama
          </button>
        </div>
      }
    >
      {/* Başlık + skor */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[13px] font-semibold">Kullanım Yoğunluğu</h3>
          <div className="mt-1 flex items-baseline gap-2">
            <span className={`text-3xl font-bold tabular-nums leading-none ${skor.metin}`}>%{yogunluk}</span>
            <span className={`inline-flex rounded-[5px] px-2 py-0.5 text-[11px] font-medium ${skor.rozet}`}>{skor.etiket}</span>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={openQuota} className="h-7 shrink-0 gap-1.5 rounded-[5px] px-2.5 text-[12px]" title="Firma için manuel kota ayarla">
          <Settings2 className="size-3.5" /> Kota
        </Button>
      </div>

      {/* Metrikler — 2×2 kutu */}
      <div className="grid grid-cols-2 gap-2">
        {metrics.map((m) => {
          const s = seviye(m.pct);
          return (
            <div key={m.label} className="rounded-[5px] bg-[var(--section-bg)] px-3 py-2">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                {m.icon}
                <span className="text-[12px] font-medium">{m.label}</span>
                <span className={`ml-auto text-[13px] font-semibold tabular-nums ${m.pct >= 60 ? s.metin : "text-foreground"}`}>%{m.pct}</span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                <div className={`h-full rounded-full ${s.cubuk}`} style={{ width: `${m.pct}%` }} />
              </div>
              <p className="mt-1 truncate text-[11px] tabular-nums text-muted-foreground" title={m.manuel ? "Elle verilmiş kotaya göre" : undefined}>
                {m.detay}{m.manuel && <span className="text-primary"> · elle kota</span>}
              </p>
            </div>
          );
        })}
      </div>

      {/* 30 günlük geçmiş özeti */}
      {d.history30d && (
        <div className="mt-auto grid grid-cols-3 divide-x border-t pt-3">
          <div className="flex min-w-0 flex-col pr-3">
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">CPU · 30 gün</span>
            {/* Zirve ölçülmemişse "—": sıfır yazıp "hiç yük olmamış" izlenimi verme */}
            <span className="text-[13px] font-semibold tabular-nums">
              Ort %{sayi(d.history30d.avgCpu)}
              <span className="font-normal text-muted-foreground"> · zirve {d.history30d.peakCpu == null ? "—" : `%${sayi(d.history30d.peakCpu)}`}</span>
            </span>
            <span className="text-[11px] tabular-nums text-muted-foreground">{d.history30d.peakCpu != null && d.history30d.peakCpuDate ? `zirve günü ${tarih(d.history30d.peakCpuDate)}` : " "}</span>
          </div>
          <div className="flex min-w-0 flex-col px-3">
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">RAM · 30 gün</span>
            <span className="text-[13px] font-semibold tabular-nums">
              Ort {sayi(d.history30d.avgRamGB)} GB
              <span className="font-normal text-muted-foreground"> · zirve {d.history30d.peakRamGB == null ? "—" : `${sayi(d.history30d.peakRamGB)} GB`}</span>
            </span>
            <span className="text-[11px] tabular-nums text-muted-foreground">{d.history30d.peakRamGB != null && d.history30d.peakRamDate ? `zirve günü ${tarih(d.history30d.peakRamDate)}` : " "}</span>
          </div>
          <div className="flex min-w-0 flex-col pl-3">
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Veritabanı büyümesi</span>
            <span className="text-[13px] font-semibold tabular-nums">
              {sayi(d.history30d.dbStartMB / 1024)} → {sayi(d.history30d.dbEndMB / 1024)} GB
            </span>
            <span className={`text-[11px] font-medium tabular-nums ${d.history30d.dbGrowthPct > 0 ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground"}`}>
              {(() => {
                const farkGB = (d.history30d.dbEndMB - d.history30d.dbStartMB) / 1024
                const isaret = (n: number) => (n > 0 ? "+" : n < 0 ? "−" : "")
                return `${isaret(d.history30d.dbGrowthPct)}%${sayi(Math.abs(d.history30d.dbGrowthPct))} · 30 günde ${isaret(farkGB)}${sayi(Math.abs(farkGB))} GB`
              })()}
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
          Elle kota yoksa varsayılanlar: CPU kullanıcı başı %5, RAM kullanıcı başı 2 GB
          (son 30 günün ortalama günlük kullanıcı sayısı), Disk 25 GB, Veritabanı 5 GB.
          4 metriğin ortalaması yoğunluk skorunu oluşturur:
        </p>

        <div className="space-y-1.5 mt-1">
          {[
            { label: "CPU Kullanımı",  icon: <Cpu className="h-3.5 w-3.5" />,        pct: cpuPct,  detail: `Ort %${avgCpuValue} / %${cpuKota}` },
            { label: "RAM Kullanımı",  icon: <MemoryStick className="h-3.5 w-3.5" />, pct: ramPct,  detail: `${(avgRamMB/1024).toFixed(1)} / ${(ramKotaMB/1024).toFixed(1)} GB` },
            { label: "Disk Kullanımı", icon: <HardDrive className="h-3.5 w-3.5" />,   pct: diskPct, detail: `${d.usageDisk.toFixed(1)} / ${(d.quotaDiskMB / 1024).toFixed(0)} GB` },
            { label: "Veritabanı",     icon: <Database className="h-3.5 w-3.5" />,    pct: dbPct,   detail: `${(avgDbMB / 1024).toFixed(2)} / ${(d.dbTotalMB / 1024).toFixed(0)} GB` },
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
            { lbl: "CPU limiti (%)", val: qCpu,  set: setQCpu,  ph: "Kullanıcı başı %5",  unit: "%"  },
            { lbl: "RAM (GB)",       val: qRam,  set: setQRam,  ph: "Kullanıcı başı 2 GB",  unit: "GB" },
            { lbl: "Disk (GB)",      val: qDisk, set: setQDisk, ph: "25 (varsayılan)", unit: "GB" },
            { lbl: "Veritabanı (GB)",val: qDb,   set: setQDb,   ph: "5 (varsayılan)",  unit: "GB" },
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
  const [selectedFirma, setSelectedFirma] = useState<FirmaCompany | null>(null);
  // Firma etiketleri
  const [firmaTags, setFirmaTags] = useState<string[]>([]);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [tagPopoverOpen, setTagPopoverOpen] = useState(false);
  const [tagInput, setTagInput] = useState("");
  // Panik: firmanın erişimini tek hamlede kesme
  const [panicOpen, setPanicOpen] = useState(false);
  const [panicBusy, setPanicBusy] = useState(false);
  const [tagBusy, setTagBusy] = useState(false);
  const [apiCompanies, setApiCompanies] = useState<FirmaCompany[]>([]);
  const [apiLoading, setApiLoading] = useState(true);

  /* Sütun başlığı filtreleri — liste tasarım deseni standardı. */
  const [firmaFiltre,  setFirmaFiltre]  = useState("");
  const [kodFiltre,    setKodFiltre]    = useState("");
  const [durumFiltre,  setDurumFiltre]  = useState<string[]>([]);
  const [temsilciFiltre, setTemsilciFiltre] = useState<string[]>([]);
  const [lisansFiltre, setLisansFiltre] = useState<TarihFiltreDeger>({ mode: "tum" });
  const [kullaniciFiltre, setKullaniciFiltre] = useState<SayiAralikDeger>({});

  /* Sayfalama — sayfa başına 25 kayıt. */
  const FIRMA_SAYFA_BOYU = 25;
  const [firmaSayfa, setFirmaSayfa] = useState(1);
  const [listSortKey, setListSortKey] = useState<"firma" | "firkod" | "userCount" | "lisansBitis" | "status" | "temsilci">("firma");
  const [listSortDir, setListSortDir] = useState<"asc" | "desc">("asc");

  const [tabUsers, setTabUsers] = useState<TabUser[]>([]);
  /** Firmanın erişimi kesik mi: kullanıcı var ve hiçbiri aktif değil. */
  const firmaErisimiKesik =
    tabUsers.length > 0 && tabUsers.every((u) => !u.enabled);
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
  /** webUsers hangi firma için yüklendi — Hizmetler ve Erişim sekmesi aynı veriyi paylaşır, iki kez okunmasın */
  const [webUsersFirma, setWebUsersFirma]   = useState<string | null>(null);
  // Pars kullanıcı şifreleri (Ayar.mdb'den canlı) — Hizmetler listesinde gösterilir
  const [parsSifreler, setParsSifreler]     = useState<{ serviceId: number; users: { parsUserId: number; username: string; password: string | null }[]; error?: string }[]>([]);
  const [parsSifreLoading, setParsSifreLoading] = useState(false);
  const [parsSifreFirma, setParsSifreFirma] = useState<string | null>(null);
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
  // Kaydet'e basıldı mı (uyarılar ancak o zaman) + eksik alan sallanması
  const [webUserDenendi, setWebUserDenendi] = useState(false);
  const [webUserSallan, setWebUserSallan]   = useState(false);
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
  const [yedekAlKaydediliyor, setYedekAlKaydediliyor] = useState<string | null>(null);
  const [yedekKapatOnay, setYedekKapatOnay] = useState<TabSQLDatabase | null>(null);
  // Kullanıcılar / Veritabanları sekmesi sütun başlığı filtreleri — firma değişince sıfırlanır
  const [kulAdFiltre, setKulAdFiltre]       = useState("");
  const [kulIsimFiltre, setKulIsimFiltre]   = useState("");
  const [kulDurumFiltre, setKulDurumFiltre] = useState<("aktif" | "pasif")[]>([]);
  const [kulOfficeFiltre, setKulOfficeFiltre] = useState<("var" | "yok")[]>([]);
  const [dbAdFiltre, setDbAdFiltre]         = useState("");
  const [dbYedekFiltre, setDbYedekFiltre]   = useState<("acik" | "kapali" | "kayitsiz")[]>([]);
  const [dbDurumFiltre, setDbDurumFiltre]   = useState<("online" | "diger")[]>([]);
  // pusula-ui Table filtre satırı aç/kapa (CRM Teklifler deseni)
  const [kulFiltreAcik, setKulFiltreAcik]   = useState(false);
  const [dbFiltreAcik, setDbFiltreAcik]     = useState(false);
  const [kulSira, setKulSira]               = useState<SortState | null>(null);
  const [dbSira, setDbSira]                 = useState<SortState | null>(null);
  const [svcAdFiltre, setSvcAdFiltre]       = useState("");
  const [svcKatFiltre, setSvcKatFiltre]     = useState<string[]>([]);
  const [svcDurumFiltre, setSvcDurumFiltre] = useState<("calisiyor" | "durdu" | "yok")[]>([]);
  const [svcFiltreAcik, setSvcFiltreAcik]   = useState(false);
  const [svcSira, setSvcSira]               = useState<SortState | null>(null);
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
  const [debugId, setDebugId]                     = useState<string | null>(null);
  const debugOfsetRef                             = useRef(0);
  const debugFetchingRef                          = useRef(false);
  const debugBoxRef                               = useRef<HTMLDivElement>(null);

  // Yeni Kullanıcı dialog
  const [oldDataOpen, setOldDataOpen]             = useState(false);
  const [girisSirasiOpen, setGirisSirasiOpen]     = useState(false);
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
  // Olustur basildi mi — eksik alan uyarilari ancak o zaman gorunur (dugme hic silik durmasin)
  const [newUserDenendi, setNewUserDenendi]       = useState(false);
  const [newUserSallan, setNewUserSallan]         = useState(false);
  // Sunucu secenekleri gelene kadar iskelet — yoksa once secici, sonra serit gorunup ziplıyordu
  const [newUserSunucuYukleniyor, setNewUserSunucuYukleniyor] = useState(false);

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
  const [connectKoduKullanici, setConnectKoduKullanici] = useState<string | null>(null);
  const [terminalDegistirAcik, setTerminalDegistirAcik] = useState(false);
  const [connectCihazKullanici, setConnectCihazKullanici] = useState<string | null>(null);
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

  /**
   * Office çalıştırma yetkisi — kullanıcıyı `Office_Kullanicilari` AD
   * grubuna ekler/çıkarır.
   *
   * Terminal sunucularda AppLocker bu grubu arıyor. Grup üyeliği OTURUM
   * AÇARKEN belirlendiği için kullanıcı o an bağlıysa yetki hemen
   * geçerli olmuyor; bilgi mesajı bunu söylüyor, "çalışmadı" sanılmasın.
   */
  async function toggleOffice(usr: { username: string; groups?: string[] }) {
    if (!selectedFirma) return
    const acik = (usr.groups ?? []).includes("Office_Kullanicilari")
    try {
      const r = await fetch(`/api/companies/${selectedFirma.firkod}/users/action`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ username: usr.username, action: acik ? "office-off" : "office-on" }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error ?? "İşlem başarısız")
      /*  Listeyi yerinde güncelle: ajan raporu 5 dk'da bir yenileniyor,
       *  o zamana kadar menü eski durumu gösterirdi.                    */
      setTabUsers((prev) => prev.map((x) =>
        x.username === usr.username
          ? { ...x, groups: acik
              ? (x.groups ?? []).filter((g) => g !== "Office_Kullanicilari")
              : [...(x.groups ?? []), "Office_Kullanicilari"] }
          : x,
      ))
      toast.success(acik ? "Office yetkisi kaldırıldı" : "Office yetkisi verildi", {
        description: `${usr.username} · oturum açıkken değişmez, çıkıp girmeli`,
      })
    } catch (err) {
      toast.error("Office yetkisi değiştirilemedi", {
        description: err instanceof Error ? err.message : String(err),
      })
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
  // Pars (mobil) — dialogda Pars hizmeti seçilince: kullanıcılar + raporlar + bağlanacak DB'ler
  const [newSvcParsUsers, setNewSvcParsUsers]         = useState<ParsWizardUser[]>([]);
  const [newSvcParsReportIds, setNewSvcParsReportIds] = useState<number[]>([]);
  const [newSvcParsKatalog, setNewSvcParsKatalog]     = useState<ParsKatalog | null>(null);
  const [newSvcParsKatalogFor, setNewSvcParsKatalogFor] = useState<number | null>(null);
  const [newSvcParsLoading, setNewSvcParsLoading]     = useState(false);
  const [newSvcParsError, setNewSvcParsError]         = useState<string | null>(null);
  /** DB adı → Pars tip ID (string); "" = bağlanmaz */
  const [newSvcParsDbTips, setNewSvcParsDbTips]       = useState<Record<string, string>>({});
  /** Ayar.mdb yazma adımının sonucu — mesaj yalnız başarılıysa gösterilir */
  const [newSvcParsDurum, setNewSvcParsDurum]         = useState<"yok" | "tamam" | "hata">("yok");
  /** Pars yönetim paneli (kullanıcı/şifre, raporlar, veritabanı) */
  const [parsYonetim, setParsYonetim] = useState<{ serviceId: number | null; sekme: string } | null>(null);
  const [newSvcMsgCopied, setNewSvcMsgCopied]         = useState(false);
  /** API hizmeti (iis-site) id → elle girilen Users.xml kullanıcısı; boş = kardeş hizmetten kopyala */
  const [newSvcApiKimlik, setNewSvcApiKimlik]         = useState<Record<number, { username: string; password: string }>>({});
  /** Hizmet ekle kutusunun kategori filtresi; "" = tümü */
  const [newSvcFiltre, setNewSvcFiltre]               = useState("");
  let _parsRowId = 1
  const mkParsRow = (): ParsWizardUser => ({ id: Date.now() + (_parsRowId++), username: "", password: parsSifreUret(), admin: false })

  // Şifre üretici — connection string / XML uyumlu karakter seti.
  const generatePassword = () => generateSafePassword(10)

  async function openNewUserDialog() {
    if (!selectedFirma) return
    setNewUserOpen(true)
    setNewUserStarted(false); setNewUserError(null); setNewUserDone(false); setNewUserMsgCopied(false); setNewUserDenendi(false)
    setNewUserUsername(""); setNewUserDisplayName(""); setNewUserEmail(""); setNewUserPhone(""); setNewUserPassword(""); setNewUserShowPw(false)
    setNewUserAdServerId(""); setNewUserRdpServerId(""); setNewUserAdLocked(false); setNewUserRdpLocked(false)
    setNewUserSunucuYukleniyor(true)
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
    } finally {
      setNewUserSunucuYukleniyor(false)
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

  /** @param onlyPars true → var olan Pars hizmetine kullanıcı ekleme: Pars seçili ve sekme Mobil açılır */
  async function openNewSvcDialog(onlyPars = false) {
    if (!selectedFirma) return
    setNewSvcOpen(true)
    setNewSvcStarted(false); setNewSvcDone(false); setNewSvcError(null)
    setNewSvcSelectedIds([]); setNewSvcIisServerId(""); setNewSvcDepoServerId(""); setNewSvcApiKimlik({}); setNewSvcFiltre("")
    setNewSvcAdServerId(""); setNewSvcWindowsServerId(""); setNewSvcWindowsLocked(false)
    setNewSvcParsUsers([mkParsRow()]); setNewSvcParsReportIds([]); setNewSvcParsError(null)
    setNewSvcParsKatalog(null); setNewSvcParsKatalogFor(null)
    setNewSvcParsDurum("yok"); setNewSvcMsgCopied(false)
    // Firmanın mevcut DB'leri program koduna göre tipiyle hazır gelsin
    const dbTips: Record<string, string> = {}
    for (const d of tabSQL) { const t = parsTipFromProgramCode(d.ProgramCode); dbTips[d.Name] = t === null ? "" : String(t) }
    setNewSvcParsDbTips(dbTips)
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
      const parsSvc = catalog.find((s) => s.type === "pars")
      if (onlyPars && parsSvc) setNewSvcSelectedIds([parsSvc.id])
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
  // Resim: IIS'te site kurar (IIS sunucusu) + Depo'daki paylaşımı yayınlar (Depo sunucusu)
  const newSvcHasResim         = newSvcSelected.some((s) => s.type === "iis-resim")
  const newSvcParsService      = newSvcSelected.find((s) => s.type === "pars") ?? null
  // Rapor gruplaması için firmanın program tipleri: mevcut DB'lerin program kodları + seçilen Pusula programları
  const newSvcParsTipleri = [...new Set([
    ...tabSQL.map((d) => parsTipFromProgramCode(d.ProgramCode)),
    ...newSvcSelected.filter((s) => s.type === "pusula-program").map((s) => parsTipFromProgramCode((s.config as PusulaProgramConfig | null)?.programCode)),
  ].filter((t): t is number => t !== null))]
  const newSvcParsDatalar = Object.entries(newSvcParsDbTips)
    .filter(([, t]) => t !== "")
    .map(([data, t]) => ({ data, tipId: Number(t) }))
  const newSvcParsUsersValid = newSvcParsUsers.length > 0
    && newSvcParsUsers.every((u) => parsKullaniciAdiGecerliMi(u.username) && parsSifreGecerliMi(u.password))
    && new Set(newSvcParsUsers.map((u) => u.username.trim().toLocaleLowerCase("tr-TR"))).size === newSvcParsUsers.length
    && !newSvcParsUsers.some((u) => (newSvcParsKatalog?.users ?? []).some((k) => k.adi.trim().toLocaleLowerCase("tr-TR") === u.username.trim().toLocaleLowerCase("tr-TR")))
  const newSvcParsValid = !newSvcParsService
    || (newSvcParsUsersValid && !!newSvcParsKatalog && !newSvcParsError && newSvcParsReportIds.length > 0 && newSvcParsDatalar.length > 0)

  // Elle girilen API kullanıcılarından biri hatalıysa (yarım / yasak karakter) Oluştur kapalı
  const newSvcApiKimlikHatali = newSvcSelected.some((s) => {
    const k = s.type === "iis-site" ? newSvcApiKimlik[s.id] : undefined
    return !!k && apiKimlikHatasi(k.username, k.password) !== null
  })

  // Yalnız Pars: AD'ye dokunulmaz, AD sunucusu istenmez
  const newSvcParsOnly = newSvcSelected.length > 0 && newSvcSelected.every((s) => s.type === "pars")
  const newSvcValid =
    newSvcSelectedIds.length > 0 &&
    (!!newSvcAdServerId || newSvcParsOnly) &&
    (!newSvcHasPusula || (!!newSvcWindowsServerId && !!newSvcDepoServerId)) &&
    (!(newSvcHasIis || newSvcHasResim) || !!newSvcIisServerId) &&
    (!newSvcHasResim || !!newSvcDepoServerId) &&
    newSvcParsValid &&
    !newSvcApiKimlikHatali

  // Yeni Hizmet "Kurulum sunucuları" kartındaki tek satır: ikon + ad/açıklama solda,
  // seçim sağda. Seçim yapılınca ikon kutusu yeşile döner (eksik olan bir bakışta görünür).
  const newSvcSunucuSec = (
    label: string,
    aciklama: string,
    Ikon: React.ComponentType<{ className?: string }>,
    value: string,
    onChange: (v: string) => void,
    list: { id: string; name: string; ip: string; isOnline?: boolean }[],
    opts?: { disabled?: boolean; not?: string },
  ) => (
    <div className="flex items-center gap-3 px-3 py-2.5">
      <span className={`flex size-8 shrink-0 items-center justify-center rounded-[5px] transition-colors duration-200 ${
        value ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" : "bg-muted text-muted-foreground"
      }`}>
        {value ? <Check className="size-4" strokeWidth={2.5} /> : <Ikon className="size-4" />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-[13px] font-medium leading-[18px]">
          {label}
          {opts?.not && <span className="text-muted-foreground text-[11px] font-normal">· {opts.not}</span>}
        </div>
        <div className="text-muted-foreground truncate text-[11px] leading-[16px]">{aciklama}</div>
      </div>
      <Select value={value} onValueChange={onChange} disabled={opts?.disabled}>
        <SelectTrigger className="h-8 w-[220px] shrink-0 rounded-[5px] text-[12px]">
          <SelectValue placeholder={list.length ? "Sunucu seçin…" : "Sunucu yok"} />
        </SelectTrigger>
        <SelectContent>
          {list.map((s) => (
            <SelectItem key={s.id} value={s.id} className="text-[13px]" disabled={s.isOnline === false}>
              {s.name} <span className="text-muted-foreground ml-1">{s.ip}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )

  const loadNewSvcParsKatalog = (serviceId: number, taze = false) => {
    setNewSvcParsLoading(true); setNewSvcParsError(null)
    fetch(`/api/setup/pars/catalog?serviceId=${serviceId}${taze ? "&refresh=true" : ""}`, { cache: "no-store" })
      .then(async (r) => {
        const d = await r.json()
        if (!r.ok || d?.error) throw new Error(d?.error ?? "Pars kataloğu alınamadı")
        setNewSvcParsKatalog(d as ParsKatalog); setNewSvcParsKatalogFor(serviceId)
      })
      .catch((e) => setNewSvcParsError(e instanceof Error ? e.message : "Pars kataloğu alınamadı"))
      .finally(() => setNewSvcParsLoading(false))
  }
  // Dialogda Pars seçilince kataloğu bir kez çek
  useEffect(() => {
    if (!newSvcOpen || !newSvcParsService) return
    if (newSvcParsKatalogFor === newSvcParsService.id || newSvcParsLoading) return
    loadNewSvcParsKatalog(newSvcParsService.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newSvcOpen, newSvcParsService?.id, newSvcParsKatalogFor, newSvcParsLoading])

  // Yeni kullanıcı bitince müşteriye gidecek erişim bilgisi — pencerede satır satır + "Mesajı kopyala"
  const newUserErisim = (() => {
    const adSrv  = newUserAdServers.find((s) => s.id === newUserAdServerId)
    const rdpSrv = newUserRdpServers.find((s) => s.id === newUserRdpServerId)
    const sunucu = `${rdpSrv?.ip ?? ""}${rdpSrv?.rdpPort ? `:${rdpSrv.rdpPort}` : ""}`
    const domainShort = (adSrv?.domain ?? "").split(".")[0]?.trim() ?? ""
    const userPart = `${selectedFirma?.firkod ?? ""}.${newUserUsername.trim()}`
    const kullanici = domainShort ? `${domainShort}\\${userPart}` : userPart
    return {
      satirlar: [
        { ad: "Sunucu", deger: sunucu },
        { ad: "Kullanıcı adı", deger: kullanici },
        { ad: "Şifre", deger: newUserPassword },
      ],
      mesaj: ["Merhaba,", "", "Sunucu erişim bilgileriniz aşağıdadır.", "", `Sunucu: ${sunucu}`, "",
        `Kullanıcı Adı: ${kullanici}`, `Şifre: ${newUserPassword}`, "", "İyi çalışmalar."].join("\n"),
    }
  })()

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
    setDebugContent(""); setDebugRunning(false); setDebugId(null); setDebugServers([]); setDebugServerId("")
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
      debugOfsetRef.current = 0
      setDebugId(d.id); setDebugPath(d.path ?? "")
      setDebugRunning(true); setDebugContent("")
      if (d.shared) toast.info("Dosya zaten açık", { description: "Başka bir izleme sürüyor ya da dosya elle konmuş — aynı dosya okunuyor." })
    } catch (err) {
      setDebugError(err instanceof Error ? err.message : String(err))
    } finally {
      setDebugBusy(false)
    }
  }

  async function debugStop() {
    if (!selectedFirma || !debugId) return
    setDebugBusy(true)
    try {
      await fetch(`/api/companies/${selectedFirma.firkod}/debug`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "stop", id: debugId }),
      })
    } catch {}
    setDebugRunning(false); setDebugId(null)
    setDebugBusy(false)
  }

  /* Yalnız yeni eklenen kısım okunur (ofset). Parça sınırı aşıldıysa
     (devami) hemen bir parça daha istenir; ekranda en fazla son 2 MB tutulur. */
  async function debugFetch() {
    if (!selectedFirma || !debugId || debugFetchingRef.current) return
    debugFetchingRef.current = true
    try {
      for (let i = 0; i < 8; i++) {
        const r = await fetch(`/api/companies/${selectedFirma.firkod}/debug?id=${debugId}&ofset=${debugOfsetRef.current}`)
        const d = await r.json()
        if (!r.ok) { setDebugError(d.error ?? "Okunamadı"); return }
        setDebugError(null)
        if (d.ofset < debugOfsetRef.current) setDebugContent("")   // dosya kesildi, baştan
        debugOfsetRef.current = d.ofset
        if (d.icerik) setDebugContent((c) => { const n = c + d.icerik; return n.length > 2_000_000 ? n.slice(-2_000_000) : n })
        if (d.durdu) {
          setDebugRunning(false); setDebugId(null)
          setDebugError(d.durdu === "boyut" ? "Dosya 20 MB'ı aştı — debug durduruldu ve dosya silindi."
            : d.durdu === "dosya-yok" ? "debugsql.txt sunucudan kaldırılmış — debug durdu."
            : d.durdu === "zaman-asimi" ? "Uzun süre okunmadığı için debug kapatıldı." : "Debug durduruldu.")
          return
        }
        if (!d.devami) return
      }
    } catch (err) {
      setDebugError(err instanceof Error ? err.message : String(err))
    } finally {
      debugFetchingRef.current = false
    }
  }

  useEffect(() => {
    if (!debugOpen || !debugRunning || !debugId) return
    debugFetch()
    const t = setInterval(debugFetch, 5000)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debugOpen, debugRunning, debugId, selectedFirma?.firkod])

  // Yeni satır gelince en alta (kullanıcı yukarıdaysa dokunma)
  useEffect(() => {
    const el = debugBoxRef.current
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 80) el.scrollTop = el.scrollHeight
  }, [debugContent])

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
   * EKRANDA NE VARSA O aktarılır: arama + sütun başlığı filtreleri uygulanmış
   * ve seçili sıraya göre dizilmiş liste (`listeFiltreli`). "Gördüğüm tablo ile
   * dosya farklı" şaşkınlığı olmasın diye tüm firmalar değil.
   */
  async function exportCompanyList() {
    if (!listeFiltreli.length) return
    const XLSX = await import("xlsx")

    const header = ["Firma Kodu", "Firma", "Temsilci", "E-posta", "Telefon", "Kullanıcı", "Lisans Bitiş", "Durum"]
    const rows = listeFiltreli.map((c) => [
      c.firkod,
      c.firma,
      c.temsilci ? (c.temsilci.aktif ? c.temsilci.ad : `${c.temsilci.ad} (pasif)`) : "",
      c.email || "",
      c.phone || "",
      c.userCount,
      lisansGoster(c.lisansBitis),
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
    if (!selectedFirma) return
    // company-detail yetkisi olmayan kullanıcılar için detay tablarını fetch etme —
    // hepsi 403 döner ve gereksiz yük olur. Bu kullanıcılar firmaya tıklayınca
    // doğrudan Erişim Bilgileri modal'ı açılır (selectFirma içinde).
    if (!canViewCompanyDetail) return
    const firkod = selectedFirma.firkod
    setTabUsers([]); setTabIIS([]); setTabSQL([]); setTabServices([])
    // Firma değişti — Erişim sekmesi verisi bayat, sekmeyi de başa al.
    setDetailTab("users"); setAccessInfo(null); setAccessError(null); setWebUsers([]); setWebUsersFirma(null); setParsSifreler([]); setParsSifreFirma(null)
    setKulAdFiltre(""); setKulIsimFiltre(""); setKulDurumFiltre([]); setKulOfficeFiltre([]); setDbAdFiltre(""); setDbYedekFiltre([]); setDbDurumFiltre([]); setSvcAdFiltre(""); setSvcKatFiltre([]); setSvcDurumFiltre([])
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

  /** guvenlik.YedekAl'ı değiştirir — SpareBackup + Backup Master kapsamı */
  async function yedekAlDegistir(db: TabSQLDatabase, yedekAl: boolean) {
    if (!selectedFirma || yedekAlKaydediliyor) return
    setYedekAlKaydediliyor(db.Id)
    try {
      const r = await fetch(`/api/companies/${selectedFirma.firkod}/sql/yedek-al`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dbName: db.Name, yedekAl }),
      })
      const data = await r.json().catch(() => ({}))
      if (!r.ok) { toast.error(data.error ?? "Yedek ayarı kaydedilemedi"); return }
      setTabSQL((prev) => prev.map((d) => (d.Id === db.Id ? { ...d, YedekAl: yedekAl } : d)))
      const bm = data.backupMaster as { ok: boolean; ozet: string } | undefined
      if (bm && !bm.ok) toast.warning(`${db.Name}: yedek ${yedekAl ? "açıldı" : "kapatıldı"}`, { description: bm.ozet })
      else toast.success(`${db.Name}: yedek ${yedekAl ? "açıldı" : "kapatıldı"}`, { description: bm?.ozet })
    } catch {
      toast.error("Yedek ayarı kaydedilemedi")
    } finally {
      setYedekAlKaydediliyor(null)
    }
  }

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

  /**
   * Panik / geri alma. `geriAl=false` firmanın AD hesaplarını devre dışı
   * bırakıp açık oturumları kapatır; `true` ise pasif hesapları yeniden
   * açar. Her iki yön de AlertDialog onayından sonra çağrılır.
   */
  async function runPanic(geriAl: boolean) {
    if (!selectedFirma) return
    setPanicBusy(true)
    const id = toast.loading(geriAl ? "Erişim açılıyor…" : "Erişim kesiliyor…", {
      description: selectedFirma.firma,
    })
    try {
      const r = await fetch(`/api/companies/${encodeURIComponent(selectedFirma.firkod)}/panic`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mod: geriAl ? "geri" : "panik" }),
      })
      const data = await r.json()
      if (!r.ok) {
        toast.error("İşlem başarısız", { id, description: data?.error ?? "Bilinmeyen hata" })
        return
      }
      const ozet = geriAl
        ? `${data.devreDisi} hesap yeniden açıldı`
        : `${data.devreDisi} hesap devre dışı · ${data.kapatilanOturum} oturum kapatıldı`
      if (data.ok) {
        toast.success(geriAl ? "Firma erişimi açıldı" : "Firma erişimi kesildi", { id, description: ozet })
      } else {
        // Kısmi başarı — ne olduğunu sayılarla birlikte söyle, sessiz geçme.
        toast.warning("Kısmen tamamlandı", {
          id,
          description: `${ozet}. ${(data.hatalar ?? []).join(" ")}`,
        })
      }
      setPanicOpen(false)
      // Liste güncel kalsın; refreshTabUsers agent'ı force ile yeniden
      // sorguluyor, yoksa hesaplar eski durumuyla görünüyordu.
      await refreshTabUsers()
    } catch (e) {
      toast.error("İşlem başarısız", {
        id,
        description: e instanceof Error ? e.message : "Bağlantı hatası",
      })
    } finally {
      setPanicBusy(false)
    }
  }

  /**
   * URL'de firkod yoksa seçimi bırak. "Geri" butonu kaldırıldıktan sonra
   * listeye dönüş yolu sidebar'daki "Firmalar" bağlantısı; o /companies'e
   * gidiyor ama client-side navigasyonda selectedFirma state'te kalıyordu,
   * dolayısıyla liste hiç görünmüyordu.
   */
  useEffect(() => {
    if (urlFirkod) return
    setSelectedFirma(null)
    setCompanyDetail(null)
    setTabUsers([]); setTabIIS([]); setTabSQL([]); setTabServices([])
  }, [urlFirkod])

  /**
   * Web hizmetlerinin sunucudaki `Config\Users.xml` içeriğini çeker.
   *
   * Agent'a gidiyor (yavaş olabilir) — bu yüzden modal'ın geri kalanını
   * bekletmeden AYRI yükleniyor, hata durumunda modal çalışmaya devam eder.
   */
  async function loadWebUsers(firkod: string) {
    setWebUsers([])
    setWebUsersLoading(true)
    setWebUsersFirma(firkod)
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
   * Hizmetler sekmesi kullanıcı/şifreleri — sekmeye ilk geçişte bir kez:
   * API hizmetleri Users.xml / Web.config'ten (Erişim sekmesiyle ortak veri),
   * Pars kullanıcıları Ayar.mdb'den. İkisi de agent üzerinden canlı okunur.
   */
  async function loadServiceCreds(firkod: string, taze = false) {
    if (taze || (webUsersFirma !== firkod && !webUsersLoading)) void loadWebUsers(firkod)
    if (!taze && (parsSifreFirma === firkod || parsSifreLoading)) return
    setParsSifreFirma(firkod); setParsSifreLoading(true); setParsSifreler([])
    try {
      const r = await fetch(`/api/companies/${encodeURIComponent(firkod)}/pars-sifreler`, { cache: "no-store" })
      const d = await r.json()
      setParsSifreler(r.ok && Array.isArray(d) ? d : [])
    } catch {
      setParsSifreler([])
    } finally {
      setParsSifreLoading(false)
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
    setWebUserPw(webSifreUret())
    setWebUserDbs(opts)
    setWebUserSteps(null)
    setWebUserDenendi(false)
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
    setWebUserDenendi(false)
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
    /*  SQL giris sifresi AYRI kaynaktan: AD sifresi degisince bu
        degismiyor, tek kaynaktan gosterilirse ekran yanlis sifre
        veriyordu (2026-08-28, firma 2311).                        */
    const sqlCredentials = accessInfo.sqlCredentials ?? {}
    /*  Giriş adı SAKLANAN değerden; yoksa türetilir. Türetme tek
        başına yanlış ad veriyordu — ad kuralı alt çizgiden noktaya
        döndü ama mevcut girişler alt çizgili kaldı.               */
    const sqlLogins = accessInfo.sqlLogins ?? {}
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
      const sqlLogin = sqlLogins[firstUser.username] ?? sqlLoginAdi(firkod, firstUser.username)
      const sqlPw = sqlCredentials[firstUser.username] ?? ""
      lines.push("SQL Veritabanı Bilgileri:")
      if (sqlIp) lines.push(`Sunucu: ${sqlIp}`)
      lines.push(`Kullanıcı Adı: ${sqlLogin}`)
      lines.push(sqlPw ? `Şifre: ${sqlPw}` : "Şifre: (kayıtlı değil)")
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

  // Firma listesi (empty-state) için arama + sıralama
  /**
   * lisansBitis iki formatta gelebiliyor: "yyyy-MM-dd" (API) veya "dd.MM.yyyy"
   * (eski kayıtlar). Filtre ve karşılaştırma için ISO'ya sabitliyoruz.
   */
  function lisansIso(s: string): string {
    if (!s) return "";
    const p = s.split(".");
    if (p.length === 3) return `${p[2]}-${p[1].padStart(2, "0")}-${p[0].padStart(2, "0")}`;
    return s.slice(0, 10);
  }

  /** Ekranda gg.aa.yyyy — ISO gösterim kullanıcı için okunaksızdı. */
  function lisansGoster(s: string): string {
    const iso = lisansIso(s);
    if (!iso) return "—";
    const [y, a, g] = iso.split("-");
    return y && a && g ? `${g}.${a}.${y}` : s;
  }

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
  const listFiltered = apiCompanies.slice();
  const listSorted = listFiltered.slice().sort((a, b) => {
    let cmp = 0;
    switch (listSortKey) {
      case "firma":       cmp = a.firma.localeCompare(b.firma, "tr"); break;
      case "firkod":      cmp = (a.firkod || "").localeCompare(b.firkod || "", "tr"); break;
      case "userCount":   cmp = a.userCount - b.userCount; break;
      case "lisansBitis": cmp = parseLisansDate(a.lisansBitis) - parseLisansDate(b.lisansBitis); break;
      /* Temsilcisiz firmalar sona — boş satırlar listenin başını kaplamasın. */
      case "temsilci":    cmp = (a.temsilci?.ad ?? "ZZZ").localeCompare(b.temsilci?.ad ?? "ZZZ", "tr"); break;
      case "status": {
        const av = firmaIsActive(a) ? 1 : 0;
        const bv = firmaIsActive(b) ? 1 : 0;
        cmp = bv - av;
        break;
      }
    }
    return listSortDir === "asc" ? cmp : -cmp;
  });

  /* Filtre değişince kullanıcı 3. sayfada boş liste görmesin. */
  useEffect(() => {
    setFirmaSayfa(1);
  }, [firmaFiltre, kodFiltre, durumFiltre, temsilciFiltre, lisansFiltre, kullaniciFiltre]);

  /* Temsilci filtresi seçenekleri — listedeki temsilciler + "Temsilcisiz". */
  const TEMSILCISIZ = "— Temsilcisiz —";
  const temsilciSecenekleri = useMemo(() => {
    const ad = new Set<string>();
    let bosVar = false;
    for (const c of apiCompanies) { if (c.temsilci?.ad) ad.add(c.temsilci.ad); else bosVar = true; }
    const liste = [...ad].sort((a, b) => a.localeCompare(b, "tr"));
    return bosVar ? [...liste, TEMSILCISIZ] : liste;
  }, [apiCompanies]);

  /* Sütun başlığı filtreleri — üstteki serbest arama ile VE (AND) birleşir. */
  const listeFiltreli = listSorted.filter((c) => {
    const f = firmaFiltre.trim().toLocaleLowerCase("tr-TR");
    const k = kodFiltre.trim().toLocaleLowerCase("tr-TR");
    if (f && !c.firma.toLocaleLowerCase("tr-TR").includes(f)) return false;
    if (k && !(c.firkod || "").toLocaleLowerCase("tr-TR").includes(k)) return false;
    if (durumFiltre.length && !durumFiltre.includes(firmaIsActive(c) ? "aktif" : "doldu")) return false;
    if (temsilciFiltre.length && !temsilciFiltre.includes(c.temsilci?.ad ?? TEMSILCISIZ)) return false;
    if (!tarihUygun(lisansIso(c.lisansBitis), lisansFiltre)) return false;
    if (kullaniciFiltre.min != null && c.userCount < kullaniciFiltre.min) return false;
    if (kullaniciFiltre.max != null && c.userCount > kullaniciFiltre.max) return false;
    return true;
  });

  /* Ekranda gösterilen sayfa. Excel yine TÜM filtrelenmiş kaydı alır — tek
     sayfayı değil; "listelenen firmalar" filtre sonucu demek. */
  const firmaSayfalik = listeFiltreli.slice(
    (firmaSayfa - 1) * FIRMA_SAYFA_BOYU,
    firmaSayfa * FIRMA_SAYFA_BOYU,
  );

  return (
    <PageContainer title="Firma Yönetimi" description="Firmaların sunucu kullanım durumları">
      {/* Company Selector / Header Bar — firma secili degilken hic render
          edilmez; bos sarmalayici mb-6 ile listeyi asagi itiyordu. */}
      <div className={selectedFirma && canViewCompanyDetail ? "mb-3" : undefined}>
        {/* No-perm modunda selectedFirma yalnızca modal'ı beslemek için set
            ediliyor — detay header'ını ve panelini render etme, liste görünür kalsın. */}
        {selectedFirma && canViewCompanyDetail ? (
          /* Seçili firma: kompakt header bar */
          <div className="rounded-[8px] bg-[var(--section-bg)] p-2">
            <div className="rounded-[5px] bg-card px-4 py-3" style={{ boxShadow: "var(--card-shadow)" }}>
              <div className="flex items-center gap-3">
                <>
                  {/* Firma adı üstte; iletişim + temsilci altında, kopyalanabilir */}
                  <div className="min-w-0 flex-1">
                    {/* İlk satır: ad + kod + durum rozeti + etiketler */}
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <h2 className="truncate text-[15px] font-semibold tracking-tight">{selectedFirma.firma}</h2>
                      {selectedFirma.firkod && (
                        <span className="inline-flex shrink-0 rounded-[5px] bg-muted px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground">{selectedFirma.firkod}</span>
                      )}
                      <span className={`inline-flex shrink-0 rounded-[5px] px-2 py-0.5 text-[11px] font-medium ${
                        firmaIsActive(selectedFirma)
                          ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                          : "bg-red-500/15 text-red-700 dark:text-red-400"
                      }`}>
                        {firmaIsActive(selectedFirma) ? "Aktif" : "Pasif"}
                      </span>
                        {/* Firma etiketleri */}
                        {canViewCompanyDetail && (
                          <div className="flex items-center gap-1.5">
                            {firmaTags.map((tag) => (
                              <span
                                key={tag}
                                className={`group/tag shrink-0 inline-flex items-center gap-1 rounded-[5px] border px-1.5 py-0.5 text-[11px] font-medium ${tagColor(tag)}`}
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
                                            className="w-full flex items-center gap-1.5 px-1.5 py-1 rounded-[5px] hover:bg-muted/70 transition-colors text-left"
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
                    </div>
                    <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted-foreground">
                      {selectedFirma.email && (
                        <span className="inline-flex min-w-0 items-center gap-1.5">
                          <Mail className="size-3.5 shrink-0" />
                          <span className="truncate">{selectedFirma.email}</span>
                          <CopyIconButton value={selectedFirma.email} subtle />
                        </span>
                      )}
                      {selectedFirma.phone && (
                        <span className="inline-flex shrink-0 items-center gap-1.5">
                          <Phone className="size-3.5 shrink-0" />
                          <span className="tabular-nums">{selectedFirma.phone}</span>
                          <CopyIconButton value={selectedFirma.phone} subtle />
                        </span>
                      )}
                      {/* Dar ekranda sağdaki özet gizli — lisans burada */}
                      {selectedFirma.lisansBitis && (
                        <span className="inline-flex shrink-0 items-center gap-1.5 tabular-nums lg:hidden">
                          <Calendar className="size-3.5 shrink-0" />
                          {lisansGoster(selectedFirma.lisansBitis)}
                        </span>
                      )}
                      {/* Müşteri temsilcisi — CRM'den; pasifse firma devredilmemiş olabilir */}
                      {selectedFirma.temsilci && (
                        <span
                          className="inline-flex shrink-0 items-center gap-1.5"
                          title={selectedFirma.temsilci.aktif ? "Müşteri temsilcisi" : "Müşteri temsilcisi pasif — firma devredilmemiş olabilir"}
                        >
                          <User className="size-3.5 shrink-0" />
                          <span className={selectedFirma.temsilci.aktif ? "" : "opacity-60"}>{selectedFirma.temsilci.ad}</span>
                          {!selectedFirma.temsilci.aktif && (
                            <span className="inline-flex rounded-[5px] bg-amber-500/15 px-1.5 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400">pasif</span>
                          )}
                        </span>
                      )}
                    </div>
                  </div>

                </>

                {/* Sağ: firma özeti (geniş ekranda) — kullanıcı, hizmet, veritabanı, yedek, lisans */}
                {(() => {
                  const iso = lisansIso(selectedFirma.lisansBitis ?? "")
                  const kalan = iso ? Math.ceil((new Date(`${iso}T23:59:59`).getTime() - Date.now()) / 86_400_000) : null
                  const kalanRenk = kalan === null ? "" : kalan < 0 ? "text-red-600 dark:text-red-400" : kalan <= 30 ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground"
                  const hizmetSayisi = collectServices().length
                  const toplamMB = tabSQL.reduce((t, d) => t + (d.SizeMB || 0), 0)
                  const boyutYaz = (mb: number) => (mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${Math.round(mb)} MB`)
                  /*  Yedek sağlığı: yalnız yedeği açık (guvenlik.YedekAl=1) DB'ler. Son yedek = tam/diferansiyelin
                   *  en yenisi. SpareBackup her gün alıyor → 26 saati geçen gecikmiş, 48 saati geçen / hiç olmayan sorunlu. */
                  const zaman = (s: string | null) => (s ? new Date(s.replace(" ", "T")).getTime() : NaN)
                  const yedekli = tabSQL.filter((d) => d.YedekAl === true)
                  const saat = (d: TabSQLDatabase) => {
                    const son = Math.max(zaman(d.LastBackup) || 0, zaman(d.LastDiffBackup) || 0)
                    return son ? (Date.now() - son) / 3_600_000 : Infinity
                  }
                  const sorunlu = yedekli.filter((d) => saat(d) > 48)
                  const gecikmis = yedekli.filter((d) => saat(d) > 26 && saat(d) <= 48)
                  const yedekDurum: { metin: string; renk: string; nokta: string; aciklama: string } =
                    yedekli.length === 0
                      ? { metin: "Kapalı", renk: "text-muted-foreground", nokta: "bg-muted-foreground/50", aciklama: "Yedeği açık veritabanı yok" }
                      : sorunlu.length > 0
                        ? { metin: `${sorunlu.length} sorunlu`, renk: "text-red-600 dark:text-red-400", nokta: "bg-red-500",
                            aciklama: `48 saattir yedek yok: ${sorunlu.map((d) => d.Name).join(", ")}` }
                        : gecikmis.length > 0
                          ? { metin: `${gecikmis.length} gecikmiş`, renk: "text-amber-700 dark:text-amber-400", nokta: "bg-amber-500",
                              aciklama: `Son yedek 26 saatten eski: ${gecikmis.map((d) => d.Name).join(", ")}` }
                          : { metin: "Sağlıklı", renk: "text-emerald-700 dark:text-emerald-400", nokta: "bg-emerald-500",
                              aciklama: `${yedekli.length} veritabanının hepsi son 26 saatte yedeklendi` }
                  const Kutu = ({ baslik, children, title }: { baslik: string; children: React.ReactNode; title?: string }) => (
                    <div className="text-right" title={title}>
                      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{baslik}</p>
                      {tabLoading ? <Skeleton className="ml-auto mt-1 h-4 w-12 rounded-[5px]" /> : (
                        <p className="whitespace-nowrap text-[15px] font-semibold tabular-nums leading-tight">{children}</p>
                      )}
                    </div>
                  )
                  const Ayrac = () => <span className="h-8 w-px shrink-0 bg-border" />
                  return (
                    <div className="hidden shrink-0 items-center gap-4 lg:flex">
                      <Kutu baslik="Kullanıcı" title="AD hesabı / kullanıcı hakkı">
                        {tabUsers.length}<span className="text-[12px] font-medium text-muted-foreground"> / {selectedFirma.userCount}</span>
                      </Kutu>
                      <Ayrac />
                      <Kutu baslik="Hizmet">{hizmetSayisi}</Kutu>
                      <Ayrac />
                      <Kutu baslik="Veritabanı" title="Adet · toplam boyut">
                        {tabSQL.length}<span className="text-[12px] font-medium text-muted-foreground"> · {boyutYaz(toplamMB)}</span>
                      </Kutu>
                      <Ayrac />
                      <Kutu baslik="Yedek" title={yedekDurum.aciklama}>
                        <span className={`inline-flex items-center gap-1.5 ${yedekDurum.renk}`}>
                          <span className={`size-2 rounded-full ${yedekDurum.nokta}`} />{yedekDurum.metin}
                        </span>
                      </Kutu>
                      <Ayrac />
                      <div className="text-right">
                        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Lisans bitiş</p>
                        <p className="whitespace-nowrap text-[15px] font-semibold tabular-nums leading-tight">
                          {lisansGoster(selectedFirma.lisansBitis ?? "")}
                          {kalan !== null && (
                            <span className={`ml-1.5 text-[12px] font-medium ${kalanRenk}`}>{kalan < 0 ? "doldu" : `${kalan} gün`}</span>
                          )}
                        </p>
                      </div>
                      <Ayrac />
                    </div>
                  )
                })()}

                {/* Panik — firmanın erişimini kes / geri aç.
                    Tüm hesaplar pasifse buton yön değiştirir; aksi halde
                    panik sonrası tekrar basılabilir ama hiçbir şey yapmayan
                    ölü bir düğme olurdu. */}
                <button
                  onClick={() => setPanicOpen(true)}
                  disabled={tabUsers.length === 0}
                  className={
                    (firmaErisimiKesik
                      ? "border-emerald-600/40 text-emerald-700 hover:bg-emerald-600 dark:text-emerald-400 "
                      : "border-destructive/40 text-destructive hover:bg-destructive ") +
                    "hover:text-white inline-flex h-8 shrink-0 items-center gap-1.5 rounded-[5px] border px-3 text-[12px] font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50"
                  }
                  title={
                    firmaErisimiKesik
                      ? "Firmanın devre dışı hesaplarını yeniden aç"
                      : "Firmanın tüm hesaplarını devre dışı bırak ve açık oturumları kapat"
                  }
                >
                  {firmaErisimiKesik
                    ? <><Play className="h-3.5 w-3.5" />Erişimi Aç</>
                    : <><Ban className="h-3.5 w-3.5" />Panik</>}
                </button>
              </div>
            </div>
                </div>
        ) : null}
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
                  <Skeleton className="h-8 w-28 rounded-[5px]" />
                  <div className="grid grid-cols-2 gap-2">
                    {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[62px] rounded-[5px]" />)}
                  </div>
                  <Skeleton className="h-10 w-full rounded-[5px]" />
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
                  <span>Firmanın tüm kullanıcılarının günlük toplamı · RAM/Disk sol, CPU sağ eksen</span>
                </>
              }
            >
              {(() => {
                const veri = companyDetail?.weeklyUsage ?? []
                const ort = (k: "ramGB" | "cpu" | "diskGB") => {
                  const v = veri.map((p) => p[k]).filter((x): x is number => x != null)
                  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null
                }
                const sayi = (n: number | null) => (n == null ? "—" : n.toLocaleString("tr-TR", { maximumFractionDigits: 1 }))
                const sonDisk = [...veri].reverse().find((p) => p.diskGB != null)?.diskGB ?? null
                const ogeler = [
                  { ad: "RAM",  renk: "bg-emerald-500", deger: `${sayi(ort("ramGB"))} GB`, alt: "ortalama" },
                  { ad: "CPU",  renk: "bg-blue-500",    deger: `%${sayi(ort("cpu"))}`,     alt: "ortalama" },
                  { ad: "Disk", renk: "bg-amber-500",   deger: `${sayi(sonDisk)} GB`,      alt: "son" },
                ]
                return (
                  <>
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="text-[13px] font-semibold">Haftalık Kullanım</h3>
                        <p className="text-[12px] text-muted-foreground">Son 7 gün · günlük toplam</p>
                      </div>
                      <div className="flex shrink-0 items-start gap-4">
                        {ogeler.map((o) => (
                          <div key={o.ad} className="text-right">
                            <p className="flex items-center justify-end gap-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                              <span className={`size-2 rounded-full ${o.renk}`} />{o.ad}
                            </p>
                            <p className="text-[15px] font-semibold tabular-nums leading-tight">{detailLoading ? "—" : o.deger}</p>
                            <p className="text-[11px] text-muted-foreground">{o.alt}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="min-h-[170px] flex-1">
                      {detailLoading ? <Skeleton className="h-full w-full rounded-[5px]" /> : <WeeklyUsageChart data={veri} />}
                    </div>
                  </>
                )
              })()}
            </NestedCard>
          </div>

          {/* Tab Kartı */}
          <NestedCard>
            <Tabs
              value={detailTab}
              onValueChange={(v) => {
                setDetailTab(v)

                // Sekmeye geçilene kadar hiç istek atmıyoruz, sonra bir kez.
                if (v === "services" && selectedFirma) void loadServiceCreds(selectedFirma.firkod)
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
                <TabsTrigger value="analiz" className="text-[11px] h-7 gap-1.5">
                  <Activity className="h-3.5 w-3.5" />
                  Analiz
                </TabsTrigger>
              </TabsList>

              {/* Kullanıcılar */}
              <TabsContent layout={false} value="users" className="mt-0">
                {(() => {
                  const officeVar = (u: TabUser) => (u.groups ?? []).includes("Office_Kullanicilari")
                  const ad = kulAdFiltre.trim().toLocaleLowerCase("tr-TR")
                  const isim = kulIsimFiltre.trim().toLocaleLowerCase("tr-TR")
                  const liste = tabUsers.filter((u) => {
                    if (ad && !u.username.toLocaleLowerCase("tr-TR").includes(ad)) return false
                    if (isim && !(u.displayName ?? "").toLocaleLowerCase("tr-TR").includes(isim)) return false
                    if (kulDurumFiltre.length && !kulDurumFiltre.includes(u.enabled ? "aktif" : "pasif")) return false
                    if (kulOfficeFiltre.length && !kulOfficeFiltre.includes(officeVar(u) ? "var" : "yok")) return false
                    return true
                  })
                  const filtreSayisi = (ad ? 1 : 0) + (isim ? 1 : 0) + (kulDurumFiltre.length ? 1 : 0) + (kulOfficeFiltre.length ? 1 : 0)
                  const temizle = () => { setKulAdFiltre(""); setKulIsimFiltre(""); setKulDurumFiltre([]); setKulOfficeFiltre([]) }
                  const ram = (mb: number) => (mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${Math.round(mb)} MB`)
                  const sutunlar: TableColumn<TabUser>[] = [
                    {
                      key: "username", header: "Kullanıcı", sortable: true, width: "220px",
                      filter: <InlineTextFilter value={kulAdFiltre} onChange={setKulAdFiltre} placeholder="Kullanıcı ara…" />,
                      cell: (u) => <span className="block truncate" title={u.username}>{u.username}</span>,
                    },
                    {
                      key: "displayName", header: "Ad soyad", sortable: true,
                      filter: <InlineTextFilter value={kulIsimFiltre} onChange={setKulIsimFiltre} placeholder="Ad ara…" />,
                      cell: (u) => <span className="block truncate" title={u.displayName}>{u.displayName || "—"}</span>,
                    },
                    {
                      key: "usageCpu", header: "CPU", sortable: true, align: "right", width: "80px",
                      sortValue: (u) => u.usageCpu ?? -1,
                      cell: (u) => <span className="tabular-nums" title={u.usageDate ? `Son ölçüm: ${u.usageDate}` : "Ölçüm yok"}>{u.usageCpu != null ? `%${u.usageCpu}` : "—"}</span>,
                    },
                    {
                      key: "usageRamMB", header: "RAM", sortable: true, align: "right", width: "90px",
                      sortValue: (u) => u.usageRamMB ?? -1,
                      cell: (u) => <span className="tabular-nums" title={u.usageDate ? `Son ölçüm: ${u.usageDate}` : "Ölçüm yok"}>{u.usageRamMB != null ? ram(u.usageRamMB) : "—"}</span>,
                    },
                    {
                      key: "lastLogin", header: "Son giriş", sortable: true, width: "160px",
                      cell: (u) => <span className="tabular-nums">{u.lastLogin || "—"}</span>,
                    },
                    {
                      key: "enabled", header: "Durum", sortable: true, align: "center", width: "100px",
                      sortValue: (u) => (u.enabled ? 1 : 0),
                      filter: <InlineSelectFilter options={["aktif", "pasif"] as const} selected={kulDurumFiltre} onChange={setKulDurumFiltre} getLabel={(o) => (o === "aktif" ? "Aktif" : "Pasif")} />,
                      cell: (u) => (
                        <span className={`inline-flex rounded-[5px] px-2 py-0.5 text-[11px] font-medium ${u.enabled ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" : "bg-muted text-muted-foreground"}`}>
                          {u.enabled ? "Aktif" : "Pasif"}
                        </span>
                      ),
                    },
                    {
                      // Office yetkisi — AppLocker `Office_Kullanicilari` grubuna bakıyor; menüden değiştiriliyor
                      key: "office", header: "Office", sortable: true, align: "center", width: "90px",
                      sortValue: (u) => (officeVar(u) ? 1 : 0),
                      filter: <InlineSelectFilter options={["var", "yok"] as const} selected={kulOfficeFiltre} onChange={setKulOfficeFiltre} getLabel={(o) => (o === "var" ? "Var" : "Yok")} />,
                      cell: (u) => (
                        <span className={`inline-flex rounded-[5px] px-2 py-0.5 text-[11px] font-medium ${officeVar(u) ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" : "bg-muted text-muted-foreground"}`}>
                          {officeVar(u) ? "Var" : "Yok"}
                        </span>
                      ),
                    },
                    {
                      key: "islem", header: "", width: "64px", align: "center",
                      cell: (usr) => {
                        const yetkili = officeVar(usr)
                        return (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button className="inline-flex size-7 items-center justify-center rounded-[5px] transition-colors hover:bg-muted/60" aria-label="İşlemler">
                                <MoreVertical className="size-3.5 text-muted-foreground" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-52">
                              <DropdownMenuItem className="gap-2 text-[12px]" onClick={() => setConnectKoduKullanici(usr.username)}>
                                <KeyRound className="size-3.5" /> Connect 2 kurulum kodu
                              </DropdownMenuItem>
                              <DropdownMenuItem className="gap-2 text-[12px]" onClick={() => setConnectCihazKullanici(usr.username)}>
                                <Laptop className="size-3.5" /> Connect 2 cihazları
                              </DropdownMenuItem>
                              <DropdownMenuItem className="gap-2 text-[12px]" onClick={() => openPwReset(usr)}>
                                <KeyRound className="size-3.5" /> Şifre sıfırla
                              </DropdownMenuItem>
                              <DropdownMenuItem className="gap-2 text-[12px]" onClick={() => toggleOffice(usr)}>
                                <FileText className="size-3.5" /> {yetkili ? "Office yetkisini kaldır" : "Office kullanabilsin"}
                              </DropdownMenuItem>
                              <DropdownMenuItem className={`gap-2 text-[12px] ${usr.enabled ? "text-rose-600 focus:text-rose-600" : ""}`} onClick={() => setToggleUser(usr)}>
                                <Ban className="size-3.5" /> {usr.enabled ? "Hesabı askıya al" : "Hesabı aktifleştir"}
                              </DropdownMenuItem>
                              <DropdownMenuItem className="gap-2 text-[12px] text-rose-600 focus:text-rose-600" onClick={() => { setDeleteUser(usr); setDeleteConfirm(""); setDeleteError(null) }}>
                                <Trash2 className="size-3.5" /> Kullanıcıyı sil
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )
                      },
                    },
                  ]
                  return (
                    <div className="space-y-2">
                      <ListeAracSeridi
                        sayac={tabLoading ? "" : `${filtreSayisi > 0 ? `${liste.length} / ` : ""}${tabUsers.length} kullanıcı`}
                        filtreAcik={kulFiltreAcik}
                        onFiltre={() => setKulFiltreAcik((v) => !v)}
                        filtreSayisi={filtreSayisi}
                        onTemizle={temizle}
                      >
                        <Button size="sm" onClick={openNewUserDialog} className="h-8 gap-1.5 rounded-[5px] text-[12px]">
                          <UserPlus className="size-3.5" /> Yeni Kullanıcı
                        </Button>
                      </ListeAracSeridi>
                      <Table<TabUser>
                        data={liste}
                        columns={sutunlar}
                        getRowId={(u) => u.username}
                        sort={kulSira}
                        onSortChange={setKulSira}
                        filterRow={kulFiltreAcik}
                        columnDividers
                        resizable
                        rowHeight={36}
                        headerHeight={30}
                        height={tabloYuksekligi(liste.length, kulFiltreAcik)}
                        loading={tabLoading}
                        className="rounded-[8px] text-[13px]"
                        emptyState={
                          tabUsers.length === 0 ? (
                            <div className="flex flex-col items-center gap-2 py-4 text-center text-muted-foreground">
                              <p className="text-[13px]">Bu firmada henüz AD kullanıcısı yok.</p>
                              <Button size="sm" onClick={openNewUserDialog} className="h-8 gap-1.5 rounded-[5px] text-[12px]">
                                <UserPlus className="size-3.5" /> Kullanıcı ekle
                              </Button>
                            </div>
                          ) : "Filtreye uyan kayıt yok."
                        }
                      />
                    </div>
                  )
                })()}
              </TabsContent>

              {/* Hizmetler — hizmet başına satır; API hizmetinde Users.xml / Web.config (SarrafPro),
                  Pars'ta Ayar.mdb kullanıcıları canlı okunup kullanıcı + şifre olarak gösterilir */}
              <TabsContent layout={false} value="services" className="mt-0">
                {(() => {
                  type SvcSatir = TabCompanyService & { assigned: boolean }
                  type Kimlik = { username: string; password: string | null; dbs?: string[] }
                  const tumu = collectServices()
                  const tur = (s: SvcSatir) => (s.type === "iis-site" ? "API hizmeti" : s.type === "iis-resim" ? "Resim" : s.type === "pusula-program" ? "Pusula programı" : s.type === "pars" ? "Pars" : (s.type || "—"))
                  const kategori = (s: SvcSatir) => s.category || tur(s)
                  const durumu = (s: SvcSatir): "calisiyor" | "durdu" | "yok" => (!s.status ? "yok" : s.status === "Started" ? "calisiyor" : "durdu")
                  // Kullanıcılar: tür başına kaynak — yükleniyor / okunamadı / yok / liste
                  /*  yonet: Users.xml'li API hizmeti — ekle/düzenle/sil/test buradan (site = Users.xml'in IIS adı,
                   *  dbs = Users.xml global DB listesi). Web.config (SarrafPro) ve Pars burada salt okunur;
                   *  Pars kullanıcıları satır menüsündeki Pars yönetiminden değişir.                          */
                  type KimlikBilgi = { durum: "yok" | "yukleniyor" | "hata" | "liste"; liste: Kimlik[]; hata: string; not: string; yonet: { site: string; dbs: string[] } | null }
                  const bos: KimlikBilgi = { durum: "yok", liste: [], hata: "", not: "", yonet: null }
                  const kimlik = (s: SvcSatir): KimlikBilgi => {
                    if (s.type === "iis-site" || s.type === "iis-resim") {
                      const anahtar = (s.siteName || s.name).trim().toLowerCase()
                      const xml = webUsers.find((w) => w.siteName.trim().toLowerCase() === anahtar)
                      if (!xml) return { ...bos, durum: webUsersLoading ? "yukleniyor" : "yok" }
                      if (xml.error) return { ...bos, durum: "hata", hata: xml.error }
                      if (xml.notFound) return bos
                      const webconfig = xml.kaynak === "webconfig"
                      return { durum: "liste", liste: xml.users, hata: "", not: webconfig ? "Web.config" : "", yonet: webconfig ? null : { site: xml.siteName, dbs: xml.dbs ?? [] } }
                    }
                    if (s.type === "pars") {
                      const p = parsSifreler.find((x) => x.serviceId === s.parsServiceId)
                      if (!p) return { ...bos, durum: parsSifreLoading ? "yukleniyor" : "yok" }
                      if (p.error) return { ...bos, durum: "hata", hata: p.error }
                      return { ...bos, durum: "liste", liste: p.users }
                    }
                    return bos
                  }
                  const ad = svcAdFiltre.trim().toLocaleLowerCase("tr-TR")
                  const liste = tumu.filter((s) => {
                    if (ad && !`${s.name} ${s.siteName ?? ""}`.toLocaleLowerCase("tr-TR").includes(ad)) return false
                    if (svcKatFiltre.length && !svcKatFiltre.includes(kategori(s))) return false
                    if (svcDurumFiltre.length && !svcDurumFiltre.includes(durumu(s))) return false
                    return true
                  })
                  const kategoriler = [...new Set(tumu.map(kategori))].sort((a, b) => a.localeCompare(b, "tr"))
                  const filtreSayisi = (ad ? 1 : 0) + (svcKatFiltre.length ? 1 : 0) + (svcDurumFiltre.length ? 1 : 0)
                  const temizle = () => { setSvcAdFiltre(""); setSvcKatFiltre([]); setSvcDurumFiltre([]) }
                  const sutunlar: TableColumn<SvcSatir>[] = [
                    {
                      key: "name", header: "Hizmet", sortable: true,
                      filter: <InlineTextFilter value={svcAdFiltre} onChange={setSvcAdFiltre} placeholder="Hizmet ara…" />,
                      cell: (s) => (
                        <span className="flex min-w-0 items-center gap-1.5">
                          <span className="truncate">{s.name}</span>
                          {!s.assigned && <span className="inline-flex shrink-0 rounded-[5px] bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground" title="Sihirbaz kaydı yok — IIS'te elle kurulmuş site">Elle kurulmuş</span>}
                        </span>
                      ),
                    },
                    {
                      key: "category", header: "Kategori", sortable: true, width: "140px",
                      sortValue: (s) => kategori(s),
                      filter: <InlineSelectFilter options={kategoriler} selected={svcKatFiltre} onChange={setSvcKatFiltre} />,
                      cell: (s) => <span className="block truncate">{kategori(s)}</span>,
                    },
                    {
                      key: "siteName", header: "IIS adı", sortable: true, width: "170px",
                      sortValue: (s) => (s.type === "pars" ? "" : s.siteName ?? ""),
                      cell: (s) => <span className="block truncate">{s.siteName && s.type !== "pars" ? s.siteName : "—"}</span>,
                    },
                    {
                      key: "server", header: "Sunucu", sortable: true, width: "140px",
                      cell: (s) => <span className="block truncate">{s.server || "—"}</span>,
                    },
                    {
                      key: "port", header: "Port", sortable: true, align: "center", width: "80px",
                      sortValue: (s) => s.port ?? 0,
                      cell: (s) => <span className="tabular-nums">{s.port ?? "—"}</span>,
                    },
                    {
                      // Çok kullanıcılı hizmet: satır sabit yükseklikte — ilk kullanıcı + "+N" (tıklayınca hepsi)
                      key: "kullanici", header: "Kullanıcı", width: "220px",
                      cell: (s) => {
                        const k = kimlik(s)
                        if (k.durum === "yukleniyor") return <Skeleton className="h-4 w-28 rounded-[5px]" />
                        if (k.durum === "hata") return <span className="text-rose-600 dark:text-rose-400" title={k.hata}>Okunamadı</span>
                        if (k.durum === "yok") return <span>—</span>
                        const y = k.yonet
                        const ilk = k.liste[0]
                        // Users.xml'li hizmette liste tek kullanıcıda da açılır — işlemler orada
                        const panelVar = k.liste.length > 1 || (y !== null)
                        return (
                          <span className="flex min-w-0 items-center gap-1">
                            {ilk ? (
                              <>
                                <span className="truncate" title={k.not ? `Kaynak: ${k.not}` : undefined}>{ilk.username}</span>
                                <CopyIconButton value={ilk.username} subtle />
                              </>
                            ) : (
                              <span className="truncate">Kullanıcı yok</span>
                            )}
                            {panelVar && (
                              <Popover>
                                <PopoverTrigger asChild>
                                  <button type="button" onClick={(e) => e.stopPropagation()} title={y ? "Kullanıcıları yönet" : "Tüm kullanıcılar"}
                                    className="inline-flex shrink-0 items-center gap-1 rounded-[5px] bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary transition-colors hover:bg-primary/20">
                                    {k.liste.length > 1 ? `+${k.liste.length - 1}` : y && k.liste.length === 0 ? <><Plus className="size-3" />Ekle</> : <Settings2 className="size-3" />}
                                  </button>
                                </PopoverTrigger>
                                <PopoverContent align="start" className="w-[22rem] p-0">
                                  <p className="border-b bg-[var(--section-bg)] px-3 py-2 text-[12px] font-medium">{s.name} · {k.liste.length} kullanıcı{k.not ? ` · ${k.not}` : ""}</p>
                                  {k.liste.length === 0 ? (
                                    <p className="px-3 py-4 text-center text-[12px] text-muted-foreground">Users.xml'de kullanıcı yok.</p>
                                  ) : (
                                    <ul className="max-h-72 divide-y overflow-y-auto">
                                      {k.liste.map((x) => {
                                        const tAnahtar = y ? `${y.site}::${x.username}` : ""
                                        const sonuc = y ? webUserTestResult[tAnahtar] : undefined
                                        const sinaniyor = y !== null && webUserTestBusy === tAnahtar
                                        const u = { username: x.username, password: x.password ?? "", dbs: x.dbs ?? [] }
                                        return (
                                          <li key={x.username} className="flex flex-col gap-0.5 px-3 py-1.5 text-[13px]">
                                            <span className="flex items-center gap-2">
                                              <span className="min-w-0 flex-1 truncate" title={x.dbs?.length ? `Veritabanları: ${x.dbs.join(", ")}` : undefined}>{x.username}</span>
                                              <CopyIconButton value={x.username} subtle />
                                              <SvcSifre deger={x.password} />
                                              {y && (
                                                <DropdownMenu>
                                                  <DropdownMenuTrigger asChild>
                                                    <button type="button" className="inline-flex size-6 shrink-0 items-center justify-center rounded-[5px] transition-colors hover:bg-muted/60" aria-label={`${x.username} işlemleri`}>
                                                      {sinaniyor ? <RefreshCw className="size-3.5 animate-spin text-muted-foreground" /> : <MoreVertical className="size-3.5 text-muted-foreground" />}
                                                    </button>
                                                  </DropdownMenuTrigger>
                                                  <DropdownMenuContent align="end" className="w-48">
                                                    <DropdownMenuItem className="gap-2 text-[12px]" disabled={sinaniyor} onClick={() => void testWebUser(y.site, u, "lan")}>
                                                      <Network className="size-3.5" /> Erişim testi (LAN)
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem className="gap-2 text-[12px]" disabled={sinaniyor} onClick={() => void testWebUser(y.site, u, "wan")}>
                                                      <Globe className="size-3.5" /> Erişim testi (WAN)
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem className="gap-2 text-[12px]" onClick={() => editWebUserDialog(y.site, y.dbs, u)}>
                                                      <Pencil className="size-3.5" /> Düzenle
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem className="gap-2 text-[12px] text-rose-600 focus:text-rose-600" onClick={() => setWebUserDelTarget({ siteName: y.site, username: x.username })}>
                                                      <Trash2 className="size-3.5" /> Sil
                                                    </DropdownMenuItem>
                                                  </DropdownMenuContent>
                                                </DropdownMenu>
                                              )}
                                            </span>
                                            {sonuc && (
                                              <span className={`truncate text-[11px] ${sonuc.ok ? "text-emerald-700 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`} title={sonuc.message}>
                                                {sonuc.ok ? "Erişim başarılı" : "Erişim başarısız"}{sonuc.message ? ` — ${sonuc.message}` : ""}
                                              </span>
                                            )}
                                          </li>
                                        )
                                      })}
                                    </ul>
                                  )}
                                  {y && (
                                    <div className="border-t p-2">
                                      <Button size="sm" variant="outline" className="h-7 w-full gap-1.5 rounded-[5px] text-[12px]" onClick={() => openWebUserDialog(y.site, y.dbs)}>
                                        <UserPlus className="size-3.5" /> Kullanıcı ekle
                                      </Button>
                                    </div>
                                  )}
                                </PopoverContent>
                              </Popover>
                            )}
                          </span>
                        )
                      },
                    },
                    {
                      key: "sifre", header: "Şifre", width: "170px",
                      cell: (s) => {
                        const k = kimlik(s)
                        if (k.durum === "yukleniyor") return <Skeleton className="h-4 w-24 rounded-[5px]" />
                        return k.durum === "liste" && k.liste.length > 0 ? <SvcSifre deger={k.liste[0].password} /> : <span>—</span>
                      },
                    },
                    {
                      key: "status", header: "Durum", sortable: true, align: "center", width: "110px",
                      sortValue: (s) => (durumu(s) === "calisiyor" ? 2 : durumu(s) === "durdu" ? 1 : 0),
                      filter: <InlineSelectFilter options={["calisiyor", "durdu", "yok"] as const} selected={svcDurumFiltre} onChange={setSvcDurumFiltre}
                        getLabel={(o) => (o === "calisiyor" ? "Çalışıyor" : o === "durdu" ? "Durdu" : "Durum yok")} />,
                      cell: (s) => {
                        const d = durumu(s)
                        if (d === "yok") return <span>—</span>
                        return (
                          <span className={`inline-flex rounded-[5px] px-2 py-0.5 text-[11px] font-medium ${d === "calisiyor" ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" : "bg-muted text-muted-foreground"}`}>
                            {d === "calisiyor" ? "Çalışıyor" : "Durdu"}
                          </span>
                        )
                      },
                    },
                    {
                      key: "islem", header: "", width: "64px", align: "center",
                      cell: (svc) => {
                        const y = kimlik(svc).yonet
                        return (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button className="inline-flex size-7 items-center justify-center rounded-[5px] transition-colors hover:bg-muted/60" aria-label={`${svc.name} işlemleri`}>
                              <MoreVertical className="size-3.5 text-muted-foreground" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-56">
                            {y && (
                              <DropdownMenuItem className="gap-2 text-[12px]" onClick={() => openWebUserDialog(y.site, y.dbs)}>
                                <UserPlus className="size-3.5" /> Kullanıcı ekle
                              </DropdownMenuItem>
                            )}
                            {svc.type === "pars" && (
                              <>
                                <DropdownMenuItem className="gap-2 text-[12px]" onClick={() => setParsYonetim({ serviceId: svc.parsServiceId ?? null, sekme: "kullanicilar" })}>
                                  <KeyRound className="size-3.5" /> Kullanıcı adı / şifre
                                </DropdownMenuItem>
                                <DropdownMenuItem className="gap-2 text-[12px]" onClick={() => setParsYonetim({ serviceId: svc.parsServiceId ?? null, sekme: "raporlar" })}>
                                  <FileText className="size-3.5" /> Rapor / görev yetkileri
                                </DropdownMenuItem>
                                <DropdownMenuItem className="gap-2 text-[12px]" onClick={() => setParsYonetim({ serviceId: svc.parsServiceId ?? null, sekme: "datalar" })}>
                                  <Database className="size-3.5" /> Veritabanı ekle
                                </DropdownMenuItem>
                                <DropdownMenuItem className="gap-2 text-[12px]" onClick={() => openNewSvcDialog(true)}>
                                  <UserPlus className="size-3.5" /> Pars kullanıcısı ekle
                                </DropdownMenuItem>
                              </>
                            )}
                            {/* Sihirbaz ataması olmayan site: kaldıracak atama kaydı yok */}
                            <DropdownMenuItem className="gap-2 text-[12px] text-rose-600 focus:text-rose-600" disabled={!svc.assigned || svc.type === "pars"}>
                              <Trash2 className="size-3.5" /> Hizmeti kaldır
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                        )
                      },
                    },
                  ]
                  return (
                    <div className="space-y-2">
                      <ListeAracSeridi
                        sayac={tabLoading ? "" : `${filtreSayisi > 0 ? `${liste.length} / ` : ""}${tumu.length} hizmet`}
                        filtreAcik={svcFiltreAcik}
                        onFiltre={() => setSvcFiltreAcik((v) => !v)}
                        filtreSayisi={filtreSayisi}
                        onTemizle={temizle}
                      >
                        <Button size="sm" variant="outline" onClick={() => selectedFirma && void loadServiceCreds(selectedFirma.firkod, true)}
                          disabled={webUsersLoading || parsSifreLoading} className="h-8 gap-1.5 rounded-[5px] text-[12px]">
                          <RefreshCw className={`size-3.5 ${webUsersLoading || parsSifreLoading ? "animate-spin" : ""}`} /> Kullanıcıları yenile
                        </Button>
                        <Button size="sm" onClick={() => openNewSvcDialog()} className="h-8 gap-1.5 rounded-[5px] text-[12px]">
                          <Plus className="size-3.5" /> Yeni Hizmet
                        </Button>
                      </ListeAracSeridi>
                      <Table<SvcSatir>
                        data={liste}
                        columns={sutunlar}
                        getRowId={(s) => String(s.id)}
                        sort={svcSira}
                        onSortChange={setSvcSira}
                        filterRow={svcFiltreAcik}
                        columnDividers
                        resizable
                        rowHeight={36}
                        headerHeight={30}
                        height={tabloYuksekligi(liste.length, svcFiltreAcik)}
                        loading={tabLoading}
                        className="rounded-[8px] text-[13px]"
                        emptyState={
                          tumu.length === 0 ? (
                            <div className="flex flex-col items-center gap-2 py-4 text-center text-muted-foreground">
                              <p className="text-[13px]">Bu firmaya henüz hizmet kurulmadı.</p>
                              <Button size="sm" onClick={() => openNewSvcDialog()} className="h-8 gap-1.5 rounded-[5px] text-[12px]">
                                <Plus className="size-3.5" /> Hizmet ekle
                              </Button>
                            </div>
                          ) : "Filtreye uyan kayıt yok."
                        }
                      />
                    </div>
                  )
                })()}
              </TabsContent>

              {/* Veritabanları */}
              <TabsContent layout={false} value="databases" className="mt-0">
                {(() => {
                  const online = (d: TabSQLDatabase) => d.Status === "ONLINE" || d.Status === "Online"
                  const yedekTur = (d: TabSQLDatabase): "acik" | "kapali" | "kayitsiz" => (d.YedekAl === null ? "kayitsiz" : d.YedekAl ? "acik" : "kapali")
                  const ad = dbAdFiltre.trim().toLocaleLowerCase("tr-TR")
                  const liste = tabSQL.filter((d) => {
                    if (ad && !d.Name.toLocaleLowerCase("tr-TR").includes(ad)) return false
                    if (dbYedekFiltre.length && !dbYedekFiltre.includes(yedekTur(d))) return false
                    if (dbDurumFiltre.length && !dbDurumFiltre.includes(online(d) ? "online" : "diger")) return false
                    return true
                  })
                  const filtreSayisi = (ad ? 1 : 0) + (dbYedekFiltre.length ? 1 : 0) + (dbDurumFiltre.length ? 1 : 0)
                  const temizle = () => { setDbAdFiltre(""); setDbYedekFiltre([]); setDbDurumFiltre([]) }
                  const boyut = (mb: number) => (mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb} MB`)
                  const yenile = async () => {
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
                  }
                  const sutunlar: TableColumn<TabSQLDatabase>[] = [
                    {
                      key: "Name", header: "Veritabanı", sortable: true,
                      filter: <InlineTextFilter value={dbAdFiltre} onChange={setDbAdFiltre} placeholder="Veritabanı ara…" />,
                      cell: (db) => {
                        const dosyalar = [
                          db.DataFilePath ? `MDF: ${db.DataFilePath}` : null,
                          db.LogFilePath  ? `LDF: ${db.LogFilePath}`  : null,
                          db.ProgramCode  ? `Program: ${db.ProgramCode}` : null,
                        ].filter(Boolean).join("\n")
                        return (
                          <span className="flex min-w-0 items-center gap-2" title={dosyalar}>
                            <Database className="size-3.5 shrink-0" />
                            <span className="truncate">{db.Name}</span>
                          </span>
                        )
                      },
                    },
                    {
                      key: "Server", header: "Sunucu", sortable: true, width: "170px",
                      cell: (db) => (
                        <span className="block truncate">
                          {db.Server}{db.ServerIP && <span className="ml-1.5 tabular-nums">{db.ServerIP}</span>}
                        </span>
                      ),
                    },
                    {
                      key: "SizeMB", header: "Boyut", sortable: true, align: "right", width: "90px",
                      cell: (db) => <span className="tabular-nums">{boyut(db.SizeMB)}</span>,
                    },
                    {
                      key: "RecoveryModel", header: "Kurtarma", sortable: true, align: "center", width: "100px",
                      sortValue: (db) => db.RecoveryModel ?? "",
                      cell: (db) => db.RecoveryModel
                        ? <span className="inline-flex rounded-[5px] bg-muted px-2 py-0.5 text-[11px] font-medium">{db.RecoveryModel === "SIMPLE" ? "Simple" : db.RecoveryModel === "FULL" ? "Full" : db.RecoveryModel}</span>
                        : <span>—</span>,
                    },
                    {
                      key: "Owner", header: "Sahip", sortable: true, width: "150px",
                      sortValue: (db) => db.Owner ?? "",
                      cell: (db) => <span className="block truncate" title={db.Owner ?? ""}>{db.Owner ?? "—"}</span>,
                    },
                    {
                      key: "LastBackup", header: "Tam yedek", sortable: true, width: "170px",
                      sortValue: (db) => db.LastBackup ?? "",
                      cell: (db) => (
                        <span className="tabular-nums" title={db.LastBackupStart ? `Başlangıç: ${db.LastBackupStart}\nBitiş: ${db.LastBackup ?? "—"}` : ""}>
                          {db.LastBackup ?? "—"}
                        </span>
                      ),
                    },
                    {
                      key: "LastDiffBackup", header: "Diff yedek", sortable: true, width: "170px",
                      sortValue: (db) => db.LastDiffBackup ?? "",
                      cell: (db) => (
                        <span className="tabular-nums" title={db.LastDiffBackupStart ? `Başlangıç: ${db.LastDiffBackupStart}\nBitiş: ${db.LastDiffBackup ?? "—"}` : ""}>
                          {db.LastDiffBackup ?? "—"}
                        </span>
                      ),
                    },
                    {
                      // Yedek — sihirbaz ve Yeni Veritabanı penceresiyle aynı düğme; kapatmak onay ister
                      key: "YedekAl", header: "Yedek", sortable: true, align: "center", width: "110px",
                      sortValue: (db) => (db.YedekAl === null ? 0 : db.YedekAl ? 2 : 1),
                      filter: <InlineSelectFilter options={["acik", "kapali", "kayitsiz"] as const} selected={dbYedekFiltre} onChange={setDbYedekFiltre}
                        getLabel={(o) => (o === "acik" ? "Alınıyor" : o === "kapali" ? "Kapalı" : "Kayıt yok")} />,
                      cell: (db) => {
                        const yd = yedekTur(db)
                        if (yd === "kayitsiz") return <span title="sirket.guvenlik'te kaydı yok — yedek kapsamı dışında">Kayıt yok</span>
                        return (
                          <UiTooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                aria-pressed={yd === "acik"}
                                disabled={yedekAlKaydediliyor !== null}
                                onClick={(e) => { e.stopPropagation(); if (yd === "acik") setYedekKapatOnay(db); else void yedekAlDegistir(db, true) }}
                                className={`inline-flex h-7 shrink-0 items-center gap-1.5 rounded-[5px] border px-2 text-[12px] font-medium transition-colors disabled:cursor-not-allowed ${yedekAlKaydediliyor === db.Id ? "animate-pulse" : ""} ${
                                  yd === "acik"
                                    ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                                    : "text-muted-foreground line-through hover:text-foreground"
                                }`}
                              >
                                <ShieldCheck className="size-3.5" /> Yedek
                              </button>
                            </TooltipTrigger>
                            <TooltipContent>{yd === "acik" ? "Yedek görevinde — kapatmak için tıklayın" : "Yedeği alınmıyor — açmak için tıklayın"}</TooltipContent>
                          </UiTooltip>
                        )
                      },
                    },
                    {
                      key: "Status", header: "Durum", sortable: true, align: "center", width: "110px",
                      sortValue: (db) => (online(db) ? 1 : 0),
                      filter: <InlineSelectFilter options={["online", "diger"] as const} selected={dbDurumFiltre} onChange={setDbDurumFiltre} getLabel={(o) => (o === "online" ? "Çevrimiçi" : "Çevrimdışı")} />,
                      cell: (db) => (
                        <span className={`inline-flex rounded-[5px] px-2 py-0.5 text-[11px] font-medium ${online(db) ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" : "bg-red-500/15 text-red-700 dark:text-red-400"}`}>
                          {online(db) ? "Çevrimiçi" : "Çevrimdışı"}
                        </span>
                      ),
                    },
                    {
                      key: "islem", header: "", width: "64px", align: "center",
                      cell: (db) => (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button className="inline-flex size-7 items-center justify-center rounded-[5px] transition-colors hover:bg-muted/60" aria-label="İşlemler">
                              <MoreVertical className="size-3.5 text-muted-foreground" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-44">
                            <DropdownMenuItem className="gap-2 text-[12px]" onClick={() => sqlBackup(db)}>
                              <Download className="size-3.5" /> Yedek al
                            </DropdownMenuItem>
                            <DropdownMenuItem className="gap-2 text-[12px]" onClick={() => openQuery(db)}>
                              <Terminal className="size-3.5" /> Sorgu çalıştır
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ),
                    },
                  ]
                  return (
                    <div className="space-y-2">
                      <ListeAracSeridi
                        sayac={tabLoading ? "" : `${filtreSayisi > 0 ? `${liste.length} / ` : ""}${tabSQL.length} veritabanı`}
                        filtreAcik={dbFiltreAcik}
                        onFiltre={() => setDbFiltreAcik((v) => !v)}
                        filtreSayisi={filtreSayisi}
                        onTemizle={temizle}
                      >
                        <Button size="sm" variant="outline" onClick={() => void yenile()} disabled={sqlRefreshing} className="h-8 gap-1.5 rounded-[5px] text-[12px]">
                          <RefreshCw className={`size-3.5 ${sqlRefreshing ? "animate-spin" : ""}`} /> {sqlRefreshing ? "Yenileniyor…" : "Yenile"}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setGirisSirasiOpen(true)} className="h-8 gap-1.5 rounded-[5px] text-[12px]">
                          <ListOrdered className="size-3.5" /> Giriş sırası
                        </Button>
                        <Button size="sm" onClick={() => setOldDataOpen(true)} className="h-8 gap-1.5 rounded-[5px] text-[12px]">
                          <Plus className="size-3.5" /> Yeni Veritabanı
                        </Button>
                      </ListeAracSeridi>
                      <Table<TabSQLDatabase>
                        data={liste}
                        columns={sutunlar}
                        getRowId={(db) => db.Id}
                        sort={dbSira}
                        onSortChange={setDbSira}
                        filterRow={dbFiltreAcik}
                        columnDividers
                        resizable
                        rowHeight={36}
                        headerHeight={30}
                        height={tabloYuksekligi(liste.length, dbFiltreAcik)}
                        loading={tabLoading}
                        className="rounded-[8px] text-[13px]"
                        emptyState={
                          tabSQL.length === 0 ? (
                            <div className="flex flex-col items-center gap-2 py-4 text-center text-muted-foreground">
                              <p className="text-[13px]">Bu firmaya henüz veritabanı kurulmadı.</p>
                              <Button size="sm" onClick={() => setOldDataOpen(true)} className="h-8 gap-1.5 rounded-[5px] text-[12px]">
                                <Plus className="size-3.5" /> Veritabanı ekle
                              </Button>
                            </div>
                          ) : "Filtreye uyan kayıt yok."
                        }
                      />
                    </div>
                  )
                })()}
                <AlertDialog open={!!yedekKapatOnay} onOpenChange={(o) => { if (!o) setYedekKapatOnay(null) }}>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Yedek kapatılsın mı?</AlertDialogTitle>
                      <AlertDialogDescription>
                        <span className="font-medium text-foreground">{yedekKapatOnay?.Name}</span> veritabanı
                        SpareBackup ve Backup Master yedeklerinden çıkarılacak. Bu veritabanının bundan sonra yedeği alınmaz.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Vazgeç</AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-destructive text-white hover:bg-destructive/90"
                        onClick={() => { if (yedekKapatOnay) yedekAlDegistir(yedekKapatOnay, false); setYedekKapatOnay(null) }}
                      >Yedeği Kapat</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </TabsContent>

              {/* ── Erişim ─────────────────────────────────────────────────
                  Modal'a sığmayan erişim bilgileri burada, sayfa genişliğinde
                  ve kompakt tablo düzeninde. Veri sekmeye geçilince yükleniyor. */}
              {/* Analiz — firmanın kendi kullanımı, müşteriye rapor üretilir */}
              <TabsContent layout={false} value="analiz" className="mt-0">
                {selectedFirma && <FirmaAnaliz firkod={selectedFirma.firkod} />}
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

          {/* Pusula giriş ekranı data sırası */}
          {selectedFirma && (
            <GirisSirasiSheet
              open={girisSirasiOpen}
              onOpenChange={setGirisSirasiOpen}
              firkod={selectedFirma.firkod}
              firma={selectedFirma.firma}
            />
          )}

          {/* Yeni Veritabanı Ekle — Eski Datalar restore penceresi */}
          {selectedFirma && (
            <OldDataRestoreDialog
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
              <div ref={debugBoxRef} className="flex-1 min-h-0 overflow-auto bg-zinc-950 text-zinc-100 font-mono text-[11px] leading-relaxed p-4 whitespace-pre-wrap">
                {debugError && <div className="text-red-400 mb-2">{debugError}</div>}
                {debugContent ? (
                  debugContent
                ) : debugError ? null : (
                  <div className="text-zinc-500 italic">
                    {debugRunning ? "Dosya boş — 5 sn içinde yeniden denenecek…" : "Debug durduruldu."}
                  </div>
                )}
              </div>
              <div className="px-5 py-2 border-t border-border/50 text-[10px] text-muted-foreground">
                5 saniyede bir yalnız yeni satırlar okunur. Pencere kapatılınca debug durur ve dosya silinir; 10 dk okunmayan debug kendiliğinden kapatılır.
              </div>
            </DialogContent>
          </Dialog>

          {/* Yeni Kullanıcı — Yeni Veritabanı / Yeni Hizmet pencereleriyle aynı düzen */}
          <Dialog open={newUserOpen} onOpenChange={(o) => { if (!newUserStarted || newUserDone) { setNewUserOpen(o); if (!o) setNewUserStarted(false) } }}>
            <DialogContent className="top-[8vh] translate-y-0 grid-cols-1 gap-0 p-0 sm:max-w-[560px]">
              <DialogHeader className="flex-row items-center gap-3 space-y-0 border-b bg-[var(--section-bg)] px-5 py-4">
                <span className={`flex size-9 shrink-0 items-center justify-center rounded-[5px] ${newUserDone ? "bg-emerald-600 text-white" : "bg-primary text-primary-foreground"}`}>
                  {newUserDone ? <CheckCircle2 className="size-[18px]" /> : <UserPlus className="size-[18px]" />}
                </span>
                <div className="min-w-0">
                  <DialogTitle className="text-[15px] font-semibold">
                    Yeni Kullanıcı <span className="font-medium text-muted-foreground">— {selectedFirma?.firkod}</span>
                  </DialogTitle>
                  <DialogDescription className="truncate text-[12px]">
                    {newUserDone ? "Kullanıcı oluşturuldu — erişim bilgilerini müşteriye iletin."
                      : newUserStarted ? "Active Directory'de oluşturuluyor…"
                      : selectedFirma?.firma ?? ""}
                  </DialogDescription>
                </div>
              </DialogHeader>

              <div className="max-h-[68vh] min-w-0 overflow-y-auto">
                <div className="space-y-3 p-4 [&_label]:text-foreground">
                  {!newUserStarted ? (() => {
                    const adSrv  = newUserAdServers.find((x) => x.id === newUserAdServerId)
                    const rdpSrv = newUserRdpServers.find((x) => x.id === newUserRdpServerId)
                    const ikisiKilitli = newUserAdLocked && newUserRdpLocked
                    // Eksik alan uyarıları yalnız Oluştur'a basıldıktan sonra
                    const eksik = (kosul: boolean) => newUserDenendi && kosul
                    const sunucuEksik = eksik(!newUserAdServerId || !newUserRdpServerId)
                    const adEksik = eksik(!newUserUsername.trim())
                    const sifreEksik = eksik(!newUserPassword.trim() || !meetsAdComplexity(newUserPassword))
                    const hata = `border-red-500/60 ${newUserSallan ? "motion-safe:animate-sallan" : ""}`
                    return (
                      <>
                        {/* Sunucular — firma kaydından geliyorsa tek bilgi şeridi, değilse seçici.
                            Seçenekler gelene kadar şerit boyunda iskelet: aksi halde önce seçici, sonra şerit görünüp zıplıyor. */}
                        {newUserSunucuYukleniyor ? (
                          <div className="flex items-center gap-2 rounded-[8px] bg-[var(--section-bg)] px-3 py-2">
                            <Skeleton className="size-3.5 rounded-[3px]" />
                            <Skeleton className="h-3.5 w-28 rounded-[5px]" />
                            <Skeleton className="h-3.5 w-20 rounded-[5px]" />
                            <Skeleton className="h-3.5 w-28 rounded-[5px]" />
                          </div>
                        ) : ikisiKilitli ? (
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-[8px] bg-[var(--section-bg)] px-3 py-2 text-[12px]">
                            <Server className="size-3.5 shrink-0 text-muted-foreground" />
                            <span className="font-medium">{adSrv?.name ?? "—"}</span>
                            <span className="tabular-nums text-muted-foreground">{adSrv?.ip}</span>
                            <ArrowRight className="size-3 shrink-0 text-muted-foreground" />
                            <span className="font-medium">{rdpSrv?.name ?? "—"}</span>
                            <span className="tabular-nums text-muted-foreground">{rdpSrv?.ip}</span>
                            <span className="ml-auto text-muted-foreground">firma kaydından</span>
                          </div>
                        ) : (
                          <KullaniciBolum baslik="Sunucular">
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                              {([
                                { etiket: "AD sunucusu", liste: newUserAdServers, deger: newUserAdServerId, set: setNewUserAdServerId, kilitli: newUserAdLocked, sec: adSrv },
                                { etiket: "Bağlantı sunucusu (RDP)", liste: newUserRdpServers, deger: newUserRdpServerId, set: setNewUserRdpServerId, kilitli: newUserRdpLocked, sec: rdpSrv },
                              ] as const).map((s) => (
                                <Field key={s.etiket} label={s.etiket} required hint={s.kilitli ? "Firma kaydından" : undefined} ek={sunucuEksik && !s.deger ? <span className="text-red-700 dark:text-red-400">Seçin</span> : undefined}>
                                  {s.kilitli ? (
                                    <div className="flex h-8 items-center gap-2 rounded-[5px] border px-2.5 text-[13px]">
                                      <span className="truncate">{s.sec?.name ?? "—"}</span>
                                      {s.sec?.ip && <span className="ml-auto shrink-0 text-[12px] tabular-nums text-muted-foreground">{s.sec.ip}</span>}
                                    </div>
                                  ) : (
                                    <Select value={s.deger} onValueChange={s.set}>
                                      <SelectTrigger className={`h-8 rounded-[5px] text-[13px] ${sunucuEksik && !s.deger ? hata : ""}`}>
                                        <SelectValue placeholder={s.liste.length ? "Seçin…" : "Yükleniyor…"} />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {s.liste.map((x) => (
                                          <SelectItem key={x.id} value={x.id} className="text-[13px]">
                                            {x.name} <span className="ml-1 tabular-nums text-muted-foreground">{x.ip}</span>
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  )}
                                </Field>
                              ))}
                            </div>
                          </KullaniciBolum>
                        )}

                        <KullaniciBolum baslik="Hesap">
                          {/* Kullanıcı adı — firma kodu öneki sabit */}
                          <Field label="Kullanıcı adı" required ek={adEksik ? <span className="text-red-700 dark:text-red-400">Kullanıcı adı girin</span> : undefined}>
                            <div className={`flex h-8 items-center overflow-hidden rounded-[5px] border bg-background transition-colors focus-within:border-foreground/40 ${adEksik ? hata : ""}`}>
                              <span className="flex h-full shrink-0 items-center border-r bg-muted px-2.5 text-[13px] font-medium">{selectedFirma?.firkod}.</span>
                              <input
                                value={newUserUsername}
                                onChange={(e) => setNewUserUsername(e.target.value)}
                                placeholder="kullanici"
                                autoFocus
                                className="h-full min-w-0 flex-1 bg-transparent px-2.5 text-[13px] outline-none"
                              />
                            </div>
                          </Field>

                          <Field label="Ad soyad">
                            <Input value={newUserDisplayName} onChange={(e) => setNewUserDisplayName(e.target.value)} placeholder="Adı Soyadı" />
                          </Field>

                          {/* Şifre — göster / oluştur; AD karmaşıklık kuralı canlı kontrol */}
                          <Field label="Şifre" required ek={
                            !newUserPassword
                              ? <span className={sifreEksik ? "text-red-700 dark:text-red-400" : "text-muted-foreground"}>{sifreEksik ? "Şifre girin ya da Oluştur'a basın" : "En az 7 karakter, 4 gruptan 3'ü"}</span>
                              : meetsAdComplexity(newUserPassword)
                                ? <span className="text-emerald-700 dark:text-emerald-400">AD kuralına uygun</span>
                                : <span className="text-red-700 dark:text-red-400">Kurala uymuyor — en az 7 karakter, 4 gruptan 3&apos;ü</span>
                          }>
                            <div className={`flex h-8 items-center overflow-hidden rounded-[5px] border bg-background transition-colors focus-within:border-foreground/40 ${
                              sifreEksik ? hata : newUserPassword ? (meetsAdComplexity(newUserPassword) ? "border-emerald-500/60" : hata) : ""
                            }`}>
                              <input
                                type={newUserShowPw ? "text" : "password"}
                                value={newUserPassword}
                                onChange={(e) => setNewUserPassword(e.target.value)}
                                placeholder="••••••••"
                                className="h-full min-w-0 flex-1 bg-transparent px-2.5 text-[13px] outline-none"
                              />
                              <button type="button" onClick={() => setNewUserShowPw((v) => !v)} title={newUserShowPw ? "Gizle" : "Göster"} className="flex h-full w-8 items-center justify-center text-muted-foreground transition-colors hover:text-foreground">
                                {newUserShowPw ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                              </button>
                              <button type="button" onClick={() => { setNewUserPassword(generatePassword()); setNewUserShowPw(true) }} title="Şifre oluştur" className="flex h-full items-center gap-1 border-l bg-muted/40 px-2.5 text-[12px] font-medium transition-colors hover:bg-muted">
                                <RefreshCw className="size-3.5" /> Oluştur
                              </button>
                            </div>
                          </Field>
                        </KullaniciBolum>

                        <KullaniciBolum baslik="İletişim" not="isteğe bağlı">
                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <Field label="E-posta">
                              <Input type="email" value={newUserEmail} onChange={(e) => setNewUserEmail(e.target.value)} placeholder="ad@sirket.com" />
                            </Field>
                            <Field label="Telefon">
                              <Input type="tel" value={newUserPhone} onChange={(e) => setNewUserPhone(e.target.value)} placeholder="05xx xxx xx xx" />
                            </Field>
                          </div>
                        </KullaniciBolum>

                        {newUserError && (
                          <p className="rounded-[5px] bg-red-500/15 px-3 py-2 text-[12px] text-red-700 dark:text-red-400">{newUserError}</p>
                        )}
                      </>
                    )
                  })() : (
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

                  {/* Bitti — müşteriye gidecek erişim bilgisi */}
                  {newUserDone && selectedFirma && (
                    <KullaniciBolum baslik="Müşteri bilgilendirme">
                      <ul className="-mx-3 -my-3 divide-y">
                        {newUserErisim.satirlar.map((s) => (
                          <li key={s.ad} className="flex items-center gap-2 px-3 py-2">
                            <span className="w-[96px] shrink-0 text-[12px] text-muted-foreground">{s.ad}</span>
                            <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{s.deger || "—"}</span>
                            <CopyIconButton value={s.deger} subtle />
                          </li>
                        ))}
                      </ul>
                    </KullaniciBolum>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 border-t px-5 py-3">
                {!newUserStarted ? (
                  <>
                    <Button variant="outline" className="flex-1" onClick={() => setNewUserOpen(false)}>Vazgeç</Button>
                    {/* Hiç silik değil: eksik varsa basınca alanların altında gösterilir */}
                    <Button className="flex-1" onClick={() => {
                      setNewUserDenendi(true)
                      // Eksik/hatalı alanlar kısa sallanır (globals.css `sallan`, motion-safe)
                      if (!newUserValid) { setNewUserSallan(true); setTimeout(() => setNewUserSallan(false), 450); return }
                      setNewUserError(null); setNewUserStarted(true)
                    }}>
                      <UserPlus className="size-3.5" /> Oluştur
                    </Button>
                  </>
                ) : newUserDone && selectedFirma ? (
                  <>
                    <Button variant="outline" className="flex-1" onClick={() => { setNewUserOpen(false); setNewUserStarted(false) }}>Kapat</Button>
                    <Button className="flex-1" onClick={async () => {
                      if (await copyToClipboard(newUserErisim.mesaj)) { setNewUserMsgCopied(true); setTimeout(() => setNewUserMsgCopied(false), 2000) }
                    }}>
                      {newUserMsgCopied ? <><CheckCheck className="size-3.5" /> Kopyalandı</> : <><Copy className="size-3.5" /> Mesajı kopyala</>}
                    </Button>
                  </>
                ) : (
                  <Button variant="outline" className="flex-1" disabled={!newUserError} onClick={() => { setNewUserOpen(false); setNewUserStarted(false) }}>
                    {newUserError ? "Kapat" : "Oluşturuluyor…"}
                  </Button>
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
          {selectedFirma && (
            <>
              <ConnectKoduDialog firkod={selectedFirma.firkod} kullanici={connectKoduKullanici} onClose={() => setConnectKoduKullanici(null)} />
              <ConnectCihazlarDialog firkod={selectedFirma.firkod} kullanici={connectCihazKullanici} onClose={() => setConnectCihazKullanici(null)} />
              <TerminalDegistirSheet
                open={terminalDegistirAcik}
                onOpenChange={setTerminalDegistirAcik}
                firkod={selectedFirma.firkod}
                firmaAdi={selectedFirma.firma}
                onBitti={() => void loadAccessTab(selectedFirma.firkod)}
              />
            </>
          )}

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

          {/* Pars Yönetimi (kullanıcı adı/şifre · raporlar · veritabanı) */}
          {selectedFirma && (
            <ParsYonetimSheet
              open={!!parsYonetim}
              onOpenChange={(o) => !o && setParsYonetim(null)}
              firkod={selectedFirma.firkod}
              firmaAdi={selectedFirma.firma}
              serviceId={parsYonetim?.serviceId ?? null}
              baslangicSekmesi={parsYonetim?.sekme}
              dbSecenekleri={tabSQL.map((d) => ({ name: d.Name, programCode: d.ProgramCode }))}
              onChanged={refreshTabServices}
            />
          )}

          {/* Yeni Hizmet Ekle Dialog */}
          <Dialog open={newSvcOpen} onOpenChange={(o) => { if (!newSvcStarted) setNewSvcOpen(o) }}>
            {/* Ortaya değil üste sabit: kategori değişince yükseklik değişiyor; ortalı pencere
                yeniden ortalanıp sekme çubuğunu dikeyde kaydırınca vurgu yukarıdan geliyordu. */}
            <DialogContent className="top-[8vh] translate-y-0 sm:max-w-[760px] p-0 gap-0">
              <DialogHeader className="flex-row items-center gap-3 space-y-0 border-b bg-[var(--section-bg)] px-5 py-4">
                <span className="bg-primary/10 text-primary ring-primary/20 flex size-9 shrink-0 items-center justify-center rounded-[5px] ring-1">
                  <Plus className="size-[18px]" />
                </span>
                <div className="min-w-0">
                  <DialogTitle className="text-[15px] font-semibold">
                    Yeni Hizmet <span className="text-muted-foreground font-medium">— {selectedFirma?.firkod}</span>
                  </DialogTitle>
                  <p className="text-muted-foreground text-[12px]">
                    {newSvcStarted ? "Hizmetler kuruluyor…" : "Firmaya eklenecek hizmetleri seçin."}
                  </p>
                </div>
              </DialogHeader>
              <ScrollArea className="max-h-[68vh]">
                <div className="px-5 py-4 space-y-3">
                  {!newSvcStarted ? (
                    <>
                      {newSvcLoading ? (
                        <div className="space-y-3">
                          <Skeleton className="h-8 w-full rounded-[5px]" />
                          <Skeleton className="h-[104px] w-full rounded-[5px]" />
                        </div>
                      ) : newSvcCatalog.length === 0 ? (
                        <div className="flex flex-col items-center gap-2 py-8 text-center">
                          <p className="text-muted-foreground text-[12px]">Henüz tanımlı hizmet yok.</p>
                          <Button asChild size="sm" variant="outline" className="h-7 text-[11px]">
                            <a href="/services"><Plus className="size-3.5" />Hizmet tanımla</a>
                          </Button>
                        </div>
                      ) : (
                        <>
                          {/* Hizmet ekle — seçilen hizmet aşağıya bir satır olarak eklenir; listede
                              yalnız henüz eklenmemiş hizmetler görünür. Açılır listedeki filtre kategoriye daraltır. */}
                          <Combobox
                            items={newSvcCatalog.filter((s) => !newSvcSelectedIds.includes(s.id) && (!newSvcFiltre || s.category === newSvcFiltre))}
                            header={
                              <ToggleGroup
                                type="single"
                                value={newSvcFiltre || "tumu"}
                                onValueChange={(v) => v && setNewSvcFiltre(v === "tumu" ? "" : v)}
                                variant="outline"
                                size="sm"
                                className="w-full"
                              >
                                <ToggleGroupItem value="tumu" className="h-7 flex-1 px-2 text-[12px]">Tümü</ToggleGroupItem>
                                {[...new Set(newSvcCatalog.map((s) => s.category))].map((cat) => (
                                  <ToggleGroupItem key={cat} value={cat} className="h-7 flex-1 px-2 text-[12px]">
                                    {cat === "Mobil" ? "Pars" : cat}
                                  </ToggleGroupItem>
                                ))}
                              </ToggleGroup>
                            }
                            getKey={(s) => String(s.id)}
                            getLabel={(s) => `${s.name} ${s.category}`}
                            value=""
                            onChange={(key) => { const id = Number(key); if (id) setNewSvcSelectedIds((p) => p.includes(id) ? p : [...p, id]) }}
                            placeholder={newSvcSelectedIds.length ? "Başka hizmet ekle…" : "Hizmet ekle…"}
                            searchPlaceholder="Hizmet ara…"
                            emptyText="Eklenecek hizmet kalmadı"
                            maxListHeight="max-h-72"
                            renderItem={(s) => {
                              const { ikon, renk } = hizmetGorunum(s.name, s.type)
                              return (
                                <span className="flex min-w-0 flex-1 items-center gap-2.5">
                                  <span className={`flex size-6 shrink-0 items-center justify-center rounded-[5px] ${renk.yumusak}`}>
                                    <HizmetIkonu ikon={ikon} className="size-3.5" />
                                  </span>
                                  <span className="min-w-0 flex-1 truncate">{s.name}</span>
                                  <span className="text-muted-foreground shrink-0 text-[11px]">{s.category === "Mobil" ? "Pars" : s.category}</span>
                                </span>
                              )
                            }}
                          />

                          {/* Eklenen hizmetler — her biri bir satır; API hizmetinde (Resim hariç) kullanıcı/şifre */}
                          {newSvcSelected.length === 0 ? (
                            <div className="text-muted-foreground flex flex-col items-center gap-1 rounded-[5px] border border-dashed py-8 text-center">
                              <Plus className="size-4" />
                              <p className="text-[12px]">Yukarıdan hizmet seçerek ekleyin.</p>
                            </div>
                          ) : (
                            <div className="bg-card divide-y rounded-[5px] border">
                              {newSvcSelected.map((svc) => {
                                const { ikon, renk } = hizmetGorunum(svc.name, svc.type)
                                const apiKullanicili = svc.type === "iis-site"
                                const k = newSvcApiKimlik[svc.id] ?? { username: "", password: "" }
                                const hata = apiKimlikAlanHatalari(k.username, k.password)
                                const yaz = (patch: Partial<{ username: string; password: string }>) =>
                                  setNewSvcApiKimlik((p) => ({ ...p, [svc.id]: { ...(p[svc.id] ?? { username: "", password: "" }), ...patch } }))
                                const kirmizi = "border-rose-500 focus-visible:border-rose-500 focus-visible:ring-rose-500/20"
                                return (
                                  <div key={svc.id} className="animate-in fade-in slide-in-from-top-1 flex items-center gap-3 px-3 py-2.5 duration-300">
                                    <span className={`flex size-8 shrink-0 items-center justify-center rounded-[5px] ${renk.yumusak}`}>
                                      <HizmetIkonu ikon={ikon} />
                                    </span>
                                    <div className="min-w-0 flex-1">
                                      <div className="truncate text-[13px] font-medium leading-[18px]">{svc.name}</div>
                                      <div className="text-muted-foreground truncate text-[11px] leading-[16px]">{svc.category === "Mobil" ? "Pars" : svc.category}</div>
                                    </div>
                                    {apiKullanicili && (
                                      <>
                                        <Input
                                          value={k.username}
                                          onChange={(e) => yaz({ username: e.target.value })}
                                          placeholder="Kullanıcı adı"
                                          autoComplete="off"
                                          aria-label={`${svc.name} kullanıcı adı`}
                                          aria-invalid={hata.kullanici || undefined}
                                          className={`h-8 w-[170px] shrink-0 rounded-[5px] text-[12px] ${hata.kullanici ? kirmizi : ""}`}
                                        />
                                        <div className="relative w-[150px] shrink-0">
                                          <Input
                                            value={k.password}
                                            onChange={(e) => yaz({ password: e.target.value.replace(/[^0-9]/g, "").slice(0, 6) })}
                                            placeholder="Şifre (6 rakam)"
                                            inputMode="numeric"
                                            maxLength={6}
                                            autoComplete="off"
                                            aria-label={`${svc.name} şifre`}
                                            aria-invalid={hata.sifre || undefined}
                                            className={`h-8 rounded-[5px] pr-8 text-[12px] tabular-nums ${hata.sifre ? kirmizi : ""}`}
                                          />
                                          <UiTooltip>
                                            <TooltipTrigger asChild>
                                              <button
                                                type="button"
                                                onClick={() => yaz({ password: apiSifreUret() })}
                                                aria-label="Şifre üret"
                                                className="text-muted-foreground hover:text-foreground absolute top-1/2 right-1 flex size-6 -translate-y-1/2 items-center justify-center rounded-[5px] transition-colors"
                                              >
                                                <RefreshCw className="size-3.5" />
                                              </button>
                                            </TooltipTrigger>
                                            <TooltipContent>Şifre üret</TooltipContent>
                                          </UiTooltip>
                                        </div>
                                      </>
                                    )}
                                    <UiTooltip>
                                      <TooltipTrigger asChild>
                                        <Button
                                          type="button"
                                          size="icon"
                                          variant="ghost"
                                          onClick={() => {
                                            setNewSvcSelectedIds((p) => p.filter((x) => x !== svc.id))
                                            setNewSvcApiKimlik((p) => { const n = { ...p }; delete n[svc.id]; return n })
                                          }}
                                          aria-label={`${svc.name} kaldır`}
                                          className="text-muted-foreground size-8 shrink-0 rounded-[5px] hover:text-rose-600"
                                        >
                                          <X className="size-4" />
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent>Kaldır</TooltipContent>
                                    </UiTooltip>
                                  </div>
                                )
                              })}
                            </div>
                          )}

                          {/* Kurulum sunucuları — tüm seçili hizmetlerde ortak (kurulum türe göre
                              tek IIS / tek Windows / tek Depo kullanır). Alanlar gerektiğinde açılır. */}
                          {(() => {
                            const alanlar: Array<{ key: string; acik: boolean; el: React.ReactNode }> = [
                              { key: "iis",  acik: newSvcHasIis || newSvcHasResim,
                                el: newSvcSunucuSec("IIS Sunucusu", "API hizmetlerinin siteleri burada açılır", Globe, newSvcIisServerId, setNewSvcIisServerId, newSvcIisServers) },
                              { key: "win",  acik: newSvcHasPusula,
                                el: newSvcSunucuSec("Windows / RDP", "Program klasörü ve kısayollar", Laptop, newSvcWindowsServerId, setNewSvcWindowsServerId, newSvcWindowsList, { disabled: newSvcWindowsLocked, not: newSvcWindowsLocked ? "firma kaydından" : undefined }) },
                              { key: "depo", acik: newSvcHasPusula || newSvcHasResim,
                                el: newSvcSunucuSec("Depo", newSvcHasResim ? "Resim klasörü ve Resimler paylaşımı" : "Resim klasörü", HardDrive, newSvcDepoServerId, setNewSvcDepoServerId, newSvcDepoServers) },
                            ]
                            const acik = alanlar.filter((a) => a.acik)
                            const herhangi = acik.length > 0
                            return (
                              <div
                                inert={!herhangi}
                                className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${herhangi ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}
                              >
                                <div className="overflow-hidden">
                                  <div className="text-muted-foreground mb-1.5 text-[10px] font-medium tracking-wider uppercase">Kurulum sunucuları</div>
                                  <div className="bg-card divide-y rounded-[5px] border">
                                    {acik.map((a) => (
                                      <div key={a.key} className="animate-in fade-in slide-in-from-top-1 duration-300">
                                        {a.el}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            )
                          })()}

                          {/* Pars: kullanıcılar + raporlar + bağlanacak DB'ler */}
                          {newSvcParsService && (
                            <>
                              <div className="rounded-[5px] border border-border/50 overflow-hidden">
                                <div className="px-3 py-2 bg-muted/20 border-b border-border">
                                  <span className="text-[10px] font-medium text-muted-foreground tracking-wider uppercase">
                                    Pars'a bağlanacak veritabanları — {newSvcParsDatalar.length} / {tabSQL.length}
                                  </span>
                                </div>
                                {tabSQL.length === 0 ? (
                                  <p className="px-3 py-3 text-[11px] text-amber-600 dark:text-amber-400">
                                    Firmanın SQL veritabanı listesi boş — Pars kullanıcısı rapor göremez. Önce SQL sekmesinden veritabanını kur.
                                  </p>
                                ) : (
                                  <div className="divide-y divide-border/40">
                                    {tabSQL.map((db) => (
                                      <div key={db.Name} className="grid grid-cols-[1fr_170px] items-center gap-3 px-3 py-1.5">
                                        <span className="text-[11px] font-mono truncate">{db.Name}</span>
                                        <Select value={newSvcParsDbTips[db.Name] ?? ""} onValueChange={(v) => setNewSvcParsDbTips((p) => ({ ...p, [db.Name]: v === "yok" ? "" : v }))}>
                                          <SelectTrigger className="h-7 text-[11px] rounded-[5px]">
                                            <SelectValue placeholder="Bağlanmaz" />
                                          </SelectTrigger>
                                          <SelectContent>
                                            <SelectItem value="yok" className="text-[11px]">Bağlanmaz</SelectItem>
                                            {Object.entries(PARS_TIPLER).map(([tid, ad]) => (
                                              <SelectItem key={tid} value={tid} className="text-[11px]">{ad}</SelectItem>
                                            ))}
                                          </SelectContent>
                                        </Select>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                              <StepServicesPars
                                katalog={newSvcParsKatalog}
                                loading={newSvcParsLoading}
                                error={newSvcParsError}
                                onRefresh={() => loadNewSvcParsKatalog(newSvcParsService.id, true)}
                                users={newSvcParsUsers}
                                onAddUser={() => setNewSvcParsUsers((p) => [...p, mkParsRow()])}
                                onRemoveUser={(id) => setNewSvcParsUsers((p) => p.filter((u) => u.id !== id))}
                                onUpdateUser={(id, patch) => setNewSvcParsUsers((p) => p.map((u) => u.id === id ? { ...u, ...patch } : u))}
                                onRegenerate={(id) => setNewSvcParsUsers((p) => p.map((u) => u.id === id ? { ...u, password: parsSifreUret() } : u))}
                                programTipleri={newSvcParsTipleri}
                                selectedReportIds={newSvcParsReportIds}
                                onSetReportIds={setNewSvcParsReportIds}
                              />
                            </>
                          )}

                          {!newSvcAdServerId && !newSvcParsOnly && (
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
                          serverId:         newSvcParsOnly ? "" : newSvcAdServerId,
                          windowsServerId:  newSvcHasPusula ? newSvcWindowsServerId : undefined,
                          iisServerId:      (newSvcHasIis || newSvcHasResim) ? newSvcIisServerId : undefined,
                          depoServerId:     (newSvcHasPusula || newSvcHasResim) ? newSvcDepoServerId : undefined,
                          firmaId:          selectedFirma.firkod,
                          firmaName:        selectedFirma.firma,
                          users:            [],
                          services:         newSvcSelected.map<AdProvisionService>((s) => {
                            const k = s.type === "iis-site" ? newSvcApiKimlik[s.id] : undefined
                            return {
                              id:     s.id,
                              name:   s.name,
                              type:   s.type,
                              config: s.config,
                              // Boş bırakılırsa gönderilmez → kullanıcılar kardeş hizmetten kopyalanır
                              appUser: k && k.username.trim() && k.password ? { username: k.username.trim(), password: k.password } : undefined,
                            }
                          }),
                          skipDepo:         !newSvcHasPusula,
                          pars: newSvcParsService ? {
                            serviceId:        newSvcParsService.id,
                            users:            newSvcParsUsers.map((u) => ({ username: u.username.trim(), password: u.password, admin: u.admin })),
                            allowedReportIds: newSvcParsReportIds,
                            datalar:          newSvcParsDatalar,
                          } : undefined,
                        }}
                        onComplete={() => {
                          toast.success("Hizmet kuruldu", { description: `${newSvcSelected.length} hizmet firmaya eklendi` })
                          setNewSvcDone(true)
                          refreshTabServices()
                        }}
                        onError={(msg) => setNewSvcError(msg)}
                        onStep={(st) => {
                          if (st.stepId !== "pars_yaz") return
                          if (st.status === "done")  setNewSvcParsDurum("tamam")
                          if (st.status === "error") setNewSvcParsDurum("hata")
                        }}
                      />
                    )
                  )}

                  {/*  Pars kullanicisi yazildiysa musteriye gidecek metin —
                      sihirbazdaki (step-run.tsx) blokla AYNI bicim.        */}
                  {newSvcParsDurum === "tamam" && newSvcParsService && (() => {
                    const msg = [
                      "Merhaba,",
                      "",
                      "Pars mobil uygulama erişim bilgileriniz aşağıdadır.",
                      "",
                      ...parsMesajSatirlari(
                        newSvcParsUsers.map((u) => ({ username: u.username, password: u.password })),
                        newSvcParsKatalog?.baglanti,
                      ),
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
                          onClick={async () => { if (await copyToClipboard(msg)) { setNewSvcMsgCopied(true); setTimeout(() => setNewSvcMsgCopied(false), 2000) } }}
                          className="w-full rounded-[5px] h-8 text-[13px] gap-1.5"
                        >
                          {newSvcMsgCopied ? <><CheckCircle2 className="h-3.5 w-3.5" /> Kopyalandı</> : <><Save className="h-3.5 w-3.5" /> Kopyala</>}
                        </Button>
                      </div>
                    )
                  })()}
                </div>
              </ScrollArea>
              <div className="flex items-center gap-2 border-t px-5 py-3">
                {!newSvcStarted ? (
                  <>
                    <span className="text-muted-foreground mr-auto text-[12px] tabular-nums">
                      {newSvcSelectedIds.length > 0 ? `${newSvcSelectedIds.length} hizmet seçildi` : "Hizmet seçilmedi"}
                    </span>
                    <Button size="sm" variant="outline" onClick={() => setNewSvcOpen(false)} className="h-8 rounded-[5px] text-[12px]">Vazgeç</Button>
                    <Button size="sm" disabled={!newSvcValid} onClick={() => { setNewSvcError(null); setNewSvcStarted(true) }} className="h-8 gap-1.5 rounded-[5px] text-[12px]">
                      <Plus className="size-3.5" /> Oluştur
                    </Button>
                  </>
                ) : (
                  <Button size="sm" disabled={!newSvcDone && !newSvcError} onClick={() => { setNewSvcOpen(false); setNewSvcStarted(false) }} className="ml-auto h-8 rounded-[5px] text-[12px]">Kapat</Button>
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
        <ListeKarti
          className="min-h-0 flex-1"
          baslik="Firmalar"
          ikon={<Building2 className="size-3.5" />}
          toplam={apiCompanies.length}
          filtreli={listeFiltreli.length}
          aksiyon={
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1.5 rounded-[5px] text-[12px]"
              onClick={exportCompanyList}
              disabled={apiLoading || listeFiltreli.length === 0}
              title="Listelenen firmaları Excel olarak indir"
            >
              <Download className="h-3.5 w-3.5" />
              Excel
            </Button>
          }
        >
          <div className="min-h-0 flex-1 overflow-auto">
            <table className="w-full text-[14px] font-medium leading-[20px]">
              <ListeThead>
                <th className="w-px px-4 py-1.5 text-left font-medium whitespace-nowrap">
                  <MetinFiltre label="Firma Kodu" value={kodFiltre} onChange={setKodFiltre} />
                </th>
                {/* Boş alanı bu sütun yutar — diğerleri içeriğine göre daralır. */}
                <th className="px-4 py-1.5 text-left font-medium">
                  <MetinFiltre label="Firma" value={firmaFiltre} onChange={setFirmaFiltre} />
                </th>
                <th className="w-px px-4 py-1.5 text-left font-medium whitespace-nowrap">
                  <SecimFiltre
                    label="Temsilci"
                    options={temsilciSecenekleri}
                    getLabel={(o) => o}
                    selected={temsilciFiltre}
                    onChange={(v) => setTemsilciFiltre(v as string[])}
                    aranabilir
                    ilkGosterim={8}
                  />
                </th>
                <th className="w-px px-4 py-1.5 text-right font-medium whitespace-nowrap">
                  <SayiAralikFiltre label="Kullanıcı" value={kullaniciFiltre} onChange={setKullaniciFiltre} />
                </th>
                <th className="w-px px-4 py-1.5 text-right font-medium whitespace-nowrap">
                  <TarihFiltre
                    label="Lisans Bitiş"
                    value={lisansFiltre}
                    onChange={setLisansFiltre}
                    buAyLabel="Bu ay doluyor"
                    align="end"
                  />
                </th>
                <th className="w-px px-4 py-1.5 text-right font-medium whitespace-nowrap">
                  <SecimFiltre
                    label="Durum"
                    options={["aktif", "doldu"] as const}
                    getLabel={(o) => (o === "aktif" ? "Aktif" : "Süresi Doldu")}
                    selected={durumFiltre}
                    onChange={(v) => setDurumFiltre(v as string[])}
                  />
                </th>
              </ListeThead>
              <tbody>
                {apiLoading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 6 }).map((_, j) => (
                        <td key={j} className="px-4 py-1.5"><Skeleton className="h-3 w-full rounded-[5px]" /></td>
                      ))}
                    </tr>
                  ))
                ) : listeFiltreli.length === 0 ? (
                  <ListeBosSatir
                    sutunSayisi={6}
                    toplam={apiCompanies.length}
                    bosMesaj="Kayıtlı firma yok."
                    filtreliMesaj="Arama sonucu bulunamadı."
                  />
                ) : firmaSayfalik.map((comp) => {
                  const active = firmaIsActive(comp);
                  return (
                    <tr
                      key={comp.id}
                      onClick={() => selectFirma(comp)}
                      className="hover:bg-muted/20 cursor-pointer transition-colors"
                    >
                      <td className="text-muted-foreground w-px px-4 py-1.5 whitespace-nowrap font-mono text-[12px] tabular-nums">
                        {comp.firkod || "—"}
                      </td>
                      <td className="px-4 py-1.5 text-[12px]">
                        <span className="flex min-w-0 items-center gap-2">
                          <Building2 className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">{comp.firma}</span>
                        </span>
                      </td>
                      <td className="text-muted-foreground w-px px-4 py-1.5 whitespace-nowrap text-[12px]">
                        {comp.temsilci ? (
                          <span className="inline-flex items-center gap-1.5" title={comp.temsilci.aktif ? undefined : "Temsilci pasif — firma devredilmemiş olabilir"}>
                            <User className="h-3 w-3 shrink-0" />
                            <span className={comp.temsilci.aktif ? "" : "opacity-60"}>{comp.temsilci.ad}</span>
                            {!comp.temsilci.aktif && (
                              <span className="inline-flex rounded-[5px] bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400">pasif</span>
                            )}
                          </span>
                        ) : "—"}
                      </td>
                      <td className="text-muted-foreground w-px px-4 py-1.5 text-right whitespace-nowrap text-[12px] tabular-nums">
                        <span className="inline-flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          {comp.userCount}
                        </span>
                      </td>
                      <td className="text-muted-foreground w-px px-4 py-1.5 text-right whitespace-nowrap text-[12px] tabular-nums">
                        {lisansGoster(comp.lisansBitis)}
                      </td>
                      <td className="w-px px-4 py-1.5 text-right whitespace-nowrap">
                        {active ? (
                          <span className="inline-flex rounded-[5px] bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">Aktif
                          </span>
                        ) : (
                          <span className="inline-flex rounded-[5px] bg-red-500/15 px-2 py-0.5 text-[11px] font-medium text-red-700 dark:text-red-400">Süresi Doldu
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <ListeSayfalama
            sayfa={firmaSayfa}
            onSayfaChange={setFirmaSayfa}
            toplam={listeFiltreli.length}
            sayfaBoyu={FIRMA_SAYFA_BOYU}
          />
        </ListeKarti>
      )}

      {/* Panik / geri alma onayı — yıkıcı işlem, AlertDialog zorunlu (proje kuralı) */}
      <AlertDialog open={panicOpen} onOpenChange={(o) => { if (!panicBusy) setPanicOpen(o) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {firmaErisimiKesik ? "Firma erişimini aç" : "Firma erişimini kes"}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-[12px]">
                <p>
                  <strong>{selectedFirma?.firma}</strong> firması için:
                </p>
                {firmaErisimiKesik ? (
                  <>
                    <ul className="list-inside list-disc space-y-1">
                      <li>
                        Devre dışı bırakılmış {tabUsers.length} AD hesabı yeniden açılacak —
                        kullanıcılar tekrar oturum açabilir.
                      </li>
                    </ul>
                    <p className="text-muted-foreground">
                      Kapatılan oturumlar geri gelmez; kullanıcılar yeniden bağlanır.
                    </p>
                  </>
                ) : (
                  <>
                    <ul className="list-inside list-disc space-y-1">
                      <li>Tüm aktif AD hesapları devre dışı bırakılacak — yeni oturum açılamaz.</li>
                      <li>O an açık olan oturumlar kapatılacak — <strong>kaydedilmemiş veriler kaybolur</strong>.</li>
                    </ul>
                    <p className="text-muted-foreground">
                      Erişim aynı düğmeyle geri açılabilir; kapanan oturumlar geri gelmez.
                    </p>
                  </>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={panicBusy} className="text-[12px] h-8">Vazgeç</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); runPanic(firmaErisimiKesik) }}
              disabled={panicBusy}
              className={
                (firmaErisimiKesik
                  ? "bg-emerald-600 hover:bg-emerald-600/90 "
                  : "bg-destructive hover:bg-destructive/90 ") +
                "text-white text-[12px] h-8"
              }
            >
              {panicBusy
                ? (firmaErisimiKesik ? "Açılıyor…" : "Kesiliyor…")
                : (firmaErisimiKesik ? "Erişimi Aç" : "Erişimi Kes")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Web hizmeti Users.xml kullanıcısı — ekle / düzenle / silme ilerlemesi (Yeni Kullanıcı ile aynı düzen) */}
      <Dialog
        open={webUserDlg !== null}
        onOpenChange={(o) => { if (!o && !webUserSaving) { setWebUserDlg(null); setWebUserSteps(null) } }}
      >
        <DialogContent className="top-[8vh] translate-y-0 grid-cols-1 gap-0 p-0 sm:max-w-[480px]">
          {(() => {
            const kayit = webUserDlg ? webUsers.find((w) => w.siteName === webUserDlg.siteName) : undefined
            const mod = webUserDlg?.mode ?? "add"
            const bitti = webUserSteps !== null && !webUserSaving && webUserSteps.every((s) => s.status === "done")
            const hatali = webUserSteps?.some((s) => s.status === "error") ?? false
            const ad = webUserName.trim()
            // Aynı adda başka kullanıcı (düzenlemede kendi eski adı hariç) — Users.xml'de çakışır
            const cakisan = !!ad && (kayit?.users ?? []).some((u) =>
              u.username.toLocaleLowerCase("tr-TR") === ad.toLocaleLowerCase("tr-TR") &&
              (mod !== "edit" || u.username !== webUserDlg?.original))
            const secenekler = webUserDlg?.dbOptions ?? []
            const dbGerekli = secenekler.length > 0
            const adHata = !ad ? "Zorunlu" : cakisan ? "Bu ad zaten kullanılıyor" : ""
            const sifreHata = !webUserPw ? "Zorunlu" : !WEB_SIFRE_DESENI.test(webUserPw) ? "6 haneli, yalnız rakam" : ""
            const dbHata = dbGerekli && webUserDbs.length === 0 ? "En az bir veritabanı seçin" : ""
            const gecerli = !adHata && !sifreHata && !dbHata
            const goster = (h: string) => (webUserDenendi && h ? <span className="text-red-600 dark:text-red-400">{h}</span> : null)
            const hataSinifi = (h: string) => (webUserDenendi && h ? `border-red-500/60 ${webUserSallan ? "motion-safe:animate-sallan" : ""}` : "")
            const tumu = secenekler.length > 0 && secenekler.every((d) => webUserDbs.includes(d))
            const kapat = () => { setWebUserDlg(null); setWebUserSteps(null) }
            return (
              <>
                <DialogHeader className="flex-row items-center gap-3 space-y-0 border-b bg-[var(--section-bg)] px-5 py-4">
                  <span className={`flex size-9 shrink-0 items-center justify-center rounded-[5px] ${
                    bitti ? "bg-emerald-600 text-white" : hatali ? "bg-rose-600 text-white" : mod === "delete" ? "bg-rose-500/15 text-rose-600 dark:text-rose-400" : "bg-primary text-primary-foreground"}`}>
                    {bitti ? <CheckCircle2 className="size-[18px]" />
                      : hatali ? <XCircle className="size-[18px]" />
                      : mod === "delete" ? <Trash2 className="size-[18px]" />
                      : mod === "edit" ? <Pencil className="size-[18px]" />
                      : <UserPlus className="size-[18px]" />}
                  </span>
                  <div className="min-w-0">
                    <DialogTitle className="text-[15px] font-semibold">
                      {mod === "edit" ? "Kullanıcı Düzenle" : mod === "delete" ? "Kullanıcı Siliniyor" : "Kullanıcı Ekle"}
                      <span className="font-medium text-muted-foreground"> — {webUserDlg?.siteName}</span>
                    </DialogTitle>
                    <DialogDescription className="truncate text-[12px]">
                      {bitti ? "İşlem tamamlandı."
                        : webUserSteps ? (webUserSaving ? "Sunucuda uygulanıyor…" : "İşlem tamamlanamadı.")
                        : mod === "edit" ? `${webUserDlg?.original ?? ""} kullanıcısı · ${kayit?.server ?? "API hizmeti"}`
                        : `Users.xml'e yeni kullanıcı · ${kayit?.server ?? "API hizmeti"}`}
                    </DialogDescription>
                  </div>
                </DialogHeader>

                <div className="max-h-[68vh] min-w-0 overflow-y-auto">
                  <div className="space-y-3 p-4">
                    {webUserSteps ? (
                      <KullaniciBolum baslik="İlerleme">
                        <ul className="-mx-3 -my-3 divide-y">
                          {webUserSteps.map((s, i) => (
                            <li key={i} className="flex items-start gap-2.5 px-3 py-2">
                              <span className="mt-0.5 shrink-0">
                                {s.status === "done"    && <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" />}
                                {s.status === "running" && <RefreshCw className="size-4 animate-spin text-muted-foreground" />}
                                {s.status === "error"   && <XCircle className="size-4 text-rose-600 dark:text-rose-400" />}
                                {s.status === "pending" && <span className="block size-4 rounded-full border border-border" />}
                              </span>
                              <div className="min-w-0">
                                <p className={`text-[13px] ${s.status === "pending" ? "text-muted-foreground" : "font-medium"}`}>{s.label}</p>
                                {s.error && <p className="mt-0.5 text-[12px] text-rose-600 dark:text-rose-400">{s.error}</p>}
                              </div>
                            </li>
                          ))}
                        </ul>
                      </KullaniciBolum>
                    ) : (
                      <>
                        <KullaniciBolum baslik="Hesap">
                          <Field label="Kullanıcı adı" required ek={goster(adHata)}>
                            <Input
                              value={webUserName}
                              onChange={(e) => setWebUserName(e.target.value)}
                              placeholder="örn. MERKEZ"
                              className={hataSinifi(adHata)}
                              autoFocus
                            />
                          </Field>
                          <Field label="Şifre" required ek={goster(sifreHata)}>
                            <div className="flex items-center gap-1.5">
                              <Input value={webUserPw} inputMode="numeric" maxLength={6} placeholder="6 haneli rakam"
                                onChange={(e) => setWebUserPw(e.target.value.replace(/\D/g, "").slice(0, 6))} className={`flex-1 tabular-nums tracking-[0.2em] ${hataSinifi(sifreHata)}`} />
                              <CopyIconButton value={webUserPw} subtle />
                              <Button type="button" variant="outline" className="h-8 shrink-0 gap-1.5 rounded-[5px] px-2.5 text-[12px]"
                                onClick={() => setWebUserPw(webSifreUret())} title="Yeni şifre üret">
                                <RefreshCw className="size-3.5" /> Üret
                              </Button>
                            </div>
                          </Field>
                        </KullaniciBolum>

                        <section className={`rounded-[8px] bg-[var(--section-bg)] p-1.5 ${webUserDenendi && dbHata && webUserSallan ? "motion-safe:animate-sallan" : ""}`}>
                          <div className="flex items-center gap-1.5 px-2 pb-1.5 pt-0.5">
                            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                              Veritabanları
                              {secenekler.length > 0 && <span className="normal-case tracking-normal"> · {webUserDbs.length}/{secenekler.length} seçili</span>}
                            </p>
                            <span className="ml-auto text-[11px]">{goster(dbHata)}</span>
                            {secenekler.length > 1 && (
                              <button type="button" className="text-[11px] font-medium text-primary hover:underline"
                                onClick={() => setWebUserDbs(tumu ? [] : secenekler)}>
                                {tumu ? "Hiçbiri" : "Tümü"}
                              </button>
                            )}
                          </div>
                          <div className={`overflow-hidden rounded-[5px] bg-card ${webUserDenendi && dbHata ? "ring-1 ring-red-500/60" : ""}`} style={{ boxShadow: "var(--card-shadow)" }}>
                            {secenekler.length === 0 ? (
                              <p className="px-3 py-3 text-[12px] text-muted-foreground">Bu hizmet için veritabanı listesi bulunamadı.</p>
                            ) : (
                              <ul className="max-h-48 divide-y overflow-y-auto">
                                {secenekler.map((db) => {
                                  const on = webUserDbs.includes(db)
                                  return (
                                    <li key={db}>
                                      <label className="flex cursor-pointer items-center gap-2.5 px-3 py-2 text-[13px] transition-colors hover:bg-muted/30">
                                        <Checkbox checked={on} onCheckedChange={() => setWebUserDbs((prev) => (on ? prev.filter((x) => x !== db) : [...prev, db]))} />
                                        <span className={`truncate ${on ? "font-medium" : "text-muted-foreground"}`}>{db}</span>
                                      </label>
                                    </li>
                                  )
                                })}
                              </ul>
                            )}
                          </div>
                        </section>

                        <div className="flex items-start gap-2 rounded-[8px] bg-[var(--section-bg)] px-3 py-2 text-[12px] text-muted-foreground">
                          <Info className="mt-0.5 size-3.5 shrink-0" />
                          <span>Sunucudaki <span className="font-medium text-foreground">Config\Users.xml</span> güncellenir (önceki hali .bak olarak saklanır), ardından IIS sitesi yeniden başlatılır.</span>
                        </div>
                      </>
                    )}

                    {webUserSteps && hatali && webUserSteps[0].status === "done" && (
                      <p className="rounded-[5px] bg-amber-500/15 px-3 py-2 text-[12px] text-amber-800 dark:text-amber-400">
                        Users.xml güncellendi ama site yeniden başlatılamadı — değişiklik uygulama yeniden başlatılana kadar geçerli olmayabilir.
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 border-t px-5 py-3">
                  {webUserSteps ? (
                    <Button variant="outline" className="flex-1" onClick={kapat} disabled={webUserSaving}>
                      {webUserSaving ? "Uygulanıyor…" : "Kapat"}
                    </Button>
                  ) : (
                    <>
                      <Button variant="outline" className="flex-1" onClick={kapat} disabled={webUserSaving}>Vazgeç</Button>
                      <Button className="flex-1" disabled={webUserSaving} onClick={() => {
                        setWebUserDenendi(true)
                        if (!gecerli) { setWebUserSallan(true); setTimeout(() => setWebUserSallan(false), 450); return }
                        void saveWebUser()
                      }}>
                        {mod === "edit" ? <><Save className="size-3.5" /> Kaydet</> : <><UserPlus className="size-3.5" /> Ekle</>}
                      </Button>
                    </>
                  )}
                </div>
              </>
            )
          })()}
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
    <div className="group flex items-center gap-3 px-3 py-2 hover:bg-muted/70 transition-colors">
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

/**
 * Firma detayı liste sekmelerinin araç şeridi — CRM Teklifler deseni: solda sayaç,
 * sağda Temizle + Filtre (pusula-ui Table filtre satırını aç/kapa) + eylem düğmeleri.
 */
function ListeAracSeridi({ sayac, filtreAcik, onFiltre, filtreSayisi, onTemizle, children }: {
  sayac: string
  filtreAcik: boolean
  onFiltre: () => void
  filtreSayisi: number
  onTemizle: () => void
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="text-[12px] text-muted-foreground tabular-nums">{sayac}</span>
      <div className="flex items-center gap-2">
        {filtreSayisi > 0 && (
          <button type="button" onClick={onTemizle} className="rounded-[5px] px-2 py-1 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
            Temizle
          </button>
        )}
        <button
          type="button"
          onClick={onFiltre}
          aria-pressed={filtreAcik}
          className={`inline-flex h-8 items-center gap-1.5 rounded-[5px] border px-3 text-[12px] font-medium transition-colors ${
            filtreAcik || filtreSayisi > 0 ? "border-primary/40 bg-primary/15 text-primary" : "bg-card text-foreground hover:bg-muted"
          }`}
        >
          <ListFilter className="size-3.5" /> Filtre
          {filtreSayisi > 0 && <span className="rounded-full bg-primary px-1.5 text-[10px] tabular-nums text-primary-foreground">{filtreSayisi}</span>}
        </button>
        {children}
      </div>
    </div>
  )
}

/**
 * Tablo yüksekliği — satır sayısı kadar (36 px), en az 3 satırlık, en çok 520 px; filtre satırı açıksa +36.
 * Kayıt yokken boş durum (metin + "… ekle" düğmesi) sığsın diye 180 px gövde: 3 satırlık yerde
 * kaydırma çubuğu çıkıp düğme kesiliyordu.
 */
function tabloYuksekligi(satir: number, filtreAcik: boolean): number {
  const govde = satir === 0 ? 180 : Math.max(satir, 3) * 36
  return Math.min(520, 30 + (filtreAcik ? 36 : 0) + govde + 2)
}

/** Pencere içi bölüm — section-bg panel + başlık + beyaz kart (liste kartlarıyla aynı dil) */
function KullaniciBolum({ baslik, not, children }: { baslik: string; not?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[8px] bg-[var(--section-bg)] p-1.5">
      <p className="flex items-center gap-1.5 px-2 pb-1.5 pt-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {baslik}{not && <span className="normal-case tracking-normal">· {not}</span>}
      </p>
      <div className="space-y-3 rounded-[5px] bg-card p-3" style={{ boxShadow: "var(--card-shadow)" }}>{children}</div>
    </section>
  )
}

/** Hizmetler tablosu şifre hücresi — gizli gelir; göster / kopyala (Table satırı `group` taşımadığı için düğmeler hep görünür) */
function SvcSifre({ deger }: { deger: string | null }) {
  const [goster, setGoster] = useState(false)
  if (!deger) return <span>—</span>
  return (
    <span className="inline-flex min-w-0 items-center gap-0.5">
      <span className="min-w-0 truncate">{goster ? deger : "••••••••"}</span>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setGoster((v) => !v) }}
        className="inline-flex size-6 shrink-0 items-center justify-center rounded-[5px] text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
        title={goster ? "Gizle" : "Göster"}
      >
        {goster ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
      </button>
      <CopyIconButton value={deger} subtle />
    </span>
  )
}

/** API hizmeti (Users.xml) şifresi — 6 haneli, yalnız rakam */
const WEB_SIFRE_DESENI = /^\d{6}$/
function webSifreUret(): string {
  const a = new Uint32Array(6)
  crypto.getRandomValues(a)
  return Array.from(a, (n) => String(n % 10)).join("")
}
