import { NextResponse } from "next/server"
import { getSupabaseServer } from "@/lib/supabase/server"
import { requirePermission } from "@/lib/require-permission"

export async function GET(_req: Request, { params }: { params: Promise<{ firkod: string }> }) {
  const gate = await requirePermission("companies", "read")
  if (gate) return gate
  const { firkod } = await params
  try {
    const sb = await getSupabaseServer()
    const [{ data: sites }, { data: servers }] = await Promise.all([
      sb.schema("hub").from("iis_sites")
        .select("id, name, server, status, binding, app_pool, physical_path, hizmet")
        .eq("firma", firkod).order("server").order("name"),
      sb.schema("hub").from("servers").select("name, ip"),
    ])
    const ipByName = new Map(((servers ?? []) as { name: string; ip: string }[]).map((s) => [s.name, s.ip]))
    const rows = ((sites ?? []) as {
      id: string; name: string; server: string; status: string; binding: string; app_pool: string; physical_path: string; hizmet: string | null
    }[]).map((i) => ({
      Id: i.id, Name: i.name, Server: i.server, Status: i.status, Binding: i.binding,
      AppPool: i.app_pool, PhysicalPath: i.physical_path, Hizmet: i.hizmet,
      ServerIP: ipByName.get(i.server) ?? null,
    }))
    return NextResponse.json(rows)
  } catch (err) {
    console.error("[GET /api/companies/[firkod]/iis]", err)
    return NextResponse.json({ error: "IIS verisi alınamadı" }, { status: 500 })
  }
}
