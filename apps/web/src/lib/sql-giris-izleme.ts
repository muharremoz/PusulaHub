/**
 * SQL hatalı giriş izleme (29.10.2026) — CRM mobil Sunucular → Güvenlik sekmesi.
 *
 * Dakikada bir SQL hata günlüğündeki "Login failed" satırları okunur, 5 dk'lık
 * kovalara toplanıp hub.sql_giris_hatalari'na yazılır, kurallara uyan durumda
 * CRM üzerinden `sunucu_izleme` yetkililerine push gider.
 *
 * Neden bu tasarım:
 *  - Dışarıdan 1433'e yalnız FortiGate'te izinli IP'ler geliyor; asıl risk
 *    içeride (terminaller, VPN). SQL'in gördüğü IP terminalin IP'si → IP
 *    engellemek o terminaldeki herkesi keser. Bu yüzden ENGELLEME YOK, yalnız uyarı.
 *  - Günlük ~1,5 gün geriye gidiyor (15 dk'lık diferansiyel yedek satırları
 *    dolduruyor) — geçmiş yalnız tabloda kalır, okuma her dakika olmalı.
 *  - "Veritabanı açılamadı" saldırı değil (kimlik doğrulama başarılı), ama
 *    müşteri tarafında yanlış ayarlı program demek → "destek" uyarısı, günde bir.
 *
 * İmleç (son okunan satırın zamanı) hub.sql_giris_bildirim'de `__imlec`
 * anahtarıyla durur — Hub yeniden başlayınca kaldığı yerden devam eder, aynı
 * satır iki kez sayılmaz. İlk açılışta son 48 saat içe alınır (uyarısız).
 *
 * NOT: `import "server-only"` BİLEREK yok — custom server.ts'ten yükleniyor.
 */

import sql from "mssql"
import { getSupabaseAdmin } from "./supabase/admin"
import { decrypt } from "./crypto"
import { withSqlConnection } from "./sql-external"

const ARALIK_MS = 60_000
const KOVA_MS = 5 * 60_000
const SAKLAMA_GUN = 90
const ILK_ICE_ALMA_SAAT = 48
const PENCERE_MS = 10 * 60_000
/** Bundan eski olaylar için uyarı üretilmez (ilk içe alma, uzun kesinti sonrası) */
const TAZE_MS = 15 * 60_000
const IMLEC = "__imlec"
/** SQL açıldıktan sonra bu süre "veritabanı açılamıyor" uyarısı yok (aşağıda D1) */
const ACILIS_MS = 15 * 60_000
const OFIS_IP = "95.3.34.130"

export type Neden = "parola_yanlis" | "kullanici_yok" | "veritabani_acilamadi" | "giris_kapali" | "parola_suresi" | "diger"
export type Seviye = "guvenlik" | "destek" | "bilgi"

export interface GirisOlayi {
  t: number
  ip: string
  kullanici: string
  neden: Neden
  veritabani: string
}

/**
 * Sayılmayan denemeler (30.10.2026). Pars uygulaması (PUSULA GOREV) kendi
 * RDP koruma modülü için `BruteForceAttackMonitor`'a bağlanmayı dener;
 * müşteride kurulu kopyası müşterinin SQL bilgileriyle 30 sn'de bir
 * dener ve yetkisi olmadığı için "veritabanı açılamadı" alır. Normal bir
 * davranış — sayımı ve uyarıları şişirmesin diye hiç kaydedilmez.
 */
export function yoksayilir(x: { neden: string; veritabani: string | null }): boolean {
  return x.neden === "veritabani_acilamadi" && (x.veritabani ?? "").replace(/^\[|\]$/g, "") === "BruteForceAttackMonitor"
}

/** "Login failed for user 'x'. Reason: …. [CLIENT: ip]" → olay */
export function satirCoz(utc: string, metin: string): GirisOlayi | null {
  const kullanici = metin.match(/user '([^']*)'/)?.[1]
  if (kullanici == null) return null
  const neden: Neden =
    /Password did not match/i.test(metin) ? "parola_yanlis" :
    /Could not find a login/i.test(metin) ? "kullanici_yok" :
    /explicitly specified database/i.test(metin) ? "veritabani_acilamadi" :
    /disabled/i.test(metin) ? "giris_kapali" :
    /expired|must be changed/i.test(metin) ? "parola_suresi" : "diger"
  const olay: GirisOlayi = {
    t: Date.parse(utc.endsWith("Z") ? utc : utc + "Z"),
    ip: metin.match(/CLIENT: ([^\]]+)\]/)?.[1]?.trim() ?? "?",
    kullanici,
    neden,
    veritabani: neden === "veritabani_acilamadi" ? (metin.match(/database '([^']*)'/)?.[1] ?? "") : "",
  }
  return yoksayilir(olay) ? null : olay
}

