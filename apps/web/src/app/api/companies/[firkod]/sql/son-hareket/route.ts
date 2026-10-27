/**
 * GET /api/companies/[firkod]/sql/son-hareket
 *
 * Firmanın her veritabanında `carhrk` (cari hareket) tablosundaki son kayıt zamanı — Veritabanları sekmesindeki
 * "Son cari hareket" sütunu. Liste beklemesin diye ayrı uç; sekme açılınca bir kez çağrılır.
 *
 * Kaynak kolon: `STarih` (kaydın girildiği tarih + saat). Eski program sürümlerinde bu kolon yok; o zaman
 * `CariTrh` (belge tarihi, saatsiz — ileri/geri tarihli olabilir) kullanılır ve `saatsiz: true` döner.
 * Tablo büyük olabilir (1M satır): NOLOCK + MAX, sonuç firma başına 5 dk önbellekte.
 * Zamanlar metin döner ("YYYY-AA-GG SS:DD") — tedious SQL'in duvar saatini UTC sanıyor (bkz. lib/yedek-testi.ts).
 */

import { NextRequest, NextResponse } from "next/server"
import sql from "mssql"
import { getSupabaseServer } from "@/lib/supabase/server"
import { withSqlConnection } from "@/lib/sql-external"
import { decrypt } from "@/lib/crypto"
import { requirePermission } from "@/lib/require-permission"
import { firmaVeritabanlari } from "@/lib/firma-yedekleri"

export interface SonHareket {
  db:      string
  /** "YYYY-AA-GG SS:DD"; carhrk boşsa null */
  son:     string | null
  /** Kaynak CariTrh (saat bilgisi yok) */
  saatsiz: boolean
}

const onbellek = new Map<string, { at: number; veri: SonHareket[] }>()
const TTL = 5 * 60_000

export async function GET(req: NextRequest, { params }: { params: Promise<{ firkod: string }> }) {
  const gate = await requirePermission("companies", "read")
  if (gate) return gate
  const { firkod } = await params
  if (!/^\d+$/.test(firkod)) return NextResponse.json({ error: "Geçersiz firma kodu" }, { status: 400 })

  const yenile = req.nextUrl.searchParams.get("refresh") === "1"
  const c = onbellek.get(firkod)
  if (!yenile && c && Date.now() - c.at < TTL) return NextResponse.json(c.veri)

  const sb = await getSupabaseServer()
  const { data: company } = await sb.schema("hub").from("companies").select("sql_server_id").eq("company_id", firkod).maybeSingle()
  const sqlServerId = (company as { sql_server_id: string | null } | null)?.sql_server_id
  if (!sqlServerId) return NextResponse.json([])
  const { data: srv } = await sb.schema("hub").from("servers").select("ip, sql_username, sql_password").eq("id", sqlServerId).maybeSingle()
  const s = srv as { ip: string; sql_username: string | null; sql_password: string | null } | null
  if (!s?.sql_username || !s?.sql_password) return NextResponse.json([])

  const adlar = await firmaVeritabanlari(firkod)
  if (adlar.length === 0) return NextResponse.json([])

  try {
    const veri = await withSqlConnection<SonHareket[]>(
      { server: s.ip, port: 1433, user: s.sql_username, password: decrypt(s.sql_password) ?? "", database: "master", requestTimeout: 60_000 },
      async (pool) => {
        const r = await pool.request().input("adlar", sql.NVarChar(sql.MAX), adlar.join("|")).query<{ db: string; son: string | null; kaynak: string }>(`
          SET NOCOUNT ON;
          DECLARE @t TABLE (db sysname, son varchar(16) NULL, kaynak sysname);
          DECLARE @db sysname, @k sysname, @q nvarchar(max);
          DECLARE c CURSOR LOCAL FAST_FORWARD FOR
            SELECT d.name FROM sys.databases d
            JOIN STRING_SPLIT(@adlar, '|') a ON a.value COLLATE DATABASE_DEFAULT = d.name COLLATE DATABASE_DEFAULT
            WHERE d.state_desc = 'ONLINE';
          OPEN c; FETCH NEXT FROM c INTO @db;
          WHILE @@FETCH_STATUS = 0
          BEGIN
            IF OBJECT_ID(QUOTENAME(@db) + N'.dbo.carhrk') IS NOT NULL
            BEGIN
              SET @k = CASE WHEN COL_LENGTH(QUOTENAME(@db) + N'.dbo.carhrk', 'STarih') IS NOT NULL THEN N'STarih' ELSE N'CariTrh' END;
              SET @q = N'SELECT @db, CONVERT(varchar(16), MAX(' + QUOTENAME(@k) + N'), 120), @k FROM ' + QUOTENAME(@db) + N'.dbo.carhrk WITH (NOLOCK);';
              INSERT @t EXEC sp_executesql @q, N'@db sysname, @k sysname', @db = @db, @k = @k;
            END
            FETCH NEXT FROM c INTO @db;
          END
          CLOSE c; DEALLOCATE c;
          SELECT db, son, kaynak FROM @t;`)
        return r.recordset.map((x) => ({ db: x.db, son: x.son, saatsiz: x.kaynak === "CariTrh" }))
      },
    )
    onbellek.set(firkod, { at: Date.now(), veri })
    return NextResponse.json(veri)
  } catch (err) {
    console.log("[son-hareket]", firkod, err instanceof Error ? err.message : err)
    return NextResponse.json({ error: "Son cari hareket okunamadı" }, { status: 502 })
  }
}
