import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { getSupabaseServer } from "@/lib/supabase/server"
import { withSqlConnection } from "@/lib/sql-external"
import { decrypt } from "@/lib/crypto"
import { requirePermission } from "@/lib/require-permission"
import { girisSatirlari, siraUygula, type SiraEslesme } from "@/lib/giris-sirasi"

/**
 * Pusula giriş ekranı data sırası — bkz. lib/giris-sirasi.ts
 *
 * GET  → firmanın dataları (srkkod büyükten küçüğe = programdaki sıra) + geri alınabilir son değişiklik
 * POST { sira: number[] }  → srkkod'lar istenen sırada (üstten alta)
 * POST { geriAl: number }  → geçmişteki bir değişikliği geri al
 */

type Ctx = { params: Promise<{ firkod: string }> }

async function sqlBaglantisi(firkod: string) {
  const sb = await getSupabaseServer()
  const { data: company } = await sb.schema("hub").from("companies").select("sql_server_id").eq("company_id", firkod).maybeSingle()
  const sqlServerId = (company as { sql_server_id: string | null } | null)?.sql_server_id
  if (!sqlServerId) return { hata: "Firmaya SQL sunucusu atanmamış" } as const
  const { data: srv } = await sb.schema("hub").from("servers").select("ip, sql_username, sql_password").eq("id", sqlServerId).maybeSingle()
  const s = srv as { ip: string; sql_username: string | null; sql_password: string | null } | null
  if (!s?.sql_username || !s.sql_password) return { hata: "SQL sunucusunun giriş bilgisi yok" } as const
  return {
    sb,
    cfg: { server: s.ip, port: 1433, user: s.sql_username, password: decrypt(s.sql_password) ?? "", database: "sirket", requestTimeout: 30000 },
  } as const
}

export async function GET(_req: NextRequest, { params }: Ctx) {
  const gate = await requirePermission("companies", "read")
  if (gate) return gate
  const { firkod } = await params
  const firmaId = Number.parseInt(firkod, 10)
  if (!Number.isFinite(firmaId)) return NextResponse.json({ error: "Geçersiz firma" }, { status: 400 })

  try {
    const b = await sqlBaglantisi(firkod)
    if ("hata" in b) return NextResponse.json({ error: b.hata }, { status: 400 })
    const [satirlar, { data: son }] = await Promise.all([
      withSqlConnection(b.cfg, (pool) => girisSatirlari(pool, firmaId)),
      b.sb.schema("hub").from("giris_sirasi_gecmis")
        .select("id, kullanici, geri_alindi, created_at")
        .eq("company_id", firkod).eq("geri_alindi", false).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ])
    return NextResponse.json({ satirlar, sonDegisiklik: son ?? null })
  } catch (err) {
    console.error("[giris-sirasi GET]", err)
    return NextResponse.json({ error: "Data listesi alınamadı" }, { status: 500 })
  }
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const gate = await requirePermission("companies", "write")
  if (gate) return gate
  const { firkod } = await params
  const firmaId = Number.parseInt(firkod, 10)
  if (!Number.isFinite(firmaId)) return NextResponse.json({ error: "Geçersiz firma" }, { status: 400 })

  const body = (await req.json().catch(() => null)) as { sira?: unknown; geriAl?: unknown } | null
  const session = await auth()
  const kullanici = session?.user?.fullName ?? session?.user?.username ?? null

  try {
    const b = await sqlBaglantisi(firkod)
    if ("hata" in b) return NextResponse.json({ error: b.hata }, { status: 400 })

    // Geri alınacak kayıt — eşlemedeki "eski" numaralar hedef olur
    let geriAlId: number | null = null
    let geriHedef: Map<string, number> | null = null
    if (typeof body?.geriAl === "number") {
      const { data: kayit } = await b.sb.schema("hub").from("giris_sirasi_gecmis")
        .select("id, eslesme, geri_alindi").eq("id", body.geriAl).eq("company_id", firkod).maybeSingle()
      const k = kayit as { id: number; eslesme: SiraEslesme[]; geri_alindi: boolean } | null
      if (!k) return NextResponse.json({ error: "Kayıt bulunamadı" }, { status: 404 })
      if (k.geri_alindi) return NextResponse.json({ error: "Bu değişiklik zaten geri alınmış" }, { status: 409 })
      geriAlId = k.id
      geriHedef = new Map(k.eslesme.map((e) => [e.dataYolu.toLowerCase(), e.eski]))
    } else if (!Array.isArray(body?.sira) || !body.sira.every((x) => Number.isInteger(x))) {
      return NextResponse.json({ error: "sira veya geriAl gerekli" }, { status: 400 })
    }

    const eslesme = await withSqlConnection(b.cfg, async (pool) => {
      const satirlar = await girisSatirlari(pool, firmaId)
      const mevcut = satirlar.map((s) => s.srkkod)            // büyükten küçüğe
      const numaralar = [...mevcut]                             // dağıtılacak numaralar

      /*  Hedef sıra: üstteki satır en büyük numarayı alır.                */
      let hedefSira: number[]
      if (geriHedef) {
        const hedefNo = new Map<number, number>()
        for (const s of satirlar) {
          const eski = geriHedef.get(s.dataYolu.toLowerCase())
          if (eski === undefined) throw new Error("Geri alma sonrası data eklenmiş/silinmiş — elle sıralayın")
          hedefNo.set(s.srkkod, eski)
        }
        const hedefSet = [...hedefNo.values()].sort((a, b) => a - b)
        const numSet = [...numaralar].sort((a, b) => a - b)
        if (hedefSet.some((v, i) => v !== numSet[i])) throw new Error("Numaralar değişmiş — elle sıralayın")
        hedefSira = [...satirlar].sort((a, b) => hedefNo.get(b.srkkod)! - hedefNo.get(a.srkkod)!).map((s) => s.srkkod)
      } else {
        hedefSira = body!.sira as number[]
        const a = [...hedefSira].sort((x, y) => x - y)
        const c = [...mevcut].sort((x, y) => x - y)
        if (a.length !== c.length || a.some((v, i) => v !== c[i])) {
          throw new Error("Liste güncel değil — yenileyip tekrar deneyin")
        }
      }

      const hedef = new Map<number, number>()
      const out: SiraEslesme[] = []
      hedefSira.forEach((srkkod, i) => {
        const yeni = numaralar[i]
        const s = satirlar.find((x) => x.srkkod === srkkod)!
        out.push({ dataYolu: s.dataYolu, eski: srkkod, yeni })
        if (yeni !== srkkod) hedef.set(srkkod, yeni)
      })
      if (hedef.size) await siraUygula(pool, firmaId, hedef)
      return hedef.size ? out : null
    })

    if (!eslesme) return NextResponse.json({ ok: true, degisen: 0 })

    const gecmis = b.sb.schema("hub").from("giris_sirasi_gecmis")
    /*  Geri alma kaydı kendisi geri alınamaz (geri_alindi=true doğar) —
     *  aksi halde "geri al"a ikinci basış geri almayı geri alırdı. Böylece
     *  art arda basmak değişiklikleri sondan başa doğru teker teker açar. */
    const { error: logErr } = await gecmis.insert({ company_id: firkod, kullanici, eslesme, geri_alindi: geriAlId !== null })
    if (logErr) console.error("[giris-sirasi] geçmiş yazılamadı:", logErr.message, JSON.stringify(eslesme))
    if (geriAlId !== null) await gecmis.update({ geri_alindi: true }).eq("id", geriAlId)

    return NextResponse.json({ ok: true, degisen: eslesme.filter((e) => e.eski !== e.yeni).length })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error("[giris-sirasi POST]", msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
