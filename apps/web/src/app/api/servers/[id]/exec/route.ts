import { NextResponse } from "next/server"
import { query } from "@/lib/db"
import { getAllAgents, queueExec, getExecResult } from "@/lib/agent-store"

interface ServerRow { Name: string; IP: string }

/* POST — Komut kuyruğa ekle */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { command } = await req.json()

  if (!command?.trim()) {
    return NextResponse.json({ error: "Komut boş olamaz" }, { status: 400 })
  }

  // DB'den sunucu bilgisini al
  const rows = await query<ServerRow[]>`
    SELECT Name, IP FROM Servers WHERE Id = ${id}
  `
  if (!rows.length) {
    return NextResponse.json({ error: "Sunucu bulunamadı" }, { status: 404 })
  }

  const { Name, IP } = rows[0]

  // Agent'ı eşleştir
  const agents = getAllAgents()
  const agent  = agents.find((a) => a.hostname === Name || a.ip === IP)

  if (!agent) {
    return NextResponse.json({ error: "Bu sunucuda aktif agent yok" }, { status: 503 })
  }

  if (agent.status === "offline") {
    return NextResponse.json({ error: "Agent çevrimdışı" }, { status: 503 })
  }

  const execId = queueExec(agent.agentId, command.trim())
  if (!execId) {
    return NextResponse.json({ error: "Komut kuyruğa eklenemedi" }, { status: 500 })
  }

  return NextResponse.json({ execId })
}

/* GET — Sonucu poll et */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  await params
  const execId = new URL(req.url).searchParams.get("execId")
  if (!execId) {
    return NextResponse.json({ error: "execId gerekli" }, { status: 400 })
  }

  const result = getExecResult(execId)
  if (!result) {
    return NextResponse.json({ ready: false })
  }

  return NextResponse.json({ ready: true, result })
}
