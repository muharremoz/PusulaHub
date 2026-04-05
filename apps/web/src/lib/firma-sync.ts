/* ══════════════════════════════════════════════════════════
   PusulaHub — Firma Cache Sync
   Firma API'yi 5 dakikada bir çeker, FirmaCache tablosuna yazar.
   Uygulama içi tüm firma sorguları bu tablodan yapılır.
══════════════════════════════════════════════════════════ */

import sql from "mssql"

const SYNC_INTERVAL_MS = 5 * 60 * 1000 // 5 dakika

interface FirmaApiItem {
  Firkod:    number
  Firma:     string
  EMail:     string
  Mobile:    string
  UserCount: number
  Lisans:    string
}

interface FirmaApiResponse {
  IsSuccess:    boolean
  Message:      string
  Param:        FirmaApiItem[]
}

let _pool: sql.ConnectionPool | null = null
async function getSyncPool(): Promise<sql.ConnectionPool> {
  if (_pool && _pool.connected) return _pool
  _pool = new sql.ConnectionPool({
    server:   process.env.DB_SERVER ?? "localhost",
    database: process.env.DB_NAME ?? "PusulaHub",
    user:     process.env.DB_USER ?? "SA",
    password: process.env.DB_PASSWORD ?? "",
    port:     parseInt(process.env.DB_PORT ?? "1433"),
    options:  { trustServerCertificate: true, encrypt: false },
    pool:     { max: 3, min: 0, idleTimeoutMillis: 60000 },
  })
  await _pool.connect()
  return _pool
}

async function syncFirmalar(): Promise<void> {
  const baseUrl  = process.env.FIRMA_API_URL      ?? ""
  const username = process.env.FIRMA_API_USERNAME ?? ""
  const password = process.env.FIRMA_API_PASSWORD ?? ""

  if (!baseUrl) return

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 15000)

    const res = await fetch(`${baseUrl}/Server/List`, {
      method: "POST",
      headers: {
        Authorization: "Basic " + Buffer.from(`${username}:${password}`).toString("base64"),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
      signal: controller.signal,
      cache: "no-store",
    })
    clearTimeout(timer)

    if (!res.ok) {
      console.log(`[FirmaSync] API hatası: HTTP ${res.status}`)
      return
    }

    const json: FirmaApiResponse = await res.json()
    if (!json.IsSuccess || !Array.isArray(json.Param)) {
      console.log(`[FirmaSync] API başarısız: ${json.Message}`)
      return
    }

    const pool = await getSyncPool()
    for (const item of json.Param) {
      const firkod    = String(item.Firkod)
      const firma     = item.Firma?.trim() ?? ""
      const email     = item.EMail === "X" ? "" : (item.EMail ?? "")
      const phone     = item.Mobile === "X" ? "" : (item.Mobile ?? "")
      const userCount = item.UserCount ?? 0
      const lisans    = item.Lisans ?? ""

      await pool.request()
        .input("firkod",    sql.NVarChar(20),  firkod)
        .input("firma",     sql.NVarChar(200), firma)
        .input("email",     sql.NVarChar(200), email)
        .input("phone",     sql.NVarChar(100), phone)
        .input("userCount", sql.Int,           userCount)
        .input("lisans",    sql.NVarChar(50),  lisans)
        .query(`
          MERGE Companies AS target
          USING (SELECT @firkod AS CompanyId) AS source ON target.CompanyId = source.CompanyId
          WHEN MATCHED THEN
            UPDATE SET Name=@firma, ContactEmail=@email, ContactPhone=@phone, UserCount=@userCount, ContractEnd=CASE WHEN @lisans='' THEN target.ContractEnd ELSE TRY_CAST(@lisans AS DATE) END
          WHEN NOT MATCHED THEN
            INSERT (Id, CompanyId, Name, Sector, ContactPerson, ContactEmail, ContactPhone, UserCount, UserCapacity, Status, ContractStart, ContractEnd, CreatedAt)
            VALUES (NEWID(), @firkod, @firma, '', '', @email, @phone, @userCount, 0, 'active', GETDATE(), CASE WHEN @lisans='' THEN DATEADD(YEAR,1,GETDATE()) ELSE TRY_CAST(@lisans AS DATE) END, GETDATE());
        `)
    }

    console.log(`[FirmaSync] ${json.Param.length} firma senkronize edildi.`)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    if (!msg.includes("abort")) {
      console.log(`[FirmaSync] Hata: ${msg}`)
    }
  }
}

let _timer: ReturnType<typeof setInterval> | null = null

export function startFirmaSync(): void {
  if (_timer) return
  console.log("[FirmaSync] Başlatıldı — 5 dk aralıkla")
  // İlk sync 10 saniye sonra (uygulama yüklenmesini bekle)
  setTimeout(syncFirmalar, 10000)
  _timer = setInterval(syncFirmalar, SYNC_INTERVAL_MS)
}

export function stopFirmaSync(): void {
  if (_timer) {
    clearInterval(_timer)
    _timer = null
  }
}
