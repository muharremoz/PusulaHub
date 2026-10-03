/**
 * POST /api/hub/connect/sifre  { firma, kullanici }
 *
 * Kullanıcının Hub'da saklı (son sıfırlanan) AD şifresi — Connect uygulaması şifre değişince kendisi
 * güncellesin diye (kullanıcı kararı 03.10.2026). Connect servisi cihazı (ve açıksa 2FA kodunu)
 * doğruladıktan sonra çağırır; şifreyi saklamaz, yalnız iletir.
 * DİKKAT: yanıt DÜZ METİN ŞİFRE içerir. Auth: X-Service-Key = CONNECT_SERVICE_KEY.
 * Ek daraltma: kullanıcının Connect servisinde iptal edilmemiş bir cihazı yoksa şifre VERİLMEZ — anahtar
 * sızsa bile yalnız Connect kullanan kullanıcıların şifresi risk altında olur (servis ele geçirilmişse bu
 * denetim işe yaramaz; onun karşılığı anahtarın ayrı olması ve güncelleme imzası).
 */
import { NextRequest, NextResponse } from "next/server"
import { kullaniciSifreKaydi, servisAnahtariDogru, sifreCoz } from "@/lib/connect-hub-ic"
import { connectTumCihazlar } from "@/lib/connect-yonetim"

export async function POST(req: NextRequest) {
  if (!servisAnahtariDogru(req.headers.get("x-service-key"))) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  const b = (await req.json().catch(() => ({}))) as { firma?: string; kullanici?: string }
  const firma = String(b.firma ?? "").trim(), kullanici = String(b.kullanici ?? "").trim()
  if (!firma || !kullanici) return NextResponse.json({ error: "firma ve kullanici zorunlu" }, { status: 400 })
  try {
    let cihazlar
    try { cihazlar = await connectTumCihazlar(firma) }
    catch (e) { return NextResponse.json({ error: "Connect cihazı doğrulanamadı: " + (e instanceof Error ? e.message : String(e)) }, { status: 503 }) }
    if (!cihazlar.some((c) => !c.iptal && c.kullanici.toLowerCase() === kullanici.toLowerCase()))
      return NextResponse.json({ error: "Bu kullanıcının kayıtlı Connect cihazı yok" }, { status: 403 })
    const kayit = await kullaniciSifreKaydi(firma, kullanici)
    const sifre = kayit ? sifreCoz(kayit.sifreli) : null
    if (!kayit || !sifre) return NextResponse.json({ error: "Bu kullanıcının şifresi Hub'da kayıtlı değil" }, { status: 404 })
    return NextResponse.json({ sifre, sifreSurumu: kayit.surum }, { headers: { "Cache-Control": "no-store" } })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
