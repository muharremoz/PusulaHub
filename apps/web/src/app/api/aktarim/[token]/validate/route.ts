/**
 * GET /api/aktarim/[token]/validate
 *
 * Ubuntu upload servisi tarafından çağrılır — token geçerli mi?
 * Auth: X-Service-Key header'ı + .env'deki TRANSFER_SERVICE_KEY ile eşleşmeli.
 *
 * Müşteri arayüzünden gelen istek değil — yalnızca güvenli sunucu-arka-sunucu.
 *
 * Response (200):
 *   { ok: true, session: {...}, agents: { sql?: { ip, port, apiKey }, depo?: {...} } }
 * Response (404 / 410):
 *   { ok: false, reason: 'not_found' | 'expired' | 'cancelled' | 'completed' }
 */

import { NextRequest, NextResponse } from "next/server"
import { getTransferSessionByToken, updateTransferProgress } from "@/lib/transfer-sessions"
import { query } from "@/lib/db"
import { decrypt } from "@/lib/crypto"

function isServiceAuthorized(req: NextRequest): boolean {
  const expected = process.env.TRANSFER_SERVICE_KEY ?? ""
  if (!expected) return false
  const got = req.headers.get("x-service-key") ?? ""
  return got === expected
}

interface ServerRow {
  Id:           string
  IP:           string
  AgentPort:    number | null
  ApiKey:       string | null
  EncryptedApiKey?: string | null
}

async function loadAgent(serverId: string | null): Promise<
  { ip: string; port: number; apiKey: string } | null
> {
  if (!serverId) return null
  const rows = await query<ServerRow[]>`
    SELECT Id, IP, AgentPort, ApiKey FROM Servers WHERE Id = ${serverId}
  `
  const r = rows[0]
  if (!r || !r.IP || !r.AgentPort || !r.ApiKey) return null

  // ApiKey 'enc:v1:...' prefix'i ile encrypted olabilir
  let key: string = r.ApiKey
  if (key.startsWith("enc:v1:")) {
    try {
      const dec = decrypt(key)
      if (dec) key = dec
    } catch { /* plaintext kalsın */ }
  }
  return { ip: r.IP, port: r.AgentPort, apiKey: key }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  if (!isServiceAuthorized(req)) {
    return NextResponse.json({ ok: false, reason: "unauthorized" }, { status: 401 })
  }

  const { token } = await params
  const sess = await getTransferSessionByToken(token)
  if (!sess) {
    return NextResponse.json({ ok: false, reason: "not_found" }, { status: 404 })
  }

  if (sess.Status === "cancelled" || sess.Status === "expired") {
    return NextResponse.json({ ok: false, reason: sess.Status }, { status: 410 })
  }
  if (sess.Status === "completed") {
    return NextResponse.json({ ok: false, reason: "completed" }, { status: 410 })
  }

  // ExpiresAt geçtiyse otomatik 'expired' işaretle
  if (new Date(sess.ExpiresAt) < new Date()) {
    await updateTransferProgress(token, { status: "expired" })
    return NextResponse.json({ ok: false, reason: "expired" }, { status: 410 })
  }

  const [sqlAgent, depoAgent] = await Promise.all([
    loadAgent(sess.SqlServerId),
    loadAgent(sess.DepoServerId),
  ])

  return NextResponse.json({
    ok: true,
    session: sess,
    agents: { sql: sqlAgent, depo: depoAgent },
  })
}
