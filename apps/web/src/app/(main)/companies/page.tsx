"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PageContainer } from "@/components/layout/page-container";
import { NestedCard } from "@/components/shared/nested-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { ProgressBar } from "@/components/shared/progress-bar";
import { AnimatedCircularProgressBar } from "@/components/ui/animated-circular-progress-bar";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } from "recharts";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tooltip as UiTooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import type { Top5Company } from "@/app/api/companies/top5/route";
import type { CompanyDetail } from "@/app/api/companies/[firkod]/detail/route";

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
  Briefcase,
  StickyNote,
  Activity,
  Database,
  MoreVertical,
  LogOut,
  KeyRound,
  Ban,
  Globe,
  Info,
  Search,
  ChevronsUpDown,
  ChevronLeft,
  Play,
  Square,
  RotateCw,
  Trash2,
  Download,
  Upload,
  Terminal,
  Settings2,
  ToggleLeft,
  ToggleRight,
  X,
  Bookmark,
  Trash,
  Save,
  Bug,
  Plus,
  Check,
  Eye,
  EyeOff,
  RefreshCw,
  UserPlus,
} from "lucide-react";
import { AdProvisionRunner, type AdProvisionService } from "@/components/company-setup/ad-provision-runner";
import { meetsAdComplexity } from "@/components/company-setup/step-users";
import type { WizardServiceDto } from "@/app/api/services/route";

