import { NextResponse } from "next/server"
import { findServerBy } from "@/lib/hub-servers"
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

  const server = await findServerBy(id, "id") as { id: string } | null
  const serverId = server?.id
  if (!serverId) {
    return NextResponse.json({ error: "Sunucu bulunamadı" }, { status: 404 })
  }

  const msg = queueMessage(serverId, {
    title:     title.trim(),
    body:      body.trim(),
    type,
    from,
    toCompany: "",
  })

  if (!msg) {
    return NextResponse.json({ error: "Agent bulunamadı veya çevrimdışı" }, { status: 404 })
  }

  return NextResponse.json({ ok: true, id: msg.id })
}
