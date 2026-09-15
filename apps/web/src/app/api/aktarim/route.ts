/**
 * GET  /api/aktarim   → admin: aktarım listesi (Ubuntu'dan proxy)
 * POST /api/aktarim   → admin: yeni aktarım oluştur (Ubuntu'ya forward)
 *
 * Aktarım state'i artık Ubuntu (10.15.2.6) SQLite'ında tutuluyor.
 * Hub yalnızca admin UI sunar ve isteği VPN üzerinden Ubuntu'ya proxy eder.
 */

import { NextRequest, NextResponse } from "next/server"
import { requirePermission } from "@/lib/require-permission"
import { auth } from "@/auth"
import { listSessions, createSession, type CreateInput } from "@/lib/aktarim-proxy"
import { getSupabaseServer } from "@/lib/supabase/server"
import { decrypt } from "@/lib/crypto"

interface ServerCred {
  Name:     string
  IP:       string
  Username: string | null   // Windows admin (push SMB için)
  Password: string | null
}

async function loadServerCreds(id: string | null | undefined): Promise<ServerCred | null> {
  if (!id) return null
  const sb = await getSupabaseServer()
  const { data } = await sb.schema("hub").from("servers").select("name, ip, username, password").eq("id", id).maybeSingle()
  if (!data) return null
  const r = data as { name: string; ip: string; username: string | null; password: string | null }
  let pw: string | null = r.password ?? null
  if (pw && pw.startsWith("enc:v1:")) {
    try { const dec = decrypt(pw); if (dec) pw = dec } catch { /* plain */ }
  }
  return { Name: r.name, IP: r.ip, Username: r.username, Password: pw }
}

export async function GET() {
  const gate = await requirePermission("aktarim", "read")
  if (gate) return gate
  try {
    const list = await listSessions()
    return NextResponse.json(list)
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Hata" }, { status: 502 })
  }
}

export async function POST(req: NextRequest) {
  const gate = await requirePermission("aktarim", "write")
  if (gate) return gate
  const session = await auth()
  const createdBy = session?.user?.username ?? session?.user?.email ?? null

  let body: CreateInput
  try { body = (await req.json()) as CreateInput } catch {
    return NextResponse.json({ error: "Geçersiz JSON" }, { status: 400 })
  }
  if (!body.companyId || !body.firmaName) {
    return NextResponse.json({ error: "companyId ve firmaName zorunludur" }, { status: 400 })
  }

  try {
    // Firmanın terminal (RDP) sunucusu — program dosyaları buraya gider.
    // Firma kurulmamışsa yok; o durumda müşteri sayfasında program alanı görünmez.
    const sb = await getSupabaseServer()
    const { data: comp } = await sb.schema("hub").from("companies")
      .select("windows_server_id").eq("company_id", body.companyId).maybeSingle()
    const rdpServerId = (comp as { windows_server_id: string | null } | null)?.windows_server_id ?? null

    // Müşterinin seçeceği programlar (Perakende, Toptan…) — hizmet kataloğundaki pusula-program'lar
    const { data: svcRows } = await sb.schema("hub").from("wizard_services")
      .select("name, config").eq("type", "pusula-program").eq("is_active", true).order("display_order")
    const programOptions = ((svcRows ?? []) as { name: string; config: string | null }[]).map((r) => {
      let cfg: { exeName?: string | null; paramFileName?: string | null; programCode?: string | null } = {}
      try { cfg = r.config ? JSON.parse(r.config) : {} } catch { /* bozuk config */ }
      return {
        name: r.name,
        exeName: cfg.exeName ?? null,
        paramFileName: cfg.paramFileName ?? null,
        // 909 = Perakende: parametrede <DATAKODU>/<OPENOFFICE> blok biçimi kullanılır
        programCode: cfg.programCode ?? null,
      }
    })

    // SQL, Depo ve terminal sunucusu credential'larını çek
    const [sqlSrv, depoSrv, rdpSrv] = await Promise.all([
      loadServerCreds(body.sqlServerId),
      loadServerCreds(body.depoServerId),
      loadServerCreds(rdpServerId),
    ])

    const payload: CreateInput = {
      ...body,
      createdBy,
      sqlServerName:  sqlSrv?.Name      ?? null,
      sqlServerIp:    sqlSrv?.IP        ?? null,
      sqlUsername:    sqlSrv?.Username  ?? null,
      sqlPassword:    sqlSrv?.Password  ?? null,
      depoServerName: depoSrv?.Name     ?? null,
      depoServerIp:   depoSrv?.IP       ?? null,
      depoUsername:   depoSrv?.Username ?? null,
      depoPassword:   depoSrv?.Password ?? null,
      rdpServerName:  rdpSrv?.Name      ?? null,
      rdpServerIp:    rdpSrv?.IP        ?? null,
      rdpUsername:    rdpSrv?.Username  ?? null,
      rdpPassword:    rdpSrv?.Password  ?? null,
      programOptions,
    }
    const sess = await createSession(payload)
    return NextResponse.json(sess)
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Hata" }, { status: 502 })
  }
}
