import { NextResponse } from "next/server"
import { query, execute } from "@/lib/db"

interface SettingRow { Key: string; Value: string | null }

export async function GET() {
  try {
    const rows = await query<SettingRow[]>`SELECT [Key], [Value] FROM Settings`
    const settings: Record<string, string> = {}
    for (const r of rows) {
      settings[r.Key] = r.Value ?? ""
    }
    return NextResponse.json(settings)
  } catch (err) {
    console.error("[GET /api/settings]", err)
    return NextResponse.json({ error: "Ayarlar alınamadı" }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const body: Record<string, string> = await req.json()
    for (const [key, value] of Object.entries(body)) {
      await execute`
        UPDATE Settings SET [Value] = ${value} WHERE [Key] = ${key}
      `
    }
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error("[POST /api/settings]", err)
    return NextResponse.json({ error: "Ayarlar kaydedilemedi" }, { status: 500 })
  }
}
