"use client"

import { useEffect, useState, useCallback } from "react"
import { PageContainer } from "@/components/layout/page-container"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import {
  MoreVertical,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  Database,
  Play,
  Download,
  Loader2,
  Table2,
  Bookmark,
  FileText,
  Braces,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  ServerOff,
  AlertTriangle,
  Info,
} from "lucide-react"
import type { SqlServerItem } from "@/app/api/setup/sql-servers/route"
import type { SqlDatabaseItem, SqlDatabasesResponse } from "@/app/api/setup/sql-servers/[id]/databases/route"
import type { ExecuteResponse } from "@/app/api/sql/execute/route"

/* ── Tipler ─────────────────────────────────────────────── */
interface FlatDb extends SqlDatabaseItem {
  uid:        string   // `${serverId}::${name}`
  serverId:   string
  serverName: string
}

type SortKey = "name" | "serverName" | "sizeMB" | "state" | "createDate"
type SortDir = "asc" | "desc"

/* ── Kayıtlı Sorgular (statik — sistem sorguları) ───────── */
const SAVED_QUERIES = [
  {
    id:  "sq-1",
    name: "Aktif Tablolar",
    db:   "master",
    sql:  "SELECT name, object_id, type_desc\nFROM sys.tables\nWHERE type = 'U'\nORDER BY name",
  },
  {
    id:  "sq-2",
    name: "Büyük Tablolar",
    db:   "master",
    sql:  "SELECT t.name, p.rows AS [Satir Sayisi]\nFROM sys.tables t\nINNER JOIN sys.partitions p\n  ON t.object_id = p.object_id\nWHERE p.index_id IN (0,1)\nORDER BY p.rows DESC",
  },
  {
    id:  "sq-3",
    name: "Son Yedekler",
    db:   "msdb",
    sql:  "SELECT database_name,\n       backup_finish_date,\n       type\nFROM msdb.dbo.backupset\nORDER BY backup_finish_date DESC",
  },
  {
    id:  "sq-4",
    name: "Aktif Bağlantılar",
    db:   "master",
    sql:  "SELECT session_id, login_name,\n       host_name, program_name, status\nFROM sys.dm_exec_sessions\nWHERE is_user_process = 1",
  },
  {
    id:  "sq-5",
    name: "İndex Kullanımı",
    db:   "master",
    sql:  "SELECT OBJECT_NAME(i.object_id) AS TableName,\n       i.name AS IndexName,\n       ius.user_seeks,\n       ius.user_scans\nFROM sys.indexes i\nJOIN sys.dm_db_index_usage_stats ius\n  ON i.object_id = ius.object_id\n  AND i.index_id = ius.index_id\nORDER BY ius.user_seeks DESC",
  },
  {
    id:  "sq-6",
    name: "Veritabanı Boyutları",
    db:   "master",
    sql:  "SELECT\n  name AS [Veritabani],\n  size * 8 / 1024 AS [Boyut (MB)]\nFROM sys.master_files\nWHERE type = 0\nORDER BY size DESC",
  },
]

