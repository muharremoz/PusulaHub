import { NextResponse } from "next/server"
import { getSupabaseServer } from "@/lib/supabase/server"

export async function GET() {
  try {
    const sb = await getSupabaseServer()
    const { data, error } = await sb.schema("hub").from("settings").select("key, value")
    if (error) throw error

    const settings: Record<string, string> = {}
    for (const r of (data ?? []) as { key: string; value: string | null }[]) {
      settings[r.key] = r.value ?? ""
    }
    return NextResponse.json(settings)
  } catch (err) {
    console.error("[GET /api/settings]", err)
    return NextResponse.json({ error: "Ayarlar alınamadı" }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const body: Record<string, string> = await req.json()
    const rows = Object.entries(body).map(([key, value]) => ({
      key,
      value,
      updated_at: new Date().toISOString(),
    }))
    if (rows.length) {
      const sb = await getSupabaseServer()
      const { error } = await sb.schema("hub").from("settings").upsert(rows, { onConflict: "key" })
      if (error) throw error
    }
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error("[POST /api/settings]", err)
    return NextResponse.json({ error: "Ayarlar kaydedilemedi" }, { status: 500 })
  }
}
