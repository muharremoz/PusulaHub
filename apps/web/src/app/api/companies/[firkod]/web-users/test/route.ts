import { NextResponse } from "next/server"
import { getSupabaseServer } from "@/lib/supabase/server"
import { requirePermission } from "@/lib/require-permission"
import { testWebUser } from "@/lib/web-users-ops"

/**
 * POST /api/companies/[firkod]/web-users/test
 * Body: { siteName, username, password, database?, via? }
 *
 * Users.xml'deki kullanıcının hizmete gerçekten giriş yapıp yapamadığını dener
 * ("lan" → sunucu IP'si, "wan" → DNS). Kapı burada; iş `@/lib/web-users-ops`te.
 */

export type { WebUserTestResult } from "@/lib/web-users-ops"

export async function POST(
  req: Request,
  { params }: { params: Promise<{ firkod: string }> },
) {
  // Şifreyle giriş denemesi yapıyor — okuma yetkisi yeterli değil.
  const gate = await requirePermission("company-detail", "write")
  if (gate) return gate

  const { firkod } = await params
  try {
    const body = (await req.json()) as {
      siteName?: string; username?: string; password?: string; database?: string
      via?: "lan" | "wan"
    }
    const sb = await getSupabaseServer()
    return await testWebUser(sb, firkod, body)
  } catch (err) {
    console.error("[POST /api/companies/[firkod]/web-users/test]", err)
    return NextResponse.json({ error: "Erişim testi yapılamadı" }, { status: 500 })
  }
}
