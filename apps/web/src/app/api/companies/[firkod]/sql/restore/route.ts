import { NextRequest, NextResponse } from "next/server"
import { withSqlConnection } from "@/lib/sql-external"
import { resolveFirmaSqlTarget } from "@/lib/sql-company-target"
import { restoreBackupOnServer, firmaDataDir } from "@/lib/sql-restore"
import { serverAgentById } from "@/lib/hub-servers"
import { execOnAgent } from "@/lib/agent-poller"
import { buildWriteDesktopIni } from "@/lib/setup-fileops"
import { getSupabaseServer } from "@/lib/supabase/server"
import { depodakiYol, okuPusulaXResimYolu, pusulaXResimYolu, yazPusulaXResimYolu } from "@/lib/pusulax-resim-yolu"

/**
 * POST /api/companies/[firkod]/sql/restore
 * Body: { server: string, dbName: string, backupPath: string }
 *
 * Verilen .bak dosyasını dbName hedefine REPLACE ile geri yükler.
 * Mevcut DB üzerine yazar.
 *
 * Pusula X datasıysa resim yolu (Sabitler.ImagePath) yedekteki değerle gelmesin:
 * geri yüklemeden önceki yol firmanın Depo'sunu gösteriyorsa o korunur (alt
 * klasörlü olabilir, ör. \6796\TOPTAN\), göstermiyorsa \\<Depo>\Resimler\{firmaId}\ yazılır.
 *
 * D:\SQLData\{firmaId} klasörü ilk kez burada açılmış olabilir — Gezgin'de "<firmaNo> - <firma adı>"
 * görünsün diye desktop.ini yazılır (sihirbazdaki adımla aynı). Hata geri yüklemeyi bozmaz.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ firkod: string }> }
) {
  const { firkod } = await params
  try {
    const body = await req.json() as { server?: string; dbName?: string; backupPath?: string }
    if (!body.dbName || !body.backupPath) {
      return NextResponse.json({ error: "dbName ve backupPath zorunlu" }, { status: 400 })
    }

    const target = await resolveFirmaSqlTarget(firkod, body.server)
    if (!target) return NextResponse.json({ error: "SQL sunucusu bulunamadı" }, { status: 404 })

    const sb = await getSupabaseServer()
    const { data: comp } = await sb.schema("hub").from("companies").select("file_server_id, name").eq("company_id", firkod).maybeSingle()
    const fsid = (comp as { file_server_id: string | null } | null)?.file_server_id
    const firmaAdi = ((comp as { name: string | null } | null)?.name ?? "").trim()
    const depoIp = fsid
      ? ((await sb.schema("hub").from("servers").select("ip").eq("id", fsid).maybeSingle()).data as { ip: string } | null)?.ip ?? null
      : null

    let resimYolu: string | null = null
    await withSqlConnection(
      { server: target.ip, user: target.username, password: target.password, database: "master", requestTimeout: 600000 },
      async (pool) => {
        const onceki = await okuPusulaXResimYolu(pool, body.dbName!).catch(() => null)
        await restoreBackupOnServer(pool, body.backupPath!, body.dbName!, { firmaId: firkod })
        if (!depoIp) return
        try {
          if ((await okuPusulaXResimYolu(pool, body.dbName!)) === null) return
          const yol = depodakiYol(onceki, depoIp) ?? pusulaXResimYolu(depoIp, firkod)
          await yazPusulaXResimYolu(pool, body.dbName!, yol)
          resimYolu = yol
        } catch (err) {
          // Geri yükleme tamam; yol yazılamadıysa yalnız günlüğe düşer
          console.error("[POST /sql/restore] resim yolu", err instanceof Error ? err.message : err)
        }
      },
    )

    if (firmaAdi) {
      try {
        const ag = await serverAgentById(target.serverId)
        if (ag?.api_key && ag.agent_port) {
          const r = await execOnAgent(target.ip, ag.agent_port, ag.api_key, buildWriteDesktopIni(firmaDataDir(firkod), firmaAdi, `${firkod} - ${firmaAdi}`), 60)
          if (r.exitCode !== 0) console.error("[POST /sql/restore] desktop.ini", r.stderr?.trim())
        }
      } catch (err) {
        console.error("[POST /sql/restore] desktop.ini", err instanceof Error ? err.message : err)
      }
    }

    return NextResponse.json({ ok: true, resimYolu })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error("[POST /sql/restore]", msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
