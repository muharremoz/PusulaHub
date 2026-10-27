/**
 * GET /api/companies/[firkod]/yedekler/indir?kaynak=ftp|r2&gun=GG-AA-YYYY&dosya=<db>_FULL_….zip
 *
 * R2: 15 dakikalık imzalı adrese yönlendirir (tarayıcı doğrudan R2'den indirir).
 * FTP: dosya Spare Cloud'dan Hub üzerinden akıtılır.
 * Dosyanın veritabanı bu firmaya ait değilse 404 — başka firmanın yedeği bu uçtan indirilemez.
 * Her indirme kimin indirdiğiyle birlikte sunucu günlüğüne yazılır.
 */

import { NextRequest, NextResponse } from "next/server"
import { Readable } from "node:stream"
import { auth } from "@/auth"
import { requirePermission } from "@/lib/require-permission"
import { dosyaAdiCoz, firmaVeritabanlari, ftpAkis, ftpTanimli, gunGecerli, r2ImzaliAdres, r2Tanimli } from "@/lib/firma-yedekleri"

export async function GET(req: NextRequest, { params }: { params: Promise<{ firkod: string }> }) {
  const gate = await requirePermission("company-detail", "read")
  if (gate) return gate
  const { firkod } = await params
  const q = req.nextUrl.searchParams
  const kaynak = q.get("kaynak"), gun = q.get("gun") ?? "", dosya = q.get("dosya") ?? ""

  const ad = dosyaAdiCoz(dosya)
  if (!/^\d+$/.test(firkod) || (kaynak !== "ftp" && kaynak !== "r2") || !gunGecerli(gun) || !ad) {
    return NextResponse.json({ error: "Geçersiz istek" }, { status: 400 })
  }
  const dbler = await firmaVeritabanlari(firkod)
  if (!dbler.some((d) => d.toLowerCase() === ad.db.toLowerCase())) {
    return NextResponse.json({ error: "Bu yedek firmaya ait değil" }, { status: 404 })
  }

  const session = await auth()
  console.log(`[yedek-indir] ${session?.user?.email ?? "?"} firma=${firkod} kaynak=${kaynak} ${gun}/${dosya}`)

  try {
    if (kaynak === "r2") {
      if (!r2Tanimli()) return NextResponse.json({ error: "R2 bağlantı bilgisi tanımlı değil" }, { status: 503 })
      return NextResponse.redirect(await r2ImzaliAdres(gun, dosya), 302)
    }
    if (!ftpTanimli()) return NextResponse.json({ error: "Spare Cloud bağlantı bilgisi tanımlı değil" }, { status: 503 })
    const { akis, boyut } = await ftpAkis(gun, dosya)
    return new Response(Readable.toWeb(akis) as ReadableStream, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Length": String(boyut),
        "Content-Disposition": `attachment; filename="${dosya}"`,
        "Cache-Control": "no-store",
      },
    })
  } catch (err) {
    const mesaj = err instanceof Error ? err.message : String(err)
    console.log(`[yedek-indir] HATA ${gun}/${dosya}: ${mesaj}`)
    return NextResponse.json({ error: /No such file/i.test(mesaj) ? "Dosya bulunamadı (silinmiş olabilir)" : mesaj }, { status: 502 })
  }
}
