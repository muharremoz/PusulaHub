import { NextRequest, NextResponse } from "next/server"
import { getSupabaseServer } from "@/lib/supabase/server"
import { execOnAgent } from "@/lib/agent-poller"

/* Firma'nın Pusula program klasörü C:\MUSTERI\{firkod}. debugsql.txt hizmet klasöründe. */

interface AgentCreds { IP: string; AgentPort: number; ApiKey: string }
interface SrvCredRow { ip: string; agent_port: number | null; api_key: string | null }
const toCreds = (r: SrvCredRow | null): AgentCreds | null =>
  r && r.agent_port != null && r.api_key ? { IP: r.ip, AgentPort: r.agent_port, ApiKey: r.api_key } : null

async function getWinAgent(firkod: string, serverId?: string): Promise<AgentCreds | null> {
  const sb = await getSupabaseServer()
  if (serverId) {
    const { data } = await sb.schema("hub").from("servers").select("ip, agent_port, api_key").eq("id", serverId).maybeSingle()
    return toCreds(data as SrvCredRow | null)
  }
  const { data: c } = await sb.schema("hub").from("companies").select("windows_server_id").eq("company_id", firkod).maybeSingle()
  const wsid = (c as { windows_server_id: string | null } | null)?.windows_server_id
  if (!wsid) return null
  const { data } = await sb.schema("hub").from("servers").select("ip, agent_port, api_key").eq("id", wsid).maybeSingle()
  return toCreds(data as SrvCredRow | null)
}

interface WinServerOpt { Id: string; Name: string; IP: string }
async function listWinAgents(): Promise<WinServerOpt[]> {
  const sb = await getSupabaseServer()
  const { data } = await sb.schema("hub").from("servers").select("id, name, ip, agent_port, api_key").order("name")
  return ((data ?? []) as { id: string; name: string; ip: string; agent_port: number | null; api_key: string | null }[])
    .filter((s) => s.agent_port != null && s.api_key)
    .map((s) => ({ Id: s.id, Name: s.name, IP: s.ip }))
}

const getRoot = (firkod: string) => `C:\\MUSTERI\\${firkod}`
function psEscape(s: string): string { return s.replace(/'/g, "''") }

/* Alt-klasör adı sadece \ / : * ? " < > | gibi geçersiz karakterler içermesin */
function validSub(s: string): boolean {
  return !!s && /^[^\\\/:*?"<>|]+$/.test(s) && s !== "." && s !== ".."
}

/* GET /api/companies/[firkod]/debug
     ?folders=1          → alt klasörleri listele
     ?subfolder=Muhasebe → ilgili debugsql.txt içeriğini oku */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ firkod: string }> }
) {
  const { firkod } = await params
  const sp = req.nextUrl.searchParams
  try {
    if (sp.get("servers") === "1") {
      const servers = await listWinAgents()
      return NextResponse.json({ servers })
    }
    const serverId = sp.get("serverId") ?? undefined
    const agent = await getWinAgent(firkod, serverId)
    if (!agent) return NextResponse.json({ error: "Windows sunucusu tanımsız", needServer: true }, { status: 404 })
    const root = getRoot(firkod)

    if (sp.get("folders") === "1") {
      const cmd = `if(Test-Path '${psEscape(root)}'){ (Get-ChildItem -LiteralPath '${psEscape(root)}' -Directory -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Name) -join [char]10 } else { Write-Output '__NOROOT__' }`
      const res = await execOnAgent(agent.IP, agent.AgentPort, agent.ApiKey, cmd, 15)
      if (res.exitCode !== 0) return NextResponse.json({ error: res.stderr || "Klasör listelenemedi" }, { status: 500 })
      const raw = (res.stdout ?? "").trim()
      if (raw === "__NOROOT__") return NextResponse.json({ folders: [], root, missing: true })
      const folders = raw ? raw.split(/\r?\n/).map((x) => x.trim()).filter(Boolean) : []
      return NextResponse.json({ folders, root })
    }

    const sub = sp.get("subfolder") ?? ""
    if (!validSub(sub)) return NextResponse.json({ error: "subfolder geçersiz" }, { status: 400 })
    const path = `${root}\\${sub}\\debugsql.txt`
    const cmd = `if(Test-Path -LiteralPath '${psEscape(path)}'){ $tmp = Join-Path $env:TEMP ('debugsql_' + [guid]::NewGuid().ToString('N') + '.txt'); try { cmd /c copy /Y '${psEscape(path)}' $tmp | Out-Null; if(Test-Path -LiteralPath $tmp){ Get-Content -LiteralPath $tmp -Raw -Encoding Default } } finally { if(Test-Path -LiteralPath $tmp){ Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue } } } else { Write-Output '__NOFILE__' }`
    const res = await execOnAgent(agent.IP, agent.AgentPort, agent.ApiKey, cmd, 15)
    if (res.exitCode !== 0) return NextResponse.json({ error: res.stderr || "Okunamadı" }, { status: 500 })
    const raw = (res.stdout ?? "").trim()
    if (raw === "__NOFILE__") return NextResponse.json({ running: false, path, content: "" })
    return NextResponse.json({ running: true, path, content: res.stdout ?? "" })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}

/* POST /api/companies/[firkod]/debug
   Body: { action: "start" | "stop", subfolder: string } */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ firkod: string }> }
) {
  const { firkod } = await params
  try {
    const { action, subfolder, serverId } = (await req.json()) as { action?: "start" | "stop"; subfolder?: string; serverId?: string }
    if (action !== "start" && action !== "stop") {
      return NextResponse.json({ error: "action start veya stop olmalı" }, { status: 400 })
    }
    if (!validSub(subfolder ?? "")) {
      return NextResponse.json({ error: "subfolder zorunlu ve geçerli olmalı" }, { status: 400 })
    }
    const agent = await getWinAgent(firkod, serverId)
    if (!agent) return NextResponse.json({ error: "Windows sunucusu tanımsız", needServer: true }, { status: 404 })

    const folder = `${getRoot(firkod)}\\${subfolder}`
    const path = `${folder}\\debugsql.txt`
    const cmd = action === "start"
      ? `if(-not (Test-Path -LiteralPath '${psEscape(folder)}')){ Write-Error 'Klasör yok: ${psEscape(folder)}'; exit 1 }; New-Item -ItemType File -Force -Path '${psEscape(path)}' | Out-Null; if(Test-Path -LiteralPath '${psEscape(path)}'){ Write-Output 'OK' } else { Write-Error 'Dosya olusturulamadi'; exit 1 }`
      : `if(Test-Path -LiteralPath '${psEscape(path)}'){ Remove-Item -LiteralPath '${psEscape(path)}' -Force }; Write-Output 'OK'`

    const res = await execOnAgent(agent.IP, agent.AgentPort, agent.ApiKey, cmd, 15)
    const out = (res.stdout ?? "").trim()
    if (res.exitCode !== 0 || (action === "start" && !out.includes("OK"))) {
      return NextResponse.json({ error: res.stderr || res.stdout || "Agent komutu başarısız", stdout: res.stdout, stderr: res.stderr, exitCode: res.exitCode }, { status: 500 })
    }
    return NextResponse.json({ ok: true, path, stdout: out })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