export type KaynakTuru = "sunucu" | "ofis" | "dahili" | "dis"

export function kaynakTuru(ip: string, sunucular: Map<string, string>): KaynakTuru {
  if (sunucular.has(ip)) return "sunucu"
  if (ip === OFIS_IP) return "ofis"
  if (/^10\.|^172\.(1[6-9]|2\d|3[01])\.|^192\.168\.|^127\.|^<local/.test(ip)) return "dahili"
  return "dis"
}

export function kaynakAdi(ip: string, sunucular: Map<string, string>): string {
  const ad = sunucular.get(ip)
  if (ad) return `${ad} (${ip})`
  if (ip === OFIS_IP) return `Ofis (${ip})`
  return kaynakTuru(ip, sunucular) === "dis" ? `Dış adres ${ip}` : `VPN/LAN ${ip}`
}

const parolaTuru = (n: Neden) => n === "parola_yanlis" || n === "kullanici_yok"

/** Özet satırının seviyesi — mobil listede renk/sıra için. */
export function seviyeBul(
  x: { ip: string; kullanici: string; neden: Neden; adet: number },
  sunucular: Map<string, string>,
): Seviye {
  const dis = kaynakTuru(x.ip, sunucular) === "dis"
  if (x.kullanici.toLowerCase() === "sa" && x.neden === "parola_yanlis") return "guvenlik"
  if (dis && x.neden !== "veritabani_acilamadi") return "guvenlik"
  if (x.neden === "kullanici_yok" && x.adet >= 3) return "guvenlik"
  if (parolaTuru(x.neden) && x.adet >= 20) return "guvenlik"
  if (x.neden === "veritabani_acilamadi" || x.neden === "giris_kapali" || x.neden === "parola_suresi") return "destek"
  if (x.neden === "parola_yanlis" && x.adet >= 5) return "destek"
  return "bilgi"
}

// ── Uyarı kuralları ──────────────────────────────────────────────────────────

export interface Uyari {
  anahtar: string
  seviye: "guvenlik" | "destek"
  /** Aynı anahtar için en az bu kadar süre sonra tekrar */
  bekleMs: number
  baslik: string
  govde: string
  sms: boolean
  /** Uyarının ilgilendiği kullanıcılar — kullanıcı bazlı susturma için */
  kullanicilar: string[]
}

const SAAT = 3600_000
const saatYaz = (t: number) =>
  new Date(t).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul" })

/**
 * Son PENCERE_MS içindeki olaylardan uyarılar. `simdi`den TAZE_MS'den eski
 * olaylar hesaba katılmaz (ilk içe almada geçmiş için push yağmasın).
 */
