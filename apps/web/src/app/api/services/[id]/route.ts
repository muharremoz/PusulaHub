import { NextRequest, NextResponse } from "next/server"
import { query, execute } from "@/lib/db"
import type { WizardServiceDto, ServiceType, ServiceConfig } from "../route"

/**
 * /api/services/[id]
 *   PATCH  → Hizmeti günceller (alanlar opsiyonel; yalnız gönderilen alanlar değişir)
 *   DELETE → Hizmeti tamamen siler. Soft delete istenirse PATCH ile isActive=false kullanılabilir.
 *
 * Type değişimi destekleniyor — yeni type için config tam set verilmek zorunda.
 */

interface Row {
  Id:           number
  Name:         string
  Category:     string
  Type:         string
  Config:       string | null
  DisplayOrder: number
  IsActive:     boolean
}

function rowToDto(r: Row): WizardServiceDto {
  let parsed: ServiceConfig | null = null
  if (r.Config) {
    try { parsed = JSON.parse(r.Config) as ServiceConfig } catch { parsed = null }
  }
  return {
    id:           r.Id,
    name:         r.Name,
    category:     r.Category,
    type:         (r.Type as ServiceType) ?? "pusula-program",
    config:       parsed,
    displayOrder: r.DisplayOrder,
    isActive:     !!r.IsActive,
  }
}

function validateConfig(type: ServiceType, raw: unknown):
  { ok: true; config: ServiceConfig } | { ok: false; error: string }
{
  if (!raw || typeof raw !== "object") return { ok: false, error: "config zorunlu" }
  const c = raw as Record<string, unknown>

  if (type === "pusula-program") {
    const sourceFolderPath = typeof c.sourceFolderPath === "string" ? c.sourceFolderPath.trim() : ""
    if (!sourceFolderPath) return { ok: false, error: "config.sourceFolderPath zorunlu" }
    return {
      ok: true,
      config: {
        sourceFolderPath,
        paramFileName: typeof c.paramFileName === "string" && c.paramFileName.trim() ? c.paramFileName.trim() : null,
        programCode:   typeof c.programCode   === "string" && c.programCode.trim()   ? c.programCode.trim()   : null,
        exeName:       typeof c.exeName       === "string" && c.exeName.trim()       ? c.exeName.trim()       : null,
      },
    }
  }

  if (type === "iis-site") {
    const sourceFolderPath = typeof c.sourceFolderPath === "string" ? c.sourceFolderPath.trim() : ""
    const siteNamePattern  = typeof c.siteNamePattern  === "string" ? c.siteNamePattern.trim()  : ""
    const portRangeId      = Number(c.portRangeId)
    if (!sourceFolderPath) return { ok: false, error: "config.sourceFolderPath zorunlu" }
    if (!Number.isFinite(portRangeId) || portRangeId <= 0) {
      return { ok: false, error: "config.portRangeId zorunlu" }
    }
    return {
      ok: true,
      config: {
        sourceFolderPath,
        configFileName: typeof c.configFileName === "string" && c.configFileName.trim() ? c.configFileName.trim() : null,
        siteNamePattern: siteNamePattern || null,
        portRangeId,
      },
    }
  }

  return { ok: false, error: "Bilinmeyen type" }
}

interface PatchPayload {
  name?:         string
  category?:     string
  type?:         ServiceType
  config?:       unknown
  displayOrder?: number
  isActive?:     boolean
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctx.params
    const numericId = Number(id)
    if (!Number.isFinite(numericId)) {
      return NextResponse.json({ error: "Geçersiz id" }, { status: 400 })
    }

    const body = (await req.json()) as PatchPayload

    const current = await query<Row[]>`
      SELECT Id, Name, Category, Type, Config, DisplayOrder, IsActive
      FROM WizardServices WHERE Id = ${numericId}
    `
    if (!current.length) {
      return NextResponse.json({ error: "Hizmet bulunamadı" }, { status: 404 })
    }
    const cur = current[0]

    const nextName     = body.name     !== undefined ? body.name.trim()     : cur.Name
    const nextCategory = body.category !== undefined ? body.category.trim() : cur.Category
    const nextType: ServiceType = (body.type ?? (cur.Type as ServiceType))
    const nextDisplayOrder = body.displayOrder !== undefined ? Number(body.displayOrder) : cur.DisplayOrder
    const nextIsActive = body.isActive !== undefined ? (body.isActive ? 1 : 0) : (cur.IsActive ? 1 : 0)

    if (!nextName)     return NextResponse.json({ error: "name boş olamaz" },     { status: 400 })
    if (!nextCategory) return NextResponse.json({ error: "category boş olamaz" }, { status: 400 })
    if (nextType !== "pusula-program" && nextType !== "iis-site") {
      return NextResponse.json({ error: "type geçersiz" }, { status: 400 })
    }

    // Config: yeni payload geldiyse tam validate; gelmediyse mevcut config'i al.
    // Type değiştiyse config payload zorunlu (eski config yeni type'a uymaz).
    let nextConfigJson: string
    if (body.config !== undefined) {
      const v = validateConfig(nextType, body.config)
      if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })
      nextConfigJson = JSON.stringify(v.config)
    } else {
      if (body.type && body.type !== cur.Type) {
        return NextResponse.json(
          { error: "type değiştiğinde config payload da gönderilmeli" },
          { status: 400 },
        )
      }
      // Mevcut config'i parse + re-validate (eski şema kalıntısı için).
      let curConfig: unknown = null
      if (cur.Config) { try { curConfig = JSON.parse(cur.Config) } catch { /* yok say */ } }
      const v = validateConfig(nextType, curConfig)
      if (!v.ok) {
        return NextResponse.json(
          { error: `Mevcut config geçersiz: ${v.error}. Lütfen config alanlarını da gönderin.` },
          { status: 400 },
        )
      }
      nextConfigJson = JSON.stringify(v.config)
    }

    const result = await execute`
      UPDATE WizardServices SET
        Name         = ${nextName},
        Category     = ${nextCategory},
        Type         = ${nextType},
        Config       = ${nextConfigJson},
        DisplayOrder = ${nextDisplayOrder},
        IsActive     = ${nextIsActive},
        UpdatedAt    = SYSDATETIME()
      OUTPUT INSERTED.Id, INSERTED.Name, INSERTED.Category, INSERTED.Type, INSERTED.Config,
             INSERTED.DisplayOrder, INSERTED.IsActive
      WHERE Id = ${numericId}
    `

    const rows = result.recordset as Row[]
    return NextResponse.json(rowToDto(rows[0]))
  } catch (err) {
    console.error("[PATCH /api/services/[id]]", err)
    return NextResponse.json({ error: "Hizmet güncellenemedi" }, { status: 500 })
  }
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctx.params
    const numericId = Number(id)
    if (!Number.isFinite(numericId)) {
      return NextResponse.json({ error: "Geçersiz id" }, { status: 400 })
    }

    const result = await execute`DELETE FROM WizardServices WHERE Id = ${numericId}`
    if (result.rowsAffected[0] === 0) {
      return NextResponse.json({ error: "Hizmet bulunamadı" }, { status: 404 })
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[DELETE /api/services/[id]]", err)
    return NextResponse.json({ error: "Hizmet silinemedi" }, { status: 500 })
  }
}
