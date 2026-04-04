import { NextResponse } from "next/server"
import { generateOTP, verifyOTP } from "@/lib/otp-store"

/* POST /api/otp  body: { key, action }
   OTP üretir, konsola yazar (yönetici sunucu terminalini görür) */
export async function POST(req: Request) {
  const { key, action } = await req.json()
  if (!key || !action) {
    return NextResponse.json({ error: "Eksik parametre" }, { status: 400 })
  }

  const code = generateOTP(key, action)

  // Üretim ortamında burası e-posta / SMS servisine bağlanır
  console.log(`\n[OTP] İşlem: ${action} | Anahtar: ${key} | Kod: ${code} | Geçerlilik: 5 dk\n`)

  return NextResponse.json({ ok: true })
}

/* PATCH /api/otp  body: { key, code }
   OTP doğrular */
export async function PATCH(req: Request) {
  const { key, code } = await req.json()
  if (!key || !code) {
    return NextResponse.json({ error: "Eksik parametre" }, { status: 400 })
  }

  const valid = verifyOTP(key, code)
  if (!valid) {
    return NextResponse.json({ error: "Geçersiz veya süresi dolmuş kod" }, { status: 401 })
  }

  return NextResponse.json({ ok: true })
}
