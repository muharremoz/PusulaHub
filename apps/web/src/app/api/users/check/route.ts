import { NextRequest, NextResponse } from "next/server"
import { query } from "@/lib/db"
import { auth } from "@/auth"

/**
 * Kullanıcı oluşturma/düzenleme sheet'inde username ve email alanları için
 * anlık (debounced) unique kontrolü yapar.
 *   GET /api/users/check?username=foo          → { taken: bool }
 *   GET /api/users/check?email=foo@x           → { taken: bool }
 *   GET /api/users/check?username=foo&exceptId=<uuid>  (edit için kendi kaydını hariç tut)
 *
 * Sadece global Süper Admin çağırabilir (kullanıcı yönetimi yetkisi).
 */
export async function GET(req: NextRequest) {
  const session = await auth()
  if (session?.user?.role !== "admin") {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 403 })
  }

  const username  = req.nextUrl.searchParams.get("username")?.trim()
  const email     = req.nextUrl.searchParams.get("email")?.trim()
  const exceptId  = req.nextUrl.searchParams.get("exceptId") ?? null

  if (!username && !email) {
    return NextResponse.json({ error: "username veya email zorunlu" }, { status: 400 })
  }

  if (username) {
    const rows = await query<{ c: number }[]>`
      SELECT COUNT(*) AS c
      FROM dbo.AppUsers
      WHERE LOWER(Username) = ${username.toLowerCase()}
        AND (${exceptId} IS NULL OR Id <> ${exceptId})
    `
    return NextResponse.json({ taken: rows[0].c > 0 })
  }

  // email
  const rows = await query<{ c: number }[]>`
    SELECT COUNT(*) AS c
    FROM dbo.AppUsers
    WHERE LOWER(Email) = ${email!.toLowerCase()}
      AND (${exceptId} IS NULL OR Id <> ${exceptId})
  `
  return NextResponse.json({ taken: rows[0].c > 0 })
}
