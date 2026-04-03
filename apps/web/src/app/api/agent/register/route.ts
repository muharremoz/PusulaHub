/* ══════════════════════════════════════════════════════════
   POST /api/agent/register
   Agent ilk çalıştığında veya token sıfırlandığında çağırır.
   Body: AgentRegisterRequest
   Auth: secret (AGENT_SECRET env var ile eşleşmeli)
══════════════════════════════════════════════════════════ */

import { NextRequest, NextResponse } from "next/server"
import { registerAgent } from "@/lib/agent-store"
import type { AgentRegisterRequest, AgentRegisterResponse } from "@/lib/agent-types"

export async function POST(req: NextRequest) {
  try {
    const body: AgentRegisterRequest = await req.json()

    /* ── Secret doğrulama ── */
    const expectedSecret = process.env.AGENT_SECRET
    if (!expectedSecret) {
      return NextResponse.json(
        { error: "AGENT_SECRET env var tanımlı değil" },
        { status: 500 }
      )
    }
    if (body.secret !== expectedSecret) {
      return NextResponse.json(
        { error: "Geçersiz secret" },
        { status: 401 }
      )
    }

    /* ── Zorunlu alanlar ── */
    if (!body.hostname || !body.ip || !body.os || !body.version) {
      return NextResponse.json(
        { error: "Eksik alan: hostname, ip, os, version zorunlu" },
        { status: 400 }
      )
    }

    /* ── Agent kaydet / güncelle ── */
    const agent = registerAgent({
      hostname:  body.hostname,
      ip:        body.ip,
      os:        body.os,
      version:   body.version,
      localPort: body.localPort ?? 8585,
    })

    const response: AgentRegisterResponse = {
      agentId:    agent.agentId,
      token:      agent.token,
      hubVersion: "1.0.0",
    }

    console.log(`[Agent] Kayıt: ${body.hostname} (${body.ip}) [${body.os}]`)

    return NextResponse.json(response, { status: 200 })
  } catch (err) {
    console.error("[Agent Register]", err)
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 })
  }
}
