import { NextRequest, NextResponse } from "next/server"
import { withSqlConnection } from "@/lib/sql-external"
import { resolveFirmaSqlTarget } from "@/lib/sql-company-target"
import { restoreBackupOnServer } from "@/lib/sql-restore"
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
    const { data: comp } = await sb.schema("hub").from("companies").select("file_server_id").eq("company_id", firkod).maybeSingle()
    const fsid = (comp as { file_server_id: string | null } | null)?.file_server_id
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

    return NextResponse.json({ ok: true, resimYolu })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error("[POST /sql/restore]", msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
