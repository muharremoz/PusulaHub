import { NextResponse } from "next/server"
import { requirePermission } from "@/lib/require-permission"
import { getMessage, getRecipients } from "@/lib/messages-db"

/**
 * GET /api/messages/[id]
 * Mesaj detayı + alıcı (sunucu+kullanıcı) listesi.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requirePermission("messages", "read")
  if (gate) return gate

  const { id } = await params
  try {
    const m = await getMessage(id)
    if (!m) return NextResponse.json({ error: "Mesaj bulunamadı" }, { status: 404 })

    const recipients = await getRecipients(id)

    return NextResponse.json({
      message: {
        id:            m.Id,
        subject:       m.Subject,
        body:          m.Body,
        type:          m.Type,
        priority:      m.Priority,
        recipientType: m.RecipientType,
        companyId:     m.CompanyId,
        companyName:   m.CompanyName,
        senderName:    m.SenderName,
        sentAt:        m.SentAt,
        totalCount:    m.TotalCount,
        readCount:     m.ReadCount,
      },
      recipients: recipients.map(r => ({
        id:           r.Id,
        serverId:     r.ServerId,
        serverName:   r.ServerName,
        username:     r.Username,
        status:       r.Status,
        deliveredAt:  r.DeliveredAt,
        readAt:       r.ReadAt,
        errorMessage: r.ErrorMessage,
      })),
    })
  } catch (err) {
    console.error("[GET /api/messages/[id]]", err)
    return NextResponse.json({ error: "Mesaj detayı alınamadı" }, { status: 500 })
  }
}
