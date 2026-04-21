import { NextRequest, NextResponse } from "next/server"
import { query, execute } from "@/lib/db"
import { encrypt, decrypt } from "@/lib/crypto"
import { requirePermission } from "@/lib/require-permission"

/* ── Tipler ── */
interface VaultRow {
  Id:                string
  Category:          string
  Title:             string
  Username:          string
  Password:          string
  Host:              string | null
  Url:               string | null
  Notes:             string | null
  IsFavorite:        boolean
  PasswordChangedAt: string | null
  CreatedAt:         string
  UpdatedAt:         string
}

/* GET /api/vault — tüm girişleri listele (şifreler çözülmüş olarak) */
export async function GET() {
  const gate = await requirePermission("vault", "read")
  if (gate) return gate
  try {
    const rows = await query<VaultRow[]>`
      SELECT Id, Category, Title, Username, Password, Host, Url, Notes,
             IsFavorite,
             CONVERT(NVARCHAR(30), PasswordChangedAt, 120) AS PasswordChangedAt,
             CONVERT(NVARCHAR(30), CreatedAt, 120) AS CreatedAt,
             CONVERT(NVARCHAR(30), UpdatedAt, 120) AS UpdatedAt
      FROM VaultEntries
      ORDER BY Title
    `
    return NextResponse.json(rows.map((r) => ({
      id:                r.Id,
      category:          r.Category,
      title:             r.Title,
      username:          r.Username,
      password:          decrypt(r.Password) ?? "",
      host:              r.Host,
      url:               r.Url,
      notes:             r.Notes,
      isFavorite:        !!r.IsFavorite,
      passwordChangedAt: r.PasswordChangedAt,
      createdAt:         r.CreatedAt,
      updatedAt:         r.UpdatedAt,
    })))
  } catch (err) {
    console.error("[GET /api/vault]", err)
    return NextResponse.json({ error: "Vault listesi alınamadı" }, { status: 500 })
  }
}

/* POST /api/vault — yeni giriş ekle (şifre AES-256-GCM ile saklanır) */
export async function POST(req: NextRequest) {
  const gate = await requirePermission("vault", "write")
  if (gate) return gate
  try {
    const { category, title, username, password, host, url, notes } = await req.json()
    if (!title?.trim() || !username?.trim() || !password?.trim()) {
      return NextResponse.json({ error: "Başlık, kullanıcı adı ve şifre zorunlu" }, { status: 400 })
    }

    const id = crypto.randomUUID()
    const encryptedPassword = encrypt(password)

    await execute`
      INSERT INTO VaultEntries (Id, Category, Title, Username, Password, Host, Url, Notes, PasswordChangedAt)
      VALUES (
        ${id},
        ${category ?? "server"},
        ${title.trim()},
        ${username.trim()},
        ${encryptedPassword},
        ${host || null},
        ${url || null},
        ${notes || null},
        GETDATE()
      )
    `
    return NextResponse.json({ id }, { status: 201 })
  } catch (err) {
    console.error("[POST /api/vault]", err)
    return NextResponse.json({ error: "Giriş eklenemedi" }, { status: 500 })
  }
}
