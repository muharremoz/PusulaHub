import { NextResponse } from "next/server"
import { query } from "@/lib/db"

interface IISSiteRow {
  Id:           string
  Name:         string
  Server:       string
  Status:       string
  Binding:      string
  AppPool:      string
  PhysicalPath: string
  Hizmet:       string | null
  ServerIP:     string | null
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ firkod: string }> }
) {
  const { firkod } = await params
  try {
    const rows = await query<IISSiteRow[]>`
      SELECT i.Id, i.Name, i.Server, i.Status, i.Binding, i.AppPool, i.PhysicalPath, i.Hizmet,
             s.IP AS ServerIP
      FROM IISSites i
      LEFT JOIN Servers s ON s.Name = i.Server
      WHERE i.Firma = ${firkod}
      ORDER BY i.Server, i.Name
    `
    return NextResponse.json(rows)
  } catch (err) {
    console.error("[GET /api/companies/[firkod]/iis]", err)
    return NextResponse.json({ error: "IIS verisi alınamadı" }, { status: 500 })
  }
}
