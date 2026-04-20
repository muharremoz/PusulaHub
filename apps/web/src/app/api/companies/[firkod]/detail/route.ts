import { NextResponse } from "next/server"
import { query } from "@/lib/db"
import { getAgentById } from "@/lib/agent-store"

/**
 * Firma yoğunluk hesaplaması — paylaşımlı sunucu modeli.
 * Firma'nın kendi kullanıcılarının/DB'lerinin sunucu toplamına oranı alınır.
 *
 *   CPU %  = SUM(firmaKullanıcı.cpuPercent)                        → 0-100
 *   RAM %  = SUM(firmaKullanıcı.ramMB) / sunucu.totalRamMB × 100
 *   Disk % = SUM(firmaDB.sizeMB) / sunucuDiskTotalMB × 100
 *   User % = firmaAktifOturum / sunucuToplamOturum × 100
 *   DB %   = SUM(firmaDB.sizeMB) / SUM(sunucuTümDB.sizeMB) × 100
 *
 * Yoğunluk skoru = bu 5 yüzdenin ortalaması (client tarafı zaten ortalıyor).
 *
 * Kota alanları skorun paydası olarak hizmet eder — kullanıcıya "kullanım/kota" ikilisi gösterilir.
 */

export interface CompanyDetail {
  usageCpu:     number  // Firmanın kullandığı CPU yüzdesi (0-100)
  quotaCpu:     number  // 100 — CPU zaten oran
  usageRam:     number  // GB (gösterim için)
  quotaRam:     number  // GB — sunucu toplam RAM (gösterim için)
  usageRamMB:   number  // MB — hassas yüzde hesabı için
  quotaRamMB:   number  // MB
  usageDisk:    number  // GB — firma DB boyutu
  quotaDisk:    number  // GB — sunucu disk toplam
  usageDiskMB:  number
  quotaDiskMB:  number
  userCount:    number  // Firmanın aktif oturum sayısı
  userCapacity: number  // Sunucudaki toplam oturum
  dbSizeMB:     number
  dbQuota:      number  // GB — sunucudaki tüm DB'lerin toplam boyutu
  dbTotalMB:    number  // MB — sunucudaki tüm DB'lerin toplam boyutu (hassas)
  weeklyUsage:  { day: string; cpu: number; ram: number; disk: number }[]
  history30d?:  CompanyUsageHistory
}

export interface CompanyUsageHistory {
  avgCpu:       number        // 30g ortalama CPU %
  peakCpu:      number        // 30g peak CPU %
  peakCpuDate:  string | null // Peak CPU tarihi (YYYY-MM-DD)
  avgRamGB:     number        // 30g ortalama RAM (GB)
  peakRamGB:    number
  peakRamDate:  string | null
  maxUsers:     number        // 30g içinde görülen max kullanıcı sayısı
  dbStartMB:    number        // 30g öncesi DB boyutu
  dbEndMB:      number        // Bugünkü DB boyutu
  dbGrowthPct:  number        // % büyüme
  dailyPoints:  { date: string; cpu: number; ramMB: number; dbMB: number }[]
}

interface CompanyRow {
  CompanyId:       string
  WindowsServerId: string | null
  SqlServerId:     string | null
  FileServerId:    string | null
  FileStorageMB:   number | null
  DbQuota:         number | null
  QuotaDisk:       number | null
}

