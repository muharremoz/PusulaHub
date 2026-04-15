import { NextRequest, NextResponse } from "next/server"
import { query } from "@/lib/db"
import { getAllAgents } from "@/lib/agent-store"
import { pollSingleAgent } from "@/lib/agent-poller"

/**
 * GET /api/setup/company-users?serverId=...&firmaNo=...
 * Firma kurulum sihirbazı 3. adım "AD'de Kayıtlı Kullanıcılar" listesi için:
 * seçilen AD sunucusundaki seçilen firmanın (firmaNo = firkod) mevcut
 * domain kullanıcılarını agent-store'dan canlı olarak döndürür.
 *
 * Agent raporu `ad.companies[].users` yapısıyla gelir; firmaNo = firkod eşlenir.
 */

interface ServerRow {
  Name: string
  IP:   string
}

export interface ExistingAdUserDto {
  username:    string
  displayName: string
  lastLogin?:  string
  isDisabled:  boolean
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const serverId = searchParams.get("serverId")
    const firmaNo  = searchParams.get("firmaNo")
    const refresh  = searchParams.get("refresh") === "true"

    if (!serverId || !firmaNo) {
      return NextResponse.json(
        { error: "serverId ve firmaNo parametreleri zorunludur" },
        { status: 400 }
      )
    }

    // refresh=true ise agent'tan canlı rapor çek (cache'i atla) — AD'den kullanıcı silmeden sonra güncel listeyi almak için.
    if (refresh) {
      await pollSingleAgent(serverId)
    }

    // Sunucu adını/IP'sini DB'den çek — agent-store'da eşleştirmek için
    const rows = await query<ServerRow[]>`
      SELECT Name, IP FROM Servers WHERE Id = ${serverId}
    `
    if (!rows.length) {
      return NextResponse.json({ error: "Sunucu bulunamadı" }, { status: 404 })
    }
    const { Name, IP } = rows[0]

    // Agent raporundan firmayı bul
    const agents = getAllAgents()
    const agent  = agents.find(
      (a) => a.agentId === serverId || a.hostname === Name || a.ip === IP
    )

    if (!agent?.lastReport?.ad?.companies?.length) {
      return NextResponse.json([])
    }

    const company = agent.lastReport.ad.companies.find((c) => c.firmaNo === firmaNo)
    if (!company) {
      return NextResponse.json([])
    }

    const users: ExistingAdUserDto[] = company.users.map((u) => {
      const raw = u.lastLogin ?? ""
      const hasLogin = raw && raw !== "Hiç" && raw !== "Never" && raw !== "0"
      return {
        username:    u.username,
        displayName: u.displayName ?? "",
        lastLogin:   hasLogin ? raw : undefined,
        isDisabled:  !u.enabled,
      }
    })

    const resp = NextResponse.json(users)
    resp.headers.set("Cache-Control", "private, max-age=10, stale-while-revalidate=30")
    return resp
  } catch (err) {
    console.error("[GET /api/setup/company-users]", err)
    return NextResponse.json({ error: "Kullanıcılar alınamadı" }, { status: 500 })
  }
}
