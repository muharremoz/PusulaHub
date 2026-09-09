/**
 * POST /api/companies/[firkod]/sql/old-data/scan
 * Body: { source?: "depo" | "sql", path?: string }
 *
 * Firma detayındaki "Yeni Veritabanı Ekle" akışı için bir klasördeki `.bak`
 * (RESTORE) ve `.mdf` (ATTACH) dosyalarını listeler. `.ldf` kendi başına
 * gösterilmez; aynı adlı `.mdf`in eşi olarak iliştirilir.
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

/** `.bak` → RESTORE, `.mdf` → CREATE DATABASE ... FOR ATTACH */
export type OldDataKind = "bak" | "mdf"

export interface OldDataFile {
  fileName:     string
  databaseName: string   // dosya adından türetilen baz ad (firma prefix'siz)
  fileSizeMB:   number
  date:         string
  kind:         OldDataKind
  /** kind="mdf" ve aynı adlı log dosyası varsa onun adı; yoksa boş. */
  ldfFileName?: string
}

export type ScanSource = "depo" | "sql"

export interface OldDataScanResponse {
  folder: string
  source: ScanSource
  /** Taranan sunucunun adı — UI-da hangi makineye bakıldığı görünsün */
  server: string
  files:  OldDataFile[]
}

/**
 * `ELIZ25_20260410.bak` → `ELIZ25`
 * `ELIZ25.mdf`          → `ELIZ25`
 * `CANER22_Data.MDF`    → `CANER22`
 *
 * SQL Server'ın yerleşik adlandırması veri dosyasına `_Data`, log dosyasına
 * `_Log` ekler; DB adı bu ekler atılınca çıkar.
 */
function parseDatabaseName(fileName: string): string {
  const base = fileName.replace(/\.[^.]+$/, "").replace(/_(data|dat)$/i, "")
  const m = base.match(/^(.+?)_\d{8}$/)
  return (m ? m[1] : base).trim()
}

/**
 * MDF/LDF eşleştirme anahtarı — uzantı ve SQL Server'ın dosya eki atılır.
 *
 *   CANER22_Data.MDF  ↔  CANER22_Log.LDF   → caner22
 *   ELIZ25.mdf        ↔  ELIZ25.ldf        → eliz25
 *   MAHMUT.MDF        ↔  MAHMUT_0.LDF      → mahmut
 *
 * Sayısal ek (`_0`, `_1`) yalnız LOG tarafında kırpılır: veri dosyasında da
 * kırpılsaydı `DATA_2024.mdf` ile `DATA_2025.mdf` aynı anahtara düşerdi.
 */
function pairKey(fileName: string, isLog: boolean): string {
  const base = fileName.replace(/\.[^.]+$/, "")
  const trimmed = isLog
    ? base.replace(/_(log|\d+)$/i, "")
    : base.replace(/_(data|dat)$/i, "")
  return trimmed.toLowerCase()
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

    /*  .ldf'ler kendi başına listelenmez; .mdf'in eşi olarak iliştirilir.
     *  Boyut ikisinin toplamı — attach ederken ikisi de kopyalanacak.   */
    const ldfByKey = new Map<string, RawBackupItem>()
    for (const it of raw) {
      if (ext(it) === ".ldf") ldfByKey.set(pairKey(it.Name, true), it)
    }

    const files: OldDataFile[] = raw
      .filter((it) => ext(it) === ".bak" || ext(it) === ".mdf")
      .map((it) => {
        const isMdf = ext(it) === ".mdf"
        const ldf   = isMdf ? ldfByKey.get(pairKey(it.Name, false)) : undefined
        return {
          fileName:     it.Name,
          databaseName: parseDatabaseName(it.Name),
          fileSizeMB:   ((it.Length || 0) + (ldf?.Length || 0)) / (1024 * 1024),
          date:         toDateString(it.LastWriteTime),
          kind:         (isMdf ? "mdf" : "bak") as OldDataKind,
          ...(ldf ? { ldfFileName: ldf.Name } : {}),
        }
      })

    const resp: OldDataScanResponse = { folder, source, server: serverName, files }
    return NextResponse.json(resp)
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Yedekler taranamadı"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
