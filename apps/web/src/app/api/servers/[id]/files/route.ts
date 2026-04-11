import { NextRequest, NextResponse } from "next/server"
import { query } from "@/lib/db"
import { execOnAgent } from "@/lib/agent-poller"

export interface FileItem {
  name:     string
  isDir:    boolean
  size:     number | null   // null = klasör
  modified: string          // "2024-01-15T10:23:00"
}

export interface FilesResponse {
  path:   string
  items:  FileItem[]
  drives: string[]
}

interface ServerRow {
  IP:        string
  AgentPort: number | null
  ApiKey:    string | null
}

// Güvenli path: sadece mutlak yol, ".." yok, agent injection yok
function validatePath(p: string): boolean {
  if (!p) return false
  // Windows mutlak yol: C:\ ile başlar
  if (!/^[A-Za-z]:[\\\/]/.test(p)) return false
  // Path traversal engelle
  if (p.includes("..")) return false
  return true
}

// PS single-quote escape: ' → ''
function psEscape(s: string): string {
  return s.replace(/'/g, "''")
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const rawPath = req.nextUrl.searchParams.get("path") ?? "C:\\"

  if (!validatePath(rawPath)) {
    return NextResponse.json({ error: "Geçersiz path" }, { status: 400 })
  }

  try {
    const rows = await query<ServerRow[]>`
      SELECT IP, AgentPort, ApiKey FROM Servers WHERE Id = ${id}
    `
    if (!rows.length || !rows[0].AgentPort || !rows[0].ApiKey) {
      return NextResponse.json({ error: "Sunucu bulunamadı veya agent tanımlı değil" }, { status: 404 })
    }

    const { IP, AgentPort, ApiKey } = rows[0]
    const safePath = psEscape(rawPath)

    // Klasör listesi — pipe-separated: name|isDir|size|modified
    const listCmd = [
      `try {`,
      `  $items = Get-ChildItem -Path '${safePath}' -ErrorAction Stop;`,
      `  $dirs  = $items | Where-Object { $_.PSIsContainer  } | Sort-Object Name;`,
      `  $files = $items | Where-Object { !$_.PSIsContainer } | Sort-Object Name;`,
      `  foreach ($i in (@($dirs) + @($files))) {`,
      `    $s = if ($i.PSIsContainer) { -1 } else { [long]$i.Length };`,
      `    Write-Output ($i.Name + '|' + $i.PSIsContainer + '|' + $s + '|' + $i.LastWriteTime.ToString('yyyy-MM-ddTHH:mm:ss'))`,
      `  }`,
      `} catch { Write-Output ('ERR:' + $_.Exception.Message) }`,
    ].join(" ")

    // Sürücü listesi
    const driveCmd = `(Get-PSDrive -PSProvider FileSystem).Name -join ','`

    const [listResult, driveResult] = await Promise.all([
      execOnAgent(IP, AgentPort, ApiKey, listCmd, 15),
      execOnAgent(IP, AgentPort, ApiKey, driveCmd, 10),
    ])

    // Hata kontrolü
    if (listResult.stdout.startsWith("ERR:")) {
      return NextResponse.json({ error: listResult.stdout.slice(4) }, { status: 500 })
    }

    // Satırları parse et
    const items: FileItem[] = listResult.stdout
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((line) => {
        const [name, isDirStr, sizeStr, modified] = line.split("|")
        const isDir = isDirStr?.toLowerCase() === "true"
        const size  = isDir ? null : (parseInt(sizeStr ?? "-1", 10) || 0)
        return { name: name ?? "", isDir, size, modified: modified ?? "" }
      })
      .filter((i) => i.name)

    // Sürücüler
    const drives = driveResult.stdout
      .trim()
      .split(",")
      .map((d) => d.trim().toUpperCase())
      .filter(Boolean)

    return NextResponse.json({ path: rawPath, items, drives } satisfies FilesResponse)
  } catch (err) {
    console.error("[GET /api/servers/[id]/files]", err)
    return NextResponse.json({ error: "Dosya listesi alınamadı" }, { status: 500 })
  }
}
