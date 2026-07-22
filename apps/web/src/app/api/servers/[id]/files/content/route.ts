import { NextRequest, NextResponse } from "next/server"
import { findServerBy } from "@/lib/hub-servers"
import { execOnAgent } from "@/lib/agent-poller"

const MAX_PREVIEW_BYTES  = 5  * 1024 * 1024  // 5 MB
const MAX_DOWNLOAD_BYTES = 100 * 1024 * 1024  // 100 MB

const MIME: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
  gif: "image/gif",  bmp: "image/bmp",  webp: "image/webp",
  svg: "image/svg+xml", ico: "image/x-icon", tiff: "image/tiff",
  pdf: "application/pdf",
  txt: "text/plain", log: "text/plain", ini: "text/plain",
  cfg: "text/plain", conf: "text/plain", md: "text/plain",
  xml: "text/xml", json: "application/json", csv: "text/csv",
  html: "text/html", htm: "text/html", css: "text/css",
  js: "text/javascript", ts: "text/plain", tsx: "text/plain",
  cs: "text/plain", ps1: "text/plain", bat: "text/plain",
  cmd: "text/plain", sql: "text/plain",
  yaml: "text/plain", yml: "text/plain", config: "text/plain",
}

function validatePath(p: string): boolean {
  if (!p) return false
  if (!/^[A-Za-z]:[\\\/]/.test(p)) return false
  if (p.includes("..")) return false
  return true
}

function psEscape(s: string): string {
  return s.replace(/'/g, "''")
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const rawPath = req.nextUrl.searchParams.get("path") ?? ""
  const mode    = req.nextUrl.searchParams.get("mode") ?? "download" // "download" | "preview"

  if (!validatePath(rawPath)) {
    return NextResponse.json({ error: "Geçersiz path" }, { status: 400 })
  }

  try {
    const srv = await findServerBy(id, "ip, agent_port, api_key") as
      { ip: string; agent_port: number | null; api_key: string | null } | null
    if (!srv || !srv.agent_port || !srv.api_key) {
      return NextResponse.json({ error: "Sunucu bulunamadı" }, { status: 404 })
    }

    const { ip: IP, agent_port: AgentPort, api_key: ApiKey } = srv
    const safePath = psEscape(rawPath)
    const maxBytes = mode === "preview" ? MAX_PREVIEW_BYTES : MAX_DOWNLOAD_BYTES

    const cmd = [
      `try {`,
      `  $f = Get-Item -Path '${safePath}' -ErrorAction Stop;`,
      `  if ($f.Length -gt ${maxBytes}) { Write-Output 'ERR:Dosya cok buyuk (max ${Math.round(maxBytes / 1024 / 1024)} MB)'; exit };`,
      `  $b = [System.IO.File]::ReadAllBytes('${safePath}');`,
      `  Write-Output ([Convert]::ToBase64String($b))`,
      `} catch { Write-Output ('ERR:' + $_.Exception.Message) }`,
    ].join(" ")

    const result = await execOnAgent(IP, AgentPort, ApiKey, cmd, 60)
    const out = result.stdout.trim()

    if (out.startsWith("ERR:")) {
      return NextResponse.json({ error: out.slice(4) }, { status: 500 })
    }

    const fileName    = rawPath.split(/[\\\/]/).pop() ?? "file"
    const ext         = fileName.split(".").pop()?.toLowerCase() ?? ""
    const contentType = MIME[ext] ?? "application/octet-stream"
    const buffer      = Buffer.from(out, "base64")

    const headers: Record<string, string> = {
      "Content-Type":   contentType,
      "Content-Length": buffer.length.toString(),
    }

    if (mode === "download") {
      headers["Content-Disposition"] = `attachment; filename="${encodeURIComponent(fileName)}"`
    }

    return new NextResponse(buffer, { headers })
  } catch (err) {
    console.error("[GET /api/servers/[id]/files/content]", err)
    return NextResponse.json({ error: "Dosya okunamadı" }, { status: 500 })
  }
}
