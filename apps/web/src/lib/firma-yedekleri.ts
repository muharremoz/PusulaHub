/**
 * Firma detayı → Yedekler sekmesi: firmanın veritabanlarının SpareBackup yedekleri.
 *
 * İki yer:
 *  - Spare Cloud (FTP/SFTP, 185.130.59.123) — `/root/Backup/1900/Makdos_SQL_Server/<GG-AA-YYYY>/<db>_<FULL|DIFF>_<zaman>.zip`.
 *    Hub bu sunucuya `/tv` disk kartı için zaten SSH ile bağlanıyor (`SFTP_*` env, bkz. lib/backup-storage.ts).
 *  - Cloudflare R2 (`makdos-sqlserver-backup`) — aynı anahtar düzeni, SpareBackup'ın ikinci hedefi (23.10.2026'dan beri).
 *    Hub'da salt-okuma bir token kullanılır: R2_ENDPOINT, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY.
 *
 * Yalnız okur: listeleme ve indirme. Silme/yazma yok.
 *
 * Neden FTP'de `find`: bir gün klasöründe ~20 bin dosya var (373 veritabanı × 15 dk'lık diff); SFTP ile klasör klasör
 * okumak 28 gün için dakikalar sürer. Tek `find -name` komutu yalnız firmanın dosyalarını döndürür.
 * Neden R2'de veritabanı öneki: anahtarlar `<görev>/<gün>/<db>_...` — `Prefix` olarak `<gün>/<db>_` verilince
 * gün başına yalnız o veritabanının ~50 dosyası gelir; gün klasörünün tamamını sayfalamaya gerek kalmaz.
 */

import { Client, type SFTPWrapper } from "ssh2"
import { AwsClient } from "aws4fetch"
import type { Readable } from "node:stream"
import { getSupabaseServer } from "@/lib/supabase/server"
import { withSqlConnection } from "@/lib/sql-external"
import { decrypt } from "@/lib/crypto"
import { SC_GOREV } from "@/lib/spare-cloud"

/** SpareBackup'ın Spare Cloud hesabı (firma 1900 = Makdos) altındaki görev klasörü */
const FTP_KOK = `/root/Backup/1900/${SC_GOREV}`

export type YedekTuru = "full" | "diff"
export type KaynakDurumu = { durum: "ok" | "tanimsiz" | "hata"; mesaj?: string }

export interface YedekDosyasi {
  /** Gün klasörü (GG-AA-YYYY) — yedek turunun başladığı gün */
  gun:    string
  dosya:  string
  db:     string
  tur:    YedekTuru
  /** Dosya adındaki yedek zamanı, "YYYY-AA-GG SS:DD" */
  zaman:  string
  boyut:  number
  ftp:    boolean
  r2:     boolean
}

/* ── Ad doğrulama ──────────────────────────────────────────────────────── */

