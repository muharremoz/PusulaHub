import { NextRequest, NextResponse } from "next/server"
import { DebugHatasi, baslat, durdur, klasorler, oku } from "@/lib/firma-debug"

/**
 * Firma debug izleme — alt uygulamalar (CRM → SQL Konsol) için.
 * Auth: x-internal-key (Hub middleware `/api/hub/*` yolunu kapıdan muaf tutar).
 *
 * Kullanıcı yetkilendirmesini ÇAĞIRAN yapar: CRM, firkod'u konsol oturumundan
 * alır (istekten değil), böylece konsol yalnız kendi oturumunun firmasına
 * erişir. Sunucu seçimi YOK — firmanın Windows sunucusu kullanılır.
 *
 *   GET  ?firkod=…&islem=klasorler        → { klasorler, kok, eksik, sunucu }
 *   GET  ?firkod=…&islem=oku&id=…&ofset=N → { icerik, ofset, boyut, devami, durdu }
 *   POST { firkod, islem: "baslat", klasor, kim } → { id, path, sunucu, paylasimli }
 *   POST { firkod, islem: "durdur", id }          → { silindi }
 */

function yetkili(req: NextRequest): NextResponse | null {
  const expected = process.env.INTERNAL_APP_KEY
  if (!expected) return NextResponse.json({ error: "INTERNAL_APP_KEY Hub'da tanımlı değil." }, { status: 500 })
  if (req.headers.get("x-internal-key") !== expected) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  return null
}

function hata(err: unknown) {
  if (err instanceof DebugHatasi) return NextResponse.json({ error: err.message }, { status: err.durum })
  return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
}

const yanit = (veri: unknown) => NextResponse.json(veri, { headers: { "Cache-Control": "no-store" } })

export async function GET(req: NextRequest) {
  const red = yetkili(req)
  if (red) return red
  const sp = req.nextUrl.searchParams
  const firkod = (sp.get("firkod") ?? "").trim()
  if (!firkod) return NextResponse.json({ error: "firkod zorunlu" }, { status: 400 })
  try {
    switch (sp.get("islem")) {
      case "klasorler": return yanit(await klasorler(firkod))
      case "oku": {
        const id = sp.get("id")
        if (!id) return NextResponse.json({ error: "id zorunlu" }, { status: 400 })
        return yanit(await oku(firkod, id, Number(sp.get("ofset") ?? 0)))
      }
      default: return NextResponse.json({ error: "islem klasorler veya oku olmalı" }, { status: 400 })
    }
  } catch (err) {
    return hata(err)
  }
}

export async function POST(req: NextRequest) {
  const red = yetkili(req)
  if (red) return red
  try {
    const b = (await req.json()) as { firkod?: string; islem?: string; klasor?: string; kim?: string; id?: string }
    const firkod = (b.firkod ?? "").trim()
    if (!firkod) return NextResponse.json({ error: "firkod zorunlu" }, { status: 400 })
    if (b.islem === "baslat") return yanit(await baslat(firkod, b.klasor ?? "", { kaynak: "sql-konsol", kim: b.kim ?? null }))
    if (b.islem === "durdur") {
      if (!b.id) return NextResponse.json({ error: "id zorunlu" }, { status: 400 })
      return yanit(await durdur(firkod, b.id))
    }
    return NextResponse.json({ error: "islem baslat veya durdur olmalı" }, { status: 400 })
  } catch (err) {
    return hata(err)
  }
}
