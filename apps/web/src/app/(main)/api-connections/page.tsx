"use client";

import { useState } from "react";
import {
  CheckCircle2, XCircle, Loader2, Play, ChevronDown, ChevronRight,
  Cable, RefreshCw, Clock, Copy, Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";

// ─── API Tanimlari ──────────────────────────────────────────────────────────────

interface ApiParam {
  key: string;
  label: string;
  defaultValue: string;
  placeholder?: string;
  pathParam?: boolean;
}

interface Endpoint {
  id: string;
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  description: string;
  params?: ApiParam[];
  body?: string;
}

interface ApiServer {
  id: string;
  name: string;
  description: string;
  baseUrl: string;
  endpoints: Endpoint[];
}

const API_SERVERS: ApiServer[] = [
  {
    id: "agent-windows",
    name: "Windows Agent API",
    description: "DC-PRIMARY (192.168.1.10:3001) — Windows sunucu agent servisi",
    baseUrl: "http://192.168.1.10:3001",
    endpoints: [
      {
        id: "health",
        method: "GET",
        path: "/api/health",
        description: "Agent saglik durumu ve sistem bilgileri",
      },
      {
        id: "system-info",
        method: "GET",
        path: "/api/system/info",
        description: "CPU, RAM, Disk, OS detaylari",
      },
      {
        id: "system-processes",
        method: "GET",
        path: "/api/system/processes",
        description: "Calisan surecler listesi",
        params: [
          { key: "limit", label: "Limit", defaultValue: "20", placeholder: "20" },
        ],
      },
      {
        id: "ad-users",
        method: "GET",
        path: "/api/ad/users",
        description: "Active Directory kullanici listesi",
        params: [
          { key: "ou", label: "OU", defaultValue: "", placeholder: "OU=IT,DC=sirket,DC=local" },
        ],
      },
      {
        id: "ad-ou-list",
        method: "GET",
        path: "/api/ad/ou",
        description: "Organizasyon birimi (OU) agaci",
      },
      {
        id: "ad-user-create",
        method: "POST",
        path: "/api/ad/users",
        description: "Yeni AD kullanicisi olustur",
        body: `{
  "username": "test.user",
  "displayName": "Test User",
  "email": "test.user@sirket.local",
  "ou": "OU=IT,DC=sirket,DC=local",
  "password": "P@ssw0rd123"
}`,
      },
      {
        id: "ad-user-toggle",
        method: "PATCH",
        path: "/api/ad/users/:username",
        description: "Kullanici hesabini aktif/pasif yap",
        params: [
          { key: "username", label: "Username", defaultValue: "test.user", placeholder: "test.user", pathParam: true },
        ],
        body: `{ "enabled": false }`,
      },
      {
        id: "files-list",
        method: "GET",
        path: "/api/files/list",
        description: "Belirtilen dizindeki dosya ve klasorler",
        params: [
          { key: "path", label: "Dizin", defaultValue: "C:\\", placeholder: "C:\\" },
        ],
      },
      {
        id: "files-copy",
        method: "POST",
        path: "/api/files/copy",
        description: "Dosya veya klasor kopyala",
        body: `{
  "source": "C:\\\\Temp\\\\test.txt",
  "destination": "C:\\\\Backup\\\\test.txt"
}`,
      },
      {
        id: "iis-sites",
        method: "GET",
        path: "/api/iis/sites",
        description: "IIS web siteleri listesi",
      },
      {
        id: "iis-apppools",
        method: "GET",
        path: "/api/iis/apppools",
        description: "IIS uygulama havuzlari listesi",
      },
      {
        id: "iis-site-action",
        method: "POST",
        path: "/api/iis/sites/:name/action",
        description: "IIS sitesini baslat/durdur",
        params: [
          { key: "name", label: "Site Adi", defaultValue: "Default Web Site", placeholder: "Site adi", pathParam: true },
        ],
        body: `{ "action": "stop" }`,
      },
    ],
  },
  {
    id: "agent-sql",
    name: "SQL Server Agent API",
    description: "SQL-PROD (192.168.1.20:3001) — SQL Server yonetim agent'i",
    baseUrl: "http://192.168.1.20:3001",
    endpoints: [
      {
        id: "sql-health",
        method: "GET",
        path: "/api/health",
        description: "Agent saglik durumu",
      },
      {
        id: "sql-databases",
        method: "GET",
        path: "/api/sql/databases",
        description: "Veritabani listesi (ad, boyut, durum)",
      },
      {
        id: "sql-tables",
        method: "GET",
        path: "/api/sql/tables",
        description: "Belirtilen veritabanindaki tablolar",
        params: [
          { key: "db", label: "Veritabani", defaultValue: "ERP_Production", placeholder: "DB adi" },
        ],
      },
      {
        id: "sql-query",
        method: "POST",
        path: "/api/sql/query",
        description: "SQL sorgusu calistir (sadece SELECT)",
        body: `{
  "database": "ERP_Production",
  "query": "SELECT TOP 10 * FROM sys.tables"
}`,
      },
      {
        id: "sql-backup-status",
        method: "GET",
        path: "/api/sql/backup/status",
        description: "Son yedekleme durumu ve zamanlari",
      },
      {
        id: "sql-backup-run",
        method: "POST",
        path: "/api/sql/backup/run",
        description: "Manuel yedekleme baslat",
        body: `{ "database": "ERP_Production", "type": "Full" }`,
      },
    ],
  },
  {
    id: "agent-ubuntu",
    name: "Ubuntu Agent API",
    description: "UBUNTU-APP-01 (192.168.1.50:3001) — Linux sunucu agent servisi",
    baseUrl: "http://192.168.1.50:3001",
    endpoints: [
      {
        id: "ubuntu-health",
        method: "GET",
        path: "/api/health",
        description: "Agent saglik durumu ve uptime",
      },
      {
        id: "ubuntu-system",
        method: "GET",
        path: "/api/system/info",
        description: "Sistem bilgileri (CPU, RAM, Disk, OS)",
      },
      {
        id: "ubuntu-services",
        method: "GET",
        path: "/api/services",
        description: "Systemd servisleri listesi",
      },
      {
        id: "ubuntu-service-action",
        method: "POST",
        path: "/api/services/:name/action",
        description: "Servisi baslat/durdur/yeniden-baslat",
        params: [
          { key: "name", label: "Servis", defaultValue: "nginx", placeholder: "nginx", pathParam: true },
        ],
        body: `{ "action": "restart" }`,
      },
      {
        id: "ubuntu-docker",
        method: "GET",
        path: "/api/docker/containers",
        description: "Docker container listesi",
      },
      {
        id: "ubuntu-logs",
        method: "GET",
        path: "/api/logs",
        description: "Sistem loglari (journalctl)",
        params: [
          { key: "service", label: "Servis", defaultValue: "", placeholder: "nginx" },
          { key: "lines", label: "Satir", defaultValue: "50", placeholder: "50" },
        ],
      },
    ],
  },
];

// ─── Yardimcilar ────────────────────────────────────────────────────────────────

const MOCK_RESPONSES: Record<string, unknown> = {
  "/api/health": { status: "ok", uptime: "45 gun", version: "1.0.0", hostname: "DC-PRIMARY" },
  "/api/system/info": { hostname: "DC-PRIMARY", os: "Windows Server 2022", cpu: { cores: 8, usage: 35 }, ram: { total: "32 GB", used: "20 GB", percent: 62 }, disk: { total: "500 GB", used: "225 GB", percent: 45 } },
  "/api/system/processes": { total: 142, processes: [{ name: "svchost.exe", pid: 1024, cpu: 2.1, memory: 45 }, { name: "sqlservr.exe", pid: 2048, cpu: 15.3, memory: 1240 }, { name: "w3wp.exe", pid: 3072, cpu: 5.2, memory: 320 }] },
  "/api/ad/users": { count: 8, users: [{ username: "ahmet.yilmaz", displayName: "Ahmet Yilmaz", enabled: true }, { username: "mehmet.kaya", displayName: "Mehmet Kaya", enabled: true }] },
  "/api/ad/ou": { name: "sirket.local", children: [{ name: "IT", userCount: 3 }, { name: "Muhasebe", userCount: 1 }] },
  "/api/sql/databases": { databases: [{ name: "ERP_Production", sizeMB: 15360, status: "Online" }, { name: "HR_System", sizeMB: 2048, status: "Online" }] },
  "/api/sql/tables": { database: "ERP_Production", tables: [{ name: "Users", rows: 1250 }, { name: "Orders", rows: 45000 }, { name: "Products", rows: 3200 }] },
  "/api/iis/sites": { sites: [{ name: "Kurumsal Web", status: "Started", binding: "https://www.sirket.com:443" }, { name: "Intranet Portal", status: "Started", binding: "http://intranet.sirket.local:80" }] },
  "/api/iis/apppools": { pools: [{ name: "KurumsalPool", status: "Started", runtime: "v4.0" }, { name: "ApiPool", status: "Started", runtime: "No Managed Code" }] },
  "/api/services": { services: [{ name: "nginx", status: "running" }, { name: "docker", status: "running" }, { name: "postgresql", status: "stopped" }] },
  "/api/docker/containers": { containers: [{ name: "app-frontend", image: "node:18", status: "Up 5 days" }, { name: "app-backend", image: "python:3.11", status: "Up 5 days" }] },
};

function methodColor(m: string) {
  if (m === "GET")    return "bg-emerald-100 text-emerald-700";
  if (m === "POST")   return "bg-blue-100 text-blue-700";
  if (m === "PATCH")  return "bg-amber-100 text-amber-700";
  if (m === "DELETE") return "bg-red-100 text-red-600";
  return "bg-muted text-muted-foreground";
}

function formatJson(data: unknown) {
  try { return JSON.stringify(data, null, 2); } catch { return String(data); }
}

function timeAgo(ms: number) {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

// ─── Endpoint Satiri ────────────────────────────────────────────────────────────

interface EndpointResult {
  ok: boolean;
  status: number;
  data: unknown;
  error?: string;
  duration?: number;
}

function EndpointRow({ endpoint, baseUrl }: { endpoint: Endpoint; baseUrl: string }) {
  const [open, setOpen] = useState(false);
  const [params, setParams] = useState<Record<string, string>>(
    Object.fromEntries((endpoint.params ?? []).map((p) => [p.key, p.defaultValue]))
  );
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<EndpointResult | null>(null);
  const [copied, setCopied] = useState(false);

  function buildUrl() {
    let path = endpoint.path;
    const queryParams: Record<string, string> = {};
    for (const p of endpoint.params ?? []) {
      if (p.pathParam) {
        path = path.replace(`:${p.key}`, params[p.key] ?? p.defaultValue);
      } else {
        if (params[p.key]) queryParams[p.key] = params[p.key];
      }
    }
    const qs = new URLSearchParams(queryParams).toString();
    return baseUrl + path + (qs ? "?" + qs : "");
  }

  async function run() {
    setLoading(true);
    setOpen(true);
    const start = Date.now();

    // Mock mode: simulate response
    await new Promise((r) => setTimeout(r, 300 + Math.random() * 700));

    const basePath = endpoint.path.replace(/\/:[^/]+/g, "");
    const mockData = MOCK_RESPONSES[basePath] ?? { message: "Mock response - agent baglantisi kuruldugunda gercek veri gelecek" };

    setResult({
      ok: true,
      status: 200,
      data: mockData,
      duration: Date.now() - start,
    });
    setLoading(false);
  }

  function copyResult() {
    navigator.clipboard.writeText(formatJson(result?.data ?? result));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const resultText = formatJson(result?.data ?? null);
  const lineCount = resultText.split("\n").length;

  return (
    <div className="border-b border-border/40 last:border-0">
      {/* Row header */}
      <div className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/20 transition-colors">
        <button
          type="button"
          className="flex items-center gap-3 flex-1 min-w-0 text-left"
          onClick={() => setOpen((o) => !o)}
        >
          {open ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-[4px] shrink-0 ${methodColor(endpoint.method)}`}>
            {endpoint.method}
          </span>
          <code className="text-[12px] font-mono text-foreground shrink-0">{endpoint.path}</code>
          <span className="text-[11px] text-muted-foreground truncate">{endpoint.description}</span>
        </button>

        {/* Status pill */}
        {result && (
          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-[4px] shrink-0 flex items-center gap-1 ${
            result.ok ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600"
          }`}>
            {result.ok ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
            {result.status || "ERR"}
            {result.duration != null && <span className="opacity-70">· {timeAgo(result.duration)}</span>}
          </span>
        )}

        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 shrink-0"
          onClick={run}
          disabled={loading}
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
        </Button>
      </div>

      {/* Expanded */}
      {open && (
        <div className="px-10 pb-4 space-y-3">
          {/* Params */}
          {endpoint.params && endpoint.params.length > 0 && (
            <div className="flex flex-wrap gap-3">
              {endpoint.params.map((p) => (
                <div key={p.key} className="flex flex-col gap-0.5">
                  <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">{p.label}</label>
                  <input
                    value={params[p.key] ?? ""}
                    onChange={(e) => setParams((prev) => ({ ...prev, [p.key]: e.target.value }))}
                    placeholder={p.placeholder}
                    className="text-[12px] font-mono border border-input rounded-[5px] px-2.5 py-1.5 bg-background outline-none focus:ring-1 focus:ring-ring w-64"
                  />
                </div>
              ))}
            </div>
          )}

          {/* Body preview */}
          {endpoint.body && (
            <div>
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">REQUEST BODY</p>
              <pre className="text-[11px] font-mono bg-muted/30 rounded-[5px] px-3 py-2 overflow-auto max-h-40">{endpoint.body}</pre>
            </div>
          )}

          {/* Request URL preview */}
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <span className="font-medium">URL:</span>
            <code className="font-mono bg-muted/50 px-2 py-0.5 rounded text-[10px] break-all">{buildUrl()}</code>
          </div>

          {/* Response */}
          {result && (
            <div className="rounded-[6px] border border-border overflow-hidden">
              <div className="flex items-center justify-between px-3 py-1.5 bg-muted/30 border-b border-border/40">
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  <span>{timeAgo(result.duration ?? 0)}</span>
                  <span>·</span>
                  <span>{lineCount} satir</span>
                  {result.error && <span className="text-red-500">· {result.error}</span>}
                </div>
                <button
                  onClick={copyResult}
                  className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                >
                  {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                  {copied ? "Kopyalandi" : "Kopyala"}
                </button>
              </div>
              <pre className="text-[11px] font-mono p-3 overflow-auto max-h-80 bg-[#1e1e1e] text-[#d4d4d4] leading-relaxed">
                {resultText}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Server Karti ───────────────────────────────────────────────────────────────

function ServerCard({ server }: { server: ApiServer }) {
  const [pingResult, setPingResult] = useState<{ ok: boolean; duration: number } | null>(null);
  const [pinging, setPinging] = useState(false);

  async function ping() {
    setPinging(true);
    const start = Date.now();
    // Mock ping
    await new Promise((r) => setTimeout(r, 200 + Math.random() * 300));
    setPingResult({ ok: true, duration: Date.now() - start });
    setPinging(false);
  }

  return (
    <div className="flex flex-col rounded-[8px] p-2 pb-0" style={{ backgroundColor: "#F4F2F0" }}>
      <div className="rounded-[4px]" style={{ backgroundColor: "#FFFFFF", boxShadow: "0 2px 4px rgba(0,0,0,0.06)" }}>

        {/* Card header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/40">
          <div className="flex items-center gap-3">
            <Cable className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-sm font-semibold">{server.name}</p>
              <p className="text-[11px] text-muted-foreground">{server.description}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <code className="text-[10px] font-mono bg-muted/50 px-2 py-1 rounded-[4px] text-muted-foreground">
              {server.baseUrl}
            </code>
            {pingResult && (
              <span className={`flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-[4px] ${
                pingResult.ok ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600"
              }`}>
                {pingResult.ok
                  ? <><CheckCircle2 className="h-3 w-3" />Erisilebilir</>
                  : <><XCircle className="h-3 w-3" />Erisileemiyor</>}
                <span className="opacity-70">· {timeAgo(pingResult.duration)}</span>
              </span>
            )}
            <Button variant="outline" className="h-7 text-[11px] rounded-[5px] gap-1.5" onClick={ping} disabled={pinging}>
              {pinging ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Ping
            </Button>
          </div>
        </div>

        {/* Endpoints */}
        {server.endpoints.map((ep) => (
          <EndpointRow key={ep.id} endpoint={ep} baseUrl={server.baseUrl} />
        ))}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between text-[11px] text-muted-foreground px-2 py-2">
        <span>{server.endpoints.length} endpoint</span>
        <span>{server.baseUrl}</span>
      </div>
    </div>
  );
}

// ─── Ana Sayfa ──────────────────────────────────────────────────────────────────

export default function ApiConnectionsPage() {
  return (
    <div className="flex-1 flex flex-col min-h-screen">
      <header className="flex items-center justify-between h-14 px-6 border-b border-border/40 bg-white shrink-0">
        <div>
          <h1 className="text-base font-semibold tracking-tight">API Baglantilari</h1>
          <p className="text-[11px] text-muted-foreground">Dis servis baglantilarini izle ve test et</p>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground px-3 py-1.5 rounded-[6px] bg-muted/40">
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-amber-500" />
          </span>
          Mock mod — agent baglantisi bekleniyor
        </div>
      </header>

      <main className="flex-1 p-6 bg-[#F9F8F7]">
        <div className="space-y-4">
          {API_SERVERS.map((server) => (
            <ServerCard key={server.id} server={server} />
          ))}
        </div>
      </main>
    </div>
  );
}
