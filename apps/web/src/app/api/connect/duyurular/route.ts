/**
 * GET  /api/connect/duyurular   Connect duyuruları (hedef cihaz + okuyan sayısıyla)
 * POST /api/connect/duyurular   { baslik, metin, onem, firmaId?, firmaAdi?, kullanici?, gunSayisi? } — yayınlar
 */
import { NextRequest, NextResponse } from "next/server"
import { requirePermission } from "@/lib/require-permission"
import { auth } from "@/auth"
import { connectDuyuruEkle, connectDuyurular, type ConnectDuyuruOnem } from "@/lib/connect-yonetim"

const ONEMLER: ConnectDuyuruOnem[] = ["bilgi", "uyari", "kritik"]

export async function GET() {
  const gate = await requirePermission("companies", "read")
  if (gate) return gate
  try {
    return NextResponse.json(await connectDuyurular())
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Hata" }, { status: 502 })
  }
}

export async function POST(req: NextRequest) {
  const gate = await requirePermission("companies", "write")
  if (gate) return gate
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const baslik = typeof b.baslik === "string" ? b.baslik.trim() : ""
  const metin = typeof b.metin === "string" ? b.metin.trim() : ""
  if (!baslik || !metin) return NextResponse.json({ error: "Başlık ve metin gerekli" }, { status: 400 })
  if (baslik.length > 120) return NextResponse.json({ error: "Başlık en fazla 120 karakter" }, { status: 400 })
  if (metin.length > 4000) return NextResponse.json({ error: "Metin en fazla 4000 karakter" }, { status: 400 })
  const onem = ONEMLER.includes(b.onem as ConnectDuyuruOnem) ? (b.onem as ConnectDuyuruOnem) : "bilgi"
  const firmaId = typeof b.firmaId === "string" && b.firmaId ? b.firmaId : null
  const session = await auth()
  try {
    const r = await connectDuyuruEkle({
      baslik, metin, onem,
      firmaId,
      firmaAdi: firmaId && typeof b.firmaAdi === "string" ? b.firmaAdi : null,
      kullanici: firmaId && typeof b.kullanici === "string" && b.kullanici ? b.kullanici : null,
      gunSayisi: Number(b.gunSayisi) > 0 ? Number(b.gunSayisi) : null,
      olusturan: session?.user?.username ?? session?.user?.email ?? null,
    })
    return NextResponse.json(r)
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Hata" }, { status: 502 })
  }
}
