import "server-only"
import { query } from "@/lib/db"

/**
 * GEÇİŞ HİBRİDİ: Companies hâlâ mssql'de (Faz 4'te henüz taşınmadı, 5758 satır).
 * hub.projects.company_id bir soft-ref (mssql Companies.Id). Firma adını mssql'den çözer.
 * Şu an tüm company_id'ler NULL → uniq boş → mssql'e hiç gidilmez.
 * Companies taşınınca bu helper kalkar, doğrudan hub join'e döner.
 */
export async function resolveCompanyNames(ids: (string | null)[]): Promise<Map<string, string>> {
  const uniq = [...new Set(ids.filter((x): x is string => !!x))]
  const map = new Map<string, string>()
  for (const cid of uniq) {
    try {
      const rows = await query<{ Name: string }[]>`SELECT Name FROM Companies WHERE Id = ${cid}`
      if (rows[0]) map.set(cid, rows[0].Name)
    } catch {
      /* mssql erişilemezse firma adı boş kalır */
    }
  }
  return map
}
