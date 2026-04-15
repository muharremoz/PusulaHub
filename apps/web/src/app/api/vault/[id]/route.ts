import { NextRequest, NextResponse } from "next/server"
import { execute, query } from "@/lib/db"
import { encrypt } from "@/lib/crypto"

/* PATCH /api/vault/[id] — giriş güncelle */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const { category, title, username, password, host, url, notes } = await req.json()

    // Şifre değiştiyse eski şifreyi history'ye kaydet
    if (password) {
      interface OldRow { Password: string }
      const oldRows = await query<OldRow[]>`SELECT Password FROM VaultEntries WHERE Id = ${id}`
      if (oldRows.length > 0 && oldRows[0].Password) {
        await execute`
          INSERT INTO VaultPasswordHistory (Id, VaultEntryId, Password)
          VALUES (${crypto.randomUUID()}, ${id}, ${oldRows[0].Password})
        `
      }
    }

    const encPwd = password ? encrypt(password) : null

    // Şifre güncelleniyorsa PasswordChangedAt'ı da güncelle
    if (encPwd) {
      await execute`
        UPDATE VaultEntries
        SET
          Category          = COALESCE(${category ?? null}, Category),
          Title             = COALESCE(${title    ?? null}, Title),
          Username          = COALESCE(${username ?? null}, Username),
          Password          = ${encPwd},
          Host              = ${host  || null},
          Url               = ${url   || null},
          Notes             = ${notes || null},
          PasswordChangedAt = GETDATE(),
          UpdatedAt         = GETDATE()
        WHERE Id = ${id}
      `
    } else {
      await execute`
        UPDATE VaultEntries
        SET
          Category  = COALESCE(${category ?? null}, Category),
          Title     = COALESCE(${title    ?? null}, Title),
          Username  = COALESCE(${username ?? null}, Username),
          Host      = ${host  || null},
          Url       = ${url   || null},
          Notes     = ${notes || null},
          UpdatedAt = GETDATE()
        WHERE Id = ${id}
      `
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[PATCH /api/vault/[id]]", err)
    return NextResponse.json({ error: "Giriş güncellenemedi" }, { status: 500 })
  }
}

/* DELETE /api/vault/[id] — giriş sil */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    await execute`DELETE FROM VaultEntries WHERE Id = ${id}`
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[DELETE /api/vault/[id]]", err)
    return NextResponse.json({ error: "Giriş silinemedi" }, { status: 500 })
  }
}
