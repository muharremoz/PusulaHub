import { NextResponse } from "next/server"
import { query } from "@/lib/db"
import { requirePermission } from "@/lib/require-permission"
import { auth } from "@/auth"
import { broadcast } from "@/lib/messages-fanout"
import { getAllAgents } from "@/lib/agent-store"
import { randomUUID } from "crypto"

interface ServerRow {
  Id:   string
  Name: string
}

/**
 * POST /api/servers/[id]/notify
 * Tek sunucudaki aktif oturumlara mesaj gönderir.
 * Aslında merkezi `broadcast()` fonksiyonunu çağırır → DB'ye de yazılır.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requirePermission("messages", "write")
  if (gate) return gate

  const { id } = await params
  const { title, body: msgBody, type = "info" } = await req.json().catch(() => ({}))

  if (!title?.trim() || !msgBody?.trim()) {
    return NextResponse.json({ error: "Başlık ve mesaj zorunlu" }, { status: 400 })
  }

  const rows = await query<ServerRow[]>`
    SELECT Id, Name FROM Servers
    WHERE Id = ${id} OR LOWER(Name) = ${id.toLowerCase()}
  `
  if (!rows.length) {
    return NextResponse.json({ error: "Sunucu bulunamadı" }, { status: 404 })
  }
  const serverId = rows[0].Id

  // Sunucuda aktif WTS oturumu var mı? — yoksa yine de gönder ama "0 alıcı" döner
  const agent = getAllAgents().find(a => a.agentId === serverId)
  const sessions = agent?.lastReport?.sessions ?? []
  const usernames = Array.from(new Set(
    sessions.filter(s => s.username && s.state === "Active").map(s => s.username)
  ))

  if (usernames.length === 0) {
    return NextResponse.json({ ok: false, error: "Aktif oturum yok", sessions: 0 }, { status: 200 })
  }

  const session = await auth()
  const senderName   = session?.user?.fullName ?? session?.user?.username ?? "PusulaHub"
  const senderUserId = session?.user?.id       ?? null

  const result = await broadcast({
    msgId: randomUUID(),
    subject:       title.trim(),
    body:          msgBody.trim(),
    type:          (["info", "warning", "urgent"].includes(type) ? type : "info") as "info"|"warning"|"urgent",
    priority:      "normal",
    recipientType: "selected",
    targets:       usernames.map(u => ({ agentId: serverId, username: u })),
    senderName,
    senderUserId,
  })

  return NextResponse.json({
    ok:       result.serversOk > 0,
    sessions: result.totalRecipients,
    msgId:    result.msgId,
  })
}
