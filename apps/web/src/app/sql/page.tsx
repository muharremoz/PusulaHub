"use client";

import { useState } from "react";
import { PageContainer } from "@/components/layout/page-container";
import { sqlDatabases } from "@/lib/mock-data";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  MoreVertical,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  Database,
  Play,
  Clock,
  Download,
  Loader2,
  Table2,
  Bookmark,
  FileText,
  Braces,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";

/* ══════════════════════════════════════════════
   Mock veri
══════════════════════════════════════════════ */
const SAVED_QUERIES = [
  {
    id: "sq-1",
    name: "Aktif Tablolar",
    db: "ERP_Production",
    sql: "SELECT name, object_id, type_desc\nFROM sys.tables\nWHERE type = 'U'\nORDER BY name",
  },
  {
    id: "sq-2",
    name: "Büyük Tablolar",
    db: "ERP_Production",
    sql: "SELECT t.name, p.rows AS [Satır Sayısı]\nFROM sys.tables t\nINNER JOIN sys.partitions p\n  ON t.object_id = p.object_id\nWHERE p.index_id IN (0,1)\nORDER BY p.rows DESC",
  },
  {
    id: "sq-3",
    name: "Son Yedekler",
    db: "msdb",
    sql: "SELECT database_name,\n       backup_finish_date,\n       type\nFROM msdb.dbo.backupset\nORDER BY backup_finish_date DESC",
  },
  {
    id: "sq-4",
    name: "Aktif Bağlantılar",
    db: "master",
    sql: "SELECT session_id, login_name,\n       host_name, program_name, status\nFROM sys.dm_exec_sessions\nWHERE is_user_process = 1",
  },
  {
    id: "sq-5",
    name: "İndex Kullanımı",
    db: "ERP_Production",
    sql: "SELECT OBJECT_NAME(i.object_id) AS TableName,\n       i.name AS IndexName,\n       ius.user_seeks,\n       ius.user_scans\nFROM sys.indexes i\nJOIN sys.dm_db_index_usage_stats ius\n  ON i.object_id = ius.object_id\n  AND i.index_id = ius.index_id\nORDER BY ius.user_seeks DESC",
  },
  {
    id: "sq-6",
    name: "Veritabanı Boyutları",
    db: "master",
    sql: "SELECT\n  name AS [Veritabanı],\n  size * 8 / 1024 AS [Boyut (MB)]\nFROM sys.master_files\nWHERE type = 0\nORDER BY size DESC",
  },
];

type MockResult = {
  columns: string[];
  rows: string[][];
  executionMs: number;
};

const MOCK_RESULT: MockResult = {
  columns: ["name", "object_id", "type_desc"],
  rows: [
    ["Categories",  "885578193", "USER_TABLE"],
    ["Customers",   "901578250", "USER_TABLE"],
    ["Invoices",    "917578307", "USER_TABLE"],
    ["OrderItems",  "933578364", "USER_TABLE"],
    ["Orders",      "949578421", "USER_TABLE"],
    ["Products",    "965578478", "USER_TABLE"],
    ["Suppliers",   "981578535", "USER_TABLE"],
    ["Users",       "997578592", "USER_TABLE"],
    ["Warehouses",  "1013578649", "USER_TABLE"],
    ["Transactions","1029578706", "USER_TABLE"],
  ],
  executionMs: 24,
};

/* ══════════════════════════════════════════════
   Yardımcılar
══════════════════════════════════════════════ */
type SortKey = "name" | "server" | "sizeMB" | "tables" | "status" | "lastBackup";
type SortDir = "asc" | "desc";

