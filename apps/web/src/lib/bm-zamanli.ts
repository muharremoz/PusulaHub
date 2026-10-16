import { getSupabaseAdmin } from "./supabase/admin"
import { decrypt } from "./crypto"
import { esitleBackupMaster, bmOzet } from "./backup-master"

/**
 * SQL Backup Master listesini saatte bir `guvenlik.YedekAl` ile eşitler.
 *
 * ── Neden ─────────────────────────────────────────────────────────────
 * Listeye ekleme / eşitleme Jobs.xml'i yazmak için SBM servisini durdurur.
 * Yedek işi sürerken bunu yapmak işi yarıda keser: 16.10.2026 12:18'de bir
 * veritabanı eklenirken servis yeniden başladı, öğlen turu 5111'de kesildi ve
 * sonraki veritabanları o turda yedeklenmedi. Artık iki yol da iş sürerken
 * (son 10 dk günlük yazılmış) dokunmadan "atlandı" diyor — atlanan ekleme
 * kaybolmasın diye bu iş saatte bir yeniden dener. Fark yoksa Jobs.xml'e ve
 * servise dokunmaz (esitleBackupMaster yalnız fark varsa yazar).
 *
 * Yalnız production'da (server.ts pollerEnabled) ve POLLER_READONLY değilken çalışır.
 */

const ARALIK_MS = 60 * 60 * 1000
let _timer: ReturnType<typeof setInterval> | null = null
let _calisiyor = false

async function turAt(): Promise<void> {
  if (_calisiyor) return
  _calisiyor = true
  try {
    const hub = getSupabaseAdmin().schema("hub")
    const { data: rol } = await hub.from("server_roles").select("server_id").eq("role", "SQL")
    for (const { server_id } of (rol ?? []) as { server_id: string }[]) {
      const { data: s } = await hub.from("servers")
        .select("name, ip, sql_username, sql_password, agent_port, api_key").eq("id", server_id).maybeSingle()
      const srv = s as { name: string; ip: string; sql_username: string | null; sql_password: string | null; agent_port: number | null; api_key: string | null } | null
      const sifre = srv?.sql_password ? decrypt(srv.sql_password) : null
      const anahtar = srv?.api_key ? decrypt(srv.api_key) : null
      if (!srv || !srv.sql_username || !sifre || !srv.agent_port || !anahtar) continue
      try {
        const sonuc = await esitleBackupMaster({ ip: srv.ip, username: srv.sql_username, password: sifre, agentPort: srv.agent_port, apiKey: anahtar })
        // Yalnız değişiklik ya da atlama günlüğe — her saat "güncel" yazmasın
        if (sonuc.degisti || sonuc.atlandi) console.log(`[BmEsitle] ${srv.name}: ${bmOzet(sonuc)}`)
      } catch (err) {
        console.log(`[BmEsitle] ${srv.name} hatası:`, err instanceof Error ? err.message : err)
      }
    }
  } catch (err) {
    console.log("[BmEsitle] tur hatası:", err instanceof Error ? err.message : err)
  } finally {
    _calisiyor = false
  }
}

export function startBmEsitleme(): void {
  if (_timer) return
  if (process.env.POLLER_READONLY === "1") {
    console.log("[BmEsitle] POLLER_READONLY=1 — atlandi (Jobs.xml'e yazilmaz)")
    return
  }
  console.log("[BmEsitle] Başlatıldı — 60 dk aralıkla")
  setTimeout(() => { turAt().catch(() => {}) }, 5 * 60 * 1000)   // açılıştan 5 dk sonra ilk tur
  _timer = setInterval(() => { turAt().catch(() => {}) }, ARALIK_MS)
}
