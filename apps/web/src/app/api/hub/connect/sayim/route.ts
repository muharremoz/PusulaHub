/**
 * POST /api/hub/connect/sayim  { firma, kullanici }
 *
 * Pusula X sayım modu kurulumu için server.xml değerleri (SQL dış adresi, firmanın SQL login'i
 * ve şifresi, firma kodu, IIS resim adresi). Connect servisi cihazı (ve açıksa 2FA kodunu)
 * doğruladıktan sonra çağırır; saklamaz, iletir. Mantık lib/connect-sayim.ts.
 * DİKKAT: yanıt DÜZ METİN SQL ŞİFRESİ içerir. Auth: X-Service-Key = CONNECT_SERVICE_KEY.
 * Ek daraltma /api/hub/connect/sifre ile aynı: kullanıcının iptal edilmemiş Connect cihazı yoksa verilmez.
 */
import { NextRequest, NextResponse } from "next/server"
import { servisAnahtariDogru } from "@/lib/connect-hub-ic"
import { connectTumCihazlar } from "@/lib/connect-yonetim"
import { connectSayimBilgisi } from "@/lib/connect-sayim"

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
    const r = await connectSayimBilgisi(firma, kullanici)
    if (!r.ok) return NextResponse.json({ error: r.hata }, { status: r.kod })
    return NextResponse.json(r.bilgi, { headers: { "Cache-Control": "no-store" } })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