export function uyarilariBul(olaylar: GirisOlayi[], sunucular: Map<string, string>, simdi: number, sqlAcilis?: number): Uyari[] {
  const taze = olaylar.filter((o) => simdi - o.t <= Math.min(PENCERE_MS, TAZE_MS))
  const out: Uyari[] = []
  const grupla = <K>(f: (o: GirisOlayi) => K | null) => {
    const m = new Map<K, GirisOlayi[]>()
    for (const o of taze) {
      const k = f(o)
      if (k == null) continue
      const l = m.get(k)
      if (l) l.push(o)
      else m.set(k, [o])
    }
    return m
  }

  // G1 — sa için yanlış parola (her kaynaktan)
  for (const [ip, l] of grupla((o) => (o.kullanici.toLowerCase() === "sa" && o.neden === "parola_yanlis" ? o.ip : null))) {
    out.push({
      anahtar: `G|sa|${ip}`, seviye: "guvenlik", bekleMs: SAAT, sms: false, kullanicilar: ["sa"],
      baslik: "🔴 SQL: sa için yanlış parola",
      govde: `${kaynakAdi(ip, sunucular)} · ${l.length} deneme · ${saatYaz(l.at(-1)!.t)}`,
    })
  }

  // G2/G3 — tek kaynaktan tarama (çok kullanıcı adı) ya da yoğun deneme
  for (const [ip, l] of grupla((o) => (parolaTuru(o.neden) ? o.ip : null))) {
    const adlar = new Set(l.map((o) => o.kullanici))
    if (adlar.size >= 3) {
      out.push({
        anahtar: `G|tarama|${ip}`, seviye: "guvenlik", bekleMs: SAAT, sms: true, kullanicilar: [...adlar],
        baslik: "🔴 SQL: kullanıcı adı taraması",
        govde: `${kaynakAdi(ip, sunucular)} 10 dk'da ${adlar.size} farklı kullanıcı adı denedi (${[...adlar].slice(0, 4).join(", ")})`,
      })
    } else if (l.length >= 20) {
      out.push({
        anahtar: `G|yogun|${ip}`, seviye: "guvenlik", bekleMs: SAAT, sms: true, kullanicilar: [...adlar],
        baslik: "🔴 SQL: yoğun parola denemesi",
        govde: `${kaynakAdi(ip, sunucular)} 10 dk'da ${l.length} hatalı giriş · ${[...adlar].join(", ")}`,
      })
    }
  }

  // G4 — dış adresten (FortiGate'te izinli IP'lerden biri) hatalı giriş
  for (const [k, l] of grupla((o) =>
    kaynakTuru(o.ip, sunucular) === "dis" && o.neden !== "veritabani_acilamadi" ? `${o.ip}|${o.kullanici}` : null,
  )) {
    const [ip, kul] = k.split("|")
    out.push({
      anahtar: `G|dis|${k}`, seviye: "guvenlik", bekleMs: SAAT, sms: false, kullanicilar: [kul],
      baslik: "🔴 SQL: dış adresten hatalı giriş",
      govde: `${ip} · ${kul} · ${NEDEN_AD[l[0].neden]} · ${l.length} deneme`,
    })
  }

  // D1 — veritabanı açılamıyor (müşteri programı yanlış ayarlı). Anahtar kaynaksız:
  // aynı müşteri birden çok PC'den (Altınsaray .118/.119) gelince tek uyarı.
  // SQL açılışından sonraki ACILIS_MS sayılmaz: 03:00 gece restartında servis
  // bağlantı kabul ettiği anda veritabanları henüz açılmamış oluyor, ilk gelen
  // program reddediliyor (31.10.2026: sirket/PUS2026X, DB'ler 1 sn sonra açıldı).
  const acilista = (o: GirisOlayi) => sqlAcilis != null && o.t >= sqlAcilis && o.t - sqlAcilis < ACILIS_MS
  for (const [k, l] of grupla((o) => (o.neden === "veritabani_acilamadi" && !acilista(o) ? `${o.kullanici}|${o.veritabani}` : null))) {
    const [kul, db] = k.split("|")
    const ip = l.at(-1)!.ip
    out.push({
      anahtar: `D|db|${k}`, seviye: "destek", bekleMs: 24 * SAAT, sms: false, kullanicilar: [kul],
      baslik: "🟡 SQL: veritabanı açılamıyor",
      govde: `${kul} → ${db || "?"} · ${kaynakAdi(ip, sunucular)} — programın veritabanı ayarı kontrol edilmeli`,
    })
  }

  // D2 — firma girişine tekrarlayan yanlış parola
  for (const [k, l] of grupla((o) => (o.neden === "parola_yanlis" && o.kullanici.toLowerCase() !== "sa" ? `${o.ip}|${o.kullanici}` : null))) {
    if (l.length < 5) continue
    const [ip, kul] = k.split("|")
    out.push({
      anahtar: `D|parola|${k}`, seviye: "destek", bekleMs: 24 * SAAT, sms: false, kullanicilar: [kul],
      baslik: "🟡 SQL: tekrarlayan yanlış parola",
      govde: `${kul} · ${kaynakAdi(ip, sunucular)} · 10 dk'da ${l.length} deneme — parola değişmiş ya da program ayarı bozuk olabilir`,
    })
  }

  // D3 — giriş kapalı / parola süresi dolmuş
  for (const [k, l] of grupla((o) => (o.neden === "giris_kapali" || o.neden === "parola_suresi" ? `${o.ip}|${o.kullanici}|${o.neden}` : null))) {
    const [ip, kul] = k.split("|")
    out.push({
      anahtar: `D|hesap|${k}`, seviye: "destek", bekleMs: 24 * SAAT, sms: false, kullanicilar: [kul],
      baslik: `🟡 SQL: ${NEDEN_AD[l[0].neden]}`,
      govde: `${kul} · ${kaynakAdi(ip, sunucular)} · ${l.length} deneme`,
    })
  }

  return out
}

