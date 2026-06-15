/**
 * POST /api/companies/[firkod]/sql/old-data/scan
 *
 * Firma detayındaki "Yeni Veritabanı Ekle" akışı için: firmanın Depo
 * sunucusundaki SABİT klasörü — `D:\Eski Datalar\{firmaId}` — tarayıp
 * içindeki `.bak` dosyalarını listeler.
 *
 * Depo sunucusu = Companies.FileServerId. Tarama Depo'nun PusulaAgent'ı
 * üzerinden yapılır (klasör Depo'da yereldir, net use gerekmez).
 */

import { NextRequest, NextResponse } from "next/server"
import { query } from "@/lib/db"
import { requirePermission } from "@/lib/require-permission"
import { execOnAgent } from "@/lib/agent-poller"
import { buildListBackupFiles, parseBackupListOutput, type RawBackupItem } from "@/lib/sql-backup-powershell"

export interface OldDataFile {
  fileName:     string
  databaseName: string   // .bak adından türetilen baz ad (firma prefix'siz)
  fileSizeMB:   number
  date:         string
}

export interface OldDataScanResponse {
  folder: string
  files:  OldDataFile[]
}

/** `ELIZ25_20260410.bak` → `ELIZ25` */
function parseDatabaseName(fileName: string): string {
  const base = fileName.replace(/\.bak$/i, "")
  const m = base.match(/^(.+?)_\d{8}$/)
  return (m ? m[1] : base).trim()
}

function toDateString(iso: string): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso.slice(0, 10)
  return d.toISOString().slice(0, 10)
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ firkod: string }> },
) {
  const gate = await requirePermission("companies", "read")
  if (gate) return gate
  const { firkod } = await params

  try {
    // Firma'nın Depo sunucusu (FileServerId)
    const rows = await query<{ IP: string; ApiKey: string | null; AgentPort: number | null }[]>`
      SELECT s.IP, s.ApiKey, s.AgentPort
      FROM Companies c
      INNER JOIN Servers s ON s.Id = c.FileServerId
      WHERE c.CompanyId = ${firkod}
    `
    if (!rows.length) {
      return NextResponse.json({ error: "Firmaya tanımlı Depo sunucusu yok (FileServerId boş)." }, { status: 400 })
    }
    const depo = rows[0]
    if (!depo.ApiKey || !depo.AgentPort) {
      return NextResponse.json({ error: "Depo sunucusunda PusulaAgent yapılandırılmamış." }, { status: 400 })
    }

    const folder = `D:\\Eski Datalar\\${firkod}`
    const result = await execOnAgent(depo.IP, depo.AgentPort, depo.ApiKey, buildListBackupFiles(folder), 30)
    if (result.exitCode !== 0) {
      const msg = result.stderr?.trim() || `Agent exec başarısız (exit=${result.exitCode})`
      return NextResponse.json({ error: msg }, { status: 502 })
    }

    const raw: RawBackupItem[] = parseBackupListOutput(result.stdout)
    const ext = (it: RawBackupItem) =>
      (it.Extension || (it.Name.match(/\.[^.]+$/)?.[0] ?? "")).toLowerCase()

    const files: OldDataFile[] = raw
      .filter((it) => ext(it) === ".bak")
      .map((it) => ({
        fileName:     it.Name,
        databaseName: parseDatabaseName(it.Name),
        fileSizeMB:   (it.Length || 0) / (1024 * 1024),
        date:         toDateString(it.LastWriteTime),
      }))

    const resp: OldDataScanResponse = { folder, files }
    return NextResponse.json(resp)
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Yedekler taranamadı"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
