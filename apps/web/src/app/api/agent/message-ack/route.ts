import { NextRequest, NextResponse } from "next/server"
import { markMessageRead } from "@/lib/agent-store"

export async function POST(req: NextRequest) {
  const { msgId, username } = await req.json()

  if (!msgId || !username) {
    return NextResponse.json({ error: "msgId ve username zorunlu" }, { status: 400 })
  }

  markMessageRead(msgId, username)
  return NextResponse.json({ ok: true })
}
