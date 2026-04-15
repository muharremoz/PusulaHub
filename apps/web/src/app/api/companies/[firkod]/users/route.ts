import { NextResponse } from "next/server"
import { getAllAgents } from "@/lib/agent-store"

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
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ firkod: string }> }
) {
  const { firkod } = await params
  try {
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

    const users = Array.from(seen.values()).sort((a, b) => a.username.localeCompare(b.username))
    const resp = NextResponse.json(users)
    resp.headers.set("Cache-Control", "private, max-age=10, stale-while-revalidate=30")
    return resp
  } catch (err) {
    console.error("[GET /api/companies/[firkod]/users]", err)
    return NextResponse.json({ error: "Kullanıcı verisi alınamadı" }, { status: 500 })
  }
}
