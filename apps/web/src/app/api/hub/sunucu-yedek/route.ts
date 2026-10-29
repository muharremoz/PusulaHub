import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { decrypt } from "@/lib/crypto"
import { icAnahtarKapisi } from "@/lib/hub-ic-anahtar"
import { yedekOzeti } from "@/lib/mobil-yedek-ozet"

/**
 * GET /api/hub/sunucu-yedek — CRM mobil "Sunucular → Yedek" sekmesi (29.10.2026).
 * SQL (msdb) + R2 teslimi + ESXi imaj turları; ayrıntı ve önbellek lib/mobil-yedek-ozet.ts.
 * Ayrı uç: sunucu-durum her 30 sn yenileniyor, bu ise ağır ve 10 dk önbellekli.
 */
export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const kapi = icAnahtarKapisi(req)
  if (kapi) return kapi

  const sb = getSupabaseAdmin()
  const { data: rol } = await sb.schema("hub").from("server_roles").select("server_id").eq("role", "SQL").limit(1).maybeSingle()
  const id = (rol as { server_id: string } | null)?.server_id
  const { data: srv } = id
    ? await sb.schema("hub").from("servers").select("ip, sql_username, sql_password").eq("id", id).maybeSingle()
    : { data: null }
  const s = srv as { ip: string; sql_username: string | null; sql_password: string | null } | null
  const sifre = decrypt(s?.sql_password)
  const hedef = s && s.sql_username && sifre ? { ip: s.ip, username: s.sql_username, password: sifre } : null

  return NextResponse.json(await yedekOzeti(hedef), { headers: { "Cache-Control": "no-store" } })
}
