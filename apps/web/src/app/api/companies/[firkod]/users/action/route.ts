import { NextRequest, NextResponse } from "next/server"
import { query } from "@/lib/db"
import { execOnAgent } from "@/lib/agent-poller"

/**
 * POST /api/companies/[firkod]/users/action
 * Body: { username: string, action: "reset-password" | "disable" | "enable", password?: string }
 *
 * AD üzerinde kullanıcı aksiyonları — AD agent'a PowerShell komutu gönderir.
 * samAccountName = body.username (tablodaki görüntülenen kullanıcı adı zaten firkod.xxx).
 *
 * ⚠ Agent regex-parse yapıyor — çift tırnak YASAK. Tek tırnak + '' escape.
 */

interface Body {
  username: string
  action:   "reset-password" | "disable" | "enable" | "delete"
  password?: string
}

interface ServerRow { IP: string; AgentPort: number; ApiKey: string }

function psQuote(s: string): string {
  return (s ?? "").replace(/'/g, "''")
}

function meetsAdComplexity(pw: string): boolean {
  if (!pw || pw.length < 7) return false
  let cats = 0
  if (/[A-Z]/.test(pw)) cats++
  if (/[a-z]/.test(pw)) cats++
  if (/[0-9]/.test(pw)) cats++
  if (/[^A-Za-z0-9]/.test(pw)) cats++
  return cats >= 3
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ firkod: string }> }
) {
  const { firkod } = await params
  try {
    const body = (await req.json()) as Body
    if (!body?.username || !body?.action) {
      return NextResponse.json({ error: "username ve action zorunludur" }, { status: 400 })
    }
    // username firkod.xxx formatında olmalı — başkasının kullanıcısına dokunmayı engelle
    if (!body.username.toLowerCase().startsWith(`${firkod.toLowerCase()}.`)) {
      return NextResponse.json({ error: "Kullanıcı bu firmaya ait değil" }, { status: 403 })
    }
    if (body.action === "reset-password") {
      if (!body.password || !meetsAdComplexity(body.password)) {
        return NextResponse.json({ error: "Şifre AD karmaşıklık kuralını karşılamıyor" }, { status: 400 })
      }
    }

    // AD agent bilgisi — Companies.AdServerId
    const rows = await query<ServerRow[]>`
      SELECT s.IP, s.AgentPort, s.ApiKey
      FROM Companies c
      JOIN Servers s ON s.Id = c.AdServerId
      WHERE c.CompanyId = ${firkod} AND s.AgentPort IS NOT NULL AND s.ApiKey IS NOT NULL
    `
    const agent = rows[0]
    if (!agent) return NextResponse.json({ error: "AD sunucusu tanımsız" }, { status: 404 })

    const u = psQuote(body.username)
    let cmd = ""
    if (body.action === "reset-password") {
      const pw = psQuote(body.password!)
      cmd = `Import-Module ActiveDirectory; $sec = ConvertTo-SecureString -AsPlainText -Force -String '${pw}'; Set-ADAccountPassword -Identity '${u}' -Reset -NewPassword $sec -ErrorAction Stop; Write-Output 'OK'`
    } else if (body.action === "disable") {
      cmd = `Import-Module ActiveDirectory; Disable-ADAccount -Identity '${u}' -ErrorAction Stop; Write-Output 'OK'`
    } else if (body.action === "enable") {
      cmd = `Import-Module ActiveDirectory; Enable-ADAccount -Identity '${u}' -ErrorAction Stop; Write-Output 'OK'`
    } else if (body.action === "delete") {
      cmd = `Import-Module ActiveDirectory; Remove-ADUser -Identity '${u}' -Confirm:$false -ErrorAction Stop; Write-Output 'OK'`
    } else {
      return NextResponse.json({ error: "Geçersiz aksiyon" }, { status: 400 })
    }

    const res = await execOnAgent(agent.IP, agent.AgentPort, agent.ApiKey, cmd, 20)
    const out = (res.stdout ?? "").trim()
    if (res.exitCode !== 0 || !out.includes("OK")) {
      return NextResponse.json({
        error: res.stderr || res.stdout || "Agent komutu başarısız",
        stdout: res.stdout, stderr: res.stderr, exitCode: res.exitCode,
      }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
