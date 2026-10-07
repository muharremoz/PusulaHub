/**
 * POST /api/connect/cihazlar/[id]  { islem }
 *   2fa-sifirla  telefon kayboldu — 2FA kapanır, kullanıcı şifresini yeniden girer
 *   kilit-kaldir çok hatalı kod kilidi (10 dk) hemen kalkar
 *   iptal        bilgisayar kayboldu — cihaz bağlanamaz
 *   etkinlestir  iptal geri alınır
 *   sil          ölü kaydı listeden siler (olay geçmişi kalır)
 * Yapan kişi servisin olay kaydına yazılır.
 */
import { NextRequest, NextResponse } from "next/server"
import { requirePermission } from "@/lib/require-permission"
import { auth } from "@/auth"
import { connectCihazIslemi, type ConnectCihazIslemi } from "@/lib/connect-yonetim"

const ISLEMLER: ConnectCihazIslemi[] = ["2fa-sifirla", "kilit-kaldir", "iptal", "etkinlestir", "sil"]

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requirePermission("companies", "write")
  if (gate) return gate
  const { id } = await params
  const b = (await req.json().catch(() => ({}))) as { islem?: string }
  if (!ISLEMLER.includes(b.islem as ConnectCihazIslemi)) return NextResponse.json({ error: "Geçersiz işlem" }, { status: 400 })
  const session = await auth()
  const yapan = session?.user?.username ?? session?.user?.email ?? null
  try {
    await connectCihazIslemi(id, b.islem as ConnectCihazIslemi, yapan)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Hata" }, { status: 502 })
  }
}
