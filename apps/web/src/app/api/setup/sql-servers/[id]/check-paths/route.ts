import { NextResponse } from "next/server"
import { query } from "@/lib/db"
import { execOnAgent } from "@/lib/agent-poller"
import {
  buildCheckFilesExist,
  parseCheckPathsOutput,
  type RawCheckPathItem,
} from "@/lib/sql-backup-powershell"

/**
 * POST /api/setup/sql-servers/:id/check-paths
 *
 * Body: { paths: string[] }
 *
 * Seçili SQL sunucusundaki PusulaAgent'a PowerShell komutu göndererek
 * verilen dosya yollarının her birinin varlığını ve boyutunu kontrol eder.
 *
 * Firma kurulum sihirbazı 4. adım "Demo Veritabanı" modunda, demo DB'lerin
 * `locationPath`'i seçilen SQL sunucusunda gerçekten var mı diye
 * doğrulamak için kullanılır.
 */

interface ServerRow {
  Id:        string
  Name:      string
  IP:        string
  ApiKey:    string | null
  AgentPort: number | null
}

export interface CheckPathsResponse {
  results: Array<{
    path:   string
    exists: boolean
    sizeMB: number
  }>
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const body = await req.json().catch(() => ({}))
    const rawPaths = Array.isArray(body?.paths) ? (body.paths as unknown[]) : []

    const paths = rawPaths
      .map((p) => (typeof p === "string" ? p.trim() : ""))
      .filter((p) => p.length > 0)

    if (paths.length === 0) {
      return NextResponse.json({ results: [] } satisfies CheckPathsResponse)
    }

    const rows = await query<ServerRow[]>`
      SELECT s.Id, s.Name, s.IP, s.ApiKey, s.AgentPort
      FROM Servers s
      INNER JOIN ServerRoles r ON r.ServerId = s.Id
      WHERE s.Id = ${id} AND r.Role = 'SQL'
    `
    if (rows.length === 0) {
      return NextResponse.json({ error: "SQL sunucusu bulunamadı" }, { status: 404 })
    }

    const server = rows[0]
    if (!server.ApiKey || !server.AgentPort) {
      return NextResponse.json(
        { error: "Bu sunucuda PusulaAgent yapılandırılmamış (ApiKey/AgentPort eksik)." },
        { status: 400 },
      )
    }

    const command = buildCheckFilesExist(paths)
    const result = await execOnAgent(server.IP, server.AgentPort, server.ApiKey, command, 30)

    if (result.exitCode !== 0) {
      const msg = result.stderr?.trim() || `Agent exec başarısız (exit=${result.exitCode})`
      return NextResponse.json({ error: msg }, { status: 502 })
    }

    const raw: RawCheckPathItem[] = parseCheckPathsOutput(result.stdout)

    // Agent'tan dönmeyen path'ler için default false (teoride olmamalı)
    const byPath = new Map<string, RawCheckPathItem>()
    for (const r of raw) byPath.set(r.Path, r)

    const response: CheckPathsResponse = {
      results: paths.map((p) => {
        const item = byPath.get(p)
        return {
          path:   p,
          exists: !!item?.Exists,
          sizeMB: item ? (item.Length || 0) / (1024 * 1024) : 0,
        }
      }),
    }

    return NextResponse.json(response)
  } catch (err) {
    console.error("[POST /api/setup/sql-servers/:id/check-paths]", err)
    const msg = err instanceof Error ? err.message : "Dosya kontrolü başarısız"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
