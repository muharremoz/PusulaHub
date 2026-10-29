import "server-only"
import { timingSafeEqual } from "node:crypto"
import { NextResponse, type NextRequest } from "next/server"

/**
 * `/api/hub/sunucu-*` uçlarının ortak kapısı: x-internal-key = INTERNAL_APP_KEY (CRM ↔ Hub).
 * Hub middleware `/api/hub/*` yolunu oturum kapısından muaf tutuyor; kontrol burada.
 * null dönerse geç, aksi halde dönen yanıtı ver.
 */
export function icAnahtarKapisi(req: NextRequest): NextResponse | null {
  const beklenen = process.env.INTERNAL_APP_KEY ?? ""
  if (!beklenen) return NextResponse.json({ error: "INTERNAL_APP_KEY Hub'da tanımlı değil." }, { status: 500 })
  const a = Buffer.from(req.headers.get("x-internal-key") ?? ""), b = Buffer.from(beklenen)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  return null
}
