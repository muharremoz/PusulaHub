/**
 * GET  /api/connect/ayarlar   Connect'in VPN sunucusu + portu, sayım SQL dış adresi (hub.settings; girilmemişse varsayılan)
 * POST /api/connect/ayarlar   { vpnSunucu, vpnPort, sayimSqlAdres? } — kaydeder; uygulamalar nabızla fark edip FortiClient'ı günceller.
 *                             sayimSqlAdres: Pusula X sayım kopyasının server.xml'ine yazılan SQL adresi ("host,port");
 *                             boş bırakılırsa CRM SQL Konsolu ile aynı dış adres + firmanın portu (lib/connect-sayim.ts).
 */
import { NextRequest, NextResponse } from "next/server"
import { requirePermission } from "@/lib/require-permission"
import { getSupabaseServer } from "@/lib/supabase/server"
import { VPN_SUNUCU } from "@/lib/kurulum-paketi"
import { SQL_DIS_ADRES } from "@/lib/connect-sayim"

const [VARSAYILAN_SUNUCU, VARSAYILAN_PORT = ""] = VPN_SUNUCU.split(":")
/** "host,port" ya da "host" — SqlConnection DataSource biçimi */
const SQL_ADRES_DESENI = /^[a-zA-Z0-9.-]{1,253}(,\d{1,5})?$/
const SAYIM_SQL_VARSAYILAN = `${SQL_DIS_ADRES},<firmanın SQL portu>`
/** Alan adı ya da IPv4 — FortiClient profiline yazılacağı için boşluk/özel karakter yok */
const SUNUCU_DESENI = /^(?=.{1,253}$)[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/

export async function GET() {
  const gate = await requirePermission("companies", "read")
  if (gate) return gate
  const sb = await getSupabaseServer()
  const { data, error } = await sb.schema("hub").from("settings").select("key, value").in("key", ["connect_vpn_sunucu", "connect_vpn_port", "connect_sayim_sql_adres"])
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const a = new Map(((data ?? []) as { key: string; value: string | null }[]).map((r) => [r.key, (r.value ?? "").trim()]))
  return NextResponse.json({
    vpnSunucu: a.get("connect_vpn_sunucu") || VARSAYILAN_SUNUCU,
    vpnPort: a.get("connect_vpn_port") || VARSAYILAN_PORT,
    varsayilan: !a.get("connect_vpn_sunucu"),
    sayimSqlAdres: a.get("connect_sayim_sql_adres") || "",
    sayimSqlVarsayilan: SAYIM_SQL_VARSAYILAN,
  })
}

export async function POST(req: NextRequest) {
  const gate = await requirePermission("companies", "write")
  if (gate) return gate
  const b = (await req.json().catch(() => ({}))) as { vpnSunucu?: string; vpnPort?: string | number; sayimSqlAdres?: string }
  const sunucu = String(b.vpnSunucu ?? "").trim().toLowerCase()
  const port = String(b.vpnPort ?? "").trim()
  if (!SUNUCU_DESENI.test(sunucu)) return NextResponse.json({ error: "Geçersiz sunucu adresi" }, { status: 400 })
  const p = Number(port)
  if (!/^\d{1,5}$/.test(port) || p < 1 || p > 65535) return NextResponse.json({ error: "Port 1–65535 arasında olmalı" }, { status: 400 })
  const sayimSql = String(b.sayimSqlAdres ?? "").trim()
  if (sayimSql && !SQL_ADRES_DESENI.test(sayimSql)) return NextResponse.json({ error: "Sayım SQL adresi 'sunucu' ya da 'sunucu,port' biçiminde olmalı" }, { status: 400 })
  const sb = await getSupabaseServer()
  const simdi = new Date().toISOString()
  const { error } = await sb.schema("hub").from("settings").upsert([
    { key: "connect_vpn_sunucu", value: sunucu, updated_at: simdi },
    { key: "connect_vpn_port", value: String(p), updated_at: simdi },
    { key: "connect_sayim_sql_adres", value: sayimSql, updated_at: simdi },
  ], { onConflict: "key" })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, vpnSunucu: sunucu, vpnPort: String(p), sayimSqlAdres: sayimSql })
}
