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
import { query } from "@/lib/db"
import { decrypt } from "@/lib/crypto"

interface ServerCred {
  Name:        string
  IP:          string
  Username:    string | null   // Windows admin (SMB için)
  Password:    string | null
  SqlUsername: string | null   // SQL Auth (BACKUP DATABASE için)
  SqlPassword: string | null
}

function maybeDecrypt(s: string | null): string | null {
  if (!s) return null
  if (s.startsWith("enc:v1:")) {
    try { const dec = decrypt(s); if (dec) return dec } catch { /* plain */ }
  }
  return s
}

async function loadServerCreds(id: string | null | undefined): Promise<ServerCred | null> {
  if (!id) return null
  const rows = await query<ServerCred[]>`
    SELECT Name, IP, Username, Password, SqlUsername, SqlPassword
    FROM Servers WHERE Id = ${id}
  `
  if (!rows.length) return null
  const r = rows[0]
  return {
    Name:        r.Name,
    IP:          r.IP,
    Username:    r.Username,
    Password:    maybeDecrypt(r.Password),
    SqlUsername: r.SqlUsername,
    SqlPassword: maybeDecrypt(r.SqlPassword),
  }
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
    // SQL ve Depo sunucusu credential'larını çek
    const [sqlSrv, depoSrv] = await Promise.all([
      loadServerCreds(body.sqlServerId),
      loadServerCreds(body.depoServerId),
    ])

    const payload: CreateInput = {
      ...body,
      createdBy,
      sqlServerName:    sqlSrv?.Name        ?? null,
      sqlServerIp:      sqlSrv?.IP          ?? null,
      sqlUsername:      sqlSrv?.Username    ?? null,
      sqlPassword:      sqlSrv?.Password    ?? null,
      sqlAuthUsername:  sqlSrv?.SqlUsername ?? null,
      sqlAuthPassword:  sqlSrv?.SqlPassword ?? null,
      depoServerName:   depoSrv?.Name       ?? null,
      depoServerIp:     depoSrv?.IP         ?? null,
      depoUsername:     depoSrv?.Username   ?? null,
      depoPassword:     depoSrv?.Password   ?? null,
    }
    const sess = await createSession(payload)
    return NextResponse.json(sess)
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Hata" }, { status: 502 })
  }
}
