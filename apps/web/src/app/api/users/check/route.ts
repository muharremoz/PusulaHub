import { NextRequest, NextResponse } from "next/server"
import { getSupabaseServer } from "@/lib/supabase/server"
import { auth } from "@/auth"

/**
 * Kullanıcı formu için unique kontrolü (public.users).
 *   ?username=foo  → name eşleşmesi   ·   ?email=foo@x → email eşleşmesi
 *   ?exceptId=<uuid> → edit'te kendi kaydını hariç tut. Sadece admin.
 * Not: birleşik modelde login = email; username kozmetik (name).
 */
export async function GET(req: NextRequest) {
  const session = await auth()
  if (session?.user?.role !== "admin") return NextResponse.json({ error: "Yetkisiz" }, { status: 403 })

  const username = req.nextUrl.searchParams.get("username")?.trim()
  const email    = req.nextUrl.searchParams.get("email")?.trim()
  const exceptId = req.nextUrl.searchParams.get("exceptId") ?? null
  if (!username && !email) return NextResponse.json({ error: "username veya email zorunlu" }, { status: 400 })

  const sb = await getSupabaseServer()
  let q = sb.from("users").select("id")
  q = email ? q.ilike("email", email) : q.ilike("name", username!)
  if (exceptId) q = q.neq("id", exceptId)
  const { data } = await q.limit(1)
  return NextResponse.json({ taken: (data?.length ?? 0) > 0 })
}
