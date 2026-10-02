/**
 * Sunucu ölçüm geçmişi — poller'ın 10 sn'lik örneklerini 5 dakikalık kovalara
 * özetleyip hub.server_metrics'e yazar. Sunucu Raporu sayfası buradan okur.
 *
 * Neden burada: ESXi (vCenter yok) performans geçmişi tutmuyor, agent de
 * yalnız anlık değer veriyor. Bellekteki kova, saat 5 dakikanın katını
 * geçince kapanır ve tek satır olarak yazılır (server_id + ts benzersiz,
 * çift yazımda üzerine yazar). Hub yeniden başlarsa yalnız o anki yarım
 * kova kaybolur.
 *
 * NOT: `import "server-only"` BİLEREK yok — poller custom `server.ts`'ten
 * (Next dışında) yükleniyor, o import orada sunucuyu düşürür.
 */

import { getSupabaseAdmin } from "./supabase/admin"
import type { AgentReport } from "./agent-types"

const KOVA_MS = 5 * 60_000
const SAKLAMA_GUN = 180

interface Kova {
  serverId:   string
  serverName: string
  start:      number
  n:          number
  cpuSum:     number
  cpuMax:     number
  ramSum:     number
  ramMax:     number
  ramTotal:   number
  diskUsed:   number | null
  diskTotal:  number | null
  aktifMax:   number
  toplamMax:  number
}

const kovalar = new Map<string, Kova>()

/** Sistem sürücüsü: Windows'ta C:, Linux'ta "/" ya da ilk disk. */
function sistemDiski(report: AgentReport) {
  const d = report.metrics.disks ?? []
  return d.find((x) => /^c:?\\?$/i.test(x.drive)) ?? d.find((x) => x.drive === "/") ?? d[0] ?? null
}

async function yaz(k: Kova): Promise<void> {
  if (k.n === 0) return
  const { error } = await getSupabaseAdmin().schema("hub").from("server_metrics").upsert({
    server_id:       k.serverId,
    server_name:     k.serverName,
    ts:              new Date(k.start).toISOString(),
    samples:         k.n,
    cpu_avg:         Math.round((k.cpuSum / k.n) * 10) / 10,
    cpu_max:         Math.round(k.cpuMax * 10) / 10,
    ram_used_mb:     Math.round(k.ramSum / k.n),
    ram_max_mb:      Math.round(k.ramMax),
    ram_total_mb:    Math.round(k.ramTotal),
    disk_used_gb:    k.diskUsed,
    disk_total_gb:   k.diskTotal,
    sessions_active: k.aktifMax,
    sessions_total:  k.toplamMax,
  }, { onConflict: "server_id,ts" })
  if (error) console.log(`[Metrik] ${k.serverName} yazılamadı:`, error.message)

  // Eski kayıtları seyrek temizle (~günde birkaç kez)
  if (Math.random() < 0.002) {
    const sinir = new Date(Date.now() - SAKLAMA_GUN * 86_400_000).toISOString()
    await getSupabaseAdmin().schema("hub").from("server_metrics").delete().lt("ts", sinir)
  }
}

/** Her başarılı poll'da çağrılır. Kova kapanınca önceki kovayı yazar (beklemez). */
export function metrikEkle(serverId: string, serverName: string, report: AgentReport): void {
  const simdi = Date.now()
  const start = Math.floor(simdi / KOVA_MS) * KOVA_MS
  let k = kovalar.get(serverId)
  if (k && k.start !== start) {
    void yaz(k).catch((e) => console.log(`[Metrik] ${k!.serverName}:`, e instanceof Error ? e.message : e))
    k = undefined
  }
  if (!k) {
    k = { serverId, serverName, start, n: 0, cpuSum: 0, cpuMax: 0, ramSum: 0, ramMax: 0, ramTotal: 0, diskUsed: null, diskTotal: null, aktifMax: 0, toplamMax: 0 }
    kovalar.set(serverId, k)
  }

  const m = report.metrics
  const cpu = Number(m.cpu) || 0
  // Önbellek hariç gerçek kullanım varsa onu al; yoksa WMI "used"
  const ram = Number(m.ram?.realUsedMB ?? m.ram?.usedMB) || 0
  const disk = sistemDiski(report)
  const oturum = (report.sessions ?? []).filter((s) => !/console|services/i.test(s.sessionType ?? ""))
  const aktif = oturum.filter((s) => /^active$/i.test(s.state ?? "")).length

  k.serverName = serverName
  k.n++
  k.cpuSum += cpu
  k.cpuMax = Math.max(k.cpuMax, cpu)
  k.ramSum += ram
  k.ramMax = Math.max(k.ramMax, ram)
  k.ramTotal = Number(m.ram?.totalMB) || k.ramTotal
  if (disk) { k.diskUsed = Math.round(disk.usedGB * 10) / 10; k.diskTotal = Math.round(disk.totalGB * 10) / 10 }
  k.aktifMax = Math.max(k.aktifMax, aktif)
  k.toplamMax = Math.max(k.toplamMax, oturum.length)
}
