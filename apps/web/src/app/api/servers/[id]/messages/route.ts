import { NextResponse } from "next/server"
import { getSentMessages } from "@/lib/agent-store"

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const messages = getSentMessages(id)
  return NextResponse.json({ messages })
}
