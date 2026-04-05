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
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ firkod: string }> }
) {
  const { firkod } = await params
  try {
    const rows = await query<IISSiteRow[]>`
      SELECT Id, Name, Server, Status, Binding, AppPool, PhysicalPath, Hizmet
      FROM IISSites
      WHERE Name = ${firkod}
      ORDER BY Server
    `
    return NextResponse.json(rows)
  } catch (err) {
    console.error("[GET /api/companies/[firkod]/iis]", err)
    return NextResponse.json({ error: "IIS verisi alınamadı" }, { status: 500 })
  }
}
