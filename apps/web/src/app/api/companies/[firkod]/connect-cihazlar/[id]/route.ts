/**
 * POST /api/companies/[firkod]/connect-cihazlar/[id]  { islem: "2fa-sifirla" | "iptal" }
 *
 * 2fa-sifirla: telefon kayboldu — iki adımlı doğrulama kapanır; kullanıcı oturum şifresini yeniden girer.
 * iptal: bilgisayar kayboldu/el değiştirdi — cihaz Pusula'ya bağlanamaz, yeni kurulum kodu gerekir.
 */

import { NextRequest, NextResponse } from "next/server"
import { requirePermission } from "@/lib/require-permission"
import { connectCihazIslem } from "@/lib/connect-kodu"

export async function POST(req: NextRequest, { params }: { params: Promise<{ firkod: string; id: string }> }) {
  const gate = await requirePermission("companies", "write")
  if (gate) return gate
  const { firkod, id } = await params
  const b = (await req.json().catch(() => ({}))) as { islem?: string }
  if (b.islem !== "2fa-sifirla" && b.islem !== "iptal") return NextResponse.json({ error: "Geçersiz işlem" }, { status: 400 })
  try {
    const tamam = await connectCihazIslem(firkod, id, b.islem)
    if (!tamam) return NextResponse.json({ error: "Cihaz bu firmaya ait değil" }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Hata" }, { status: 502 })
  }
}