/* ── Yardımcılar ─────────────────────────────────────────── */
function formatSize(mb: number): string {
  if (!mb || mb < 0) return "0 MB"
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`
  return `${mb} MB`
}

function formatDate(iso: string): string {
  if (!iso) return "—"
  try {
    return new Date(iso).toLocaleDateString("tr-TR", {
      day: "2-digit", month: "2-digit", year: "numeric",
    })
  } catch { return iso }
}

const STATE_BADGE: Record<string, string> = {
  ONLINE:     "bg-emerald-50 text-emerald-700 border-emerald-200",
  OFFLINE:    "bg-muted text-muted-foreground border-border",
  RESTORING:  "bg-amber-50 text-amber-700 border-amber-200",
  RECOVERING: "bg-blue-50 text-blue-700 border-blue-200",
  SUSPECT:    "bg-red-50 text-red-700 border-red-200",
}
const STATE_DOT: Record<string, string> = {
  ONLINE:     "bg-emerald-500",
  OFFLINE:    "bg-slate-300",
  RESTORING:  "bg-amber-400",
  RECOVERING: "bg-blue-400",
  SUSPECT:    "bg-red-500",
}

function downloadCSV(columns: string[], rows: string[][]) {
  const header = columns.join(",")
  const body   = rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n")
  const blob   = new Blob([header + "\n" + body], { type: "text/csv;charset=utf-8;" })
  const url    = URL.createObjectURL(blob)
  const a      = document.createElement("a")
  a.href = url; a.download = "sorgu_sonucu.csv"; a.click()
  URL.revokeObjectURL(url)
}

function downloadJSON(columns: string[], rows: string[][]) {
  const data = rows.map((r) => Object.fromEntries(columns.map((c, i) => [c, r[i]])))
  const blob  = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })
  const url   = URL.createObjectURL(blob)
  const a     = document.createElement("a")
  a.href = url; a.download = "sorgu_sonucu.json"; a.click()
  URL.revokeObjectURL(url)
}

/* ── SortHeader ─────────────────────────────────────────── */
function SortHeader({ label, sortKey, active, dir, onSort }: {
  label:   string
  sortKey: SortKey
  active:  SortKey
  dir:     SortDir
  onSort:  (k: SortKey) => void
}) {
  const isActive = active === sortKey
  return (
    <button
      onClick={() => onSort(sortKey)}
      className={cn(
        "flex items-center gap-1 text-[10px] font-medium tracking-wide uppercase transition-colors select-none",
        isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
      <span className="shrink-0">
        {isActive
          ? dir === "asc" ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />
          : <ChevronsUpDown className="size-3 opacity-40" />}
      </span>
    </button>
  )
}

/* ══════════════════════════════════════════════════════════
   Ana Bileşen
══════════════════════════════════════════════════════════ */
export default function SQLPage() {

  /* ── SQL Sunucuları ── */
  const [sqlServers,     setSqlServers]     = useState<SqlServerItem[]>([])
  const [serversLoading, setServersLoading] = useState(true)
  const [serversError,   setServersError]   = useState<string | null>(null)

  /* ── Veritabanları (tüm sunuculardan düzleştirilmiş) ── */
  const [databases,   setDatabases]   = useState<FlatDb[]>([])
  const [dbsLoading,  setDbsLoading]  = useState(false)

  /* ── Tablo sıralama ── */
  const [sortKey, setSortKey] = useState<SortKey>("name")
  const [sortDir, setSortDir] = useState<SortDir>("asc")

  /* ── Sorgu Editörü ── */
  const [editorServerId, setEditorServerId] = useState<string>("")
  const [editorDb,       setEditorDb]       = useState<string>("")
  const [sql,            setSql]            = useState("SELECT TOP 10 * FROM sys.tables\nORDER BY name")
  const [selectedSaved,  setSelectedSaved]  = useState<string | null>(null)
  const [isRunning,      setIsRunning]      = useState(false)
  const [result,         setResult]         = useState<ExecuteResponse | null>(null)
  const [queryError,     setQueryError]     = useState<string | null>(null)

  /* ── Sunucuları fetch et ── */
  useEffect(() => {
    setServersLoading(true)
    setServersError(null)
    fetch("/api/setup/sql-servers")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setSqlServers(data as SqlServerItem[])
        else setServersError((data as { error?: string }).error ?? "SQL sunucuları alınamadı")
      })
      .catch(() => setServersError("SQL sunucu API bağlantı hatası"))
      .finally(() => setServersLoading(false))
  }, [])

  /* ── Sunucular yüklendikten sonra veritabanlarını fetch et ── */
  const fetchDatabases = useCallback((servers: SqlServerItem[]) => {
    const online = servers.filter((s) => s.isOnline)
    if (online.length === 0) return

    setDbsLoading(true)
    Promise.allSettled(
      online.map((srv) =>
        fetch(`/api/setup/sql-servers/${encodeURIComponent(srv.id)}/databases`)
          .then((r) => r.json())
          .then((data: SqlDatabasesResponse | { error: string }) => ({ srv, data })),
      ),
    ).then((results) => {
      const flat: FlatDb[] = []
      for (const r of results) {
        if (r.status !== "fulfilled") continue
        const { srv, data } = r.value
        if ("error" in data) continue
        for (const db of data.databases) {
          flat.push({
            ...db,
            uid:        `${srv.id}::${db.name}`,
            serverId:   srv.id,
            serverName: srv.name,
          })
        }
      }
      setDatabases(flat)
    }).finally(() => setDbsLoading(false))
  }, [])

  useEffect(() => {
    if (sqlServers.length > 0) fetchDatabases(sqlServers)
  }, [sqlServers, fetchDatabases])

  /* ── İlk online sunucuyu editörde varsayılan seç ── */
  useEffect(() => {
    if (!editorServerId && sqlServers.length > 0) {
      const first = sqlServers.find((s) => s.isOnline) ?? sqlServers[0]
      setEditorServerId(first.id)
    }
  }, [sqlServers, editorServerId])

  /* ── Editör: sunucu değişince DB'yi sıfırla ── */
  useEffect(() => {
    setEditorDb("")
  }, [editorServerId])

  /* ── Sıralama ── */
  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    else { setSortKey(key); setSortDir("asc") }
  }

  const sorted = [...databases].sort((a, b) => {
    const mul = sortDir === "asc" ? 1 : -1
    if (sortKey === "sizeMB") return (a.sizeMB - b.sizeMB) * mul
    const av = String(a[sortKey] ?? "")
    const bv = String(b[sortKey] ?? "")
    return av.localeCompare(bv) * mul
  })

  /* ── Sorgu çalıştır ── */
  const handleRun = async () => {
    if (!sql.trim() || isRunning || !editorServerId || !editorDb) return
    setIsRunning(true)
    setResult(null)
    setQueryError(null)
    try {
      const r = await fetch("/api/sql/execute", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ serverId: editorServerId, database: editorDb, sql: sql.trim() }),
      })
      const data = await r.json() as ExecuteResponse | { error: string }
      if (!r.ok || "error" in data) {
        setQueryError(("error" in data ? data.error : null) ?? "Sorgu çalıştırılamadı")
      } else {
        setResult(data)
      }
    } catch {
      setQueryError("Sunucu bağlantı hatası")
    } finally {
      setIsRunning(false)
    }
  }

  const loadSaved = (sq: typeof SAVED_QUERIES[number]) => {
    setSql(sq.sql)
    setEditorDb(sq.db)
    setSelectedSaved(sq.id)
    setResult(null)
    setQueryError(null)
  }

  /* ── Editörde seçili sunucunun DB'leri ── */
  const editorDbs = databases.filter((d) => d.serverId === editorServerId)
  const canRun    = !!editorServerId && !!editorDb && !!sql.trim() && !isRunning

  /* ══════════════════════════════════════
     Render
  ══════════════════════════════════════ */
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
              <div className="grid grid-cols-[16px_2fr_1fr_90px_100px_120px_28px] gap-3 px-3 py-2 bg-muted/30 border-b border-border/40 items-center">
                <span />
                <SortHeader label="Veritabanı"   sortKey="name"       active={sortKey} dir={sortDir} onSort={handleSort} />
                <SortHeader label="Sunucu"        sortKey="serverName" active={sortKey} dir={sortDir} onSort={handleSort} />
                <SortHeader label="Boyut"         sortKey="sizeMB"     active={sortKey} dir={sortDir} onSort={handleSort} />
                <SortHeader label="Durum"         sortKey="state"      active={sortKey} dir={sortDir} onSort={handleSort} />
                <SortHeader label="Oluşturulma"   sortKey="createDate" active={sortKey} dir={sortDir} onSort={handleSort} />
                <button
                  onClick={() => fetchDatabases(sqlServers)}
                  disabled={dbsLoading || serversLoading}
                  title="Yenile"
                  className="flex items-center justify-center size-5 rounded-[3px] hover:bg-muted/60 transition-colors disabled:opacity-40"
                >
                  {dbsLoading
                    ? <Loader2 className="size-3 animate-spin text-muted-foreground" />
                    : <RefreshCw className="size-3 text-muted-foreground" />}
                </button>
              </div>

              {/* Hata */}
              {serversError && (
                <div className="flex items-center gap-2 px-3 py-3 text-[11px] text-red-600">
                  <AlertTriangle className="size-3.5 shrink-0" />
                  {serversError}
                </div>
              )}

              {/* Yükleniyor */}
              {(serversLoading || dbsLoading) && !serversError && (
                <div className="divide-y divide-border/40">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="grid grid-cols-[16px_2fr_1fr_90px_100px_120px_28px] gap-3 px-3 py-3 items-center">
                      <Skeleton className="size-1.5 rounded-full" />
                      <Skeleton className="h-3 w-40 rounded-[4px]" />
                      <Skeleton className="h-3 w-24 rounded-[4px]" />
                      <Skeleton className="h-3 w-16 rounded-[4px]" />
                      <Skeleton className="h-5 w-16 rounded-[4px]" />
                      <Skeleton className="h-3 w-24 rounded-[4px]" />
                      <span />
                    </div>
                  ))}
                </div>
              )}

              {/* Boş */}
              {!serversLoading && !dbsLoading && !serversError && databases.length === 0 && (
                <div className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center">
                  <ServerOff className="size-7 text-muted-foreground" />
                  <p className="text-[12px] font-medium">Veritabanı bulunamadı</p>
                  <p className="text-[10px] text-muted-foreground">
                    SQL rolüne sahip sunucu tanımlanmamış veya sunucular çevrimdışı.
                  </p>
                  <a
                    href="/servers"
                    className="mt-1 text-[11px] font-medium px-3 py-1.5 rounded-[5px] bg-foreground text-background hover:bg-foreground/90 transition-colors"
                  >
                    Sunuculara Git
                  </a>
                </div>
              )}

              {/* Liste */}
              {!serversLoading && !dbsLoading && databases.length > 0 && (
                <div className="divide-y divide-border/40">
                  {sorted.map((db) => {
                    const stateKey = (db.state ?? "").toUpperCase()
                    return (
                      <div
                        key={db.uid}
                        className="grid grid-cols-[16px_2fr_1fr_90px_100px_120px_28px] gap-3 px-3 py-2.5 hover:bg-muted/20 transition-colors items-center"
                      >
                        <span className="flex items-center justify-center">
                          <span className="relative flex size-1.5">
                            {stateKey === "ONLINE" && (
                              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                            )}
                            <span className={cn("relative inline-flex size-1.5 rounded-full", STATE_DOT[stateKey] ?? "bg-slate-300")} />
                          </span>
                        </span>
                        <div className="flex items-center gap-2 min-w-0">
                          <Database className="size-3 text-muted-foreground shrink-0" />
                          <span className="text-[11px] font-medium truncate font-mono">{db.name}</span>
                        </div>
                        <span className="text-[11px] text-muted-foreground truncate">{db.serverName}</span>
                        <span className="text-[11px] tabular-nums text-muted-foreground">{formatSize(db.sizeMB)}</span>
                        <span className={cn(
                          "text-[9px] font-medium px-1.5 py-0.5 rounded-[4px] border w-fit",
                          STATE_BADGE[stateKey] ?? "bg-muted text-muted-foreground border-border",
                        )}>
                          {stateKey}
                        </span>
                        <span className="text-[10px] text-muted-foreground tabular-nums">{formatDate(db.createDate)}</span>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button className="flex items-center justify-center h-6 w-6 rounded-[4px] hover:bg-muted/60 transition-colors shrink-0">
                              <MoreVertical className="h-3.5 w-3.5 text-muted-foreground" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="rounded-[6px]">
                            <DropdownMenuItem
                              className="text-xs cursor-pointer"
                              onClick={() => {
                                setEditorServerId(db.serverId)
                                setEditorDb(db.name)
                                const tabs = document.querySelector('[data-value="editor"]') as HTMLElement | null
                                tabs?.click()
                              }}
                            >
                              Sorgula
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-xs cursor-pointer text-muted-foreground" disabled>
                              Yedek Al (yakında)
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground px-2 py-2">
              <Database className="size-3" />
              {dbsLoading
                ? <span>Veritabanları yükleniyor…</span>
                : <span>{databases.length} veritabanı · {sqlServers.length} SQL sunucusu</span>}
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
                <div className="px-3 py-2 bg-muted/30 border-b border-border/40">
                  <p className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase">Kayıtlı Sorgular</p>
                </div>
                <div className="divide-y divide-border/40">
                  {SAVED_QUERIES.map((sq) => (
                    <button
                      key={sq.id}
                      onClick={() => loadSaved(sq)}
                      className={cn(
                        "w-full text-left px-3 py-2.5 hover:bg-muted/20 transition-colors",
                        selectedSaved === sq.id && "bg-muted/30",
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
                  {/* Editör Header — Sunucu + DB seçimi + Çalıştır */}
                  <div className="flex items-center gap-2 px-3 py-2 bg-muted/30 border-b border-border/40">
                    {/* Sunucu */}
                    <Select
                      value={editorServerId}
                      onValueChange={setEditorServerId}
                      disabled={serversLoading || sqlServers.length === 0}
                    >
                      <SelectTrigger className="h-7 w-[160px] text-[11px] rounded-[5px] font-mono border-border/50 bg-background">
                        <SelectValue placeholder={serversLoading ? "Yükleniyor…" : "Sunucu seçin"} />
                      </SelectTrigger>
                      <SelectContent className="rounded-[5px]">
                        {sqlServers.map((s) => (
                          <SelectItem key={s.id} value={s.id} className="text-[11px] font-mono">
                            {s.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {/* Veritabanı */}
                    <Select
                      value={editorDb}
                      onValueChange={setEditorDb}
                      disabled={!editorServerId || dbsLoading}
                    >
                      <SelectTrigger className="h-7 w-[200px] text-[11px] rounded-[5px] font-mono border-border/50 bg-background">
                        <SelectValue placeholder={dbsLoading ? "Yükleniyor…" : "Veritabanı seçin"} />
                      </SelectTrigger>
                      <SelectContent className="rounded-[5px]">
                        {/* Sistem veritabanları */}
                        <SelectGroup>
                          <SelectLabel className="text-[9px]">Sistem</SelectLabel>
                          {["master", "msdb", "model"].map((sdb) => (
                            <SelectItem key={sdb} value={sdb} className="text-[11px] font-mono">{sdb}</SelectItem>
                          ))}
                        </SelectGroup>
                        {/* Kullanıcı veritabanları */}
                        {editorDbs.length > 0 && (
                          <SelectGroup>
                            <SelectLabel className="text-[9px]">Kullanıcı Veritabanları</SelectLabel>
                            {editorDbs.map((db) => (
                              <SelectItem key={db.name} value={db.name} className="text-[11px] font-mono">
                                {db.name}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        )}
                      </SelectContent>
                    </Select>

                    <div className="ml-auto flex items-center gap-2">
                      <span className="text-[10px] text-muted-foreground">
                        {sql.trim().split(/\s+/).filter(Boolean).length} kelime
                      </span>
                      <button
                        onClick={handleRun}
                        disabled={!canRun}
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
                  <Textarea
                    value={sql}
                    onChange={(e) => setSql(e.target.value)}
                    onKeyDown={(e) => {
                      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                        e.preventDefault()
                        handleRun()
                      }
                      if (e.key === "Tab") {
                        e.preventDefault()
                        const el  = e.currentTarget
                        const s   = el.selectionStart
                        const end = el.selectionEnd
                        const val = el.value
                        const next = val.substring(0, s) + "  " + val.substring(end)
                        setSql(next)
                        requestAnimationFrame(() => { el.selectionStart = el.selectionEnd = s + 2 })
                      }
                    }}
                    className="rounded-none border-0 border-b border-border/40 text-[12px] font-mono resize-none min-h-[180px] bg-zinc-950 text-zinc-100 placeholder:text-zinc-600 focus-visible:ring-0 focus-visible:ring-offset-0"
                    placeholder="-- SQL sorgunuzu buraya yazın…"
                    spellCheck={false}
                  />

                  {/* Editör Footer */}
                  <div className="flex items-center gap-3 px-3 py-1.5">
                    <span className="text-[10px] text-muted-foreground">Ctrl+Enter ile çalıştır · Tab ile girinti</span>
                    {!canRun && !isRunning && (
                      <span className="flex items-center gap-1 text-[10px] text-amber-600">
                        <Info className="size-3" />
                        {!editorServerId ? "Sunucu seçin" : !editorDb ? "Veritabanı seçin" : ""}
                      </span>
                    )}
                  </div>
                </div>
                <div className="h-2" />
              </div>

              {/* Hata Mesajı */}
              {queryError && (
                <div className="rounded-[8px] p-2 pb-0" style={{ backgroundColor: "#F4F2F0" }}>
                  <div
                    className="rounded-[4px] overflow-hidden"
                    style={{ backgroundColor: "#FFFFFF", boxShadow: "0 2px 4px rgba(0,0,0,0.06)" }}
                  >
                    <div className="flex items-start gap-2 px-3 py-3">
                      <AlertCircle className="size-4 text-destructive shrink-0 mt-0.5" />
                      <div>
                        <p className="text-[11px] font-medium text-destructive">Sorgu çalıştırılamadı</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5 font-mono">{queryError}</p>
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
                      {result.truncated && (
                        <span className="flex items-center gap-1 text-[10px] text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-[4px]">
                          <Info className="size-3" />
                          İlk 1.000 satır
                        </span>
                      )}

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
                          <Braces className="size-3" />
                          JSON
                        </button>
                        <button
                          onClick={() => downloadJSON(result.columns, result.rows)}
                          className="flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-[5px] border border-border/60 hover:bg-muted/40 transition-colors text-muted-foreground hover:text-foreground"
                        >
                          <Download className="size-3" />
                          İndir
                        </button>
                      </div>
                    </div>

                    {/* Tablo */}
                    {result.columns.length === 0 ? (
                      <div className="flex items-center gap-2 px-3 py-3 text-[11px] text-muted-foreground">
                        <CheckCircle2 className="size-3.5 text-emerald-600" />
                        Sorgu başarıyla çalıştırıldı, sonuç döndürülmedi.
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-[11px]">
                          <thead>
                            <tr className="border-b border-border/40 bg-muted/20">
                              <th className="text-left px-3 py-2 text-[10px] font-medium text-muted-foreground tracking-wide uppercase w-10 tabular-nums">#</th>
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
                                  <td key={ci} className="px-3 py-2 font-mono text-foreground whitespace-nowrap max-w-[300px] truncate">
                                    {cell === "" ? <span className="text-muted-foreground/40 italic">NULL</span> : cell}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  {/* Footer */}
                  <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground px-2 py-2">
                    <Table2 className="size-3" />
                    <span>
                      {result.rows.length} satır · {result.columns.length} sütun · {result.executionMs}ms
                      {result.truncated && ` · toplam ${result.rowCount} satırın ilk 1.000'i`}
                    </span>
                  </div>
                </div>
              )}

            </div>
          </div>
        </TabsContent>

      </Tabs>
    </PageContainer>
  )
}
