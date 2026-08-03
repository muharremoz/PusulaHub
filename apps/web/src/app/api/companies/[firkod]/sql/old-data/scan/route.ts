/**
 * POST /api/companies/[firkod]/sql/old-data/scan
 * Body: { source?: "depo" | "sql", path?: string }
 *
 * Firma detayındaki "Yeni Veritabanı Ekle" akışı için bir klasördeki `.bak`
 * dosyalarını listeler.
 *
 *   source="depo" (varsayılan) → Companies.FileServerId sunucusu
 *   source="sql"               → firmanın SQL sunucusu
 *   path boşsa                 → `D:\Eski Datalar\{firmaId}` (eski davranış)
 *
 * Kaynak eskiden Depo'daki "Eski Datalar" klasörüne sabitti; sadece müşterinin
 * eski verisi yüklenebiliyordu. Normal/şablon veritabanları da kurulabilsin
 * diye hem sunucu hem klasör seçilebilir oldu. Tarama her iki durumda da ilgili
 * sunucunun PusulaAgent'ı üzerinden yapılır (klasör orada yereldir).
 */

import { NextRequest, NextResponse } from "next/server"
import { getSupabaseServer } from "@/lib/supabase/server"
import { serverAgentById } from "@/lib/hub-servers"
import { requirePermission } from "@/lib/require-permission"
import { execOnAgent } from "@/lib/agent-poller"
import { buildListBackupFiles, parseBackupListOutput, type RawBackupItem } from "@/lib/sql-backup-powershell"

export interface OldDataFile {
  fileName:     string
  databaseName: string   // .bak adından türetilen baz ad (firma prefix'siz)
  fileSizeMB:   number
  date:         string
}

export type ScanSource = "depo" | "sql"

export interface OldDataScanResponse {
  folder: string
  source: ScanSource
  /** Taranan sunucunun adı — UI-da hangi makineye bakıldığı görünsün */
  server: string
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
  req: NextRequest,
  { params }: { params: Promise<{ firkod: string }> },
) {
  const gate = await requirePermission("companies", "read")
  if (gate) return gate
  const { firkod } = await params

  let body: { source?: ScanSource; path?: string } = {}
  try { body = await req.json() } catch { /* gövdesiz çağrı = eski davranış */ }
  const source: ScanSource = body.source === "sql" ? "sql" : "depo"
  const folder = (body.path ?? "").trim().replace(/[\\/]+$/, "") || `D:\\Eski Datalar\\${firkod}`

  try {
    const sb = await getSupabaseServer()

    // Hangi sunucuda tarayacağız: Depo (file_server_id) ya da SQL (sql_server_id)
    const { data: comp } = await sb.schema("hub").from("companies")
      .select("file_server_id, sql_server_id").eq("company_id", firkod).maybeSingle()
    const c = comp as { file_server_id: string | null; sql_server_id: string | null } | null
    const targetId = source === "sql" ? c?.sql_server_id : c?.file_server_id
    if (!targetId) {
      return NextResponse.json({
        error: source === "sql"
          ? "Firmaya tanımlı SQL sunucusu yok (SqlServerId boş)."
          : "Firmaya tanımlı Depo sunucusu yok (FileServerId boş).",
      }, { status: 400 })
    }

    const agent = await serverAgentById(targetId)
    if (!agent || !agent.api_key || !agent.agent_port) {
      return NextResponse.json({
        error: `${source === "sql" ? "SQL" : "Depo"} sunucusunda PusulaAgent yapılandırılmamış.`,
      }, { status: 400 })
    }
    const { data: srvRow } = await sb.schema("hub").from("servers").select("name").eq("id", targetId).maybeSingle()
    const serverName = (srvRow as { name: string } | null)?.name ?? ""

    const result = await execOnAgent(agent.ip, agent.agent_port, agent.api_key, buildListBackupFiles(folder), 30)
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

    const resp: OldDataScanResponse = { folder, source, server: serverName, files }
    return NextResponse.json(resp)
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Yedekler taranamadı"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
