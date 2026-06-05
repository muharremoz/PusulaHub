/**
 * Firma Etiketleri — /api/companies/[firkod]/tags
 *
 * GET    → { tags: string[], allTags: string[] }
 *          tags    : bu firmanın etiketleri
 *          allTags : sistemde kullanılan tüm benzersiz etiketler (öneri için)
 * POST   { tag }   → etiket ekle (varsa no-op)
 * DELETE ?tag=...  → etiket sil
 *
 * CompanyTags tablosu ilk istekte otomatik oluşturulur (idempotent).
 * CLAUDE.md kuralı: anonymous constraint (DB-wide ad çakışması olmasın).
 */

import { NextRequest, NextResponse } from "next/server"
import { query, execute } from "@/lib/db"
import { requirePermission } from "@/lib/require-permission"

let _ensured = false
async function ensureTable(): Promise<void> {
  if (_ensured) return
  await execute`
    IF OBJECT_ID('CompanyTags','U') IS NULL
    CREATE TABLE CompanyTags (
      Id        INT IDENTITY PRIMARY KEY,
      CompanyId NVARCHAR(20)  NOT NULL,
      Tag       NVARCHAR(50)  NOT NULL,
      CreatedAt DATETIME      DEFAULT GETDATE()
    )
  `
  // Aynı firmada aynı etiketin tekrarını engelle
  await execute`
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_CompanyTags_Company_Tag')
    CREATE UNIQUE INDEX UX_CompanyTags_Company_Tag ON CompanyTags (CompanyId, Tag)
  `
  _ensured = true
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ firkod: string }> },
) {
  const gate = await requirePermission("companies", "read")
  if (gate) return gate
  const { firkod } = await params
  try {
    await ensureTable()
    const own = await query<{ Tag: string }[]>`
      SELECT Tag FROM CompanyTags WHERE CompanyId = ${firkod} ORDER BY Tag
    `
    const all = await query<{ Tag: string }[]>`
      SELECT DISTINCT Tag FROM CompanyTags ORDER BY Tag
    `
    return NextResponse.json({
      tags:    own.map((r) => r.Tag),
      allTags: all.map((r) => r.Tag),
    })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Hata" }, { status: 500 })
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ firkod: string }> },
) {
  const gate = await requirePermission("companies", "write")
  if (gate) return gate
  const { firkod } = await params

  let tag = ""
  try {
    const body = (await req.json()) as { tag?: string }
    tag = (body.tag ?? "").trim()
  } catch {
    return NextResponse.json({ error: "Geçersiz JSON" }, { status: 400 })
  }
  if (!tag) return NextResponse.json({ error: "Etiket boş olamaz" }, { status: 400 })
  if (tag.length > 50) tag = tag.slice(0, 50)

  try {
    await ensureTable()
    await execute`
      IF NOT EXISTS (SELECT 1 FROM CompanyTags WHERE CompanyId = ${firkod} AND Tag = ${tag})
        INSERT INTO CompanyTags (CompanyId, Tag) VALUES (${firkod}, ${tag})
    `
    return NextResponse.json({ ok: true, tag })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Hata" }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ firkod: string }> },
) {
  const gate = await requirePermission("companies", "write")
  if (gate) return gate
  const { firkod } = await params
  const tag = (req.nextUrl.searchParams.get("tag") ?? "").trim()
  if (!tag) return NextResponse.json({ error: "Etiket belirtilmedi" }, { status: 400 })

  try {
    await ensureTable()
    await execute`
      DELETE FROM CompanyTags WHERE CompanyId = ${firkod} AND Tag = ${tag}
    `
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Hata" }, { status: 500 })
  }
}
