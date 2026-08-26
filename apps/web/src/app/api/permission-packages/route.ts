import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { getSupabaseServer } from "@/lib/supabase/server"

/**
 * Yetki paketleri — /permissions ekranındaki hazır kümeler.
 *
 * Paket bir ROL DEĞİL: kişiye uygulandığında modül kümesi kopyalanır, bağ
 * kurulmaz. Paket sonradan değişirse daha önce uygulanmış kişiler etkilenmez.
 *
 *   GET    ?appId=hub        → liste
 *   POST   { id?, appId, name, description, modules, sortOrder }
 *                            → id varsa günceller, yoksa oluşturur
 *   DELETE ?id=…             → siler
 *
 * Okuma da yazma da admin'e kısıtlı: ekranı zaten yalnız admin görüyor.
 */

export interface PermissionPackage {
  id:          string
  appId:       string
  name:        string
  description: string | null
  modules:     string[]
  sortOrder:   number
}

interface Row {
  id: string; app_id: string; name: string
  description: string | null; modules: string[] | null; sort_order: number | null
}

const SUTUNLAR = "id, app_id, name, description, modules, sort_order"

async function adminGate(): Promise<Response | null> {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Giriş yapmalısınız" }, { status: 401 })
  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "Bu işlem için yetkiniz yok" }, { status: 403 })
  }
  return null
}

function map(r: Row): PermissionPackage {
  return {
    id:          r.id,
    appId:       r.app_id,
    name:        r.name,
    description: r.description,
    modules:     r.modules ?? [],
    sortOrder:   r.sort_order ?? 0,
  }
}

export async function GET(req: NextRequest) {
  const gate = await adminGate()
  if (gate) return gate

  const appId = req.nextUrl.searchParams.get("appId") ?? "hub"
  try {
    const sb = await getSupabaseServer()
    const { data, error } = await sb.schema("hub").from("permission_packages")
      .select(SUTUNLAR)
      .eq("app_id", appId)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true })
    if (error) throw error
    return NextResponse.json(((data ?? []) as Row[]).map(map))
  } catch (err) {
    console.error("[GET /api/permission-packages]", err)
    return NextResponse.json({ error: "Paketler alınamadı" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const gate = await adminGate()
  if (gate) return gate

  try {
    const b = await req.json() as Partial<PermissionPackage>
    const ad = (b.name ?? "").trim()
    if (!ad) return NextResponse.json({ error: "Paket adı zorunludur" }, { status: 400 })

    const kayit = {
      app_id:      b.appId ?? "hub",
      name:        ad,
      description: (b.description ?? "").trim() || null,
      modules:     Array.isArray(b.modules) ? b.modules : [],
      sort_order:  Number.isFinite(b.sortOrder) ? Number(b.sortOrder) : 0,
    }

    const sb = await getSupabaseServer()
    const q = b.id
      ? sb.schema("hub").from("permission_packages").update(kayit).eq("id", b.id).select(SUTUNLAR).maybeSingle()
      : sb.schema("hub").from("permission_packages").insert(kayit).select(SUTUNLAR).maybeSingle()

    const { data, error } = await q
    if (error) {
      // unique (app_id, name) — aynı isimde paket
      const mesaj = error.code === "23505"
        ? "Bu isimde bir paket zaten var"
        : error.message
      return NextResponse.json({ error: mesaj }, { status: 400 })
    }
    return NextResponse.json(data ? map(data as Row) : null)
  } catch (err) {
    console.error("[POST /api/permission-packages]", err)
    return NextResponse.json({ error: "Paket kaydedilemedi" }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const gate = await adminGate()
  if (gate) return gate

  const id = req.nextUrl.searchParams.get("id")
  if (!id) return NextResponse.json({ error: "id zorunludur" }, { status: 400 })
  try {
    const sb = await getSupabaseServer()
    const { error } = await sb.schema("hub").from("permission_packages").delete().eq("id", id)
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[DELETE /api/permission-packages]", err)
    return NextResponse.json({ error: "Paket silinemedi" }, { status: 500 })
  }
}
