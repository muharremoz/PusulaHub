import { NextResponse } from "next/server"
import { query } from "@/lib/db"
import { execOnAgent } from "@/lib/agent-poller"
import { buildListBackupFiles, parseBackupListOutput, type RawBackupItem } from "@/lib/sql-backup-powershell"
import type { BackupFile } from "@/lib/setup-mock-data"

/**
 * POST /api/setup/sql-servers/:id/scan-backups
 *
 * Body: { path: string }
 *
 * Seçili SQL sunucusunun PusulaAgent'ına PowerShell komutu göndererek
 * verilen klasördeki `*.bak` dosyalarını listeler. Sonuç `BackupFile[]`
 * olarak döner (step-sql bileşeninin beklediği format).
 *
 * Not: xp_dirtree gibi SQL-side dosya tarama yöntemleri güvenlik nedeniyle
 * kullanılmaz. Bunun yerine agent'ın `/api/exec` endpoint'i üzerinden
 * Get-ChildItem çalıştırılır.
 */

interface ServerRow {
  Id:        string
  Name:      string
  IP:        string
  ApiKey:    string | null
  AgentPort: number | null
}

export interface ScanBackupsResponse {
  files: BackupFile[]
}

/** `ERP_PROD_20260402.bak` → `ERP_PROD` */
function parseDatabaseName(fileName: string): string {
  // Uzantıyı at
  const base = fileName.replace(/\.bak$/i, "")
  // Sondaki _YYYYMMDD varsa kaldır
  const m = base.match(/^(.+?)_\d{8}$/)
  return (m ? m[1] : base).trim()
}

/** PS ISO date → `YYYY-MM-DD` */
function toDateString(iso: string): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso.slice(0, 10)
  return d.toISOString().slice(0, 10)
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const body = await req.json().catch(() => ({}))
    const path = typeof body?.path === "string" ? body.path.trim() : ""

    if (!path) {
      return NextResponse.json({ error: "Klasör yolu gerekli" }, { status: 400 })
    }

    const rows = await query<ServerRow[]>`
      SELECT s.Id, s.Name, s.IP, s.ApiKey, s.AgentPort
      FROM Servers s
      INNER JOIN ServerRoles r ON r.ServerId = s.Id
      WHERE s.Id = ${id} AND r.Role = 'SQL'
    `
    if (rows.length === 0) {
      return NextResponse.json({ error: "SQL sunucusu bulunamadı" }, { status: 404 })
    }

    const server = rows[0]
    if (!server.ApiKey || !server.AgentPort) {
      return NextResponse.json(
        { error: "Bu sunucuda PusulaAgent yapılandırılmamış (ApiKey/AgentPort eksik)." },
        { status: 400 },
      )
    }

    const command = buildListBackupFiles(path)
    const result = await execOnAgent(server.IP, server.AgentPort, server.ApiKey, command, 30)

    if (result.exitCode !== 0) {
      const msg = result.stderr?.trim() || `Agent exec başarısız (exit=${result.exitCode})`
      return NextResponse.json({ error: msg }, { status: 502 })
    }

    const raw: RawBackupItem[] = parseBackupListOutput(result.stdout)

    const files: BackupFile[] = raw.map((item, idx) => ({
      id:           idx + 1,
      fileName:     item.Name,
      databaseName: parseDatabaseName(item.Name),
      // Byte → MB (float) — UI tarafında MB/GB dinamik formatlanır.
      // Math.round kullanmıyoruz çünkü < 0.5 MB dosyalar 0 görünüyordu.
      fileSizeMB:   (item.Length || 0) / (1024 * 1024),
      date:         toDateString(item.LastWriteTime),
      selected:     false,
    }))

    const body_: ScanBackupsResponse = { files }
    return NextResponse.json(body_)
  } catch (err) {
    console.error("[POST /api/setup/sql-servers/:id/scan-backups]", err)
    const msg = err instanceof Error ? err.message : "Yedek dosyaları taranamadı"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
