import { NextResponse } from "next/server"
import { findServerBy } from "@/lib/hub-servers"
import { execOnAgent } from "@/lib/agent-poller"
import { requirePermission } from "@/lib/require-permission"

/* POST — Komut doğrudan agent'a gönder */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requirePermission("servers", "write")
  if (gate) return gate
  const { id } = await params
  const { command, timeout } = await req.json()
  if (!command?.trim()) return NextResponse.json({ error: "Komut boş olamaz" }, { status: 400 })

  const server = await findServerBy(id, "name, ip, api_key, agent_port") as
    { name: string; ip: string; api_key: string | null; agent_port: number | null } | null
  if (!server) return NextResponse.json({ error: "Sunucu bulunamadı" }, { status: 404 })
  if (!server.api_key || !server.agent_port) {
    return NextResponse.json({ error: "Agent bağlantı bilgileri eksik" }, { status: 400 })
  }

  const result = await execOnAgent(server.ip, server.agent_port, server.api_key, command.trim(), timeout ?? 30)
  return NextResponse.json({ ready: true, result })
}

/* GET — pull modelde exec anında döner, uyumluluk için bırakıldı */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await params
  return NextResponse.json({ ready: false, result: null })
}
