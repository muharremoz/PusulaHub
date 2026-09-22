import { NextResponse } from "next/server"
import { sqlServerById } from "@/lib/hub-servers"
import { getSupabaseServer } from "@/lib/supabase/server"
import { decrypt } from "@/lib/crypto"
import { requirePermission } from "@/lib/require-permission"
import { esitleBackupMaster, bmOzet } from "@/lib/backup-master"

/**
 * POST /api/backup-master/sync   → Jobs.xml'i `guvenlik.YedekAl=1` ile eşitler
 * GET  /api/backup-master/sync   → yalnız farkı döner (hiçbir şey yazmaz)
 *
 * Body/query: `serverId` — SQL rollü sunucu. Verilmezse SQL rolü olan ilk sunucu.
 * Kurulum sihirbazı bunu kendi içinde çağırıyor; bu uç elle tetikleme ve
 * haftalık kontrol içindir.
 */
async function calistir(serverId: string | null, kuruGosteri: boolean) {
  let id = serverId
  if (!id) {
    const sb = await getSupabaseServer()
    const { data } = await sb.schema("hub").from("server_roles").select("server_id").eq("role", "SQL").limit(1).maybeSingle()
    id = (data as { server_id: string } | null)?.server_id ?? null
  }
  if (!id) return NextResponse.json({ error: "SQL rollü sunucu bulunamadı" }, { status: 404 })

  const srv = await sqlServerById(id)
  if (!srv) return NextResponse.json({ error: "SQL sunucusu bulunamadı" }, { status: 404 })
  const sifre = decrypt(srv.sql_password)
  if (!srv.sql_username || !sifre)  return NextResponse.json({ error: `${srv.name}: SQL kullanıcı bilgisi eksik` }, { status: 400 })
  if (!srv.agent_port || !srv.api_key) return NextResponse.json({ error: `${srv.name}: agent bilgisi eksik` }, { status: 400 })

  try {
    const sonuc = await esitleBackupMaster(
      { ip: srv.ip, username: srv.sql_username, password: sifre, agentPort: srv.agent_port, apiKey: decrypt(srv.api_key)! },
      { kuruGosteri },
    )
    return NextResponse.json({ ok: true, sunucu: srv.name, ozet: bmOzet(sonuc), ...sonuc })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}

export async function GET(req: Request) {
  const gate = await requirePermission("servers", "read")
  if (gate) return gate
  const serverId = new URL(req.url).searchParams.get("serverId")
  return calistir(serverId, true)
}

export async function POST(req: Request) {
  const gate = await requirePermission("servers", "write")
  if (gate) return gate
  const body = await req.json().catch(() => ({}))
  return calistir(typeof body?.serverId === "string" ? body.serverId : null, false)
}
