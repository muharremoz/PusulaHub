import { NextResponse } from "next/server"
import { getSupabaseServer } from "@/lib/supabase/server"

/**
 * GET /api/ad/users
 * ADUsers tablosundan tüm AD kullanıcılarını döner.
 * Tablo, agent raporlarından agent-poller tarafından doldurulur.
 */

export interface ADUserDto {
  id:          string
  username:    string
  displayName: string
  email:       string
  ou:          string
  enabled:     boolean
  lastLogin:   string
  createdAt:   string
  server:      string
}

interface Row {
  id:           string
  server:       string | null
  username:     string
  display_name: string
  email:        string
  ou:           string
  enabled:      boolean
  last_login:   string | null
  created_at:   string
}

export async function GET() {
  try {
    const sb = await getSupabaseServer()
    const { data, error } = await sb.schema("hub").from("ad_users")
      .select("id, server, username, display_name, email, ou, enabled, last_login, created_at")
      .order("display_name")
    if (error) throw error

    const users: ADUserDto[] = ((data ?? []) as Row[]).map((r) => ({
      id:          r.id,
      username:    r.username,
      displayName: r.display_name,
      email:       r.email,
      ou:          r.ou,
      enabled:     !!r.enabled,
      lastLogin:   r.last_login ? r.last_login.slice(0, 16).replace("T", " ") : "",
      createdAt:   r.created_at ? r.created_at.slice(0, 10) : "",
      server:      r.server ?? "",
    }))

    const resp = NextResponse.json(users)
    resp.headers.set("Cache-Control", "private, max-age=10, stale-while-revalidate=30")
    return resp
  } catch (err) {
    console.error("[GET /api/ad/users]", err)
    return NextResponse.json({ error: "AD kullanıcıları alınamadı" }, { status: 500 })
  }
}
