import { NextResponse } from "next/server"
import { getSupabaseServer } from "@/lib/supabase/server"

// GET /api/users/lookup — aktif kullanıcılar (atanan seçici için hafif endpoint)
export async function GET() {
  const sb = await getSupabaseServer()
  const { data } = await sb.from("users").select("id, name, email").eq("active", true).order("name")
  return NextResponse.json(((data ?? []) as { id: string; name: string | null; email: string | null }[]).map((u) => ({
    id: u.id,
    username: u.email?.split("@")[0] ?? u.name ?? "",
    fullName: u.name,
  })))
}