function formatSize(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${mb} MB`;
}

const DB_STATUS_BADGE: Record<string, string> = {
  Online:     "bg-emerald-50 text-emerald-700 border-emerald-200",
  Offline:    "bg-muted text-muted-foreground border-border",
  Restoring:  "bg-amber-50 text-amber-700 border-amber-200",
};
const DB_STATUS_DOT: Record<string, string> = {
  Online:    "bg-emerald-500",
  Offline:   "bg-slate-300",
  Restoring: "bg-amber-400",
};

function downloadCSV(columns: string[], rows: string[][]) {
  const header = columns.join(",");
  const body   = rows.map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
  const blob   = new Blob([header + "\n" + body], { type: "text/csv;charset=utf-8;" });
  const url    = URL.createObjectURL(blob);
  const a      = document.createElement("a");
  a.href = url; a.download = "sorgu_sonucu.csv"; a.click();
  URL.revokeObjectURL(url);
}

function downloadJSON(columns: string[], rows: string[][]) {
  const data = rows.map((r) => Object.fromEntries(columns.map((c, i) => [c, r[i]])));
  const blob  = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url   = URL.createObjectURL(blob);
  const a     = document.createElement("a");
  a.href = url; a.download = "sorgu_sonucu.json"; a.click();
  URL.revokeObjectURL(url);
}

/* ── SortHeader ── */
function SortHeader({ label, sortKey, active, dir, onSort }: {
  label: string;
  sortKey: SortKey;
  active: SortKey;
  dir: SortDir;
  onSort: (k: SortKey) => void;
}) {
  const isActive = active === sortKey;
  return (
    <button
      onClick={() => onSort(sortKey)}
      className={cn(
        "flex items-center gap-1 text-[10px] font-medium tracking-wide uppercase transition-colors select-none",
        isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground"
      )}
    >
      {label}
      <span className="shrink-0">
        {isActive
          ? dir === "asc" ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />
          : <ChevronsUpDown className="size-3 opacity-40" />}
      </span>
    </button>
  );
}

/* ══════════════════════════════════════════════
   Ana Bileşen
══════════════════════════════════════════════ */
export default function SQLPage() {
  /* — veritabanları tab — */
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  /* — sorgu editörü tab — */
  const [selectedDb,    setSelectedDb]    = useState<string>("ERP_Production");
  const [query,         setQuery]         = useState("SELECT TOP 10 * FROM sys.tables\nORDER BY name");
  const [selectedSaved, setSelectedSaved] = useState<string | null>(null);
  const [isRunning,     setIsRunning]     = useState(false);
  const [result,        setResult]        = useState<MockResult | null>(null);
  const [hasError,      setHasError]      = useState(false);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };

  const sorted = [...sqlDatabases].sort((a, b) => {
    const mul = sortDir === "asc" ? 1 : -1;
    if (sortKey === "sizeMB" || sortKey === "tables")
      return (Number(a[sortKey]) - Number(b[sortKey])) * mul;
    return String(a[sortKey]).localeCompare(String(b[sortKey])) * mul;
  });

  const handleRun = () => {
    if (!query.trim() || isRunning) return;
    setIsRunning(true);
    setResult(null);
    setHasError(false);
    // Simüle — gerçek çalıştırma burada yapılacak
    setTimeout(() => {
      setIsRunning(false);
      if (query.trim().toLowerCase().startsWith("drop") ||
          query.trim().toLowerCase().startsWith("delete")) {
        setHasError(true);
      } else {
        setResult(MOCK_RESULT);
      }
    }, 900);
  };

  const loadSaved = (sq: typeof SAVED_QUERIES[number]) => {
    setQuery(sq.sql);
    setSelectedDb(sq.db);
    setSelectedSaved(sq.id);
    setResult(null);
    setHasError(false);
  };

  return (
    <PageContainer title="SQL Server" description="Veritabanı yönetimi ve sorgu çalıştırma">

      <Tabs defaultValue="databases">

        {/* ── Tab Başlıkları ── */}
        <TabsList className="rounded-[8px] p-1 h-auto mb-4 gap-0" style={{ backgroundColor: "#F4F2F0" }}>
          <TabsTrigger
            value="databases"
            className="rounded-[6px] text-[11px] px-3 py-1.5 font-medium transition-colors data-[state=active]:bg-foreground data-[state=active]:text-background data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:text-foreground data-[state=active]:shadow-none"
          >
            Veritabanları
          </TabsTrigger>
          <TabsTrigger
            value="editor"
            className="rounded-[6px] text-[11px] px-3 py-1.5 font-medium transition-colors data-[state=active]:bg-foreground data-[state=active]:text-background data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:text-foreground data-[state=active]:shadow-none"
          >
            Sorgu Editörü
          </TabsTrigger>
        </TabsList>

        {/* ══════════════════════════════════════
            TAB 1 — Veritabanları
        ══════════════════════════════════════ */}
        <TabsContent value="databases" className="mt-0">
          <div className="rounded-[8px] p-2 pb-0" style={{ backgroundColor: "#F4F2F0" }}>
            <div
              className="rounded-[4px] overflow-hidden"
              style={{ backgroundColor: "#FFFFFF", boxShadow: "0 2px 4px rgba(0,0,0,0.06)" }}
            >
              {/* Header */}
              <div className="grid grid-cols-[16px_2fr_1fr_80px_60px_90px_140px_28px] gap-3 px-3 py-2 bg-muted/30 border-b border-border/40 items-center">
                <span />
                <SortHeader label="Veritabanı"  sortKey="name"       active={sortKey} dir={sortDir} onSort={handleSort} />
                <SortHeader label="Sunucu"       sortKey="server"     active={sortKey} dir={sortDir} onSort={handleSort} />
                <SortHeader label="Boyut"        sortKey="sizeMB"     active={sortKey} dir={sortDir} onSort={handleSort} />
                <SortHeader label="Tablo"        sortKey="tables"     active={sortKey} dir={sortDir} onSort={handleSort} />
                <SortHeader label="Durum"        sortKey="status"     active={sortKey} dir={sortDir} onSort={handleSort} />
                <SortHeader label="Son Yedek"    sortKey="lastBackup" active={sortKey} dir={sortDir} onSort={handleSort} />
                <span />
              </div>

              {/* Satırlar */}
              <div className="divide-y divide-border/40">
                {sorted.map((db) => (
                  <div
                    key={db.id}
                    className="grid grid-cols-[16px_2fr_1fr_80px_60px_90px_140px_28px] gap-3 px-3 py-2.5 hover:bg-muted/20 transition-colors items-center"
                  >
                    <span className="flex items-center justify-center">
                      <span className="relative flex size-1.5">
                        {db.status === "Online" && (
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                        )}
                        <span className={cn("relative inline-flex size-1.5 rounded-full", DB_STATUS_DOT[db.status] ?? "bg-slate-300")} />
                      </span>
                    </span>
                    <div className="flex items-center gap-2 min-w-0">
                      <Database className="size-3 text-muted-foreground shrink-0" />
                      <span className="text-[11px] font-medium truncate font-mono">{db.name}</span>
                    </div>
                    <span className="text-[11px] text-muted-foreground">{db.server}</span>
                    <span className="text-[11px] tabular-nums text-muted-foreground">{formatSize(db.sizeMB)}</span>
                    <span className="text-[11px] tabular-nums text-muted-foreground">{db.tables}</span>
                    <span className={cn("text-[9px] font-medium px-1.5 py-0.5 rounded-[4px] border w-fit", DB_STATUS_BADGE[db.status] ?? "bg-muted text-muted-foreground border-border")}>
                      {db.status}
                    </span>
                    <span className="text-[10px] text-muted-foreground tabular-nums truncate">{db.lastBackup}</span>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="flex items-center justify-center h-6 w-6 rounded-[4px] hover:bg-muted/60 transition-colors shrink-0">
                          <MoreVertical className="h-3.5 w-3.5 text-muted-foreground" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="rounded-[6px]">
                        <DropdownMenuItem className="text-xs cursor-pointer">Detaylar</DropdownMenuItem>
                        <DropdownMenuItem className="text-xs cursor-pointer">Yedek Al</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-xs cursor-pointer text-destructive">Bağlantıları Kes</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground px-2 py-2">
              <Database className="size-3" />
              <span>{sqlDatabases.length} veritabanı listeleniyor</span>
            </div>
          </div>
        </TabsContent>

        {/* ══════════════════════════════════════
            TAB 2 — Sorgu Editörü
        ══════════════════════════════════════ */}
        <TabsContent value="editor" className="mt-0">
          <div className="grid grid-cols-[220px_1fr] gap-3 items-start">

            {/* ── Sol: Kayıtlı Sorgular ── */}
            <div className="rounded-[8px] p-2 pb-0" style={{ backgroundColor: "#F4F2F0" }}>
              <div
                className="rounded-[4px] overflow-hidden"
                style={{ backgroundColor: "#FFFFFF", boxShadow: "0 2px 4px rgba(0,0,0,0.06)" }}
              >
                {/* Başlık */}
                <div className="px-3 py-2 bg-muted/30 border-b border-border/40">
                  <p className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase">Kayıtlı Sorgular</p>
                </div>
                {/* Liste */}
                <div className="divide-y divide-border/40">
                  {SAVED_QUERIES.map((sq) => (
                    <button
                      key={sq.id}
                      onClick={() => loadSaved(sq)}
                      className={cn(
                        "w-full text-left px-3 py-2.5 hover:bg-muted/20 transition-colors",
                        selectedSaved === sq.id && "bg-muted/30"
                      )}
                    >
                      <div className="flex items-start gap-2">
                        <Bookmark className={cn("size-3 mt-0.5 shrink-0", selectedSaved === sq.id ? "text-foreground" : "text-muted-foreground")} />
                        <div className="min-w-0">
                          <p className={cn("text-[11px] font-medium truncate", selectedSaved === sq.id ? "text-foreground" : "text-foreground/80")}>
                            {sq.name}
                          </p>
                          <span className="text-[9px] bg-muted px-1 py-0 rounded-[3px] text-muted-foreground font-mono mt-0.5 inline-block">
                            {sq.db}
                          </span>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
              <div className="h-2" />
            </div>

            {/* ── Sağ: Editör + Sonuçlar ── */}
            <div className="flex flex-col gap-3">

              {/* Editör Kartı */}
              <div className="rounded-[8px] p-2 pb-0" style={{ backgroundColor: "#F4F2F0" }}>
                <div
                  className="rounded-[4px] overflow-hidden"
                  style={{ backgroundColor: "#FFFFFF", boxShadow: "0 2px 4px rgba(0,0,0,0.06)" }}
                >
                  {/* Editör Header */}
                  <div className="flex items-center gap-2 px-3 py-2 bg-muted/30 border-b border-border/40">
                    <Select value={selectedDb} onValueChange={setSelectedDb}>
                      <SelectTrigger className="h-7 w-[200px] text-[11px] rounded-[5px] font-mono border-border/50 bg-background">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="rounded-[5px]">
                        {sqlDatabases.map((db) => (
                          <SelectItem key={db.id} value={db.name} className="text-[11px] font-mono">
                            {db.name}
                          </SelectItem>
                        ))}
                        <SelectItem value="master"  className="text-[11px] font-mono">master</SelectItem>
                        <SelectItem value="msdb"    className="text-[11px] font-mono">msdb</SelectItem>
                      </SelectContent>
                    </Select>

                    <div className="ml-auto flex items-center gap-2">
                      <span className="text-[10px] text-muted-foreground">
                        {query.trim().split(/\s+/).length} kelime
                      </span>
                      <button
                        onClick={handleRun}
                        disabled={isRunning || !query.trim()}
                        className="flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-[5px] bg-foreground text-background hover:bg-foreground/90 transition-colors disabled:opacity-40 disabled:pointer-events-none"
                      >
                        {isRunning
                          ? <Loader2 className="size-3 animate-spin" />
                          : <Play className="size-3" />}
                        {isRunning ? "Çalışıyor…" : "Çalıştır"}
                      </button>
                    </div>
                  </div>

                  {/* SQL Editör Alanı */}
                  <div className="p-0">
                    <Textarea
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                          e.preventDefault();
                          handleRun();
                        }
                        // Tab tuşu — 2 boşluk ekle
                        if (e.key === "Tab") {
                          e.preventDefault();
                          const el  = e.currentTarget;
                          const s   = el.selectionStart;
                          const end = el.selectionEnd;
                          const val = el.value;
                          const next = val.substring(0, s) + "  " + val.substring(end);
                          setQuery(next);
                          requestAnimationFrame(() => { el.selectionStart = el.selectionEnd = s + 2; });
                        }
                      }}
                      className="rounded-none border-0 border-b border-border/40 text-[12px] font-mono resize-none min-h-[180px] bg-zinc-950 text-zinc-100 placeholder:text-zinc-600 focus-visible:ring-0 focus-visible:ring-offset-0"
                      placeholder="-- SQL sorgunuzu buraya yazın..."
                      spellCheck={false}
                    />
                  </div>

                  {/* Editör Footer */}
                  <div className="flex items-center gap-3 px-3 py-1.5">
                    <span className="text-[10px] text-muted-foreground">Ctrl+Enter ile çalıştır · Tab ile girinti</span>
                  </div>
                </div>
                <div className="h-2" />
              </div>

              {/* Hata Mesajı */}
              {hasError && (
                <div className="rounded-[8px] p-2 pb-0" style={{ backgroundColor: "#F4F2F0" }}>
                  <div
                    className="rounded-[4px] overflow-hidden"
                    style={{ backgroundColor: "#FFFFFF", boxShadow: "0 2px 4px rgba(0,0,0,0.06)" }}
                  >
                    <div className="flex items-center gap-2 px-3 py-3">
                      <AlertCircle className="size-4 text-destructive shrink-0" />
                      <div>
                        <p className="text-[11px] font-medium text-destructive">Sorgu çalıştırılamadı</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          DROP ve DELETE ifadeleri mock modda desteklenmiyor.
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="h-2" />
                </div>
              )}

              {/* Sonuçlar Kartı */}
              {result && (
                <div className="rounded-[8px] p-2 pb-0" style={{ backgroundColor: "#F4F2F0" }}>
                  <div
                    className="rounded-[4px] overflow-hidden"
                    style={{ backgroundColor: "#FFFFFF", boxShadow: "0 2px 4px rgba(0,0,0,0.06)" }}
                  >
                    {/* Sonuçlar Header */}
                    <div className="flex items-center gap-2 px-3 py-2 bg-muted/30 border-b border-border/40">
                      <CheckCircle2 className="size-3.5 text-emerald-600" />
                      <p className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase">Sonuçlar</p>
                      <span className="text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-[4px] font-medium">
                        {result.rows.length} satır
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {result.executionMs}ms
                      </span>

                      {/* Dışa Aktar */}
                      <div className="ml-auto flex items-center gap-1.5">
                        <button
                          onClick={() => downloadCSV(result.columns, result.rows)}
                          className="flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-[5px] border border-border/60 hover:bg-muted/40 transition-colors text-muted-foreground hover:text-foreground"
                        >
                          <FileText className="size-3" />
                          CSV
                        </button>
                        <button
                          onClick={() => downloadJSON(result.columns, result.rows)}
                          className="flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-[5px] border border-border/60 hover:bg-muted/40 transition-colors text-muted-foreground hover:text-foreground"
                        >
                          <Download className="size-3" />
                          JSON
                        </button>
                      </div>
                    </div>

                    {/* Tablo */}
                    <div className="overflow-x-auto">
                      <table className="w-full text-[11px]">
                        <thead>
                          <tr className="border-b border-border/40 bg-muted/20">
                            <th className="text-left px-3 py-2 text-[10px] font-medium text-muted-foreground tracking-wide uppercase w-10 shrink-0 tabular-nums">#</th>
                            {result.columns.map((col) => (
                              <th key={col} className="text-left px-3 py-2 text-[10px] font-medium text-muted-foreground tracking-wide uppercase whitespace-nowrap">
                                {col}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/40">
                          {result.rows.map((row, ri) => (
                            <tr key={ri} className="hover:bg-muted/20 transition-colors">
                              <td className="px-3 py-2 text-muted-foreground/50 tabular-nums select-none">{ri + 1}</td>
                              {row.map((cell, ci) => (
                                <td key={ci} className="px-3 py-2 font-mono text-foreground whitespace-nowrap">
                                  {cell}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground px-2 py-2">
                    <Table2 className="size-3" />
                    <span>{result.rows.length} satır · {result.columns.length} sütun · {result.executionMs}ms · mock mod</span>
                  </div>
                </div>
              )}

            </div>
          </div>
        </TabsContent>

      </Tabs>
    </PageContainer>
  );
}
