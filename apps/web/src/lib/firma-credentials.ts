/**
 * Firma kullanıcılarının şifrelerini saklama yardımcısı.
 *
 * `CompanyUserCredentials` tablosu (Hub DB'sinde) wizard çalışırken her
 * domain kullanıcısı için bir satır tutar — şifre AES-256-GCM ile encrypted.
 * Sadece firma detayındaki "Erişim Bilgileri" modal'ı tarafından okunur.
 *
 * Şema:
 *   Id          UNIQUEIDENTIFIER PK
 *   CompanyId   NVARCHAR(50)    — firma kodu (Companies.CompanyId)
 *   Username    NVARCHAR(200)   — tam AD username (örn. "2507.vefa1")
 *   Password    NVARCHAR(MAX)   — encrypted (lib/crypto.ts format'ı)
 *   CreatedAt, UpdatedAt
 *
 * UNIQUE constraint: (CompanyId, Username) — idempotent upsert için.
 */

import { execute, query } from "@/lib/db"
import { encrypt, decrypt } from "@/lib/crypto"

let _tableEnsured = false

/** Tablo yoksa oluştur — idempotent, ilk kullanımda 1 kez çalışır. */
async function ensureTable(): Promise<void> {
  if (_tableEnsured) return
  await execute`
    IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'CompanyUserCredentials')
    BEGIN
      CREATE TABLE CompanyUserCredentials (
        Id         UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
        CompanyId  NVARCHAR(50)  NOT NULL,
        Username   NVARCHAR(200) NOT NULL,
        Password   NVARCHAR(MAX) NOT NULL,
        CreatedAt  DATETIME2(0)  NOT NULL DEFAULT SYSUTCDATETIME(),
        UpdatedAt  DATETIME2(0)  NOT NULL DEFAULT SYSUTCDATETIME()
      )
      CREATE UNIQUE INDEX UX_CompanyUserCredentials_CompanyId_Username
        ON CompanyUserCredentials (CompanyId, Username)
    END
  `
  _tableEnsured = true
}

/**
 * Şifreyi kaydet — yoksa INSERT, varsa UPDATE.
 * Boş şifre çağrısı sessizce yok sayılır.
 */
export async function saveCompanyUserPassword(
  companyId: string,
  username:  string,
  password:  string,
): Promise<void> {
  if (!companyId || !username || !password) return
  await ensureTable()
  const enc = encrypt(password)
  await execute`
    MERGE CompanyUserCredentials AS t
    USING (SELECT ${companyId} AS CompanyId, ${username} AS Username) AS s
      ON t.CompanyId = s.CompanyId AND t.Username = s.Username
    WHEN MATCHED THEN
      UPDATE SET Password = ${enc}, UpdatedAt = SYSUTCDATETIME()
    WHEN NOT MATCHED THEN
      INSERT (CompanyId, Username, Password)
      VALUES (s.CompanyId, s.Username, ${enc});
  `
}

/**
 * Firmanın tüm saklı şifrelerini decrypt edip Map olarak döner.
 * Anahtar: tam username (örn. "2507.vefa1") · Değer: düz şifre.
 */
export async function getCompanyCredentials(
  companyId: string,
): Promise<Record<string, string>> {
  if (!companyId) return {}
  await ensureTable()
  interface Row { Username: string; Password: string }
  const rows = await query<Row[]>`
    SELECT Username, Password FROM CompanyUserCredentials
    WHERE CompanyId = ${companyId}
  `
  const out: Record<string, string> = {}
  for (const r of rows) {
    try {
      const pw = decrypt(r.Password)
      if (pw) out[r.Username] = pw
    } catch {
      // Decrypt başarısız (ör. ENCRYPTION_KEY değişmiş) — atla
    }
  }
  return out
}
