/**
 * Pusula programlarının kendi yedek menüsü kapalı tutulur (30.10.2026).
 *
 * Programdaki yedek COPY_ONLY olmadan tam yedek alıyor ve SpareBackup'ın
 * diferansiyel zincirini bozuyordu. Üç yerde kapatılır:
 *   - Toptan / Üretim / StokCari parametre dosyasına `[AKSAM YEDEKLEME YAPMA] 1`
 *   - Perakende exe'sinin (Aurum_SQL.exe) yanına boş `yedeksorma.txt`
 *   - Datanın `YanM` tablosunda yedekleme satırının ID'si 999 → menüde görünmez
 * Pusula X'e dokunulmaz (YanM tablosu yok; kendi güncellemesiyle kapanıyor).
 * Var olan firmalar için elle: scripts/program-yedek-kapat.ps1 + apps/web/__yanm-yedek-gizle.mjs
 */

import sql from "mssql"

/** Program kodu → YanM'deki yedekleme satırının ID'si (518 datada ölçüldü, hepsi aynı). */
export const YEDEK_MENU_ID: Record<string, number> = { "011": 166, "909": 615, "016": 123, "111": 110 }
export const GIZLI_MENU_ID = 999

/** Parametre dosyasına `[AKSAM YEDEKLEME YAPMA] 1` yazılan programlar: Toptan, Üretim, StokCari. */
export const AKSAM_YEDEK_PROGRAMLARI = new Set(["011", "016", "111"])
export const AKSAM_YEDEK_SATIRI = "[AKSAM YEDEKLEME YAPMA] 1"

/**
 * Datadaki yedek menüsünü gizler. `masterPool` herhangi bir DB'ye bağlı olabilir
 * (USE ile hedefe geçilir). Satırın adı "yedek" içermiyorsa ya da 999 doluysa dokunulmaz.
 */
export async function yedekMenusunuGizle(
  masterPool: sql.ConnectionPool,
  dbName: string,
  programCode: string | null | undefined,
): Promise<"gizlendi" | "zaten" | "yok"> {
  const eskiId = YEDEK_MENU_ID[(programCode ?? "").trim()]
  if (!eskiId) return "yok"
  const r = await masterPool.request()
    .input("db", sql.NVarChar, dbName)
    .input("eski", sql.Int, eskiId)
    .input("yeni", sql.Int, GIZLI_MENU_ID)
    .query<{ d: string }>(`
      DECLARE @s nvarchar(max) = N'USE ' + QUOTENAME(@db) + N';
        IF OBJECT_ID(''YanM'') IS NULL BEGIN SELECT ''yok'' d; RETURN END
        IF EXISTS(SELECT 1 FROM YanM WHERE yanM_ID = @yeni) BEGIN SELECT ''zaten'' d; RETURN END
        IF NOT EXISTS(SELECT 1 FROM YanM WHERE yanM_ID = @eski AND yanM_Caption LIKE ''%yedek%'') BEGIN SELECT ''yok'' d; RETURN END
        UPDATE YanM SET yanM_ID = @yeni WHERE yanM_ID = @eski AND yanM_Caption LIKE ''%yedek%'';
        SELECT ''gizlendi'' d'
      EXEC sp_executesql @s, N'@eski int, @yeni int', @eski = @eski, @yeni = @yeni
    `)
  const d = r.recordset[0]?.d
  return d === "gizlendi" || d === "zaten" ? d : "yok"
}

export function yedekMenusuMesaji(sonuc: "gizlendi" | "zaten" | "yok"): string {
  return sonuc === "gizlendi" ? "YanM yedekleme satırı → ID 999"
    : sonuc === "zaten" ? "Zaten gizli (ID 999)"
    : "Yedekleme satırı yok — atlandı"
}