export const NEDEN_AD: Record<Neden, string> = {
  parola_yanlis: "parola yanlış",
  kullanici_yok: "kullanıcı yok",
  veritabani_acilamadi: "veritabanı açılamadı",
  giris_kapali: "giriş kapalı",
  parola_suresi: "parola süresi dolmuş",
  diger: "diğer",
}

// ── Toplayıcı ────────────────────────────────────────────────────────────────

/* xp_readerrorlog başlangıç parametresi saniye hassasiyetli metin ister
 * (121 biçimindeki 7 hane kesir sessizce 0 satır döndürür). Zamanlar SQL'in
 * yerel saatinde; UTC'ye/UTC'den GETDATE-GETUTCDATE farkıyla çevrilir.
 * Döngüdeki arşivler: 0 (güncel) + son yazımı imleçten yeni olanlar — iki
 * okuma arasında günlük döndürülürse kaçan satırlar #1'den alınır. */
const OKUMA_SQL = `
DECLARE @fark int = DATEDIFF(minute, GETUTCDATE(), GETDATE());
DECLARE @basYerel datetime2 = DATEADD(minute, @fark, CONVERT(datetime2, @bas));
DECLARE @basMetin nvarchar(30) = CONVERT(nvarchar(30), @basYerel, 120);
DECLARE @loglar TABLE (Arsiv int, Tarih datetime, Boyut bigint);
INSERT @loglar EXEC master.dbo.sp_enumerrorlogs;
DECLARE @t TABLE (LogDate datetime, ProcessInfo nvarchar(64), Text nvarchar(max));
DECLARE @a int;
DECLARE c CURSOR LOCAL FAST_FORWARD FOR SELECT Arsiv FROM @loglar WHERE Arsiv = 0 OR Tarih >= @basYerel;
OPEN c; FETCH NEXT FROM c INTO @a;
WHILE @@FETCH_STATUS = 0 BEGIN
  INSERT @t EXEC master.dbo.xp_readerrorlog @a, 1, N'Login failed', NULL, @basMetin, NULL;
  FETCH NEXT FROM c INTO @a;
END
CLOSE c; DEALLOCATE c;
SELECT CONVERT(varchar(23), DATEADD(minute, -@fark, LogDate), 126) AS utc, Text AS metin FROM @t ORDER BY LogDate;
SELECT CONVERT(varchar(23), DATEADD(minute, -@fark, sqlserver_start_time), 126) AS acilis FROM sys.dm_os_sys_info;`

interface SqlHedef { ip: string; username: string; password: string }

let hedefOnbellek: { at: number; hedef: SqlHedef | null; sunucular: Map<string, string> } | null = null

async function hedefVeSunucular() {
  if (hedefOnbellek && Date.now() - hedefOnbellek.at < 10 * 60_000) return hedefOnbellek
  const sb = getSupabaseAdmin().schema("hub")
  const [{ data: rol }, { data: srv }] = await Promise.all([
    sb.from("server_roles").select("server_id").eq("role", "SQL").limit(1).maybeSingle(),
    sb.from("servers").select("id, name, ip, sql_username, sql_password"),
  ])
  const liste = (srv ?? []) as { id: string; name: string; ip: string; sql_username: string | null; sql_password: string | null }[]
  const s = liste.find((x) => x.id === (rol as { server_id: string } | null)?.server_id)
  const sifre = decrypt(s?.sql_password)
  hedefOnbellek = {
    at: Date.now(),
    hedef: s && s.sql_username && sifre ? { ip: s.ip, username: s.sql_username, password: sifre } : null,
    sunucular: new Map(liste.filter((x) => x.ip).map((x) => [x.ip, x.name])),
  }
  return hedefOnbellek
}

