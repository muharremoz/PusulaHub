"use client";

import { useState, useEffect } from "react";
import { PageContainer } from "@/components/layout/page-container";
import { NestedCard } from "@/components/shared/nested-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { ProgressBar } from "@/components/shared/progress-bar";
import { AnimatedCircularProgressBar } from "@/components/ui/animated-circular-progress-bar";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } from "recharts";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Skeleton } from "@/components/ui/skeleton";
import { companies, messageRecipients, servers, iisSites } from "@/lib/mock-data";
import type { Company } from "@/types";

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
}

interface TabSQLDatabase {
  Id:         string
  Name:       string
  Server:     string
  FirmaNo:    string | null
  SizeMB:     number
  Status:     string
  LastBackup: string | null
  Tables:     number
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
  Trash2,
  Download,
  Settings2,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";

function YoğunlukKart({ selected }: { selected: Company }) {
  const cpuPct  = Math.round((selected.currentUsage.cpu  / selected.monthlyQuota.cpu)  * 100);
  const ramPct  = Math.round((selected.currentUsage.ram  / selected.monthlyQuota.ram)  * 100);
  const diskPct = Math.round((selected.currentUsage.disk / selected.monthlyQuota.disk) * 100);
  const userPct = Math.round((selected.userCount / selected.userCapacity) * 100);
  const dbTotal = (selected.databases ?? []).reduce((s, d) => s + d.size, 0);
  const dbPct   = Math.round((dbTotal / selected.dbQuota) * 100);
  const yogunluk = Math.round((cpuPct + ramPct + diskPct + userPct + dbPct) / 5);

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
    { label: "CPU",  icon: <Cpu className="h-3.5 w-3.5 text-muted-foreground" />,        pct: cpuPct,  val: `${selected.currentUsage.cpu} / ${selected.monthlyQuota.cpu} vCPU` },
    { label: "RAM",  icon: <MemoryStick className="h-3.5 w-3.5 text-muted-foreground" />, pct: ramPct,  val: `${selected.currentUsage.ram} / ${selected.monthlyQuota.ram} GB` },
    { label: "Disk", icon: <HardDrive className="h-3.5 w-3.5 text-muted-foreground" />,   pct: diskPct, val: `${selected.currentUsage.disk} / ${selected.monthlyQuota.disk} GB` },
    { label: "User", icon: <Users className="h-3.5 w-3.5 text-muted-foreground" />,       pct: userPct, val: `${selected.userCount} / ${selected.userCapacity} kullanıcı` },
    { label: "DB",   icon: <Database className="h-3.5 w-3.5 text-muted-foreground" />,    pct: dbPct,   val: `${dbTotal} / ${selected.dbQuota} GB` },
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
            <span>CPU + RAM + Disk + Kullanıcı + Veritabanı ortalaması</span>
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
    </NestedCard>

    <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold">Yoğunluk Skoru Hesaplama</DialogTitle>
        </DialogHeader>

        <p className="text-[11px] text-muted-foreground leading-relaxed">
          Yoğunluk skoru, firmanın kaynak kullanımını tek bir sayıya indirger.
          Aşağıdaki 5 metriğin aritmetik ortalaması alınır:
        </p>

        <div className="space-y-1.5 mt-1">
          {[
            { label: "CPU Kullanımı",      icon: <Cpu className="h-3.5 w-3.5" />,        pct: cpuPct,  detail: `${selected.currentUsage.cpu} / ${selected.monthlyQuota.cpu} vCPU` },
            { label: "RAM Kullanımı",      icon: <MemoryStick className="h-3.5 w-3.5" />, pct: ramPct,  detail: `${selected.currentUsage.ram} / ${selected.monthlyQuota.ram} GB` },
            { label: "Disk Kullanımı",     icon: <HardDrive className="h-3.5 w-3.5" />,   pct: diskPct, detail: `${selected.currentUsage.disk} / ${selected.monthlyQuota.disk} GB` },
            { label: "Kullanıcı Doluluğu", icon: <Users className="h-3.5 w-3.5" />,       pct: userPct, detail: `${selected.userCount} / ${selected.userCapacity} kullanıcı` },
            { label: "Veritabanı Boyutu",  icon: <Database className="h-3.5 w-3.5" />,    pct: dbPct,   detail: `${dbTotal} / ${selected.dbQuota} GB` },
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
              ({cpuPct} + {ramPct} + {diskPct} + {userPct} + {dbPct}) ÷ 5
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

function calcYogunluk(comp: Company) {
  const cpuPct  = Math.round((comp.currentUsage.cpu  / comp.monthlyQuota.cpu)  * 100);
  const ramPct  = Math.round((comp.currentUsage.ram  / comp.monthlyQuota.ram)  * 100);
  const diskPct = Math.round((comp.currentUsage.disk / comp.monthlyQuota.disk) * 100);
  const userPct = Math.round((comp.userCount / comp.userCapacity) * 100);
  const dbTotal = (comp.databases ?? []).reduce((s, d) => s + d.size, 0);
  const dbPct   = Math.round((dbTotal / comp.dbQuota) * 100);
  return Math.round((cpuPct + ramPct + diskPct + userPct + dbPct) / 5);
}

const top5 = [...companies].sort((a, b) => calcYogunluk(b) - calcYogunluk(a)).slice(0, 5);

export default function CompaniesPage() {
  const [selectedCompany, setSelectedCompany] = useState<string | null>(null);
  const [selectedFirma, setSelectedFirma] = useState<FirmaCompany | null>(null);
  const [apiCompanies, setApiCompanies] = useState<FirmaCompany[]>([]);
  const [apiLoading, setApiLoading] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const [tabUsers, setTabUsers] = useState<TabUser[]>([]);
  const [tabIIS, setTabIIS] = useState<TabIISSite[]>([]);
  const [tabSQL, setTabSQL] = useState<TabSQLDatabase[]>([]);
  const [tabLoading, setTabLoading] = useState(false);

  useEffect(() => {
    fetch("/api/firma/companies")
      .then((r) => r.ok ? r.json() : Promise.reject(r))
      .then((data: FirmaCompany[]) => setApiCompanies(data))
      .catch(() => setApiCompanies([]))
      .finally(() => setApiLoading(false))
  }, [])

  useEffect(() => {
    if (!selectedFirma) return
    const firkod = selectedFirma.firkod
    setTabUsers([]); setTabIIS([]); setTabSQL([])
    setTabLoading(true)
    Promise.all([
      fetch(`/api/companies/${firkod}/users`).then(r => r.ok ? r.json() : []),
      fetch(`/api/companies/${firkod}/iis`).then(r => r.ok ? r.json() : []),
      fetch(`/api/companies/${firkod}/sql`).then(r => r.ok ? r.json() : []),
    ]).then(([users, iis, sql]) => {
      setTabUsers(Array.isArray(users) ? users : [])
      setTabIIS(Array.isArray(iis) ? iis : [])
      setTabSQL(Array.isArray(sql) ? sql : [])
    }).catch(() => {}).finally(() => setTabLoading(false))
  }, [selectedFirma?.firkod])

  function selectFirma(f: FirmaCompany) {
    setSelectedFirma(f)
    const mockMatch = companies.find((c) => c.name.toLowerCase() === f.firma.toLowerCase())
    setSelectedCompany(mockMatch?.id ?? companies[0]?.id ?? null)
    setSearchOpen(false)
    setSearchQuery("")
  }

  function clearSelection() {
    setSelectedFirma(null)
    setSelectedCompany(null)
    setTabUsers([]); setTabIIS([]); setTabSQL([])
  }

  const selected: Company | undefined = selectedCompany
    ? companies.find((c) => c.id === selectedCompany)
    : undefined;

  const companyServers = selected
    ? servers.filter((s) => selected.servers.includes(s.name))
    : [];

  const apiFiltered = searchQuery.trim()
    ? apiCompanies.filter((c) => c.firma.toLowerCase().includes(searchQuery.toLowerCase())).slice(0, 50)
    : apiCompanies.slice(0, 50);

  return (
    <PageContainer title="Firma Yönetimi" description="Firmaların sunucu kullanım durumları">
      {/* Company Selector / Header Bar */}
      <div className="mb-6">
        {(selectedFirma || selected) ? (
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

                {selectedFirma ? (
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
                ) : selected ? (
                  <>
                    <span className={`h-2 w-2 rounded-full shrink-0 ${
                      selected.status === "active" ? "bg-emerald-500" :
                      selected.status === "trial"  ? "bg-amber-500"  : "bg-red-500"
                    }`} />
                    <h2 className="text-sm font-semibold tracking-tight">{selected.name}</h2>
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <span className="text-[11px]">{selected.sector}</span>
                      <span className="text-[10px]">·</span>
                      <span className="text-[11px]">{selected.contactPerson}</span>
                      <span className="text-[10px]">·</span>
                      <span className="text-[11px]">{selected.contactEmail}</span>
                    </div>
                    <span className={`shrink-0 inline-flex items-center rounded-[4px] border px-1.5 py-0.5 text-[9px] font-medium ${statusConfig[selected.status].color}`}>
                      {statusConfig[selected.status].label}
                    </span>
                  </>
                ) : null}

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
            <div className="grid grid-cols-5 gap-2">
              {top5.map((comp) => {
                const st = statusConfig[comp.status];
                const yogunluk = calcYogunluk(comp);
                const yogunlukColor = yogunluk >= 80 ? "text-red-600" : yogunluk >= 60 ? "text-amber-600" : "text-emerald-600";
                return (
                  <button
                    key={comp.id}
                    onClick={() => {
                      setSelectedCompany(comp.id)
                      const apiMatch = apiCompanies.find((a) => a.firma.toLowerCase() === comp.name.toLowerCase())
                      setSelectedFirma(apiMatch ?? null)
                    }}
                    className="rounded-[8px] p-2 pb-0 text-left transition-all flex flex-col hover:brightness-[0.97]"
                    style={{ backgroundColor: "#F4F2F0" }}
                  >
                    <div
                      className="rounded-[4px] px-3 py-3 w-full"
                      style={{ backgroundColor: "#FFFFFF", boxShadow: "0 2px 4px rgba(0,0,0,0.06)" }}
                    >
                      <div className="flex items-start justify-between gap-1 mb-3">
                        <p className="text-[11px] font-semibold leading-tight">{comp.name}</p>
                        <span className={`shrink-0 inline-flex items-center rounded-[4px] border px-1 py-0 text-[9px] font-medium ${st.color}`}>
                          {st.label}
                        </span>
                      </div>
                      <div className="flex gap-1.5">
                        <div className="flex-1 flex flex-col items-center gap-0.5 rounded-[4px] py-1.5 bg-muted/40">
                          <span className={`text-[12px] font-bold tabular-nums leading-none ${yogunlukColor}`}>%{yogunluk}</span>
                          <span className="text-[9px] text-muted-foreground">Yoğunluk</span>
                        </div>
                        <div className="flex-1 flex flex-col items-center gap-0.5 rounded-[4px] py-1.5 bg-muted/40">
                          <Server className="h-3 w-3 text-muted-foreground" />
                          <span className="text-[11px] font-semibold tabular-nums">{comp.servers.length}</span>
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
          </NestedCard>
        )}
      </div>

      {/* Company Detail */}
      {selected ? (
        <div className="space-y-3">
          {/* Yoğunluk Skoru + Haftalık Kullanım */}
          <div className="grid grid-cols-[1fr_1fr] gap-3">
            <YoğunlukKart key={selected.id} selected={selected} />

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
                  <AreaChart data={selected.weeklyUsage} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
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
                      formatter={(value: number, name: string) => [`%${value}`, name.toUpperCase()]}
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
              <TabsContent value="users" className="mt-0">
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
                            <DropdownMenuItem className="text-[11px] gap-2"><KeyRound className="h-3.5 w-3.5" /> Şifre Sıfırla</DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-[11px] gap-2 text-destructive focus:text-destructive">
                              <Ban className="h-3.5 w-3.5" /> Hesabı Askıya Al
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    ))}
                  </div>
                </div>
              </TabsContent>

              {/* Hizmetler */}
              <TabsContent value="services" className="mt-0">
                <div className="rounded-[4px] overflow-hidden border border-border/40">
                  <div className="flex items-center justify-center py-10">
                    <p className="text-xs text-muted-foreground">Hizmet tanımları henüz eklenmedi</p>
                  </div>
                </div>
              </TabsContent>

              {/* Veritabanları */}
              <TabsContent value="databases" className="mt-0">
                <div className="rounded-[4px] overflow-hidden border border-border/40">
                  <div className="grid grid-cols-[1fr_120px_80px_140px_80px_32px] px-3 py-1.5 bg-muted/30 border-b border-border/40">
                    <span className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase">Veritabanı</span>
                    <span className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase">Sunucu</span>
                    <span className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase">Boyut</span>
                    <span className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase">Son Yedek</span>
                    <span className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase">Durum</span>
                    <span />
                  </div>
                  <div className="divide-y divide-border/40">
                    {tabLoading ? (
                      Array.from({ length: 3 }).map((_, i) => (
                        <div key={i} className="grid grid-cols-[1fr_120px_80px_140px_80px_32px] px-3 py-2.5 items-center gap-3">
                          <Skeleton className="h-3 rounded-[3px]" />
                          <Skeleton className="h-3 rounded-[3px] w-2/3" />
                          <Skeleton className="h-3 rounded-[3px]" />
                          <Skeleton className="h-3 rounded-[3px]" />
                          <Skeleton className="h-3 rounded-[3px] w-12" />
                        </div>
                      ))
                    ) : tabSQL.length === 0 ? (
                      <div className="flex items-center justify-center py-8">
                        <p className="text-xs text-muted-foreground">Veritabanı bulunamadı</p>
                      </div>
                    ) : tabSQL.map((db) => (
                      <div key={db.Id} className="grid grid-cols-[1fr_120px_80px_140px_80px_32px] px-3 py-2 hover:bg-muted/20 transition-colors items-center gap-3">
                        <div className="flex items-center gap-2">
                          <Database className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span className="text-[11px] font-medium truncate">{db.Name}</span>
                        </div>
                        <span className="text-[11px] font-mono text-muted-foreground truncate">{db.Server}</span>
                        <span className="text-[11px] tabular-nums text-muted-foreground">{(db.SizeMB / 1024).toFixed(1)} GB</span>
                        <span className="text-[10px] tabular-nums text-muted-foreground">{db.LastBackup ?? "—"}</span>
                        <div className="flex items-center gap-1.5">
                          <div className={`h-1.5 w-1.5 rounded-full ${db.Status === "Online" ? "bg-emerald-500" : "bg-gray-300"}`} />
                          <span className={`text-[10px] ${db.Status === "Online" ? "text-emerald-600" : "text-muted-foreground"}`}>
                            {db.Status === "Online" ? "Çevrimiçi" : "Çevrimdışı"}
                          </span>
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button className="h-6 w-6 flex items-center justify-center rounded-[4px] hover:bg-muted/60 transition-colors">
                              <MoreVertical className="h-3.5 w-3.5 text-muted-foreground" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-44">
                            <DropdownMenuItem className="text-[11px] gap-2"><Download className="h-3.5 w-3.5" /> Yedekle</DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-[11px] gap-2 text-destructive focus:text-destructive">
                              <Trash2 className="h-3.5 w-3.5" /> Veritabanını Kaldır
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    ))}
                  </div>
                </div>
              </TabsContent>

              {/* IIS Siteler */}
              <TabsContent value="iis" className="mt-0">
                <div className="rounded-[4px] overflow-hidden border border-border/40">
                  <div className="grid grid-cols-[120px_1fr_55px_120px_70px_32px] px-3 py-1.5 bg-muted/30 border-b border-border/40">
                    <span className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase">Sunucu</span>
                    <span className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase">Binding</span>
                    <span className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase">Port</span>
                    <span className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase">App Pool</span>
                    <span className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase">Durum</span>
                    <span />
                  </div>
                  <div className="divide-y divide-border/40">
                    {tabLoading ? (
                      Array.from({ length: 3 }).map((_, i) => (
                        <div key={i} className="grid grid-cols-[120px_1fr_55px_120px_70px_32px] px-3 py-2.5 items-center gap-3">
                          <Skeleton className="h-3 rounded-[3px] w-2/3" />
                          <Skeleton className="h-3 rounded-[3px]" />
                          <Skeleton className="h-3 rounded-[3px]" />
                          <Skeleton className="h-3 rounded-[3px]" />
                          <Skeleton className="h-3 rounded-[3px] w-12" />
                        </div>
                      ))
                    ) : tabIIS.length === 0 ? (
                      <div className="flex items-center justify-center py-8">
                        <p className="text-xs text-muted-foreground">IIS sitesi bulunamadı</p>
                      </div>
                    ) : tabIIS.map((site) => {
                      const portMatch = site.Binding.match(/:(\d+)$/)
                      const port = portMatch ? portMatch[1] : "—"
                      const host = site.Binding.replace(/:\d+$/, "").replace(/^https?:\/\//, "")
                      return (
                        <div key={site.Id} className="grid grid-cols-[120px_1fr_55px_120px_70px_32px] px-3 py-2 hover:bg-muted/20 transition-colors items-center gap-3">
                          <span className="text-[11px] font-mono text-muted-foreground truncate">{site.Server}</span>
                          <span className="text-[11px] font-mono text-muted-foreground truncate">{host || site.Binding}</span>
                          <span className="text-[11px] font-mono tabular-nums text-muted-foreground">{port}</span>
                          <span className="text-[11px] text-muted-foreground truncate">{site.AppPool}</span>
                          <div className="flex items-center gap-1.5">
                            <div className={`h-1.5 w-1.5 rounded-full ${site.Status === "Started" ? "bg-emerald-500" : "bg-gray-300"}`} />
                            <span className={`text-[10px] ${site.Status === "Started" ? "text-emerald-600" : "text-muted-foreground"}`}>
                              {site.Status === "Started" ? "Aktif" : "Durduruldu"}
                            </span>
                          </div>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button className="h-6 w-6 flex items-center justify-center rounded-[4px] hover:bg-muted/60 transition-colors">
                                <MoreVertical className="h-3.5 w-3.5 text-muted-foreground" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-44">
                              <DropdownMenuItem className="text-[11px] gap-2">
                                {site.Status === "Started"
                                  ? <><Square className="h-3.5 w-3.5" /> Durdur</>
                                  : <><Play className="h-3.5 w-3.5" /> Başlat</>
                                }
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem className="text-[11px] gap-2 text-destructive focus:text-destructive">
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
