import { NextRequest, NextResponse } from "next/server"
import { requirePermission } from "@/lib/require-permission"
import { serverAgentById, serversWithRole } from "@/lib/hub-servers"
import { execOnAgent } from "@/lib/agent-poller"

/**
 * GET /api/companies/[firkod]/resim-klasorleri?depoServerId=...
 *
 * Depo'daki D:\Resimler\<firkod> altındaki klasörler (30.10.2026). Firma
 * detayından Resim hizmeti eklenirken site hangi klasörü yayınlayacak diye
 * sorulur — bir firmanın birden çok resim klasörü olabiliyor (ör. 6572:
 * ALTINOVA, CADDE, CIGLI, TIYATRO), her biri ayrı RESIM sitesi.
 * Yalnız okur.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ firkod: string }> }) {
  const gate = await requirePermission("companies", "read")
  if (gate) return gate

  const { firkod } = await params
  if (!/^\d{1,10}$/.test(firkod)) return NextResponse.json({ error: "Geçersiz firma kodu" }, { status: 400 })

  let depoId = req.nextUrl.searchParams.get("depoServerId")?.trim() || null
  if (!depoId) depoId = ((await serversWithRole("File", "id"))[0] as { id?: string } | undefined)?.id ?? null
  if (!depoId) return NextResponse.json({ error: "Depo sunucusu bulunamadı" }, { status: 400 })

  const ag = await serverAgentById(depoId)
  if (!ag?.api_key || !ag.agent_port) return NextResponse.json({ error: "Depo sunucusunda PusulaAgent yapılandırılmamış" }, { status: 400 })

  // Agent exec: çift tırnak yok, tek satır (CLAUDE.md — agent exec tuzakları)
  const kok = `D:\\Resimler\\${firkod}`
  const cmd = `[Console]::OutputEncoding=[Text.Encoding]::UTF8; if (Test-Path -LiteralPath '${kok}') { 'VAR'; Get-ChildItem -LiteralPath '${kok}' -Directory -ErrorAction SilentlyContinue | Sort-Object Name | ForEach-Object { 'K:' + $_.Name } } else { 'YOK' }`
  const r = await execOnAgent(ag.ip, ag.agent_port, ag.api_key, cmd, 30)
  if (r.exitCode !== 0) {
    return NextResponse.json({ error: `Depo okunamadı: ${(r.stderr || r.stdout || `exit ${r.exitCode}`).slice(0, 200)}` }, { status: 502 })
  }
  const satirlar = (r.stdout ?? "").split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
  return NextResponse.json({
    kok,
    kokVar:    satirlar.includes("VAR"),
    klasorler: satirlar.filter((s) => s.startsWith("K:")).map((s) => s.slice(2)),
  })
}
