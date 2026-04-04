import { NextResponse } from "next/server"
import { query } from "@/lib/db"
import { execOnAgent } from "@/lib/agent-poller"

interface ServerRow {
  Name: string
  IP: string
  ApiKey: string | null
  AgentPort: number | null
}

/* POST — Komut doğrudan agent'a gönder */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { command, timeout } = await req.json()

  if (!command?.trim()) {
    return NextResponse.json({ error: "Komut boş olamaz" }, { status: 400 })
  }

  // DB'den sunucu bilgisini al
  const rows = await query<ServerRow[]>`
    SELECT Name, IP, ApiKey, AgentPort FROM Servers WHERE Id = ${id} OR LOWER(Name) = ${id.toLowerCase()}
  `
  if (!rows.length) {
    return NextResponse.json({ error: "Sunucu bulunamadı" }, { status: 404 })
  }

  const server = rows[0]
  if (!server.ApiKey || !server.AgentPort) {
    return NextResponse.json({ error: "Agent bağlantı bilgileri eksik" }, { status: 400 })
  }

  // Agent'a doğrudan HTTP çağrısı
  const result = await execOnAgent(
    server.IP,
    server.AgentPort,
    server.ApiKey,
    command.trim(),
    timeout ?? 30,
  )

  return NextResponse.json({ ready: true, result })
}

/* GET — Artık gerekli değil ama uyumluluk için bırakıyoruz */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  await params
  // Pull modelde exec sonucu anında döner, polling'e gerek yok
  return NextResponse.json({ ready: false, result: null })
}
