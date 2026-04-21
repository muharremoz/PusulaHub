import { NextRequest, NextResponse } from "next/server"
import { randomUUID } from "crypto"
import { auth } from "@/auth"
import { requirePermission } from "@/lib/require-permission"
import { listMessages, type MessageType, type MessagePriority, type RecipientKind } from "@/lib/messages-db"
import { broadcast } from "@/lib/messages-fanout"

/**
 * GET /api/messages
 * Tüm mesajların listesi (filtreli, sayfalı).
 * Query: ?search=...&type=info|warning|urgent&agentId=...&limit=50&offset=0
 */
export async function GET(req: NextRequest) {
  const gate = await requirePermission("messages", "read")
  if (gate) return gate

  const { searchParams } = new URL(req.url)
  const search  = searchParams.get("search")  ?? undefined
  const type    = searchParams.get("type")    ?? undefined
  const agentId = searchParams.get("agentId") ?? undefined
  const limit   = parseInt(searchParams.get("limit")  ?? "100", 10)
  const offset  = parseInt(searchParams.get("offset") ?? "0",   10)

  try {
    const rows = await listMessages({
      search,
      type:    type as MessageType | undefined,
      agentId: agentId ?? undefined,
      limit:   isNaN(limit)  ? 100 : limit,
      offset:  isNaN(offset) ? 0   : offset,
    })
    return NextResponse.json({
      messages: rows.map(r => ({
        id:            r.Id,
        subject:       r.Subject,
        body:          r.Body,
        type:          r.Type,
        priority:      r.Priority,
        recipientType: r.RecipientType,
        companyId:     r.CompanyId,
        companyName:   r.CompanyName,
        senderName:    r.SenderName,
        sentAt:        r.SentAt,
        totalCount:    r.TotalCount,
        readCount:     r.ReadCount,
      })),
    })
  } catch (err) {
    console.error("[GET /api/messages]", err)
    return NextResponse.json({ error: "Mesajlar alınamadı" }, { status: 500 })
  }
}

/**
 * POST /api/messages
 * Broadcast: tek mesajı seçilen alıcı kümesine fan-out eder.
 *
 * Body:
 * {
 *   subject:       string
 *   body:          string
 *   type?:         "info"|"warning"|"urgent"     (default "info")
 *   priority?:     "normal"|"high"|"urgent"      (default "normal")
 *   recipientType: "all"|"company"|"selected"
 *   companyId?:    string                        (recipientType="company")
 *   targets?:      [{agentId, username}]         (recipientType="selected")
 * }
 */
export async function POST(req: NextRequest) {
  const gate = await requirePermission("messages", "write")
  if (gate) return gate

  try {
    const body = await req.json().catch(() => ({}))
    const subject       = (body.subject ?? "").toString().trim()
    const msgBody       = (body.body ?? "").toString().trim()
    const type          = ["info", "warning", "urgent"].includes(body.type) ? body.type : "info"
    const priority      = ["normal", "high", "urgent"].includes(body.priority) ? body.priority : "normal"
    const recipientType = ["all", "company", "selected"].includes(body.recipientType) ? body.recipientType : null
    const companyId     = body.companyId?.toString() ?? null
    const targets       = Array.isArray(body.targets) ? body.targets : []

    if (!subject || !msgBody) {
      return NextResponse.json({ error: "Konu ve mesaj zorunlu" }, { status: 400 })
    }
    if (!recipientType) {
      return NextResponse.json({ error: "Geçerli bir alıcı tipi belirtilmeli" }, { status: 400 })
    }
    if (recipientType === "company" && !companyId) {
      return NextResponse.json({ error: "Firma seçimi zorunlu" }, { status: 400 })
    }
    if (recipientType === "selected" && targets.length === 0) {
      return NextResponse.json({ error: "En az bir alıcı seçilmeli" }, { status: 400 })
    }

    const session = await auth()
    const senderName   = session?.user?.fullName ?? session?.user?.username ?? "PusulaHub"
    const senderUserId = session?.user?.id       ?? null

    const result = await broadcast({
      msgId: randomUUID(),
      subject,
      body:  msgBody,
      type:  type as MessageType,
      priority: priority as MessagePriority,
      recipientType: recipientType as RecipientKind,
      companyId,
      targets,
      senderName,
      senderUserId,
    })

    if (result.totalRecipients === 0) {
      return NextResponse.json({
        ok: false,
        error: "Hedef alıcı bulunamadı (aktif oturum yok ya da sunucular çevrimdışı)",
        ...result,
      }, { status: 200 })
    }

    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    console.error("[POST /api/messages]", err)
    return NextResponse.json({ error: "Mesaj gönderilemedi" }, { status: 500 })
  }
}
