/**
 * Pusula giriş ekranındaki data sırası.
 *
 * Program giriş ekranında firmanın datalarını `sirket.dbo.guvenlik.srkkod`'a
 * göre BÜYÜKTEN KÜÇÜĞE listeliyor — sıra, datanın eklendiği sıra oluyor.
 * Müşteri yıllara göre görmek isteyince sırayı değiştirmenin tek yolu
 * numaraları değiştirmek.
 *
 * `srkkod` IDENTITY olduğu için UPDATE edilemiyor: firmanın satırları tek
 * işlemde silinip `IDENTITY_INSERT` ile yeni numaralarla geri ekleniyor.
 * Yeni numara HARCANMIYOR — firmanın mevcut numaraları kendi satırları
 * arasında yer değiştiriyor (permütasyon). Böylece başka firmayla çakışma
 * olmuyor ve identity sayacı etkilenmiyor.
 *
 * Kolon listesi sunucudan okunuyor: guvenlik'e ileride kolon eklenirse
 * silinip geri eklenen satırda o kolon sessizce boş kalmasın.
 */

import type { ConnectionPool } from "mssql"

export interface GirisSatiri {
  srkkod:   number
  srkadi:   string
  dataYolu: string
  prgTur:   string
  kod:      number | null
}

export interface SiraEslesme {
  dataYolu: string
  eski:     number
  yeni:     number
}

export async function girisSatirlari(pool: ConnectionPool, firmaId: number): Promise<GirisSatiri[]> {
  const r = await pool.request().input("firmaId", firmaId).query<{
    srkkod: number; srkadi: string | null; DataYolu: string | null; PrgTur: string | null; KOD: number | null
  }>("SELECT srkkod, srkadi, DataYolu, PrgTur, KOD FROM guvenlik WHERE PusulaFirmaId = @firmaId ORDER BY srkkod DESC")
  return r.recordset.map((x) => ({
    srkkod:   x.srkkod,
    srkadi:   (x.srkadi ?? "").trim(),
    dataYolu: (x.DataYolu ?? "").trim(),
    prgTur:   (x.PrgTur ?? "").trim(),
    kod:      x.KOD,
  }))
}

/**
 * `hedef`: eski srkkod → yeni srkkod. Yalnız değişen satırlar verilir;
 * yeni numaralar eski numaraların birebir yer değiştirmesi olmalı.
 */
export async function siraUygula(
  pool: ConnectionPool, firmaId: number, hedef: Map<number, number>,
): Promise<void> {
  const eskiler = [...hedef.keys()].sort((a, b) => a - b)
  const yeniler = [...hedef.values()].sort((a, b) => a - b)
  if (!eskiler.length) return
  if (eskiler.some((v, i) => v !== yeniler[i])) {
    throw new Error("Yeni numaralar mevcut numaraların yer değiştirmesi olmalı")
  }

  const kolonR = await pool.request().query<{ name: string }>(
    "SELECT name FROM sys.columns WHERE object_id = OBJECT_ID('dbo.guvenlik') AND is_computed = 0 ORDER BY column_id",
  )
  const kolonlar = kolonR.recordset.map((k) => k.name)
  if (!kolonlar.includes("srkkod") || kolonlar.some((k) => !/^\w+$/.test(k))) {
    throw new Error("guvenlik kolonları beklenen biçimde değil")
  }
  const liste  = kolonlar.map((k) => `[${k}]`).join(", ")
  const secim  = kolonlar.map((k) => (k === "srkkod" ? "m.yeni AS [srkkod]" : `g.[${k}]`)).join(", ")

  const req = pool.request().input("firmaId", firmaId).input("adet", eskiler.length)
  const degerler = [...hedef.entries()].map(([eski, yeni], i) => {
    req.input(`o${i}`, eski).input(`n${i}`, yeni)
    return `(@o${i}, @n${i})`
  }).join(", ")

  await req.query(`
    SET XACT_ABORT ON;
    BEGIN TRAN;
    DECLARE @m TABLE (eski int PRIMARY KEY, yeni int NOT NULL UNIQUE);
    INSERT @m (eski, yeni) VALUES ${degerler};

    IF (SELECT COUNT(*) FROM dbo.guvenlik g WITH (UPDLOCK, HOLDLOCK)
        JOIN @m m ON m.eski = g.srkkod WHERE g.PusulaFirmaId = @firmaId) <> @adet
      THROW 50001, 'Satırlar bu arada değişmiş — listeyi yenileyip tekrar deneyin', 1;

    SELECT ${secim} INTO #g FROM dbo.guvenlik g JOIN @m m ON m.eski = g.srkkod;
    DELETE g FROM dbo.guvenlik g JOIN @m m ON m.eski = g.srkkod;
    SET IDENTITY_INSERT dbo.guvenlik ON;
    INSERT dbo.guvenlik (${liste}) SELECT ${liste} FROM #g;
    SET IDENTITY_INSERT dbo.guvenlik OFF;
    DROP TABLE #g;
    COMMIT;
  `)
}

/** Datanın adından yıl: HOSGOR26 → 2026, MERKEZ2025 → 2025. Yoksa null. */
export function dataYili(ad: string): number | null {
  const m = ad.match(/(\d{4}|\d{2})$/)
  if (!m) return null
  const n = Number(m[1])
  if (m[1].length === 2) return 2000 + n
  return n >= 1990 && n <= 2100 ? n : null
}
