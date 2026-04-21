import { NextResponse } from "next/server"
import { MODULES } from "@/lib/permissions"
import { requireAuth } from "@/lib/require-permission"

export async function GET() {
  const gate = await requireAuth()
  if (gate) return gate
  return NextResponse.json(MODULES)
}
