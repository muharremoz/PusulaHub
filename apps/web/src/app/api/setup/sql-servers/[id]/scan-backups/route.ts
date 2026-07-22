import { NextResponse } from "next/server"
import { sqlServerById } from "@/lib/hub-servers"
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

    const server = await sqlServerById(id)
    if (!server) {
      return NextResponse.json({ error: "SQL sunucusu bulunamadı" }, { status: 404 })
    }
    if (!server.api_key || !server.agent_port) {
      return NextResponse.json(
        { error: "Bu sunucuda PusulaAgent yapılandırılmamış (ApiKey/AgentPort eksik)." },
        { status: 400 },
      )
    }

    const command = buildListBackupFiles(path)
    const result = await execOnAgent(server.ip, server.agent_port, server.api_key, command, 30)

    if (result.exitCode !== 0) {
      const msg = result.stderr?.trim() || `Agent exec başarısız (exit=${result.exitCode})`
      return NextResponse.json({ error: msg }, { status: 502 })
    }

    const raw: RawBackupItem[] = parseBackupListOutput(result.stdout)

    // Uzantıya göre ayır. Eski agent çıktısında Extension yoksa dosya adından türet.
    const ext = (it: RawBackupItem) =>
      (it.Extension || (it.Name.match(/\.[^.]+$/)?.[0] ?? "")).toLowerCase()

    const bakItems = raw.filter((it) => ext(it) === ".bak")
    const mdfItems = raw.filter((it) => ext(it) === ".mdf")
    const ldfItems = raw.filter((it) => ext(it) === ".ldf")

    // .mdf/.ldf eşleştirmesi: aynı base ada sahip .ldf'yi bul (büyük/küçük harf duyarsız).
    const ldfByBase = new Map<string, RawBackupItem>()
    for (const l of ldfItems) {
      const base = l.Name.replace(/\.ldf$/i, "").toLowerCase()
      ldfByBase.set(base, l)
    }

    let idx = 0
    const files: BackupFile[] = []

    // 1) .bak dosyaları → RESTORE
    for (const item of bakItems) {
      files.push({
        id:               ++idx,
        fileName:         item.Name,
        databaseName:     parseDatabaseName(item.Name),
        // Byte → MB (float) — UI tarafında MB/GB dinamik formatlanır.
        fileSizeMB:       (item.Length || 0) / (1024 * 1024),
        date:             toDateString(item.LastWriteTime),
        selected:         false,
        programServiceId: null,
        kind:             "bak",
      })
    }

    // 2) .mdf dosyaları → ATTACH (varsa eşleşen .ldf ile). LDF boyutu da toplam'a eklenir.
    for (const mdf of mdfItems) {
      const base = mdf.Name.replace(/\.mdf$/i, "")
      const ldf  = ldfByBase.get(base.toLowerCase())
      files.push({
        id:               ++idx,
        fileName:         mdf.Name,
        databaseName:     base.replace(/_\d{8}$/, "").trim() || base,
        fileSizeMB:       ((mdf.Length || 0) + (ldf?.Length || 0)) / (1024 * 1024),
        date:             toDateString(mdf.LastWriteTime),
        selected:         false,
        programServiceId: null,
        kind:             "attach",
        mdfFileName:      mdf.Name,
        ldfFileName:      ldf?.Name,
      })
    }

    const body_: ScanBackupsResponse = { files }
    return NextResponse.json(body_)
  } catch (err) {
    console.error("[POST /api/setup/sql-servers/:id/scan-backups]", err)
    const msg = err instanceof Error ? err.message : "Yedek dosyaları taranamadı"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