export async function sunucuAdlari(): Promise<Map<string, string>> {
  return (await hedefVeSunucular()).sunucular
}

let imlec: number | null = null
/** Son PENCERE_MS'lik olaylar — kural penceresi */
let pencere: GirisOlayi[] = []
let sonTemizlik = 0
let calisiyor = false

async function imlecOku(): Promise<number> {
  const sb = getSupabaseAdmin().schema("hub")
  const { data } = await sb.from("sql_giris_bildirim").select("son_bildirim").eq("anahtar", IMLEC).maybeSingle()
  const t = (data as { son_bildirim: string } | null)?.son_bildirim
  return t ? Date.parse(t) : Date.now() - ILK_ICE_ALMA_SAAT * SAAT
}

async function bildir(u: Uyari): Promise<void> {
  const kok = (process.env.CRM_URL ?? "https://crm.pusulanet.net").replace(/\/+$/, "")
  const anahtar = process.env.INTERNAL_APP_KEY
  if (!anahtar) return
  const istek = (yol: string, govde: unknown) =>
    fetch(`${kok}${yol}`, {
      method: "POST",
      headers: { "x-internal-key": anahtar, "Content-Type": "application/json" },
      body: JSON.stringify(govde),
      signal: AbortSignal.timeout(15_000),
    })
  const r = await istek("/api/internal/sql-giris-uyari", { baslik: u.baslik, govde: u.govde, seviye: u.seviye })
  if (!r.ok) throw new Error(`CRM push ${r.status}`)
  // SMS yalnız güvenlik taraması/yoğun denemede ve numara tanımlıysa (Coolify env)
  const numaralar = (process.env.SQL_GUVENLIK_SMS ?? "").split(",").map((x) => x.trim()).filter(Boolean)
  if (u.sms && numaralar.length) {
    await istek("/api/internal/sms", { numaralar, mesaj: `PUSULA UYARI: ${u.baslik.replace(/^\S+\s/, "")} - ${u.govde}`.slice(0, 480) })
      .catch(() => {})
  }
}

/** Susturma kapsamı: "hepsi" | "destek" | "k:<kullanıcı küçük harf>" (mobil Güvenlik sekmesinden) */
export const SUSTUR_KAPSAM = /^(hepsi|destek|k:\S{1,128})$/

/** Susturulmuş mu — kullanıcı bazında, uyarının ilgilendiği kullanıcıların hepsi susturulmuşsa */
export function susturuldu(u: Pick<Uyari, "seviye" | "kullanicilar">, kapsamlar: Set<string>): boolean {
  if (kapsamlar.has("hepsi")) return true
  if (u.seviye === "destek" && kapsamlar.has("destek")) return true
  return u.kullanicilar.length > 0 && u.kullanicilar.every((k) => kapsamlar.has(`k:${k.toLowerCase()}`))
}

async function uyarilariGonder(uyarilar: Uyari[]): Promise<void> {
  if (!uyarilar.length) return
  const sb = getSupabaseAdmin().schema("hub")
  const [{ data }, { data: sus }] = await Promise.all([
    sb.from("sql_giris_bildirim").select("anahtar, son_bildirim").in("anahtar", uyarilar.map((u) => u.anahtar)),
    sb.from("sql_giris_sustur").select("kapsam").gt("bitis", new Date().toISOString()),
  ])
  const son = new Map(((data ?? []) as { anahtar: string; son_bildirim: string }[]).map((x) => [x.anahtar, Date.parse(x.son_bildirim)]))
  const kapsamlar = new Set(((sus ?? []) as { kapsam: string }[]).map((x) => x.kapsam))
  for (const u of uyarilar) {
    const once = son.get(u.anahtar)
    if (once && Date.now() - once < u.bekleMs) continue
    // Susturulmuşsa son_bildirim yazılmaz — susturma bitince sorun sürüyorsa uyarı gelir.
    if (susturuldu(u, kapsamlar)) continue
    try {
      await bildir(u)
      await sb.from("sql_giris_bildirim").upsert({ anahtar: u.anahtar, son_bildirim: new Date().toISOString() })
      console.log(`[SqlGiris] uyarı: ${u.baslik} — ${u.govde}`)
    } catch (e) {
      console.log(`[SqlGiris] uyarı gönderilemedi: ${e instanceof Error ? e.message : e}`)
    }
  }
}

