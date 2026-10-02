/**
 * GET  /api/aktarim2  → Aktarım 2 oturumları (servisten)
 * POST /api/aktarim2  → yeni oturum + tek seferlik kod
 *
 * Hedef sunucu bilgileri (Windows yöneticisi + SQL login) burada çözülüp
 * servise gider; istemci uygulamasına asla dönmez.
 */

import { NextRequest, NextResponse } from "next/server"
import { requirePermission } from "@/lib/require-permission"
import { auth } from "@/auth"
import { getSupabaseServer } from "@/lib/supabase/server"
import { decrypt } from "@/lib/crypto"
import { olustur, oturumlar, type Aktarim2Hedef } from "@/lib/aktarim2-proxy"

function coz(v: string | null): string | null {
  if (!v || !v.startsWith("enc:v1:")) return v
  try { return decrypt(v) ?? v } catch { return v }
}

async function hedef(id: string | null | undefined): Promise<Aktarim2Hedef | null> {
  if (!id) return null
  const sb = await getSupabaseServer()
  const { data } = await sb.schema("hub").from("servers")
    .select("name, ip, username, password, sql_username, sql_password").eq("id", id).maybeSingle()
  if (!data) return null
  const r = data as { name: string; ip: string; username: string | null; password: string | null; sql_username: string | null; sql_password: string | null }
  // Servis kullanıcı adı ya da şifresi olmayan hedefi "yok" sayar ve istemcide o sekmeleri gizler
  // (02.10: Terminal 4 kullanıcı adı boştu, Programlar/Ek klasörler görünmedi) — kod üretmeden durdur.
  if (!r.username?.trim() || !coz(r.password)) {
    throw new Error(`${r.name} sunucusunun Windows kullanıcı adı ya da şifresi Hub'da kayıtlı değil (Sunucular → düzenle).`)
  }
  return {
    ad: r.name, ip: r.ip,
    kullanici: r.username, sifre: coz(r.password),
    sqlKullanici: r.sql_username, sqlSifre: coz(r.sql_password),
  }
}

export async function GET() {
  const gate = await requirePermission("aktarim", "read")
  if (gate) return gate
  try {
    return NextResponse.json(await oturumlar())
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Hata" }, { status: 502 })
  }
}

interface Govde {
  firmaId?: string
  firmaAdi?: string
  sqlServerId?: string | null
  depoServerId?: string | null
  rdpServerId?: string | null
  gunSayisi?: number
  notlar?: string | null
}

export async function POST(req: NextRequest) {
  const gate = await requirePermission("aktarim", "write")
  if (gate) return gate
  const session = await auth()
  const olusturan = session?.user?.username ?? session?.user?.email ?? null

  let b: Govde
  try { b = (await req.json()) as Govde } catch {
    return NextResponse.json({ error: "Geçersiz JSON" }, { status: 400 })
  }
  if (!b.firmaId || !b.firmaAdi) return NextResponse.json({ error: "Firma seçin" }, { status: 400 })

  try {
    const sb = await getSupabaseServer()
    const { data: svcRows } = await sb.schema("hub").from("wizard_services")
      .select("name, config").eq("type", "pusula-program").eq("is_active", true).order("display_order")
    const programlar = ((svcRows ?? []) as { name: string; config: string | null }[]).map((r) => {
      let cfg: { exeName?: string | null; paramFileName?: string | null; programCode?: string | null } = {}
      try { cfg = r.config ? JSON.parse(r.config) : {} } catch { /* bozuk config */ }
      return { name: r.name, exeName: cfg.exeName ?? null, paramFileName: cfg.paramFileName ?? null, programCode: cfg.programCode ?? null }
    })

    const [sql, depo, rdp] = await Promise.all([hedef(b.sqlServerId), hedef(b.depoServerId), hedef(b.rdpServerId)])
    const sonuc = await olustur({
      firmaId: b.firmaId,
      firmaAdi: b.firmaAdi,
      hedefler: { sql, depo, rdp },
      programlar,
      gunSayisi: Math.max(1, Math.min(90, Number(b.gunSayisi) || 14)),
      notlar: b.notlar?.trim() || null,
      olusturan,
    })
    return NextResponse.json(sonuc)
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Hata" }, { status: 502 })
  }
}
