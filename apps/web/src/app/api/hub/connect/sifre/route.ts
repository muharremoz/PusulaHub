/**
 * POST /api/hub/connect/sifre  { firma, kullanici }
 *
 * Kullanıcının Hub'da saklı (son sıfırlanan) AD şifresi — Connect uygulaması şifre değişince kendisi
 * güncellesin diye (kullanıcı kararı 03.10.2026). Connect servisi cihazı (ve açıksa 2FA kodunu)
 * doğruladıktan sonra çağırır; şifreyi saklamaz, yalnız iletir.
 * DİKKAT: yanıt DÜZ METİN ŞİFRE içerir. Auth: X-Service-Key = TRANSFER_SERVICE_KEY.
 */
import { NextRequest, NextResponse } from "next/server"
import { kullaniciSifreKaydi, servisAnahtariDogru, sifreCoz } from "@/lib/connect-hub-ic"

export async function POST(req: NextRequest) {
  if (!servisAnahtariDogru(req.headers.get("x-service-key"))) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  const b = (await req.json().catch(() => ({}))) as { firma?: string; kullanici?: string }
  const firma = String(b.firma ?? "").trim(), kullanici = String(b.kullanici ?? "").trim()
  if (!firma || !kullanici) return NextResponse.json({ error: "firma ve kullanici zorunlu" }, { status: 400 })
  try {
    const kayit = await kullaniciSifreKaydi(firma, kullanici)
    const sifre = kayit ? sifreCoz(kayit.sifreli) : null
    if (!kayit || !sifre) return NextResponse.json({ error: "Bu kullanıcının şifresi Hub'da kayıtlı değil" }, { status: 404 })
    return NextResponse.json({ sifre, sifreSurumu: kayit.surum }, { headers: { "Cache-Control": "no-store" } })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
