import { NextRequest, NextResponse } from "next/server"
import { getAllAgents } from "@/lib/agent-store"
import { pollSingleAgent } from "@/lib/agent-poller"
import { getSupabaseServer } from "@/lib/supabase/server"
import { requirePermission } from "@/lib/require-permission"

/**
 * GET /api/companies/[firkod]/users
 * Firma detay sayfası "Kullanıcılar" tabı için:
 * agent-store'daki tüm AD agent raporlarından firmaNo = firkod olan
 * firmanın kullanıcılarını toplar ve döndürür.
 */

export interface CompanyUserDto {
  username:    string
  displayName: string
  email:       string
  ou:          string
  enabled:     boolean
  lastLogin:   string
  server:      string
  groups:      string[]
  /** Kullanıcının kaynak kullanımı (UserDailyUsage — en güncel gün).
   *  null = ölçüm yok (hiç oturum açmamış / veri toplanmamış). */
  usageCpu?:   number | null   // ortalama CPU %
  usageRamMB?: number | null   // ortalama RAM (MB)
  usageDate?:  string | null   // ölçümün ait olduğu gün (YYYY-MM-DD)
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ firkod: string }> }
) {
  // Erişim Bilgileri modal'ı bu endpoint'i çağırıyor — "company-detail"
  // yetkisi olmayan ama "companies" yetkisi olan (rol: kullanıcı) kişilere
  // de açık. Modal admin/kullanıcı arasında aynı görünmeli.
  const gate = await requirePermission("companies", "read")
  if (gate) return gate
  const { firkod } = await params
  try {
    const sb = await getSupabaseServer()
    const refresh = req.nextUrl.searchParams.get("refresh") === "1"
    if (refresh) {
      const { data: comp } = await sb.schema("hub").from("companies").select("ad_server_id").eq("company_id", firkod).maybeSingle()
      const adId = (comp as { ad_server_id: string | null } | null)?.ad_server_id
      if (adId) { try { await pollSingleAgent(adId) } catch {} }
    }
    const agents = getAllAgents()
    const seen = new Map<string, CompanyUserDto>()

    for (const agent of agents) {
      const companies = agent.lastReport?.ad?.companies
      if (!companies?.length) continue

      const company = companies.find((c) => c.firmaNo === firkod)
      if (!company?.users?.length) continue

      const serverLabel = agent.hostname || agent.ip || ""
      for (const u of company.users) {
        const raw = u.lastLogin ?? ""
        const hasLogin = raw && raw !== "Hiç" && raw !== "Never" && raw !== "0"
        const key = `${u.username}|${serverLabel}`
        if (seen.has(key)) continue
        seen.set(key, {
          username:    u.username,
          displayName: u.displayName ?? "",
          email:       "",
          ou:          firkod,
          enabled:     !!u.enabled,
          lastLogin:   hasLogin ? raw : "",
          server:      serverLabel,
          groups:      [],
        })
      }
    }

    // Kaynak kullanımı — UserDailyUsage'dan her kullanıcının EN GÜNCEL gününü çek.
    // username case-insensitive + DOMAIN\ prefix'i tolere edilerek eşleştirilir.
    const bareName = (u: string) => (u.includes("\\") ? u.split("\\").pop()! : u).toLowerCase()
    try {
      // Her kullanıcının EN GÜNCEL günü (max date per username) — JS'te grupla
      const { data: usageRows } = await sb.schema("hub").from("user_daily_usage")
        .select("username, avg_cpu, avg_ram_mb, date").eq("firma_no", firkod)
      const usageMap = new Map<string, { cpu: number | null; ram: number | null; date: string }>()
      for (const r of (usageRows ?? []) as { username: string; avg_cpu: number | null; avg_ram_mb: number | null; date: string }[]) {
        const k = bareName(r.username)
        const cur = usageMap.get(k)
        if (!cur || r.date > cur.date) usageMap.set(k, { cpu: r.avg_cpu, ram: r.avg_ram_mb, date: r.date })
      }
      for (const dto of seen.values()) {
        const u = usageMap.get(bareName(dto.username))
        dto.usageCpu   = u ? u.cpu : null
        dto.usageRamMB = u ? u.ram : null
        dto.usageDate  = u ? u.date : null
      }
    } catch { /* UserDailyUsage yoksa kaynak kolonları boş kalır */ }

    const users = Array.from(seen.values()).sort((a, b) => a.username.localeCompare(b.username))
    const resp = NextResponse.json(users)
    resp.headers.set("Cache-Control", "private, max-age=10, stale-while-revalidate=30")
    return resp
  } catch (err) {
    console.error("[GET /api/companies/[firkod]/users]", err)
    return NextResponse.json({ error: "Kullanıcı verisi alınamadı" }, { status: 500 })
  }
}
