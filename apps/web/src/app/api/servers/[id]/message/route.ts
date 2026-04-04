import { NextResponse } from "next/server"
import { query } from "@/lib/db"
import { queueMessage } from "@/lib/agent-store"

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { title, body, type = "info", from = "Pusula Hub" } = await req.json()

  if (!title?.trim() || !body?.trim()) {
    return NextResponse.json({ error: "Başlık ve mesaj zorunlu" }, { status: 400 })
  }

  const rows = await query<{ Id: string }[]>`
    SELECT Id FROM Servers WHERE Id = ${id} OR LOWER(Name) = ${id.toLowerCase()}
  `
  const serverId = rows[0]?.Id
  if (!serverId) {
    return NextResponse.json({ error: "Sunucu bulunamadı" }, { status: 404 })
  }

  const msg = queueMessage(serverId, {
    title: title.trim(),
    body: body.trim(),
    type,
    from,
    toCompany: "",
    delivered: false,
  })

  if (!msg) {
    return NextResponse.json({ error: "Agent bulunamadı veya çevrimdışı" }, { status: 404 })
  }

  return NextResponse.json({ ok: true, id: msg.id })
}
