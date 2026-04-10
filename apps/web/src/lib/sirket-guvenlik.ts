/**
 * sirket.dbo.guvenlik tablosuna program kaydı eklemek için yardımcılar.
 *
 * Firma kurulum sihirbazının 4. adımında "Şirket veritabanına ekle" toggle'ı
 * açıkken, her restore edilen DB için `sirket` veritabanına bir satır insert
 * edilir. Böylece PusulaSQL programları açıldığında ilgili firma + program
 * kombinasyonu güvenlik tablosunda görünür.
 *
 * Eski ServerManager implementasyonunun (CompanySetupService.cs) birebir
 * karşılığıdır; şema + varsayılan değerler aynı.
 */

import sql from "mssql"

/** Program koduna göre arkaplan/resim/baslik1 varsayılanları. */
export function getGuvenlikTemplate(programCode: string | null | undefined): {
  arkaplan: string
  resim:    string
  baslik1:  string
} {
  switch ((programCode ?? "").trim()) {
    case "011":
      return {
        arkaplan: "C:\\Pusula\\ToptanSQL\\Resimler/arkaplan.jpg",
        resim:    "C:\\Pusula\\ToptanSQL\\Resimler/arkaplan.jpg",
        baslik1:  "TOPTAN",
      }
    case "909":
      return {
        arkaplan: "C:\\Pusula\\PerakendeSQL\\Resimler\\arkaplan.jpg",
        resim:    "C:\\Pusula\\PerakendeSQL\\Resimler\\arkaplan.jpg",
        baslik1:  "PERAKENDE",
      }
    case "111":
      return {
        arkaplan: "C:\\Pusula\\StokCariSQL\\Resimler\\arkaplan.jpg",
        resim:    "C:\\Pusula\\StokCariSQL\\Resimler\\arkaplan.jpg",
        baslik1:  "STOKCARI",
      }
    case "016":
      return {
        arkaplan: "C:\\Pusula\\UretimSQL\\Resimler\\arkaplan.jpg",
        resim:    "C:\\Pusula\\UretimSQL\\Resimler\\arkaplan.jpg",
        baslik1:  "URETIM",
      }
    default:
      // Fallback — eski projedeki ile aynı
      return {
        arkaplan: "C:\\Pusula\\ToptanSQL\\Resimler/arkaplan.jpg",
        resim:    "C:\\Pusula\\ToptanSQL\\Resimler/arkaplan.jpg",
        baslik1:  "TOPTAN",
      }
  }
}

export interface InsertGuvenlikArgs {
  /** Restore edilen hedef DB adı (srkadi + DataYolu kolonlarına yazılır) */
  dbName:      string
  /** Firma ID — KOD + PusulaFirmaId kolonlarına int olarak yazılır */
  firmaId:     string
  /** Pusula program kodu (011, 909, 111, 016…) — PrgTur kolonuna */
  programCode: string
}

/**
 * `sirket.dbo.guvenlik` tablosuna bir satır ekler. `pool` parametre olarak
 * verilen `mssql` bağlantısı **sirket** DB'sine bağlanmış olmalıdır.
 *
 * Eski projedeki `InsertGuvenlikRowAsync` metodunun birebir karşılığı.
 */
export async function insertGuvenlikRow(
  pool: sql.ConnectionPool,
  args: InsertGuvenlikArgs,
): Promise<void> {
  const { dbName, firmaId, programCode } = args
  const { arkaplan, resim, baslik1 } = getGuvenlikTemplate(programCode)
  const firmaKod = Number.parseInt(firmaId, 10)
  const safeKod  = Number.isFinite(firmaKod) ? firmaKod : 0
  const resimyolu = `\\\\10.15.2.200\\Resimler\\${firmaId}`

  const req = pool.request()
  req.input("srkadi",          sql.NVarChar, dbName)
  req.input("adres",           sql.NVarChar, "1")
  req.input("telefon",         sql.NVarChar, "1")
  req.input("faks",            sql.NVarChar, "1")
  req.input("prog_no",         sql.NVarChar, "U14-C554-T1108-M10")
  req.input("pin",             sql.NVarChar, "")
  req.input("vc",              sql.SmallInt, 1)
  req.input("puk",             sql.NVarChar, "TOTMF8473E")
  req.input("PrgTur",          sql.NVarChar, programCode)
  req.input("DataYolu",        sql.NVarChar, dbName)
  req.input("resimyolu",       sql.NVarChar, resimyolu)
  req.input("transferyolu",    sql.NVarChar, "C:\\PUSULA\\")
  req.input("arkaplan",        sql.NVarChar, arkaplan)
  req.input("resim",           sql.NVarChar, resim)
  req.input("baslik1",         sql.NVarChar, baslik1)
  req.input("transfer",        sql.Bit,      0)
  req.input("KOD",             sql.Int,      safeKod)
  req.input("ReyonYolu",       sql.NVarChar, "C:\\PUSULA\\")
  req.input("Akod",            sql.NVarChar, "B")
  req.input("YedekAl",         sql.Bit,      1)
  req.input("PusulaFirmaId",   sql.Int,      safeKod)
  req.input("TopluRapordaCik", sql.Bit,      0)

  await req.query(`
    INSERT INTO guvenlik (
      srkadi, adres, telefon, faks, prog_no, pin, vc, puk, PrgTur, giris,
      DataYolu, resimyolu, transferyolu, arkaplan, resim, baslik1,
      transfer, KOD, ReyonYolu, Akod, YedekAl, PusulaFirmaId, TopluRapordaCik
    ) VALUES (
      @srkadi, @adres, @telefon, @faks, @prog_no, @pin, @vc, @puk, @PrgTur, NULL,
      @DataYolu, @resimyolu, @transferyolu, @arkaplan, @resim, @baslik1,
      @transfer, @KOD, @ReyonYolu, @Akod, @YedekAl, @PusulaFirmaId, @TopluRapordaCik
    )
  `)
}
