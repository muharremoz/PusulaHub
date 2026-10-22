/**
 * Pusula X resim yolu — `Sabitler.ImagePath`.
 *
 * Pusula X resim yolunu guvenlik'te değil kendi `Sabitler.ImagePath`'inde tutar.
 * Yanlış/eski yol (ulaşılamayan paylaşım, terminalin C: diski) programı açılışta
 * ve içeride ağ zaman aşımı kadar dondurur ya da resimler firmalar arasında
 * karışır. Doğru yer Depo: `\\<depo>\Resimler\<firmaId>\` — sonu daima `\`.
 *
 * Yedekten gelen data (şablon, eski sunucu) içinde ne yazıyorsa onu taşır;
 * bu yüzden datayı SQL'e kuran her akış (sihirbaz, Yeni Veritabanı Ekle,
 * geri yükleme) yolu burada düzeltir. Yalnız `ImagePath` sütunu olan DB'ye
 * yazılır; diğer programların datası atlanır.
 */

import sql from "mssql"

/** Varsayılan Depo yolu: `\\<depoIp>\Resimler\<firmaId>\` */
export function pusulaXResimYolu(depoIp: string, firmaId: string | number): string {
  return `\\\\${depoIp}\\Resimler\\${firmaId}\\`
}

/** Mevcut yol; DB yoksa ya da Pusula X datası değilse (sütun yok) `null`. */
export async function okuPusulaXResimYolu(masterPool: sql.ConnectionPool, dbName: string): Promise<string | null> {
  const db = dbName.replace(/]/g, "]]")
  const r = await masterPool.request().input("db", dbName).query<{ yol: string | null }>(
    `IF DB_ID(@db) IS NULL OR COL_LENGTH(N'[${db}].dbo.Sabitler', N'ImagePath') IS NULL SELECT CAST(NULL AS nvarchar(500)) AS yol
     ELSE SELECT TOP 1 ImagePath AS yol FROM [${db}].dbo.Sabitler`,
  )
  return r.recordset[0]?.yol ?? null
}

/** Yolu yazar. Dönen değer: güncellenen satır; `-1` → Pusula X datası değil (atlandı). */
export async function yazPusulaXResimYolu(masterPool: sql.ConnectionPool, dbName: string, yol: string): Promise<number> {
  const db = dbName.replace(/]/g, "]]")
  const r = await masterPool.request().input("yol", yol).query<{ n: number }>(
    `IF COL_LENGTH(N'[${db}].dbo.Sabitler', N'ImagePath') IS NULL SELECT CAST(-1 AS int) AS n
     ELSE BEGIN UPDATE [${db}].dbo.Sabitler SET ImagePath = @yol; SELECT @@ROWCOUNT AS n END`,
  )
  return r.recordset[0]?.n ?? 0
}

/**
 * Resim hizmeti (IIS RESIM sitesi) varsa entegrasyon adresi: `EntegrasyonResimYolu = http://<IIS DNS>:<port>/`,
 * `ImagePort = <port>`. Biçim mevcut datalarla aynı (778: http://iis.databag.net:20002/ · 20002).
 * Sütunu olmayan alan atlanır. Dönen değer: yazılan sütun sayısı (0 → Pusula X datası değil).
 */
export async function yazPusulaXEntegrasyon(masterPool: sql.ConnectionPool, dbName: string, host: string, port: number): Promise<number> {
  const db = dbName.replace(/]/g, "]]")
  const r = await masterPool.request().input("url", `http://${host}:${port}/`).input("port", port).query<{ n: number }>(
    `DECLARE @n int = 0
     IF COL_LENGTH(N'[${db}].dbo.Sabitler', N'EntegrasyonResimYolu') IS NOT NULL BEGIN UPDATE [${db}].dbo.Sabitler SET EntegrasyonResimYolu = @url; SET @n += 1 END
     IF COL_LENGTH(N'[${db}].dbo.Sabitler', N'ImagePort') IS NOT NULL BEGIN UPDATE [${db}].dbo.Sabitler SET ImagePort = @port; SET @n += 1 END
     SELECT @n AS n`,
  )
  return r.recordset[0]?.n ?? 0
}

/** Önceki yol bu Depo'yu gösteriyorsa (alt klasörlü olabilir: `\6796\TOPTAN\`) korunacak yol; değilse `null`. */
export function depodakiYol(onceki: string | null, depoIp: string): string | null {
  const y = (onceki ?? "").trim()
  if (!y.toLowerCase().startsWith(`\\\\${depoIp}\\`.toLowerCase())) return null
  return y.replace(/\/+$/, "").replace(/\\*$/, "\\")
}
