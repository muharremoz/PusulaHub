import { NextRequest, NextResponse } from "next/server"
import { getSupabaseServer } from "@/lib/supabase/server"
import { findServerBy } from "@/lib/hub-servers"
import { execOnAgent } from "@/lib/agent-poller"

/**
 * POST /api/companies/[firkod]/iis/action
 * Body: { server: string, siteName: string, action: "start" | "stop" | "restart" | "remove" }
 *
 * Sunucu adından Agent bilgilerini çekip WebAdministration PS cmdlet'leri ile
 * ilgili siteye aksiyon uygular.
 *
 * ⚠ Agent JSON parser'ı regex tabanlı — komutta çift tırnak KULLANMA. Tek tırnak
 *   ve single-quote içindeki ' karakteri '' ile escape edilir.
 */

interface Body {
  server:   string
  siteName: string
  action:   "start" | "stop" | "restart" | "remove"
}

function psQuote(s: string): string {
  return (s ?? "").replace(/'/g, "''")
}

function buildCommand(siteName: string, action: Body["action"]): string {
  const n = psQuote(siteName)
  switch (action) {
    case "start":
      return `Import-Module WebAdministration; Start-WebSite -Name '${n}'; Write-Output 'OK'`
    case "stop":
      return `Import-Module WebAdministration; Stop-WebSite -Name '${n}'; Write-Output 'OK'`
    case "restart":
      return `Import-Module WebAdministration; Stop-WebSite -Name '${n}' -ErrorAction SilentlyContinue; Start-Sleep -Seconds 1; Start-WebSite -Name '${n}'; Write-Output 'OK'`
    case "remove":
      // Siteyi IIS'ten kaldır; AppPool ayrı — dokunma (başka siteler kullanıyor olabilir).
      return `Import-Module WebAdministration; if(Test-Path ('IIS:\\Sites\\' + '${n}')){Remove-WebSite -Name '${n}'}; Write-Output 'OK'`
    default:
      throw new Error("Geçersiz aksiyon")
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ firkod: string }> }
) {
  const { firkod } = await params
  try {
    const body = (await req.json()) as Body
    if (!body?.server || !body?.siteName || !body?.action) {
      return NextResponse.json({ error: "server, siteName ve action zorunludur" }, { status: 400 })
    }

    // Site gerçekten bu firmaya mı ait? (güvenlik — çapraz firma saldırısını engelle)
    const sb = await getSupabaseServer()
    const { count } = await sb.schema("hub").from("iis_sites").select("id", { count: "exact", head: true })
      .eq("name", body.siteName).eq("server", body.server).eq("firma", firkod)
    if (!count) return NextResponse.json({ error: "Site bu firmaya ait değil" }, { status: 403 })

    // Agent bilgilerini sunucu adından çek
    const srv = await findServerBy(body.server, "ip, agent_port, api_key") as { ip: string; agent_port: number | null; api_key: string | null } | null
    if (!srv) return NextResponse.json({ error: "Sunucu bulunamadı" }, { status: 404 })

    const command = buildCommand(body.siteName, body.action)
    const result  = await execOnAgent(srv.ip, srv.agent_port ?? 8585, srv.api_key ?? "", command, 30)

    if (result.exitCode !== 0) {
      return NextResponse.json(
        { error: result.stderr || result.stdout || "Agent komutu başarısız" },
        { status: 500 }
      )
    }

    return NextResponse.json({ ok: true, stdout: result.stdout?.trim() ?? "" })
  } catch (err) {
    console.error("[POST /api/companies/[firkod]/iis/action]", err)
    return NextResponse.json({ error: "Aksiyon uygulanamadı" }, { status: 500 })
  }
}
