import { NextRequest, NextResponse } from "next/server"
import { query } from "@/lib/db"
import { execOnAgent } from "@/lib/agent-poller"

/* Firma'nın Pusula program klasörü C:\MUSTERI\{firkod} — içinde her hizmet için
   ayrı alt-klasör bulunur (Muhasebe, Stok, ...). debugsql.txt seçilen hizmet
   klasörünün içinde oluşur. */

interface AgentCreds { IP: string; AgentPort: number; ApiKey: string }

async function getWinAgent(firkod: string, serverId?: string): Promise<AgentCreds | null> {
  if (serverId) {
    const rows = await query<AgentCreds[]>`
      SELECT s.IP, s.AgentPort, s.ApiKey
      FROM Servers s
      WHERE s.Id = ${serverId} AND s.AgentPort IS NOT NULL AND s.ApiKey IS NOT NULL
    `
    return rows[0] ?? null
  }
  const rows = await query<AgentCreds[]>`
    SELECT s.IP, s.AgentPort, s.ApiKey
    FROM Companies c
    JOIN Servers s ON s.Id = c.WindowsServerId
    WHERE c.CompanyId = ${firkod} AND s.AgentPort IS NOT NULL AND s.ApiKey IS NOT NULL
  `
  return rows[0] ?? null
}

interface WinServerOpt { Id: string; Name: string; IP: string }
async function listWinAgents(): Promise<WinServerOpt[]> {
  return await query<WinServerOpt[]>`
    SELECT s.Id, s.Name, s.IP
    FROM Servers s
    WHERE s.AgentPort IS NOT NULL AND s.ApiKey IS NOT NULL AND s.ApiKey <> ''
    ORDER BY s.Name
  `
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
