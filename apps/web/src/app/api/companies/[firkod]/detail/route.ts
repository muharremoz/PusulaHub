import { NextResponse } from "next/server"
import { getSupabaseServer } from "@/lib/supabase/server"
import { getAgentById, getAllAgents } from "@/lib/agent-store"
import { requirePermission } from "@/lib/require-permission"
import type { AgentReport } from "@/lib/agent-types"

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

/**
 * Haftalık grafik noktası — firmanın o günkü TOPLAM kullanımı, gerçek
 * birimleriyle. `null` = o gün ölçüm yok (0 ile karıştırılmamalı).
 */
export interface WeeklyUsagePoint {
  day:    string        // "Sal"
  date:   string        // "2026-07-28"
  cpu:    number | null // % — tüm kullanıcıların toplamı
  ramGB:  number | null // GB — tüm kullanıcıların toplamı
  diskGB: number | null // GB — firma klasörünün boyutu
  users:  number | null // o gün oturum açmış kullanıcı sayısı
}

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
  weeklyUsage:  WeeklyUsagePoint[]
  history30d?:  CompanyUsageHistory
  /** Firmaya ELLE atanmış kotalar (default'tan farklı). null = manuel kota yok
   *  → bar paylaşımlı-sunucu oranı/varsayılan kotaya göre gösterilir. Manuel
   *  değer varsa bar o kotaya göre dolar ve "kullanım / kota" gösterilir.
   *  CPU: % limiti · RAM/Disk/DB: GB. */
  manualQuota?: {
    cpuPct: number | null
    ramGB:  number | null
    diskGB: number | null
    dbGB:   number | null
  }
}

export interface CompanyUsageHistory {
  avgCpu:       number        // 30g ortalama CPU %
  /** 30g zirve CPU % — null: o dönemde zirve ölçümü yok (UI "—" gösterir) */
  peakCpu:      number | null
  peakCpuDate:  string | null // Peak CPU tarihi (YYYY-MM-DD)
  avgRamGB:     number        // 30g ortalama RAM (GB)
  peakRamGB:    number | null
  peakRamDate:  string | null
  maxUsers:     number        // 30g içinde görülen max kullanıcı sayısı
  dbStartMB:    number        // 30g öncesi DB boyutu
  dbEndMB:      number        // Bugünkü DB boyutu
  dbGrowthPct:  number        // % büyüme
  dailyPoints:  { date: string; cpu: number; ramMB: number; dbMB: number }[]
}

