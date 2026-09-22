import { NextResponse } from "next/server"
import { getSupabaseServer } from "@/lib/supabase/server"
import { sqlServerById } from "@/lib/hub-servers"
import { decrypt } from "@/lib/crypto"
import { requirePermission } from "@/lib/require-permission"
import { yedekTestiCalistir } from "@/lib/yedek-testi"

/**
 * GET /api/tv/yedek-testi — yedek doğrulama testini SSE olarak akıtır.
 *
 * Olaylar:
 *   plan  [{ id, baslik, aciklama }]            — bütün adımlar, test başlamadan
 *   adim  { id, baslik, aciklama, durum, deger?, detay?, sureMs? }
 *   bitti { durum, ozet, sureMs, bitisAt }
 *   hata  { mesaj }
 *
 * ── Tek seferde tek test ──────────────────────────────────────────────
 * Düğme ofiste herkesin gözü önünde; art arda basılacaktır. Test canlı SQL
 * sunucusunu ve SFTP'yi yokluyor, paralel koşması kimseye bir şey
 * kazandırmaz. Süren bir test varsa yeni istek 409 ile geri çevriliyor ve
 * ekran "test zaten sürüyor" diyor.
 *
 * Hiçbir yazma işlemi yok (bkz. lib/yedek-testi.ts).
 */

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

let calisiyor = false

export async function GET() {
  const gate = await requirePermission("servers", "read")
  if (gate) return gate

  if (calisiyor) {
    return NextResponse.json({ error: "Test zaten sürüyor" }, { status: 409 })
  }

  /* SQL rolündeki sunucu — yedekler orada alınıyor */
  const sb = await getSupabaseServer()
  const { data: rol } = await sb.schema("hub").from("server_roles")
    .select("server_id").eq("role", "SQL").limit(1).maybeSingle()
  const id = (rol as { server_id: string } | null)?.server_id
  if (!id) return NextResponse.json({ error: "SQL rollü sunucu bulunamadı" }, { status: 404 })

  const srv = await sqlServerById(id)
  if (!srv) return NextResponse.json({ error: "SQL sunucusu bulunamadı" }, { status: 404 })

  const sifre = decrypt(srv.sql_password)
  if (!srv.sql_username || !sifre) {
    return NextResponse.json({ error: `${srv.name}: SQL kullanıcı bilgisi eksik` }, { status: 400 })
  }
  if (!srv.agent_port || !srv.api_key) {
    return NextResponse.json({ error: `${srv.name}: agent bilgisi eksik` }, { status: 400 })
  }

  const hedef = {
    ad:        srv.name,
    ip:        srv.ip,
    username:  srv.sql_username,
    password:  sifre,
    agentPort: srv.agent_port,
    apiKey:    decrypt(srv.api_key)!,
  }

  calisiyor = true
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enc  = new TextEncoder()
      const send = (olay: string, veri: unknown) =>
        controller.enqueue(enc.encode(`event: ${olay}\ndata: ${JSON.stringify(veri)}\n\n`))

      try {
        for await (const o of yedekTestiCalistir(hedef)) {
          if      (o.tip === "plan") send("plan",  o.plan)
          else if (o.tip === "adim") send("adim",  o.adim)
          else                       send("bitti", o.sonuc)
        }
      } catch (err) {
        send("hata", { mesaj: err instanceof Error ? err.message : String(err) })
      } finally {
        calisiyor = false
        controller.close()
      }
    },
    cancel() {
      /* Ekran kapanırsa kilidi bırak — aksi halde test bir daha başlamaz */
      calisiyor = false
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type":      "text/event-stream; charset=utf-8",
      "Cache-Control":     "no-cache, no-transform",
      "Connection":        "keep-alive",
      "X-Accel-Buffering": "no",
    },
  })
}
