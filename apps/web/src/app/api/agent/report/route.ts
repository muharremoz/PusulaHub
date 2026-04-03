/* ══════════════════════════════════════════════════════════
   POST /api/agent/report
   Agent periyodik olarak buraya veri gönderir.
   Body: AgentReport
   Auth: Bearer token (kayıt sonrası alınan token)
══════════════════════════════════════════════════════════ */

import { NextRequest, NextResponse } from "next/server"
import { getAgentByToken, updateReport } from "@/lib/agent-store"
import type { AgentReport } from "@/lib/agent-types"

export async function POST(req: NextRequest) {
  try {
    const body: AgentReport = await req.json()

    /* ── Token doğrulama ── */
    const agent = getAgentByToken(body.token)
    if (!agent) {
      /* Agent yeniden kayıt yapmalı */
      return NextResponse.json(
        { error: "invalid_token", action: "reregister" },
        { status: 401 }
      )
    }

    /* ── AgentId eşleşmesi ── */
    if (agent.agentId !== body.agentId) {
      return NextResponse.json(
        { error: "Geçersiz agentId" },
        { status: 400 }
      )
    }

    /* ── Veriyi sakla ── */
    const ok = updateReport(agent.agentId, body)
    if (!ok) {
      return NextResponse.json({ error: "Kayıt bulunamadı" }, { status: 404 })
    }

    return NextResponse.json({
      ok:           true,
      nextInterval: 30,           // Agent bu kadar saniye bekleyecek
      serverTime:   new Date().toISOString(),
    })
  } catch (err) {
    console.error("[Agent Report]", err)
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 })
  }
}
