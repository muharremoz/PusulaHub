import "server-only"

import { getAllAgents } from "@/lib/agent-store"
import type { getSupabaseServer } from "@/lib/supabase/server"

/**
 * Firmanın AD kullanıcıları — agent raporlarından (bellekteki agent-store)
 * toplanır, kaynak kullanımı `hub.user_daily_usage`'dan eklenir.
 *
 * DB'de firma bazlı kullanıcı tablosu YOK (`hub.ad_users` firma kolonu
 * taşımıyor), o yüzden bu liste yalnız Hub sürecinden üretilebiliyor. CRM gibi
 * alt uygulamalar `/api/hub/firma-kullanicilar` üzerinden alır.
 */

export type UsersClient = Awaited<ReturnType<typeof getSupabaseServer>>

export interface CompanyUserDto {
  username:    string
  displayName: string
  email:       string
  ou:          string
  enabled:     boolean
  lastLogin:   string
  server:      string
  groups:      string[]
  /** Kullanıcının kaynak kullanımı (en güncel gün). null = ölçüm yok. */
  usageCpu?:   number | null
  usageRamMB?: number | null
  usageDate?:  string | null
}

export async function listCompanyUsers(
  sb: UsersClient,
  firkod: string,
): Promise<CompanyUserDto[]> {
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

  // Kaynak kullanımı — her kullanıcının EN GÜNCEL günü. username
  // case-insensitive + DOMAIN\ prefix'i tolere edilerek eşleştirilir.
  const bareName = (u: string) => (u.includes("\\") ? u.split("\\").pop()! : u).toLowerCase()
  try {
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

  return Array.from(seen.values()).sort((a, b) => a.username.localeCompare(b.username))
}
