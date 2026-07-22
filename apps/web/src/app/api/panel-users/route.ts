import { NextResponse } from "next/server"
import { getSupabaseServer } from "@/lib/supabase/server"

export async function GET() {
  try {
    const sb = await getSupabaseServer()
    const { data, error } = await sb.schema("hub").from("panel_users").select("id, name, email, role").order("name")
    if (error) throw error
    return NextResponse.json(((data ?? []) as { id: string; name: string; email: string; role: string }[])
      .map(r => ({ Id: r.id, Name: r.name, Email: r.email, Role: r.role })))
  } catch (err) {
    console.error("[GET /api/panel-users]", err)
    return NextResponse.json({ error: "Kullanıcılar alınamadı" }, { status: 500 })
  }
}