/** SpareBackup'ın veritabanı adı kuralıyla aynı (validateDbName) — kabuk ve SQL'de güvenli */
const DB_ADI = /^[\p{L}\p{N}_ @#$.-]{1,128}$/u
const GUN = /^\d{2}-\d{2}-\d{4}$/
const DOSYA = /^(.+)_(FULL|DIFF)_(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-\d{2}\.zip$/

export function dosyaAdiCoz(dosya: string): { db: string; tur: YedekTuru; zaman: string } | null {
  const m = DOSYA.exec(dosya)
  if (!m) return null
  return { db: m[1], tur: m[2] === "FULL" ? "full" : "diff", zaman: `${m[3]}-${m[4]}-${m[5]} ${m[6]}:${m[7]}` }
}

export function gunGecerli(gun: string): boolean { return GUN.test(gun) }

/* ── Firmanın veritabanları ────────────────────────────────────────────── */

/** guvenlik (PusulaFirmaId) + hub.sql_databases.firma_no — /api/companies/[firkod]/sql ile aynı kaynak */
export async function firmaVeritabanlari(firkod: string): Promise<string[]> {
  const sb = await getSupabaseServer()
  const adlar = new Map<string, string>()
  const ekle = (ad: string | null | undefined) => {
    const a = (ad ?? "").trim()
    if (a && DB_ADI.test(a) && !adlar.has(a.toLowerCase())) adlar.set(a.toLowerCase(), a)
  }

  const { data: company } = await sb.schema("hub").from("companies").select("sql_server_id").eq("company_id", firkod).maybeSingle()
  const sqlServerId = (company as { sql_server_id: string | null } | null)?.sql_server_id
  if (sqlServerId) {
    const { data: srv } = await sb.schema("hub").from("servers").select("ip, sql_username, sql_password").eq("id", sqlServerId).maybeSingle()
    const s = srv as { ip: string; sql_username: string | null; sql_password: string | null } | null
    if (s?.sql_username && s?.sql_password) {
      try {
        const rows = await withSqlConnection<{ DataYolu: string | null; srkadi: string | null }[]>(
          { server: s.ip, port: 1433, user: s.sql_username, password: decrypt(s.sql_password) ?? "", database: "sirket", requestTimeout: 8000 },
          async (pool) => (await pool.request().input("firmaId", Number.parseInt(firkod, 10))
            .query("SELECT DataYolu, srkadi FROM guvenlik WHERE PusulaFirmaId = @firmaId")).recordset,
        )
        for (const r of rows) ekle(r.DataYolu || r.srkadi)
      } catch (err) {
        console.log("[firma-yedekleri] guvenlik okunamadı:", err instanceof Error ? err.message : err)
      }
    }
  }

  const { data: dbs } = await sb.schema("hub").from("sql_databases").select("name").eq("firma_no", firkod)
  for (const d of (dbs ?? []) as { name: string }[]) ekle(d.name)
  return [...adlar.values()].sort((a, b) => a.localeCompare(b, "tr"))
}

/* ── Spare Cloud (SFTP) ────────────────────────────────────────────────── */

export function ftpTanimli(): boolean {
  return Boolean((process.env.SFTP_HOST_LAN || process.env.SFTP_HOST_WAN) && process.env.SFTP_USER && process.env.SFTP_PASS)
}

const ftpAdresleri = () => [process.env.SFTP_HOST_LAN, process.env.SFTP_HOST_WAN].filter(Boolean) as string[]

/** Önce LAN, olmazsa WAN (lib/backup-storage.ts ile aynı sıra) */
async function ftpBaglan(): Promise<Client> {
  let son: unknown = null
  for (const host of ftpAdresleri()) {
    try {
      return await new Promise<Client>((resolve, reject) => {
        const c = new Client()
        c.on("ready", () => resolve(c)).on("error", reject).connect({
          host, port: Number(process.env.SFTP_PORT ?? 22) || 22,
          username: process.env.SFTP_USER!, password: process.env.SFTP_PASS!, readyTimeout: 15_000,
        })
      })
    } catch (err) { son = err }
  }
  throw son instanceof Error ? son : new Error("Spare Cloud'a bağlanılamadı")
}

const kabuk = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`

/** Firmanın veritabanlarına ait bütün yedek dosyaları: gün klasörü, ad, boyut */
export async function ftpListele(dbler: string[]): Promise<{ gun: string; dosya: string; boyut: number }[]> {
  if (dbler.length === 0) return []
  const adlar = dbler.flatMap((db) => [`-name ${kabuk(`${db}_FULL_*`)}`, `-name ${kabuk(`${db}_DIFF_*`)}`]).join(" -o ")
  const komut = `find ${kabuk(FTP_KOK)} -mindepth 2 -maxdepth 2 -type f \\( ${adlar} \\) -printf '%P\\t%s\\n'`
  const c = await ftpBaglan()
  try {
    const cikti = await new Promise<string>((resolve, reject) => {
      const bekci = setTimeout(() => reject(new Error("Spare Cloud listesi zaman aşımına uğradı")), 60_000)
      c.exec(komut, (err, akis) => {
        if (err) { clearTimeout(bekci); return reject(err) }
        let out = ""
        akis.on("data", (d: Buffer) => { out += d.toString("utf8") })
          .on("close", () => { clearTimeout(bekci); resolve(out) })
        akis.stderr.on("data", () => { /* izin uyarıları önemsiz */ })
      })
    })
    return cikti.split("\n").flatMap((satir) => {
      const [yol, boyut] = satir.split("\t")
      const [gun, dosya] = (yol ?? "").split("/")
      return gun && dosya && GUN.test(gun) ? [{ gun, dosya, boyut: Number(boyut) || 0 }] : []
    })
  } finally { c.end() }
}

/** Tek dosyayı akış olarak açar; akış kapanınca bağlantı da kapanır */
export async function ftpAkis(gun: string, dosya: string): Promise<{ akis: Readable; boyut: number }> {
  const c = await ftpBaglan()
  try {
    const sftp = await new Promise<SFTPWrapper>((res, rej) => c.sftp((e, s) => (e ? rej(e) : res(s))))
    const yol = `${FTP_KOK}/${gun}/${dosya}`
    const boyut = await new Promise<number>((res, rej) => sftp.stat(yol, (e, st) => (e ? rej(e) : res(st.size))))
    const akis = sftp.createReadStream(yol, { highWaterMark: 1024 * 1024 })
    const kapat = () => c.end()
    akis.on("close", kapat).on("error", kapat)
    return { akis, boyut }
  } catch (err) {
    c.end()
    throw err
  }
}

/* ── Cloudflare R2 ─────────────────────────────────────────────────────── */

export function r2Tanimli(): boolean {
  return Boolean(process.env.R2_ENDPOINT && process.env.R2_BUCKET && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY)
}

const r2 = () => ({
  istemci: new AwsClient({ accessKeyId: process.env.R2_ACCESS_KEY_ID!, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!, service: "s3", region: "auto" }),
  taban: `${process.env.R2_ENDPOINT!.replace(/\/+$/, "")}/${process.env.R2_BUCKET!}`,
})

const xmlDegerleri = (xml: string, etiket: string) =>
  [...xml.matchAll(new RegExp(`<${etiket}>([^<]*)</${etiket}>`, "g"))].map((m) => m[1].replace(/&amp;/g, "&"))

/** ListObjectsV2 — sayfalı */
async function r2Liste(prefix: string, delimiter?: string): Promise<{ anahtarlar: { anahtar: string; boyut: number }[]; onekler: string[] }> {
  const { istemci, taban } = r2()
  const anahtarlar: { anahtar: string; boyut: number }[] = []
  const onekler: string[] = []
  let devam: string | undefined
  do {
    const u = new URL(taban)
    u.searchParams.set("list-type", "2")
    u.searchParams.set("prefix", prefix)
    if (delimiter) u.searchParams.set("delimiter", delimiter)
    if (devam) u.searchParams.set("continuation-token", devam)
    const r = await istemci.fetch(u.toString(), { signal: AbortSignal.timeout(20_000) })
    const xml = await r.text()
    if (!r.ok) throw new Error(`R2 ${r.status}: ${xmlDegerleri(xml, "Message")[0] ?? xml.slice(0, 120)}`)
    for (const icerik of xml.split("<Contents>").slice(1)) {
      const anahtar = xmlDegerleri(icerik, "Key")[0]
      if (anahtar) anahtarlar.push({ anahtar, boyut: Number(xmlDegerleri(icerik, "Size")[0]) || 0 })
    }
    for (const o of xml.split("<CommonPrefixes>").slice(1)) { const p = xmlDegerleri(o, "Prefix")[0]; if (p) onekler.push(p) }
    devam = xml.includes("<IsTruncated>true</IsTruncated>") ? xmlDegerleri(xml, "NextContinuationToken")[0] : undefined
  } while (devam)
  return { anahtarlar, onekler }
}

/** Bir gün klasörünün bütün dosyaları: ad → boyut (yedek testi, R2 teslimi — ~20 bin dosya, sayfalı) */
export async function r2GunDosyalari(gun: string): Promise<Map<string, number>> {
  const { anahtarlar } = await r2Liste(`${SC_GOREV}/${gun}/`)
  return new Map(anahtarlar.map((a) => [a.anahtar.split("/").pop() ?? "", a.boyut]))
}

/** Firmanın veritabanlarının R2'deki dosyaları — gün klasörleri × veritabanı öneki, en fazla 8 istek aynı anda */
export async function r2Listele(dbler: string[]): Promise<{ gun: string; dosya: string; boyut: number }[]> {
  if (dbler.length === 0) return []
  const { onekler } = await r2Liste(`${SC_GOREV}/`, "/")
  const gunler = onekler.map((p) => p.split("/")[1]).filter((g) => g && GUN.test(g))
  const isler = gunler.flatMap((gun) => dbler.map((db) => ({ gun, db })))
  const sonuc: { gun: string; dosya: string; boyut: number }[] = []
  let sira = 0
  await Promise.all(Array.from({ length: Math.min(8, isler.length) }, async () => {
    while (sira < isler.length) {
      const { gun, db } = isler[sira++]
      const { anahtarlar } = await r2Liste(`${SC_GOREV}/${gun}/${db}_`)
      for (const a of anahtarlar) {
        const dosya = a.anahtar.split("/").pop() ?? ""
        // Önek başka bir veritabanını da yakalayabilir (651_RG_ → 651_RG_ATL_...): adı tam eşleşenler
        if (dosyaAdiCoz(dosya)?.db === db) sonuc.push({ gun, dosya, boyut: a.boyut })
      }
    }
  }))
  return sonuc
}

/** Tarayıcının doğrudan R2'den indirmesi için 15 dakikalık imzalı adres (çıkış trafiği ücretsiz, Hub'dan geçmez) */
export async function r2ImzaliAdres(gun: string, dosya: string): Promise<string> {
  const { istemci, taban } = r2()
  const u = new URL(`${taban}/${SC_GOREV}/${gun}/${encodeURIComponent(dosya)}`)
  u.searchParams.set("X-Amz-Expires", "900")
  u.searchParams.set("response-content-disposition", `attachment; filename="${dosya}"`)
  const imzali = await istemci.sign(u.toString(), { method: "GET", aws: { signQuery: true } })
  return imzali.url
}

/* ── Birleştirme ───────────────────────────────────────────────────────── */

export function birlestir(ftp: { gun: string; dosya: string; boyut: number }[], r2l: { gun: string; dosya: string; boyut: number }[]): YedekDosyasi[] {
  const m = new Map<string, YedekDosyasi>()
  const ekle = (k: { gun: string; dosya: string; boyut: number }, yer: "ftp" | "r2") => {
    const c = dosyaAdiCoz(k.dosya)
    if (!c) return
    const anahtar = `${k.gun}/${k.dosya}`
    const v = m.get(anahtar) ?? { gun: k.gun, dosya: k.dosya, ...c, boyut: k.boyut, ftp: false, r2: false }
    v[yer] = true
    if (!v.boyut) v.boyut = k.boyut
    m.set(anahtar, v)
  }
  ftp.forEach((k) => ekle(k, "ftp"))
  r2l.forEach((k) => ekle(k, "r2"))
  return [...m.values()].sort((a, b) => b.zaman.localeCompare(a.zaman) || a.db.localeCompare(b.db))
}