function YoğunlukKart({ d }: { d: CompanyDetail }) {
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

  const cpuPct  = pctCpu(avgCpuValue);
  const ramPct  = pctMB(avgRamMB,       d.quotaRamMB);
  const diskPct = pctMB(d.usageDiskMB,  d.quotaDiskMB);
  const dbPct   = pctMB(avgDbMB,        d.dbTotalMB);

  // Yoğunluk: CPU + RAM + Disk + DB yüzdelerinin ortalaması (User kaldırıldı)
  const active = [d.quotaCpu > 0, d.quotaRam > 0, d.quotaDisk > 0, d.dbQuota > 0].filter(Boolean).length;
  const yogunluk = active === 0
    ? 0
    : Math.round(((d.quotaCpu > 0 ? cpuPct : 0) + (d.quotaRam > 0 ? ramPct : 0) + (d.quotaDisk > 0 ? diskPct : 0) + (d.dbQuota > 0 ? dbPct : 0)) / active);

  const [animValue, setAnimValue] = useState(0);
  const [detailOpen, setDetailOpen] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setAnimValue(yogunluk), 50);
    return () => clearTimeout(t);
  }, [yogunluk]);

  const scoreColor =
    yogunluk >= 80 ? { text: "text-red-600",    primary: "#ef4444" } :
    yogunluk >= 60 ? { text: "text-amber-600",  primary: "#f59e0b" } :
                     { text: "text-emerald-600", primary: "#10b981" };

  const metrics = [
    { label: "CPU",  icon: <Cpu className="h-3.5 w-3.5 text-muted-foreground" />,        pct: cpuPct,  val: `${d.usageCpu} / ${d.quotaCpu} vCPU` },
    { label: "RAM",  icon: <MemoryStick className="h-3.5 w-3.5 text-muted-foreground" />, pct: ramPct,  val: `${d.usageRam} / ${d.quotaRam} GB` },
    { label: "Disk", icon: <HardDrive className="h-3.5 w-3.5 text-muted-foreground" />,   pct: diskPct, val: `${d.usageDisk} / ${d.quotaDisk} GB` },
    { label: "DB",   icon: <Database className="h-3.5 w-3.5 text-muted-foreground" />,    pct: dbPct,   val: `${(d.dbSizeMB / 1024).toFixed(2)} / ${d.dbQuota} GB` },
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
      <h3 className="text-sm font-semibold mb-4">Kullanım Yoğunluğu</h3>

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
                <span className="text-[10px] font-medium tabular-nums w-8 text-right">{m.pct}%</span>
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
            <span className="text-[13px] font-semibold tabular-nums">Ort %{d.history30d.avgCpu} <span className="text-muted-foreground font-normal">/ Peak %{d.history30d.peakCpu}</span></span>
            {d.history30d.peakCpuDate && (
              <span className="text-[9px] text-muted-foreground">Peak: {d.history30d.peakCpuDate}</span>
            )}
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wide">RAM 30g</span>
            <span className="text-[13px] font-semibold tabular-nums">Ort {d.history30d.avgRamGB} GB <span className="text-muted-foreground font-normal">/ Peak {d.history30d.peakRamGB} GB</span></span>
            {d.history30d.peakRamDate && (
              <span className="text-[9px] text-muted-foreground">Peak: {d.history30d.peakRamDate}</span>
            )}
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wide">DB Büyüme</span>
            <span className="text-[13px] font-semibold tabular-nums">
              {(d.history30d.dbStartMB / 1024).toFixed(1)} → {(d.history30d.dbEndMB / 1024).toFixed(1)} GB
            </span>
            <span className={`text-[9px] ${d.history30d.dbGrowthPct >= 0 ? "text-emerald-600" : "text-red-600"}`}>
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
            { label: "CPU Kullanımı",  icon: <Cpu className="h-3.5 w-3.5" />,        pct: cpuPct,  detail: `Ort %${h?.avgCpu ?? 0} · Peak %${h?.peakCpu ?? 0}` },
            { label: "RAM Kullanımı",  icon: <MemoryStick className="h-3.5 w-3.5" />, pct: ramPct,  detail: `${(avgRamMB/1024).toFixed(1)} / ${d.quotaRam} GB` },
            { label: "Disk Kullanımı", icon: <HardDrive className="h-3.5 w-3.5" />,   pct: diskPct, detail: `${d.usageDisk.toFixed(1)} / ${d.quotaDisk} GB` },
            { label: "Veritabanı",     icon: <Database className="h-3.5 w-3.5" />,    pct: dbPct,   detail: `${(d.dbSizeMB / 1024).toFixed(2)} / ${d.dbQuota} GB` },
          ].map((m) => {
            const color = m.pct >= 80 ? "text-red-600" : m.pct >= 60 ? "text-amber-600" : "text-emerald-600";
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
              yogunluk >= 80 ? "text-red-600" : yogunluk >= 60 ? "text-amber-600" : "text-emerald-600"
            }`}>= %{yogunluk}</span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}

const statusConfig = {
  active:    { label: "Aktif",          variant: "online"  as const, color: "bg-emerald-50 text-emerald-700 border-emerald-200/60" },
  suspended: { label: "Askıya Alındı",  variant: "offline" as const, color: "bg-red-50 text-red-700 border-red-200/60" },
  trial:     { label: "Deneme",         variant: "warning" as const, color: "bg-amber-50 text-amber-700 border-amber-200/60" },
};

export default function CompaniesPage() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const urlFirkod    = searchParams.get("firkod");
  const [selectedCompany, setSelectedCompany] = useState<string | null>(null);
  const [top5, setTop5] = useState<Top5Company[]>([]);
  const [top5Loading, setTop5Loading] = useState(true);
  const [selectedFirma, setSelectedFirma] = useState<FirmaCompany | null>(null);
  const [apiCompanies, setApiCompanies] = useState<FirmaCompany[]>([]);
  const [apiLoading, setApiLoading] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const [tabUsers, setTabUsers] = useState<TabUser[]>([]);
  const [tabIIS, setTabIIS] = useState<TabIISSite[]>([]);
  const [tabSQL, setTabSQL] = useState<TabSQLDatabase[]>([]);
  const [sqlRefreshing, setSqlRefreshing] = useState(false);
  const [tabServices, setTabServices] = useState<TabCompanyService[]>([]);
  const [tabLoading, setTabLoading] = useState(false);
  const [iisActionBusy, setIisActionBusy] = useState<string | null>(null);
  const [iisRemoveTarget, setIisRemoveTarget] = useState<TabIISSite | null>(null);

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

  function generatePassword() {
    const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ"
    const lower = "abcdefghijkmnpqrstuvwxyz"
    const digit = "23456789"
    const special = "!@#$%&*"
    const all = upper + lower + digit + special
    let pw = ""
    pw += upper[Math.floor(Math.random() * upper.length)]
    pw += lower[Math.floor(Math.random() * lower.length)]
    pw += digit[Math.floor(Math.random() * digit.length)]
    pw += special[Math.floor(Math.random() * special.length)]
    for (let i = 0; i < 6; i++) pw += all[Math.floor(Math.random() * all.length)]
    return pw.split("").sort(() => Math.random() - 0.5).join("")
  }

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
    const firkod = selectedFirma.firkod
    setTabUsers([]); setTabIIS([]); setTabSQL([]); setTabServices([])
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

  function selectFirma(f: FirmaCompany) {
    setSelectedFirma(f)
    setSearchOpen(false)
    setSearchQuery("")
    router.replace(`/companies?firkod=${encodeURIComponent(f.firkod)}`, { scroll: false })
  }

  // URL'deki firkod → firma otomatik seçimi (F5 / direkt link)
  useEffect(() => {
    if (!urlFirkod) return
    if (selectedFirma?.firkod === urlFirkod) return
    if (!apiCompanies.length) return
    const match = apiCompanies.find((c) => c.firkod === urlFirkod)
    if (match) setSelectedFirma(match)
  }, [urlFirkod, apiCompanies, selectedFirma?.firkod])

  async function refreshIIS() {
    if (!selectedFirma) return
    try {
      const r = await fetch(`/api/companies/${selectedFirma.firkod}/iis`, { cache: "no-store" })
      if (r.ok) {
        const data = await r.json()
        if (Array.isArray(data)) setTabIIS(data)
      }
    } catch {}
  }

  async function iisAction(site: TabIISSite, action: "start" | "stop" | "restart" | "remove") {
    if (!selectedFirma) return
    const labels: Record<typeof action, { running: string; ok: string; fail: string }> = {
      start:   { running: "Site başlatılıyor…",        ok: "Site başlatıldı",        fail: "Site başlatılamadı" },
      stop:    { running: "Site durduruluyor…",        ok: "Site durduruldu",        fail: "Site durdurulamadı" },
      restart: { running: "Site yeniden başlatılıyor…", ok: "Site yeniden başlatıldı", fail: "Site yeniden başlatılamadı" },
      remove:  { running: "Site kaldırılıyor…",        ok: "Site kaldırıldı",        fail: "Site kaldırılamadı" },
    }
    setIisActionBusy(site.Id)
    const toastId = toast.loading(labels[action].running, { description: site.Name })
    try {
      const resp = await fetch(`/api/companies/${selectedFirma.firkod}/iis/action`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ server: site.Server, siteName: site.Name, action }),
      })
      const data = await resp.json()
      if (!resp.ok) {
        toast.error(labels[action].fail, { id: toastId, description: data?.error ?? "Bilinmeyen hata" })
        return
      }
      toast.success(labels[action].ok, { id: toastId, description: site.Name })
      // Biraz bekle, agent'ın bir sonraki raporu DB'ye yazsın — sonra yenile
      await new Promise((r) => setTimeout(r, 1200))
      await refreshIIS()
    } catch (err) {
      toast.error(labels[action].fail, { id: toastId, description: err instanceof Error ? err.message : "Bağlantı hatası" })
    } finally {
      setIisActionBusy(null)
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

  function clearSelection() {
    setSelectedFirma(null)
    setCompanyDetail(null)
    setTabUsers([]); setTabIIS([]); setTabSQL([]); setTabServices([])
    router.replace(`/companies`, { scroll: false })
  }

  const apiFiltered = searchQuery.trim()
    ? apiCompanies.filter((c) => c.firma.toLowerCase().includes(searchQuery.toLowerCase())).slice(0, 50)
    : apiCompanies.slice(0, 50);

  return (
    <PageContainer title="Firma Yönetimi" description="Firmaların sunucu kullanım durumları">
      {/* Company Selector / Header Bar */}
      <div className="mb-6">
        {selectedFirma ? (
          /* Seçili firma: kompakt header bar */
          <div className="rounded-[8px] p-2 pb-0" style={{ backgroundColor: "#F4F2F0" }}>
            <div className="rounded-[4px] px-4 py-2.5" style={{ backgroundColor: "#FFFFFF", boxShadow: "0 2px 4px rgba(0,0,0,0.06)" }}>
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
                  <span className={`shrink-0 inline-flex items-center rounded-[4px] border px-1.5 py-0.5 text-[9px] font-medium ${
                    firmaIsActive(selectedFirma)
                      ? "text-emerald-700 border-emerald-200 bg-emerald-50"
                      : "text-red-700 border-red-200 bg-red-50"
                  }`}>
                    {firmaIsActive(selectedFirma) ? "Aktif" : "Pasif"}
                  </span>
                </>

                <div className="flex-1" />

                <Popover open={searchOpen} onOpenChange={(o) => { setSearchOpen(o); if (!o) setSearchQuery(""); }}>
                  <PopoverTrigger asChild>
                    <button className="flex items-center gap-1.5 border border-border/60 hover:bg-muted/40 rounded-[5px] text-[11px] font-medium px-2.5 py-1.5 text-muted-foreground transition-colors">
                      <Search className="h-3.5 w-3.5" />
                      Firma Değiştir
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-64 p-0 rounded-[5px]" align="end">
                    <Command shouldFilter={false}>
                      <CommandInput placeholder="Firma ara..." className="text-[11px] h-8" value={searchQuery} onValueChange={setSearchQuery} />
                      <CommandList className="max-h-56 overflow-y-auto" onWheel={(e) => e.stopPropagation()}>
                        {apiLoading ? (
                          <div className="p-2 space-y-1">
                            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-7 w-full rounded-[4px]" />)}
                          </div>
                        ) : (
                          <>
                            <CommandEmpty className="text-[11px] py-4 text-center text-muted-foreground">Firma bulunamadı</CommandEmpty>
                            <CommandGroup>
                              {apiFiltered.map((comp) => (
                                <CommandItem
                                  key={comp.id}
                                  value={comp.id}
                                  onSelect={() => selectFirma(comp)}
                                  className="text-[11px] flex items-center justify-between"
                                >
                                  <span>{comp.firma}</span>
                                  <span className="text-[10px] text-muted-foreground tabular-nums font-mono">{comp.firkod}</span>
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </>
                        )}
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
            </div>
            <div className="h-2" />
          </div>
        ) : (
          /* Seçili firma yok: kart grid */
          <NestedCard>
            <p className="text-[11px] font-medium text-muted-foreground tracking-wide mb-3">EN YOĞUN 5 FİRMA</p>
            {top5Loading ? (
              <div className="grid grid-cols-5 gap-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="rounded-[8px] p-2 pb-0" style={{ backgroundColor: "#F4F2F0" }}>
                    <div className="rounded-[4px] px-3 py-3" style={{ backgroundColor: "#FFFFFF", boxShadow: "0 2px 4px rgba(0,0,0,0.06)" }}>
                      <Skeleton className="h-3 w-3/4 mb-3 rounded-[3px]" />
                      <div className="flex gap-1.5">
                        <Skeleton className="flex-1 h-8 rounded-[4px]" />
                        <Skeleton className="flex-1 h-8 rounded-[4px]" />
                        <Skeleton className="flex-1 h-8 rounded-[4px]" />
                      </div>
                    </div>
                    <div className="h-2" />
                  </div>
                ))}
              </div>
            ) : top5.length === 0 ? (
              <p className="text-[11px] text-muted-foreground py-4 text-center">Henüz firma verisi yok</p>
            ) : (
              <div className="grid grid-cols-5 gap-2">
                {top5.map((comp) => {
                  const st = statusConfig[comp.status] ?? statusConfig.active;
                  const yogunlukColor = comp.yogunluk >= 80 ? "text-red-600" : comp.yogunluk >= 60 ? "text-amber-600" : "text-emerald-600";
                  return (
                    <button
                      key={comp.id}
                      onClick={() => {
                        const apiMatch = apiCompanies.find((a) => a.firkod === comp.id)
                        setSelectedFirma(apiMatch ?? null)
                        setSelectedCompany(apiMatch?.id ?? null)
                      }}
                      className="rounded-[8px] p-2 pb-0 text-left transition-all flex flex-col hover:brightness-[0.97]"
                      style={{ backgroundColor: "#F4F2F0" }}
                    >
                      <div
                        className="rounded-[4px] px-3 py-3 w-full"
                        style={{ backgroundColor: "#FFFFFF", boxShadow: "0 2px 4px rgba(0,0,0,0.06)" }}
                      >
                        <div className="flex items-start justify-between gap-1 mb-3">
                          <p className="text-[11px] font-semibold leading-tight line-clamp-2">{comp.name}</p>
                          <span className={`shrink-0 inline-flex items-center rounded-[4px] border px-1 py-0 text-[9px] font-medium ${st.color}`}>
                            {st.label}
                          </span>
                        </div>
                        <div className="flex gap-1.5">
                          <div className="flex-1 flex flex-col items-center gap-0.5 rounded-[4px] py-1.5 bg-muted/40">
                            <span className={`text-[12px] font-bold tabular-nums leading-none ${yogunlukColor}`}>%{comp.yogunluk}</span>
                            <span className="text-[9px] text-muted-foreground">Yoğunluk</span>
                          </div>
                          <div className="flex-1 flex flex-col items-center gap-0.5 rounded-[4px] py-1.5 bg-muted/40">
                            <Database className="h-3 w-3 text-muted-foreground" />
                            <span className="text-[11px] font-semibold tabular-nums">{comp.dbCount}</span>
                          </div>
                          <div className="flex-1 flex flex-col items-center gap-0.5 rounded-[4px] py-1.5 bg-muted/40">
                            <Users className="h-3 w-3 text-muted-foreground" />
                            <span className="text-[11px] font-semibold tabular-nums">{comp.userCount}</span>
                          </div>
                        </div>
                      </div>
                      <div className="h-2" />
                    </button>
                  );
                })}
              </div>
            )}
          </NestedCard>
        )}
      </div>

      {/* Company Detail */}
      {selectedFirma ? (
        <div className="space-y-3">
          {/* Yoğunluk Skoru + Haftalık Kullanım */}
          <div className="grid grid-cols-[1fr_1fr] gap-3">
            {detailLoading ? (
              <div className="rounded-[8px] p-2 pb-0" style={{ backgroundColor: "#F4F2F0" }}>
                <div className="rounded-[4px] px-4 py-4 space-y-3" style={{ backgroundColor: "#FFFFFF", boxShadow: "0 2px 4px rgba(0,0,0,0.06)" }}>
                  <Skeleton className="h-4 w-36 rounded-[3px]" />
                  <div className="flex gap-4 items-center">
                    <Skeleton className="size-32 rounded-full shrink-0" />
                    <div className="flex-1 space-y-2.5">
                      {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-2 w-full rounded-full" />)}
                    </div>
                  </div>
                </div>
                <div className="h-2" />
              </div>
            ) : companyDetail ? (
              <YoğunlukKart key={selectedFirma.firkod} d={companyDetail} />
            ) : (
              <div className="rounded-[8px] p-2 pb-0" style={{ backgroundColor: "#F4F2F0" }}>
                <div className="rounded-[4px] px-4 py-8 flex items-center justify-center" style={{ backgroundColor: "#FFFFFF", boxShadow: "0 2px 4px rgba(0,0,0,0.06)" }}>
                  <p className="text-[12px] text-muted-foreground">Kullanım verisi bulunamadı</p>
                </div>
                <div className="h-2" />
              </div>
            )}

            <NestedCard
              className="h-full flex flex-col"
              innerClassName="flex-1 flex flex-col"
              footer={
                <>
                  <Activity className="h-3 w-3" />
                  <span>Son 7 günlük ortalama kullanım (%)</span>
                </>
              }
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold">Haftalık Kullanım</h3>
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1 text-[10px] text-muted-foreground"><span className="inline-block h-2 w-2 rounded-full bg-blue-400" />CPU</span>
                  <span className="flex items-center gap-1 text-[10px] text-muted-foreground"><span className="inline-block h-2 w-2 rounded-full bg-emerald-400" />RAM</span>
                  <span className="flex items-center gap-1 text-[10px] text-muted-foreground"><span className="inline-block h-2 w-2 rounded-full bg-amber-400" />Disk</span>
                </div>
              </div>
              <div className="flex-1 min-h-0">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={companyDetail?.weeklyUsage ?? []} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gCpu" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#60a5fa" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#60a5fa" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="gRam" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#34d399" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#34d399" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="gDisk" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#fbbf24" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#fbbf24" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="day" tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                    <Tooltip
                      contentStyle={{ fontSize: 11, borderRadius: 6, border: "1px solid #e5e7eb", padding: "6px 10px" }}
                      formatter={(value, name) => [`%${value ?? 0}`, String(name ?? "").toUpperCase()]}
                    />
                    <Area type="monotone" dataKey="cpu"  stroke="#60a5fa" strokeWidth={1.5} fill="url(#gCpu)"  dot={false} />
                    <Area type="monotone" dataKey="ram"  stroke="#34d399" strokeWidth={1.5} fill="url(#gRam)"  dot={false} />
                    <Area type="monotone" dataKey="disk" stroke="#fbbf24" strokeWidth={1.5} fill="url(#gDisk)" dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </NestedCard>
          </div>

          {/* Tab Kartı */}
          <NestedCard>
            <Tabs defaultValue="users">
              <TabsList className="mb-3 h-8">
                <TabsTrigger value="users" className="text-[11px] h-7 gap-1.5">
                  <Users className="h-3.5 w-3.5" />
                  Kullanıcılar
                  <span className="ml-0.5 text-[10px] bg-muted rounded-[3px] px-1.5 py-0.5 font-medium">{tabUsers.length}</span>
                </TabsTrigger>
                <TabsTrigger value="services" className="text-[11px] h-7 gap-1.5">
                  <Briefcase className="h-3.5 w-3.5" />
                  Hizmetler
                  <span className="ml-0.5 text-[10px] bg-muted rounded-[3px] px-1.5 py-0.5 font-medium">{tabServices.length}</span>
                </TabsTrigger>
                <TabsTrigger value="iis" className="text-[11px] h-7 gap-1.5">
                  <Globe className="h-3.5 w-3.5" />
                  IIS Siteler
                  <span className="ml-0.5 text-[10px] bg-muted rounded-[3px] px-1.5 py-0.5 font-medium">{tabIIS.length}</span>
                </TabsTrigger>
                <TabsTrigger value="databases" className="text-[11px] h-7 gap-1.5">
                  <Database className="h-3.5 w-3.5" />
                  Veritabanları
                  <span className="ml-0.5 text-[10px] bg-muted rounded-[3px] px-1.5 py-0.5 font-medium">{tabSQL.length}</span>
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
                <div className="rounded-[4px] overflow-hidden border border-border/40">
                  <div className="grid grid-cols-[1fr_1fr_120px_70px_32px] px-3 py-1.5 bg-muted/30 border-b border-border/40">
                    <span className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase">Kullanıcı</span>
                    <span className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase">Ad Soyad</span>
                    <span className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase">Son Giriş</span>
                    <span className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase">Durum</span>
                    <span />
                  </div>
                  <div className="divide-y divide-border/40">
                    {tabLoading ? (
                      Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="grid grid-cols-[1fr_1fr_120px_70px_32px] px-3 py-2.5 items-center gap-3">
                          <Skeleton className="h-3 rounded-[3px]" />
                          <Skeleton className="h-3 rounded-[3px] w-3/4" />
                          <Skeleton className="h-3 rounded-[3px]" />
                          <Skeleton className="h-3 rounded-[3px] w-12" />
                        </div>
                      ))
                    ) : tabUsers.length === 0 ? (
                      <div className="flex items-center justify-center py-8">
                        <p className="text-xs text-muted-foreground">Kullanıcı bulunamadı</p>
                      </div>
                    ) : tabUsers.map((usr) => (
                      <div key={usr.username} className="grid grid-cols-[1fr_1fr_120px_70px_32px] px-3 py-2 hover:bg-muted/20 transition-colors items-center gap-3">
                        <span className="text-[11px] font-mono truncate">{usr.username}</span>
                        <span className="text-[11px] truncate">{usr.displayName}</span>
                        <span className="text-[10px] tabular-nums text-muted-foreground">{usr.lastLogin || "—"}</span>
                        <div className="flex items-center gap-1.5">
                          <div className={`h-1.5 w-1.5 rounded-full ${usr.enabled ? "bg-emerald-500" : "bg-gray-300"}`} />
                          <span className={`text-[10px] ${usr.enabled ? "text-emerald-600" : "text-muted-foreground"}`}>
                            {usr.enabled ? "Aktif" : "Pasif"}
                          </span>
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button className="h-6 w-6 flex items-center justify-center rounded-[4px] hover:bg-muted/60 transition-colors">
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
                <div className="rounded-[4px] overflow-hidden border border-border/40">
                  <div className="grid grid-cols-[1fr_110px_140px_60px_90px_32px] px-3 py-1.5 bg-muted/30 border-b border-border/40">
                    <span className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase">Hizmet</span>
                    <span className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase">Tip</span>
                    <span className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase">Sunucu</span>
                    <span className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase">Port</span>
                    <span className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase">Durum</span>
                    <span />
                  </div>
                  <div className="divide-y divide-border/40">
                    {tabLoading ? (
                      Array.from({ length: 3 }).map((_, i) => (
                        <div key={i} className="grid grid-cols-[1fr_110px_140px_60px_90px_32px] px-3 py-2.5 items-center gap-3">
                          <Skeleton className="h-3 rounded-[3px]" />
                          <Skeleton className="h-3 rounded-[3px] w-2/3" />
                          <Skeleton className="h-3 rounded-[3px]" />
                          <Skeleton className="h-3 rounded-[3px] w-10" />
                          <Skeleton className="h-3 rounded-[3px] w-14" />
                        </div>
                      ))
                    ) : tabServices.length === 0 ? (
                      <div className="flex items-center justify-center py-8">
                        <p className="text-xs text-muted-foreground">Firmaya atanmış hizmet bulunamadı</p>
                      </div>
                    ) : tabServices.map((svc) => {
                      const running = svc.status === "Started"
                      const typeLabel = svc.type === "iis-site" ? "IIS Site" : svc.type === "pusula-program" ? "Pusula Program" : (svc.type || "—")
                      return (
                        <div key={svc.id} className="grid grid-cols-[1fr_110px_140px_60px_90px_32px] px-3 py-2 hover:bg-muted/20 transition-colors items-center gap-3">
                          <div className="flex items-center gap-2 min-w-0">
                            <Briefcase className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <div className="flex flex-col min-w-0">
                              <span className="text-[11px] font-medium truncate">{svc.name}</span>
                              {svc.siteName && <span className="text-[10px] font-mono text-muted-foreground truncate">{svc.siteName}</span>}
                            </div>
                          </div>
                          <span className="text-[10px] text-muted-foreground truncate">{typeLabel}</span>
                          <span className="text-[11px] font-mono text-muted-foreground truncate">{svc.server || "—"}</span>
                          <span className="text-[11px] tabular-nums text-muted-foreground">{svc.port ?? "—"}</span>
                          {svc.status ? (
                            <div className="flex items-center gap-1.5">
                              <div className={`h-1.5 w-1.5 rounded-full ${running ? "bg-emerald-500" : "bg-gray-300"}`} />
                              <span className={`text-[10px] ${running ? "text-emerald-600" : "text-muted-foreground"}`}>
                                {running ? "Çalışıyor" : "Durdu"}
                              </span>
                            </div>
                          ) : (
                            <span className="text-[10px] text-muted-foreground">—</span>
                          )}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button className="h-6 w-6 flex items-center justify-center rounded-[4px] hover:bg-muted/60 transition-colors">
                                <MoreVertical className="h-3.5 w-3.5 text-muted-foreground" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-44 text-[11px]">
                              <DropdownMenuItem className="text-[11px] gap-2 text-destructive focus:text-destructive">
                                <Trash2 className="h-3.5 w-3.5" /> Hizmeti Kaldır
                              </DropdownMenuItem>
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
                <div className="flex justify-end mb-2">
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
                    className="h-7 px-2.5 inline-flex items-center gap-1.5 text-[11px] rounded-[5px] border border-border/50 bg-white hover:bg-muted/40 transition-colors disabled:opacity-50"
                  >
                    <RefreshCw className={`h-3 w-3 ${sqlRefreshing ? "animate-spin" : ""}`} />
                    {sqlRefreshing ? "Yenileniyor…" : "Yenile"}
                  </button>
                </div>
                <div className="rounded-[4px] overflow-hidden border border-border/40">
                  <div className="grid grid-cols-[minmax(220px,1fr)_180px_80px_95px_140px_120px_120px_85px_32px] gap-3 px-3 py-1.5 bg-muted/30 border-b border-border/40">
                    <span className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase pl-[22px]">Veritabanı</span>
                    <span className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase">Sunucu</span>
                    <span className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase">Boyut</span>
                    <span className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase">Recovery</span>
                    <span className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase">Owner</span>
                    <span className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase">Tam Yedek</span>
                    <span className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase">Diff Yedek</span>
                    <span className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase">Durum</span>
                    <span />
                  </div>
                  <div className="divide-y divide-border/40">
                    {tabLoading ? (
                      Array.from({ length: 3 }).map((_, i) => (
                        <div key={i} className="grid grid-cols-[minmax(220px,1fr)_180px_80px_95px_140px_120px_120px_85px_32px] gap-3 px-3 py-2.5 items-center">
                          <Skeleton className="h-3 rounded-[3px]" />
                          <Skeleton className="h-3 rounded-[3px] w-2/3" />
                          <Skeleton className="h-3 rounded-[3px]" />
                          <Skeleton className="h-3 rounded-[3px]" />
                          <Skeleton className="h-3 rounded-[3px]" />
                          <Skeleton className="h-3 rounded-[3px]" />
                          <Skeleton className="h-3 rounded-[3px]" />
                          <Skeleton className="h-3 rounded-[3px] w-12" />
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
                      <div key={db.Id} title={tooltipLines} className="grid grid-cols-[minmax(220px,1fr)_180px_80px_95px_140px_120px_120px_85px_32px] gap-3 px-3 py-2 hover:bg-muted/20 transition-colors items-center">
                        <div className="flex items-center gap-2 min-w-0">
                          <Database className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span className="text-[11px] font-medium truncate">{db.Name}</span>
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
                          <span className={`text-[10px] ${db.Status === "ONLINE" || db.Status === "Online" ? "text-emerald-600" : "text-muted-foreground"}`}>
                            {(db.Status === "ONLINE" || db.Status === "Online") ? "Çevrimiçi" : "Çevrimdışı"}
                          </span>
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button className="h-6 w-6 flex items-center justify-center rounded-[4px] hover:bg-muted/60 transition-colors">
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

              {/* IIS Siteler */}
              <TabsContent value="iis" className="mt-0">
                <div className="rounded-[4px] overflow-hidden border border-border/40">
                  <div className="grid grid-cols-[minmax(260px,420px)_260px_90px_90px_1fr_32px] gap-3 px-3 py-1.5 bg-muted/30 border-b border-border/40">
                    <span className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase pl-[22px]">Site Adı</span>
                    <span className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase">Sunucu</span>
                    <span className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase">Port</span>
                    <span className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase">Durum</span>
                    <span />
                    <span />
                  </div>
                  <div className="divide-y divide-border/40">
                    {tabLoading ? (
                      Array.from({ length: 3 }).map((_, i) => (
                        <div key={i} className="grid grid-cols-[minmax(260px,420px)_260px_90px_90px_1fr_32px] px-3 py-2.5 items-center gap-3">
                          <Skeleton className="h-3 rounded-[3px]" />
                          <Skeleton className="h-3 rounded-[3px] w-2/3" />
                          <Skeleton className="h-3 rounded-[3px] w-10" />
                          <Skeleton className="h-3 rounded-[3px] w-14" />
                          <span />
                          <span />
                        </div>
                      ))
                    ) : tabIIS.length === 0 ? (
                      <div className="flex items-center justify-center py-8">
                        <p className="text-xs text-muted-foreground">IIS sitesi bulunamadı</p>
                      </div>
                    ) : tabIIS.map((site) => {
                      const portMatch = (site.Binding ?? "").match(/:(\d+)(?:[,\s]|$)/)
                      const port = portMatch ? portMatch[1] : "—"
                      return (
                        <div key={site.Id} className="grid grid-cols-[minmax(260px,420px)_260px_90px_90px_1fr_32px] px-3 py-2 hover:bg-muted/20 transition-colors items-center gap-3">
                          <div className="flex items-center gap-2 min-w-0">
                            <Globe className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <span className="text-[11px] font-medium truncate">{site.Name}</span>
                          </div>
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-[11px] truncate">{site.Server}</span>
                            {site.ServerIP && (
                              <span className="text-[10px] font-mono text-muted-foreground truncate">{site.ServerIP}</span>
                            )}
                          </div>
                          <span className="text-[11px] font-mono tabular-nums text-muted-foreground">{port}</span>
                          <div className="flex items-center gap-1.5">
                            <div className={`h-1.5 w-1.5 rounded-full ${site.Status === "Started" ? "bg-emerald-500" : "bg-gray-300"}`} />
                            <span className={`text-[10px] ${site.Status === "Started" ? "text-emerald-600" : "text-muted-foreground"}`}>
                              {site.Status === "Started" ? "Aktif" : "Durduruldu"}
                            </span>
                          </div>
                          <span />
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button className="h-6 w-6 flex items-center justify-center rounded-[4px] hover:bg-muted/60 transition-colors">
                                <MoreVertical className="h-3.5 w-3.5 text-muted-foreground" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-44">
                              <DropdownMenuItem
                                className="text-[11px] gap-2"
                                disabled={iisActionBusy === site.Id}
                                onSelect={(e) => { e.preventDefault(); iisAction(site, site.Status === "Started" ? "stop" : "start") }}
                              >
                                {site.Status === "Started"
                                  ? <><Square className="h-3.5 w-3.5" /> Durdur</>
                                  : <><Play className="h-3.5 w-3.5" /> Başlat</>
                                }
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-[11px] gap-2"
                                disabled={iisActionBusy === site.Id}
                                onSelect={(e) => { e.preventDefault(); iisAction(site, "restart") }}
                              >
                                <RotateCw className="h-3.5 w-3.5" /> Yeniden Başlat
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-[11px] gap-2 text-destructive focus:text-destructive"
                                disabled={iisActionBusy === site.Id}
                                onSelect={(e) => { e.preventDefault(); setIisRemoveTarget(site) }}
                              >
                                <Trash2 className="h-3.5 w-3.5" /> Siteyi Kaldır
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </NestedCard>

          <AlertDialog open={iisRemoveTarget !== null} onOpenChange={(o) => { if (!o) setIisRemoveTarget(null) }}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>IIS Sitesini Kaldır</AlertDialogTitle>
                <AlertDialogDescription>
                  <span className="font-mono font-medium">{iisRemoveTarget?.Name}</span> sitesi IIS'ten kaldırılacak.
                  Fiziksel dosyalar sunucuda kalmaya devam eder, sadece IIS kaydı silinir. Bu işlem geri alınamaz.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>İptal</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-white hover:bg-destructive/90"
                  onClick={() => {
                    const target = iisRemoveTarget
                    setIisRemoveTarget(null)
                    if (target) iisAction(target, "remove")
                  }}
                >
                  Kaldır
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

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
                  className="rounded-[5px] h-8 text-[11px] font-mono"
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
                                    <span className="group inline-flex items-stretch text-[10px] rounded-[4px] border border-border/60 bg-background font-mono overflow-hidden">
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
                                    <span key={k} className="group inline-flex items-stretch text-[10px] rounded-[4px] border border-border/60 bg-background font-mono overflow-hidden">
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
                          <div className="rounded-[4px] border border-border/40">
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
                                          className="h-5 px-1 text-[10px] font-mono font-normal border border-border/60 rounded-[3px] bg-background focus:outline-none focus:ring-1 focus:ring-ring"
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
                <div className="max-h-[60vh] overflow-auto rounded-[4px] border border-border/40">
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
                              <span className="text-[11px] font-medium truncate">{q.name}</span>
                              {q.category && <span className="text-[9px] rounded-[3px] bg-muted px-1.5 py-0.5 text-muted-foreground shrink-0">{q.category}</span>}
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
                    <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600 font-normal">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" /> canlı
                    </span>
                  )}
                </DialogTitle>
              </DialogHeader>
              <div className="px-5 py-3 border-b border-border/40 flex items-center gap-2 flex-wrap text-[11px]">
                {debugServers.length > 0 && (
                  <>
                    <Label className="text-[11px] text-muted-foreground">Sunucu:</Label>
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
                          <SelectItem key={s.Id} value={s.Id} className="text-[11px]">
                            {s.Name} <span className="text-muted-foreground font-mono ml-1">{s.IP}</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <span className="text-muted-foreground">·</span>
                  </>
                )}
                <Label className="text-[11px] text-muted-foreground">Program:</Label>
                <Select value={debugSubfolder} onValueChange={setDebugSubfolder} disabled={debugRunning || !debugFolders.length}>
                  <SelectTrigger className="h-7 text-[11px] rounded-[5px] w-[200px]">
                    <SelectValue placeholder={debugFolders.length ? "Seçin…" : "Klasör yok"} />
                  </SelectTrigger>
                  <SelectContent>
                    {debugFolders.map((f) => <SelectItem key={f} value={f} className="text-[11px]">{f}</SelectItem>)}
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
                            <SelectTrigger className="h-8 text-[11px] rounded-[5px]">
                              <SelectValue placeholder={newUserAdServers.length ? "Seçin…" : "Yükleniyor…"} />
                            </SelectTrigger>
                            <SelectContent>
                              {newUserAdServers.map((s) => (
                                <SelectItem key={s.id} value={s.id} className="text-[11px]">
                                  {s.name} <span className="text-muted-foreground font-mono ml-1">{s.ip}</span>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-[11px] flex items-center gap-1">RDP Sunucusu {newUserRdpLocked && <span className="text-[9px] text-muted-foreground font-normal">(firma kaydından)</span>}</Label>
                          <Select value={newUserRdpServerId} onValueChange={setNewUserRdpServerId} disabled={newUserRdpLocked}>
                            <SelectTrigger className="h-8 text-[11px] rounded-[5px]">
                              <SelectValue placeholder={newUserRdpServers.length ? "Seçin…" : "Yükleniyor…"} />
                            </SelectTrigger>
                            <SelectContent>
                              {newUserRdpServers.map((s) => (
                                <SelectItem key={s.id} value={s.id} className="text-[11px]">
                                  {s.name} <span className="text-muted-foreground font-mono ml-1">{s.ip}</span>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      {/* Kullanıcı adı */}
                      <div className="space-y-1.5">
                        <Label className="text-[11px]">Kullanıcı Adı</Label>
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
                        <Label className="text-[11px]">Ad Soyad</Label>
                        <Input value={newUserDisplayName} onChange={(e) => setNewUserDisplayName(e.target.value)} placeholder="Adı Soyadı" className="h-8 rounded-[5px] text-[11px]" />
                      </div>

                      {/* Şifre */}
                      <div className="space-y-1.5">
                        <Label className="text-[11px]">Şifre</Label>
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
                          <Label className="text-[11px]">E-posta</Label>
                          <Input type="email" value={newUserEmail} onChange={(e) => setNewUserEmail(e.target.value)} placeholder="ad@sirket.com" className="h-8 rounded-[5px] text-[11px]" />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-[11px]">Telefon</Label>
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
                      "Bağlantı Rehberi: https://www.youtube.com/watch?v=sclrNkCJ734",
                      "",
                      "İyi çalışmalar.",
                    ].join("\n")
                    return (
                      <div className="space-y-2 mt-2">
                        <Label className="text-[11px]">Müşteri Bilgilendirme Mesajı</Label>
                        <pre className="text-[11px] font-mono whitespace-pre-wrap leading-relaxed bg-muted/30 rounded-[5px] border border-border/50 p-3">{msg}</pre>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={async () => { await navigator.clipboard.writeText(msg); setNewUserMsgCopied(true); setTimeout(() => setNewUserMsgCopied(false), 2000) }}
                          className="w-full rounded-[5px] h-8 text-[11px] gap-1.5"
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
                      <Label className="text-[11px]">Yeni Şifre</Label>
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
                      <Label className="text-[11px]">Müşteri Bilgilendirme Mesajı</Label>
                      <pre className="text-[11px] font-mono whitespace-pre-wrap leading-relaxed bg-muted/30 rounded-[5px] border border-border/50 p-3">{msg}</pre>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={async () => { await navigator.clipboard.writeText(msg); setPwResetMsgCopied(true); setTimeout(() => setPwResetMsgCopied(false), 2000) }}
                        className="w-full rounded-[5px] h-8 text-[11px] gap-1.5"
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
                  <Label className="text-[11px]">Kullanıcı Adı Onayı</Label>
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
                          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-8 w-full rounded-[4px]" />)}
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
                                    <span className="size-4 rounded-full bg-foreground text-background text-[9px] flex items-center justify-center font-bold">{count}</span>
                                  )}
                                </button>
                              )
                            })}
                          </div>

                          {/* Hizmet listesi */}
                          <div className="rounded-[5px] border border-border/50 overflow-hidden">
                            <div className="px-3 py-2 bg-muted/30 border-b border-border/40">
                              <span className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase">
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
                                    <span className={`size-4 rounded-[3px] border-2 flex items-center justify-center shrink-0 ${isSelected ? "bg-foreground border-foreground" : "border-border"}`}>
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
                                  <SelectTrigger className="h-8 text-[11px] rounded-[5px]">
                                    <SelectValue placeholder={newSvcWindowsList.length ? "Seçin…" : "Sunucu yok"} />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {newSvcWindowsList.map((s) => (
                                      <SelectItem key={s.id} value={s.id} className="text-[11px]">
                                        {s.name} <span className="text-muted-foreground font-mono ml-1">{s.ip}</span>
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="space-y-1.5">
                                <Label className="text-[11px]">Depo Sunucusu</Label>
                                <Select value={newSvcDepoServerId} onValueChange={setNewSvcDepoServerId}>
                                  <SelectTrigger className="h-8 text-[11px] rounded-[5px]">
                                    <SelectValue placeholder={newSvcDepoServers.length ? "Seçin…" : "Sunucu yok"} />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {newSvcDepoServers.map((s) => (
                                      <SelectItem key={s.id} value={s.id} className="text-[11px]" disabled={!s.isOnline}>
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
                              <Label className="text-[11px]">IIS Sunucusu</Label>
                              <Select value={newSvcIisServerId} onValueChange={setNewSvcIisServerId}>
                                <SelectTrigger className="h-8 text-[11px] rounded-[5px]">
                                  <SelectValue placeholder={newSvcIisServers.length ? "Seçin…" : "Sunucu yok"} />
                                </SelectTrigger>
                                <SelectContent>
                                  {newSvcIisServers.map((s) => (
                                    <SelectItem key={s.id} value={s.id} className="text-[11px]" disabled={!s.isOnline}>
                                      {s.name} <span className="text-muted-foreground font-mono ml-1">{s.ip}</span>
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          )}

                          {!newSvcAdServerId && (
                            <p className="text-[10px] text-amber-600">Uyarı: Bu firma için AD sunucusu tanımlı değil — hizmet kurulumu OU/grup adımları için AD ister.</p>
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
                  <pre className="text-[10px] font-mono whitespace-pre-wrap bg-muted/50 rounded-[3px] p-2 max-h-40 overflow-auto">{q.sql}</pre>
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
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Building2 className="h-12 w-12 text-muted-foreground/30 mb-3" />
            <p className="text-sm font-medium text-muted-foreground">Detayları görmek için bir firma seçin</p>
            <p className="text-[11px] text-muted-foreground/60 mt-1 mb-4">Yukarıdaki kartlardan bir firmaya tıklayın</p>
            <Popover open={searchOpen} onOpenChange={(o) => { setSearchOpen(o); if (!o) setSearchQuery(""); }}>
              <PopoverTrigger asChild>
                <button className="flex items-center gap-2 text-[11px] font-medium bg-foreground text-background rounded-[5px] px-3 py-1.5 hover:bg-foreground/90 transition-colors">
                  <Search className="h-3.5 w-3.5" />
                  Firma Ara
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-0 rounded-[5px]">
                <Command shouldFilter={false}>
                  <CommandInput placeholder="Firma ara..." className="text-[11px] h-8" value={searchQuery} onValueChange={setSearchQuery} />
                  <CommandList className="max-h-56 overflow-y-auto" onWheel={(e) => e.stopPropagation()}>
                    {apiLoading ? (
                      <div className="p-2 space-y-1">
                        {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-7 w-full rounded-[4px]" />)}
                      </div>
                    ) : (
                      <>
                        <CommandEmpty className="text-[11px] py-4 text-center text-muted-foreground">Firma bulunamadı</CommandEmpty>
                        <CommandGroup>
                          {apiFiltered.map((comp) => (
                            <CommandItem
                              key={comp.id}
                              value={comp.id}
                              onSelect={() => selectFirma(comp)}
                              className="text-[11px] flex items-center justify-between"
                            >
                              <span>{comp.firma}</span>
                              <span className="text-[10px] text-muted-foreground tabular-nums font-mono">{comp.firkod}</span>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </>
                    )}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
        </NestedCard>
      )}
    </PageContainer>
  );
}