interface CompanyRow {
  company_id:        string
  windows_server_id: string | null
  sql_server_id:     string | null
  file_server_id:    string | null
  file_storage_mb:   number | null
  db_quota:          number | null
  quota_disk:        number | null
  quota_cpu:         number | null
  quota_ram:         number | null
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ firkod: string }> }
) {
  const gate = await requirePermission("company-detail", "read")
  if (gate) return gate
  const { firkod } = await params
  try {
    const sb = await getSupabaseServer()
    const { data: comp } = await sb.schema("hub").from("companies")
      .select("company_id, windows_server_id, sql_server_id, file_server_id, file_storage_mb, db_quota, quota_disk, quota_cpu, quota_ram")
      .eq("company_id", firkod).maybeSingle()
    if (!comp) return NextResponse.json({ error: "Firma bulunamadı" }, { status: 404 })
    const c = comp as unknown as CompanyRow

    // Firma kullanıcıları "firkod.xxx" ön ekine sahip
    const prefix = `${firkod.toLowerCase()}.`
    const matchesFirma = (uname: string) => {
      const u = (uname ?? "").toLowerCase()
      // Hem "6742.ahmet" hem "DOMAIN\6742.ahmet" formatlarını yakala
      return u.startsWith(prefix) || u.includes(`\\${prefix}`)
    }

    // ── Windows (RDP) sunucusundan CPU / RAM / User ──
    // Firmanın RDP sunucusunu çöz: önce WindowsServerId, raporsuz/boşsa TÜM
    // agent'ları tara ve firma kullanıcılarının (prefix eşleşen) bulunduğu
    // sunucuyu kullan. Böylece WindowsServerId atanmamış firmalarda da CPU/RAM/
    // User metrikleri ve RAM yüzdesinin paydası (sunucu toplam RAM) doğru çıkar.
    let usageCpu     = 0      // % toplam
    let usageRamMB   = 0
    let quotaRamMB   = 0
    let userCount    = 0
    let userCapacity = 0

    let winReport: AgentReport | null = null
    if (c.windows_server_id) {
      const a = getAgentById(c.windows_server_id)
      if (a?.lastReport) winReport = a.lastReport
    }
    if (!winReport) {
      for (const a of getAllAgents()) {
        const r = a.lastReport
        if (!r) continue
        const hit =
          (r.userProcesses ?? []).some((p) => matchesFirma(p.username)) ||
          (r.sessions ?? []).some((s) => matchesFirma(s.username))
        if (hit) { winReport = r; break }
      }
    }
    if (winReport) {
      quotaRamMB   = winReport.metrics?.ram?.totalMB ?? 0
      userCapacity = winReport.sessions?.length ?? 0

      for (const p of winReport.userProcesses ?? []) {
        if (!matchesFirma(p.username)) continue
        usageCpu   += p.cpuPercent ?? 0
        usageRamMB += p.ramMB ?? 0
      }
      userCount = (winReport.sessions ?? []).filter((s) => matchesFirma(s.username)).length
    }

    // ── Firma DB toplamı ──
    const { data: firmaDbs } = await sb.schema("hub").from("sql_databases").select("size_mb").eq("firma_no", firkod)
    const firmaDbMB = ((firmaDbs ?? []) as { size_mb: number }[]).reduce((s, d) => s + (d.size_mb ?? 0), 0)

    // Disk = firma'nın file sunucusundaki D:\Resimler\<firkod> klasörü
    // Kota = Companies.QuotaDisk (varsayılan 25 GB)
    const fileStorageMB = c.file_storage_mb ?? 0
    const quotaDiskGB   = c.quota_disk ?? 25
    const quotaDiskMB   = quotaDiskGB * 1024

    // DB kotası = Companies.DbQuota (varsayılan 1 GB)
    const dbQuotaGB = c.db_quota ?? 1
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

    // Manuel kota: Companies kolonları default'tan farklıysa "elle atanmış" say.
    // Default'lar: DB=1 GB, Disk=25 GB, CPU/RAM=0 (atanmamış). Manuel değer
    // varsa bar o kotaya göre dolar ve "kullanım / kota" gösterilir.
    detail.manualQuota = {
      cpuPct: (c.quota_cpu ?? 0) > 0                          ? c.quota_cpu!  : null,
      ramGB:  (c.quota_ram ?? 0) > 0                          ? c.quota_ram!  : null,
      diskGB: (c.quota_disk != null && c.quota_disk > 0 && c.quota_disk !== 25) ? c.quota_disk : null,
      dbGB:   (c.db_quota   != null && c.db_quota   > 0 && c.db_quota   !== 1)   ? c.db_quota   : null,
    }

    // Haftalık kullanım grafiği — firmanın O GÜNKÜ TOPLAM kullanımı, gerçek
    // birimleriyle (yüzde değil): "salı günü kullanıcılar toplam şu kadar
    // CPU/RAM harcamış, disklerinde şu kadar veri var".
    //
    // Kaynak `user_daily_usage` (kullanıcı × gün): CPU ve RAM kullanıcı bazında
    // tutulduğu için gün bazında TOPLANIR. `company_usage_daily.avg_cpu`
    // kullanılmıyor — o kolon kullanıcıların ORTALAMASI, firmanın toplam yükü
    // değil (3 kullanıcı × %1 → toplam %3 ama kolonda %1 yazıyor).
    // Disk firma klasörünün boyutu, kullanıcı bazlı değil → company_usage_daily.
    try {
      interface UserDayRow { date: string; username: string; avg_cpu: number | null; avg_ram_mb: number | null }
      interface DiskDayRow { date: string; disk_mb: number | null }

      const since = new Date()
      since.setDate(since.getDate() - 6)
      const sinceIso = since.toISOString().slice(0, 10)

      const [{ data: userDaysRaw }, { data: diskDaysRaw }] = await Promise.all([
        sb.schema("hub").from("user_daily_usage")
          .select("date, username, avg_cpu, avg_ram_mb").eq("firma_no", firkod).gte("date", sinceIso),
        sb.schema("hub").from("company_usage_daily")
          .select("date, disk_mb").eq("company_id", firkod).gte("date", sinceIso),
      ])

      // Gün → firma toplamı. Aynı kullanıcı iki sunucuda olabilir; CPU/RAM
      // toplanır ama kullanıcı sayısı benzersiz isimden sayılır.
      const agg = new Map<string, { cpu: number; ramMB: number; users: Set<string> }>()
      for (const r of (userDaysRaw ?? []) as UserDayRow[]) {
        const g = agg.get(r.date) ?? { cpu: 0, ramMB: 0, users: new Set<string>() }
        g.cpu   += r.avg_cpu ?? 0
        g.ramMB += r.avg_ram_mb ?? 0
        g.users.add(r.username)
        agg.set(r.date, g)
      }
      const diskByDate = new Map<string, number>()
      for (const r of (diskDaysRaw ?? []) as DiskDayRow[]) {
        if (r.disk_mb != null) diskByDate.set(r.date, r.disk_mb)
      }

      const trNames = ["Paz", "Pzt", "Sal", "Car", "Per", "Cum", "Cmt"]
      const today = new Date()
      const out: WeeklyUsagePoint[] = []
      for (let i = 6; i >= 0; i--) {
        const d = new Date(today)
        d.setDate(today.getDate() - i)
        const iso = d.toISOString().slice(0, 10)
        const g = agg.get(iso)
        const diskMB = diskByDate.get(iso)
        // Ölçüm yoksa 0 DEĞİL null: 0 "kullanım sıfıra düştü" gibi okunuyor,
        // oysa o gün poller çalışmamış. Grafik null'da çizgiyi kesiyor.
        out.push({
          day:    trNames[d.getDay()],
          date:   iso,
          cpu:    g ? Math.round(g.cpu * 10) / 10 : null,
          ramGB:  g ? Math.round((g.ramMB / 1024) * 100) / 100 : null,
          diskGB: diskMB != null ? Math.round((diskMB / 1024) * 100) / 100 : null,
          users:  g ? g.users.size : null,
        })
      }
      detail.weeklyUsage = out
    } catch { /* tablo yoksa sorun değil */ }

    // 30 günlük geçmiş özeti (CompanyUsageDaily) — satış için
    try {
      interface DailyRow {
        date: string; avg_cpu: number | null; peak_cpu: number | null
        avg_ram_mb: number | null; peak_ram_mb: number | null
        user_count: number | null; db_mb: number | null
      }
      const { data: dailyRaw } = await sb.schema("hub").from("company_usage_daily")
        .select("date, avg_cpu, peak_cpu, avg_ram_mb, peak_ram_mb, user_count, db_mb")
        .eq("company_id", firkod).order("date", { ascending: false }).limit(30)
      const dailyRows = (dailyRaw ?? []) as DailyRow[]
      if (dailyRows.length) {
        const rows = dailyRows.slice().reverse() // eskiden yeniye
        const cpus = rows.map((r) => r.avg_cpu ?? 0)
        const rams = rows.map((r) => r.avg_ram_mb ?? 0)
        // Zirve ölçülmemiş günler (eski hatalı kayıtlar temizlendi) hesaba
        // katılmaz; hiç ölçüm yoksa peak null döner ve UI "—" gösterir.
        const cpuPeaks = rows.filter((r) => r.peak_cpu != null)
        const ramPeaks = rows.filter((r) => r.peak_ram_mb != null)
        const peakCpuRow = cpuPeaks.length
          ? cpuPeaks.reduce((best, r) => ((r.peak_cpu ?? 0) > (best.peak_cpu ?? 0) ? r : best), cpuPeaks[0])
          : null
        const peakRamRow = ramPeaks.length
          ? ramPeaks.reduce((best, r) => ((r.peak_ram_mb ?? 0) > (best.peak_ram_mb ?? 0) ? r : best), ramPeaks[0])
          : null
        const nonZeroDb = rows.filter((r) => (r.db_mb ?? 0) > 0)
        const dbStart = nonZeroDb.length ? (nonZeroDb[0].db_mb ?? 0) : 0
        const dbEnd   = nonZeroDb.length ? (nonZeroDb[nonZeroDb.length - 1].db_mb ?? 0) : 0
        detail.history30d = {
          avgCpu:      Math.round((cpus.reduce((a, v) => a + v, 0) / cpus.length) * 10) / 10,
          peakCpu:     peakCpuRow?.peak_cpu ?? null,
          peakCpuDate: peakCpuRow?.date ?? null,
          avgRamGB:    Math.round((rams.reduce((a, v) => a + v, 0) / rams.length / 1024) * 10) / 10,
          peakRamGB:   peakRamRow ? Math.round(((peakRamRow.peak_ram_mb ?? 0) / 1024) * 10) / 10 : null,
          peakRamDate: peakRamRow?.date ?? null,
          maxUsers:    rows.reduce((m, r) => Math.max(m, r.user_count ?? 0), 0),
          dbStartMB:   dbStart,
          dbEndMB:     dbEnd,
          dbGrowthPct: dbStart > 0 ? Math.round(((dbEnd - dbStart) / dbStart) * 100) : 0,
          dailyPoints: rows.map((r) => ({
            date:  r.date,
            cpu:   r.avg_cpu ?? 0,
            ramMB: r.avg_ram_mb ?? 0,
            dbMB:  r.db_mb ?? 0,
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
