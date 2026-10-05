import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/pusula-session"
import { DebugHatasi, agentliSunucular, baslat, durdur, klasorler, oku } from "@/lib/firma-debug"

/* Firma detay → Debug. Mantık lib/firma-debug.ts'de (SQL Konsol da kullanıyor). */

function hata(err: unknown) {
  if (err instanceof DebugHatasi) {
    return NextResponse.json({ error: err.message, needServer: err.sunucuGerekli || undefined }, { status: err.durum })
  }
  return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
}

/* GET /api/companies/[firkod]/debug
     ?servers=1                 → agent'lı sunucular (firmaya sunucu tanımlı değilse)
     ?folders=1[&serverId=]     → C:\MUSTERI\{firkod} alt klasörleri
     ?id=…&ofset=N              → izlemenin yeni eklenen kısmı */
export async function GET(req: NextRequest, { params }: { params: Promise<{ firkod: string }> }) {
  if (!(await auth())) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 })
  const { firkod } = await params
  const sp = req.nextUrl.searchParams
  try {
    if (sp.get("servers") === "1") return NextResponse.json({ servers: await agentliSunucular() })
    if (sp.get("folders") === "1") {
      const k = await klasorler(firkod, sp.get("serverId") ?? undefined)
      return NextResponse.json({ folders: k.klasorler, root: k.kok, missing: k.eksik || undefined, server: k.sunucu })
    }
    const id = sp.get("id")
    if (!id) return NextResponse.json({ error: "id zorunlu" }, { status: 400 })
    return NextResponse.json(await oku(firkod, id, Number(sp.get("ofset") ?? 0)), { headers: { "Cache-Control": "no-store" } })
  } catch (err) {
    return hata(err)
  }
}

/* POST /api/companies/[firkod]/debug
   { action: "start", subfolder, serverId? } → { id, path, server, shared }
   { action: "stop", id }                    → { ok, deleted } */
export async function POST(req: NextRequest, { params }: { params: Promise<{ firkod: string }> }) {
  const me = await auth()
  if (!me) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 })
  const { firkod } = await params
  try {
    const b = (await req.json()) as { action?: string; subfolder?: string; serverId?: string; id?: string }
    if (b.action === "start") {
      const r = await baslat(firkod, b.subfolder ?? "", { serverId: b.serverId, kaynak: "hub", kim: me.user.fullName })
      return NextResponse.json({ id: r.id, path: r.path, server: r.sunucu, shared: r.paylasimli })
    }
    if (b.action === "stop") {
      if (!b.id) return NextResponse.json({ error: "id zorunlu" }, { status: 400 })
      const r = await durdur(firkod, b.id)
      return NextResponse.json({ ok: true, deleted: r.silindi })
    }
    return NextResponse.json({ error: "action start veya stop olmalı" }, { status: 400 })
  } catch (err) {
    return hata(err)
  }
}
