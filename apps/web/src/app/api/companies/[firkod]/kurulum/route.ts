/**
 * GET /api/companies/[firkod]/kurulum?kullanici=<ad>
 *
 * Bir kullanıcı için hazır kurulum paketi (.zip). Üretim mantığı
 * `lib/kurulum-paketi.ts`'te — CRM de aynı fonksiyonu `/api/hub/kurulum`
 * üzerinden kullanıyor (27.08.2026). Buradaki iş yalnız yetki + yanıt.
 */

import { NextResponse } from "next/server"
import { requirePermission } from "@/lib/require-permission"
import { kurulumPaketiUret } from "@/lib/kurulum-paketi"

export async function GET(
  req: Request,
  { params }: { params: Promise<{ firkod: string }> },
) {
  const gate = await requirePermission("companies", "read")
  if (gate) return gate

  const { firkod } = await params
  const kullanici = new URL(req.url).searchParams.get("kullanici")?.trim() ?? ""

  try {
    const sonuc = await kurulumPaketiUret(firkod, kullanici)
    if (!sonuc.ok) {
      return NextResponse.json({ error: sonuc.hata }, { status: sonuc.kod })
    }
    return new NextResponse(Buffer.from(sonuc.zip), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${sonuc.dosyaAdi}"`,
        "Content-Length": String(sonuc.zip.length),
        "Cache-Control": "no-store",
      },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