interface DbSumRow {
  FirmaDbMB:  number
  ServerDbMB: number
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ firkod: string }> }
) {
  const { firkod } = await params
  try {
    const compRows = await query<CompanyRow[]>`
      SELECT CompanyId, WindowsServerId, SqlServerId,
             FileServerId, FileStorageMB, DbQuota, QuotaDisk
      FROM Companies WHERE CompanyId = ${firkod}
    `
    if (!compRows.length) {
      return NextResponse.json({ error: "Firma bulunamadı" }, { status: 404 })
    }
    const c = compRows[0]

    // Firma kullanıcıları "firkod.xxx" ön ekine sahip
    const prefix = `${firkod.toLowerCase()}.`
    const matchesFirma = (uname: string) => {
      const u = (uname ?? "").toLowerCase()
      // Hem "6742.ahmet" hem "DOMAIN\6742.ahmet" formatlarını yakala
      return u.startsWith(prefix) || u.includes(`\\${prefix}`)
    }

    // ── Windows (RDP) sunucusundan CPU / RAM / User ──
    let usageCpu     = 0      // % toplam
    let usageRamMB   = 0
    let quotaRamMB   = 0
    let userCount    = 0
    let userCapacity = 0
    if (c.WindowsServerId) {
      const winAgent = getAgentById(c.WindowsServerId)
      const r = winAgent?.lastReport
      if (r) {
        quotaRamMB   = r.metrics?.ram?.totalMB ?? 0
        userCapacity = r.sessions?.length ?? 0

        const procs = r.userProcesses ?? []
        for (const p of procs) {
          if (!matchesFirma(p.username)) continue
          usageCpu   += p.cpuPercent ?? 0
          usageRamMB += p.ramMB ?? 0
        }
        userCount = (r.sessions ?? []).filter((s) => matchesFirma(s.username)).length
      }
    }

    // ── Firma DB toplamı ──
    const dbSumRows = await query<DbSumRow[]>`
      SELECT
        ISNULL((SELECT SUM(SizeMB) FROM SQLDatabases WHERE FirmaNo = ${firkod}), 0) AS FirmaDbMB,
        0 AS ServerDbMB
    `
    const firmaDbMB  = dbSumRows[0]?.FirmaDbMB  ?? 0

    // Disk = firma'nın file sunucusundaki D:\Resimler\<firkod> klasörü
    // Kota = Companies.QuotaDisk (varsayılan 25 GB)
    const fileStorageMB = c.FileStorageMB ?? 0
    const quotaDiskGB   = c.QuotaDisk ?? 25
    const quotaDiskMB   = quotaDiskGB * 1024

    // DB kotası = Companies.DbQuota (varsayılan 1 GB)
    const dbQuotaGB = c.DbQuota ?? 1
    const dbQuotaMB = dbQuotaGB * 1024

    const detail: CompanyDetail = {
      usageCpu:     Math.min(100, Math.round(usageCpu)),
      quotaCpu:     100,
      usageRam:     Math.round((usageRamMB / 1024) * 10) / 10,
      quotaRam:     Math.max(1, Math.round(quotaRamMB / 1024)),
      usageRamMB,
      quotaRamMB,
      usageDisk:    Math.round((fileStorageMB / 1024) * 10) / 10,
      quotaDisk:    quotaDiskGB,
      usageDiskMB:  fileStorageMB,
      quotaDiskMB:  Math.max(1, quotaDiskMB),
      userCount,
      userCapacity: Math.max(userCount, userCapacity),
      dbSizeMB:     firmaDbMB,
      dbQuota:      dbQuotaGB,
      dbTotalMB:    Math.max(1, dbQuotaMB),  // "payda" artık kota (1 GB)
      weeklyUsage:  [],
    }

    // Haftalık kullanım grafiği — CompanyUsageDaily'den son 7 gün, yüzde bazlı.
    // RAM/Disk mutlak değerleri firma kotasına oranlanıp 0-100 arası yüzde döner.
    try {
      interface WeekDailyRow {
        Date: string
        AvgCpu: number | null
        AvgRamMB: number | null
        DiskMB: number | null
      }
      const weekDaily = await query<WeekDailyRow[]>`
        SELECT TOP 7
          CONVERT(NVARCHAR(10), Date, 23) AS Date,
          AvgCpu, AvgRamMB, DiskMB
        FROM CompanyUsageDaily
        WHERE CompanyId = ${firkod}
        ORDER BY Date DESC
      `
      // Son 7 gün aralığını (bugün-6 → bugün) Map'e koy
      const ramQuota  = Math.max(1, quotaRamMB)
      const diskQuota = Math.max(1, quotaDiskMB)
      const pct = (u: number, q: number): number => {
        if (!q || q <= 0 || u <= 0) return 0
        const p = (u / q) * 100
        if (p > 0 && p < 1) return 1
        return Math.min(100, Math.round(p))
      }
      const dayMap = new Map<string, WeekDailyRow>()
      for (const r of weekDaily) dayMap.set(r.Date, r)

      // Disk fallback: geçmiş günlerde DiskMB henüz yazılmamış olabilir
      // (kolon sonradan eklendi). Null ise son bilinen değere (bugünkü
      // FileStorageMB) düş — disk günden güne dramatik değişmez.
      const fallbackDiskMB = fileStorageMB

      const trNames = ["Paz", "Pzt", "Sal", "Car", "Per", "Cum", "Cmt"]
      const today = new Date()
      const out: { day: string; cpu: number; ram: number; disk: number }[] = []
      for (let i = 6; i >= 0; i--) {
        const d = new Date(today)
        d.setDate(today.getDate() - i)
        const iso = d.toISOString().slice(0, 10)
        const row = dayMap.get(iso)
        const diskMB = row?.DiskMB ?? fallbackDiskMB
        out.push({
          day:  trNames[d.getDay()],
          cpu:  row?.AvgCpu != null ? Math.min(100, Math.round(row.AvgCpu)) : 0,
          ram:  row?.AvgRamMB != null ? pct(row.AvgRamMB, ramQuota) : 0,
          disk: pct(diskMB, diskQuota),
        })
      }
      detail.weeklyUsage = out
    } catch { /* tablo yoksa sorun değil */ }

    // 30 günlük geçmiş özeti (CompanyUsageDaily) — satış için
    try {
      interface DailyRow {
        Date: string; AvgCpu: number | null; PeakCpu: number | null
        AvgRamMB: number | null; PeakRamMB: number | null
        UserCount: number | null; DbMB: number | null
      }
      const dailyRows = await query<DailyRow[]>`
        SELECT TOP 30
          CONVERT(NVARCHAR(10), Date, 23) AS Date,
          AvgCpu, PeakCpu, AvgRamMB, PeakRamMB, UserCount, DbMB
        FROM CompanyUsageDaily
        WHERE CompanyId = ${firkod}
        ORDER BY Date DESC
      `
      if (dailyRows.length) {
        const rows = dailyRows.slice().reverse() // eskiden yeniye
        const cpus = rows.map((r) => r.AvgCpu ?? 0)
        const rams = rows.map((r) => r.AvgRamMB ?? 0)
        const peakCpuRow = rows.reduce((best, r) => ((r.PeakCpu ?? 0) > (best.PeakCpu ?? 0) ? r : best), rows[0])
        const peakRamRow = rows.reduce((best, r) => ((r.PeakRamMB ?? 0) > (best.PeakRamMB ?? 0) ? r : best), rows[0])
        const dbStart = rows[0].DbMB ?? 0
        const dbEnd   = rows[rows.length - 1].DbMB ?? 0
        detail.history30d = {
          avgCpu:      Math.round((cpus.reduce((a, v) => a + v, 0) / cpus.length) * 10) / 10,
          peakCpu:     peakCpuRow.PeakCpu ?? 0,
          peakCpuDate: peakCpuRow.Date,
          avgRamGB:    Math.round((rams.reduce((a, v) => a + v, 0) / rams.length / 1024) * 10) / 10,
          peakRamGB:   Math.round(((peakRamRow.PeakRamMB ?? 0) / 1024) * 10) / 10,
          peakRamDate: peakRamRow.Date,
          maxUsers:    rows.reduce((m, r) => Math.max(m, r.UserCount ?? 0), 0),
          dbStartMB:   dbStart,
          dbEndMB:     dbEnd,
          dbGrowthPct: dbStart > 0 ? Math.round(((dbEnd - dbStart) / dbStart) * 100) : 0,
          dailyPoints: rows.map((r) => ({
            date:  r.Date,
            cpu:   r.AvgCpu ?? 0,
            ramMB: r.AvgRamMB ?? 0,
            dbMB:  r.DbMB ?? 0,
          })),
        }
      }
    } catch { /* tablo yoksa sorun değil */ }

    return NextResponse.json(detail)
  } catch (err) {
    console.error("[GET /api/companies/[firkod]/detail]", err)
    return NextResponse.json({ error: "Firma detayı alınamadı" }, { status: 500 })
  }
}