export async function sqlGirisTur(): Promise<void> {
  if (calisiyor) return
  calisiyor = true
  try {
    const { hedef, sunucular } = await hedefVeSunucular()
    if (!hedef) return
    if (imlec == null) imlec = await imlecOku()
    const bas = new Date(imlec).toISOString().slice(0, 19).replace("T", " ")

    const [satirlar, acilisSatir] = await withSqlConnection(
      { server: hedef.ip, user: hedef.username, password: hedef.password, database: "master", requestTimeout: 60_000 },
      async (pool) => {
        const r = await pool.request().input("bas", sql.VarChar(30), bas).query(OKUMA_SQL)
        const rs = r.recordsets as unknown as [{ utc: string; metin: string }[], { acilis: string }[]]
        return [rs[0], rs[1]] as const
      },
    )
    const sqlAcilis = acilisSatir?.[0]?.acilis ? Date.parse(acilisSatir[0].acilis + "Z") : undefined
    const sinir = imlec
    // Başlangıç saniyeye yuvarlandığı için sınırdaki satırlar tekrar gelir — ms ile ele.
    const yeni = satirlar.map((x) => satirCoz(x.utc, x.metin)).filter((o): o is GirisOlayi => !!o && o.t > sinir)

    const sb = getSupabaseAdmin().schema("hub")
    if (yeni.length) {
      const kovalar = new Map<string, { kova: string; ip: string; kullanici: string; neden: Neden; veritabani: string; adet: number; ilk: number; son: number }>()
      for (const o of yeni) {
        const kova = new Date(Math.floor(o.t / KOVA_MS) * KOVA_MS).toISOString()
        const k = [kova, o.ip, o.kullanici, o.neden, o.veritabani].join("\u0001")
        const v = kovalar.get(k)
        if (v) { v.adet++; v.ilk = Math.min(v.ilk, o.t); v.son = Math.max(v.son, o.t) }
        else kovalar.set(k, { kova, ip: o.ip, kullanici: o.kullanici, neden: o.neden, veritabani: o.veritabani, adet: 1, ilk: o.t, son: o.t })
      }
      const p = [...kovalar.values()].map((v) => ({ ...v, ilk: new Date(v.ilk).toISOString(), son: new Date(v.son).toISOString() }))
      const { error } = await sb.rpc("sql_giris_ekle", { p })
      if (error) throw new Error(`kayıt: ${error.message}`)
      imlec = Math.max(...yeni.map((o) => o.t))
    }
    // İmleç her turda yazılır — "son okuma" kalp atışı olarak da kullanılıyor.
    await sb.from("sql_giris_bildirim").upsert({ anahtar: IMLEC, son_bildirim: new Date(imlec).toISOString() })
    await sb.from("sql_giris_bildirim").upsert({ anahtar: "__okuma", son_bildirim: new Date().toISOString() })

    const simdi = Date.now()
    pencere = [...pencere, ...yeni].filter((o) => simdi - o.t <= PENCERE_MS)
    await uyarilariGonder(uyarilariBul(pencere, sunucular, simdi, sqlAcilis))

    if (simdi - sonTemizlik > 6 * SAAT) {
      sonTemizlik = simdi
      await sb.from("sql_giris_hatalari").delete().lt("son", new Date(simdi - SAKLAMA_GUN * 24 * SAAT).toISOString())
      await sb.from("sql_giris_sustur").delete().lt("bitis", new Date(simdi).toISOString())
    }
  } catch (e) {
    console.log(`[SqlGiris] Hata: ${e instanceof Error ? e.message : e}`)
  } finally {
    calisiyor = false
  }
}

let _timer: ReturnType<typeof setInterval> | null = null

export function startSqlGirisIzleme(): void {
  if (_timer) return
  if (process.env.POLLER_READONLY === "1") {
    console.log("[SqlGiris] POLLER_READONLY=1 — atlandı")
    return
  }
  console.log("[SqlGiris] Başlatıldı — 60 sn aralıkla")
  setTimeout(() => void sqlGirisTur(), 20_000)
  _timer = setInterval(() => void sqlGirisTur(), ARALIK_MS)
}
