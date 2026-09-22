import "server-only"
import zlib from "node:zlib"
import { execOnAgent } from "@/lib/agent-poller"
import { withSqlConnection } from "@/lib/sql-external"
import { esitleBackupMaster } from "@/lib/backup-master"
import { SC_GOREV, SC_LISTE_KAYNAK } from "@/lib/spare-cloud"

/**
 * Yedek doğrulama testi — /tv ekranındaki düğmenin arkasındaki iş.
 *
 * ── Ne yapıyor? ───────────────────────────────────────────────────────
 * "Yedek alındı" demek yetmiyor; soru "yedek GERÇEKTEN var mı". Test bunu
 * üç ayrı kaynaktan sorup birbirine tutturuyor:
 *   1-2. `sirket.dbo.guvenlik` → yedeklenmesi gereken veritabanları
 *   3-5. `msdb` → SQL Server'ın kendi yedek kayıtları (tam / fark / zincir)
 *   6.   Spare Cloud (SFTP) → dosyalar gerçekten buluta çıkmış mı
 *   7.   SQL Backup Master → ikinci arşivin listesi kapsamla aynı mı
 * Her adım gerçek iş yapıyor; hiçbir adım süslemek için beklemiyor.
 *
 * ── Kesinlikle salt okuma ─────────────────────────────────────────────
 * Ekran ofiste müşteriye de açık. Test hiçbir şey yazmıyor: yedek almıyor,
 * Jobs.xml'e dokunmuyor (Backup Master adımı `kuruGosteri`), dosya silmiyor.
 * En pahalı işi 26 saatlik dosya listesini SFTP'den çekmek.
 *
 * Adımlar bir async generator ile akıyor: SSE ucu her `yield`i olduğu gibi
 * tarayıcıya geçiriyor, ekran adımı anında çiziyor.
 */

export type AdimDurum = "calisiyor" | "ok" | "uyari" | "hata"

export interface TestAdimi {
  id:       string
  baslik:   string
  /** Ekranda başlığın altındaki tek cümle — izleyen kişi ne ölçüldüğünü anlasın */
  aciklama: string
  durum:    AdimDurum
  /** Büyük punto sonuç: "188 veritabanı", "9.123 dosya" */
  deger?:   string
  /** En fazla üç kısa satır */
  detay?:   string[]
  sureMs?:  number
}

export interface TestSonucu {
  durum:   AdimDurum
  ozet:    string
  sureMs:  number
  /** Testin bittiği an */
  bitisAt: string
}

export type TestOlayi =
  | { tip: "plan";  plan: PlanAdimi[] }
  | { tip: "adim";  adim: TestAdimi }
  | { tip: "bitti"; sonuc: TestSonucu }

export interface PlanAdimi { id: string; baslik: string; aciklama: string }

/**
 * Adımların listesi test başlamadan önce yayınlanıyor: ekran bütün
 * kontrolleri en baştan solgun olarak gösteriyor, sırayla aydınlanıyorlar.
 * İzleyen kişi neyin kontrol edileceğini baştan görüyor — bir ilerleme
 * çubuğundan çok daha fazlasını anlatıyor.
 */
export const TEST_PLANI: PlanAdimi[] = [
  { id: "baglanti", baslik: "SQL Sunucusu",              aciklama: "Yedeklerin alındığı veritabanı sunucusuna bağlanılıyor" },
  { id: "kapsam",   baslik: "Yedek Kapsamı",             aciklama: "Yedeklenmesi gereken veritabanları firma kayıtlarından okunuyor" },
  { id: "tam",      baslik: "Günlük Tam Yedek",          aciklama: "Her veritabanının son tam yedeği 26 saatten yeni mi" },
  { id: "diff",     baslik: "15 Dakikalık Fark Yedeği",  aciklama: "Gün içinde 15 dakikada bir alınan değişiklik yedekleri güncel mi" },
  { id: "zincir",   baslik: "Geri Yükleme Zinciri",      aciklama: "Fark yedekleri gerçekten son tam yedeğin üstüne oturuyor mu" },
  { id: "bulut",    baslik: "Bulut Teslimi",             aciklama: "Alınan her yedek dosyası bulut sunucusunda gerçekten duruyor mu" },
  { id: "arsiv",    baslik: "İkinci Arşiv",              aciklama: "Google Drive ve FTP'ye giden ikinci kopya aynı listeyi kapsıyor mu" },
]

export interface YedekTestiHedef {
  ad:        string
  ip:        string
  username:  string
  password:  string
  agentPort: number
  apiKey:    string
}

/* ── Eşikler — scripts/sql/yedek-kontrol.sql ile aynı ───────────────── */
const TAM_SAAT     = 26   // günlük tam yedek bu kadar saatten eskiyse sorun
const DIFF_DK      = 45   // 15 dk'da bir alınıyor; 45 dk tolerans
const YUKLEME_PAYI = 30   // yeni biten yedek hâlâ yükleniyor olabilir
const BULUT_SAAT   = 26

/* ── Biçimlendirme ──────────────────────────────────────────────────── */
const sayi = (n: number) => n.toLocaleString("tr-TR")

function saat(d: Date | null | undefined): string {
  if (!d) return "—"
  return d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })
}

function gecen(d: Date | null | undefined, simdi: Date): string {
  if (!d) return "—"
  const dk = Math.max(0, Math.round((simdi.getTime() - d.getTime()) / 60_000))
  if (dk < 60) return `${dk} dk önce`
  const s = Math.floor(dk / 60)
  return s < 24 ? `${s} sa ${dk % 60} dk önce` : `${Math.floor(s / 24)} gün önce`
}

/** Spare Cloud klasör adı: yedeğin BAŞLADIĞI gün (gece yarısını aşan tur önceki günde) */
function bulutGunu(baslangic: string): string {
  const [y, a, g] = baslangic.slice(0, 10).split("-")
  return `${g}-${a}-${y}`
}

/* ── SQL parçaları ──────────────────────────────────────────────────── */

/** Son 3 günün yedek kayıtları — tam/fark/zincir adımları bunun üstüne kurulu */
const SON_YEDEKLER = `
  WITH b AS (
    SELECT bs.database_name COLLATE DATABASE_DEFAULT AS db, bs.type, bs.is_copy_only,
           bs.backup_finish_date, bs.backup_set_uuid, bs.differential_base_guid,
           ROW_NUMBER() OVER (PARTITION BY bs.database_name, bs.type, bs.is_copy_only
                              ORDER BY bs.backup_finish_date DESC) AS rn
    FROM msdb.dbo.backupset bs
    WHERE bs.backup_finish_date > DATEADD(day, -3, GETDATE())
  ),
  k AS (
    SELECT DISTINCT LTRIM(RTRIM(g.DataYolu)) COLLATE DATABASE_DEFAULT AS db
    FROM sirket.dbo.guvenlik g
    JOIN sys.databases d ON d.name COLLATE DATABASE_DEFAULT = LTRIM(RTRIM(g.DataYolu)) COLLATE DATABASE_DEFAULT
    WHERE g.YedekAl = 1 AND d.state_desc = 'ONLINE'
  )`

const KAPSAM_SQL = `
  SELECT DISTINCT LTRIM(RTRIM(g.DataYolu)) COLLATE DATABASE_DEFAULT AS db,
         d.name AS sunucuda, d.state_desc AS durum
  FROM sirket.dbo.guvenlik g
  LEFT JOIN sys.databases d ON d.name COLLATE DATABASE_DEFAULT = LTRIM(RTRIM(g.DataYolu)) COLLATE DATABASE_DEFAULT
  WHERE g.YedekAl = 1`

interface KapsamSatir { db: string; sunucuda: string | null; durum: string | null }
interface SonSatir    { db: string; son: Date | null }
interface ZincirSatir { db: string; uyumlu: number }

/* ══════════════════════════════════════════════════════════════════════
   Test
══════════════════════════════════════════════════════════════════════ */

export async function* yedekTestiCalistir(hedef: YedekTestiHedef): AsyncGenerator<TestOlayi> {
  const basladi = Date.now()
  const adimlar: TestAdimi[] = []

  const sqlCfg = {
    server: hedef.ip, user: hedef.username, password: hedef.password,
    database: "master", requestTimeout: 120_000,
  }
  const sorgu = <T>(q: string) =>
    withSqlConnection(sqlCfg, async (pool) => (await pool.request().query<T>(q)).recordset)

  /** Adımlar arasında taşınan veri */
  let simdi  = new Date()
  let kapsam = 0

  /** Bir adımı çalıştır: önce "çalışıyor", sonra sonucu yayınla. */
  async function* adim(
    id: string,
    is: () => Promise<{ durum: AdimDurum; deger: string; detay?: string[] }>,
  ): AsyncGenerator<TestOlayi> {
    const { baslik, aciklama } = TEST_PLANI.find((p) => p.id === id)!
    yield { tip: "adim", adim: { id, baslik, aciklama, durum: "calisiyor" } }
    const t = Date.now()
    let sonuc: TestAdimi
    try {
      sonuc = { id, baslik, aciklama, ...(await is()), sureMs: Date.now() - t }
    } catch (err) {
      sonuc = {
        id, baslik, aciklama, durum: "hata", deger: "Kontrol edilemedi",
        detay: [err instanceof Error ? err.message : String(err)],
        sureMs: Date.now() - t,
      }
    }
    adimlar.push(sonuc)
    yield { tip: "adim", adim: sonuc }
  }

  yield { tip: "plan", plan: TEST_PLANI }

  /* 1 ── Bağlantı ----------------------------------------------------- */
  yield* adim("baglanti", async () => {
      const [r] = await sorgu<{ ad: string; surum: string; simdi: Date; acilis: Date }>(`
        SELECT @@SERVERNAME AS ad,
               CAST(SERVERPROPERTY('ProductVersion') AS varchar(32)) AS surum,
               GETDATE() AS simdi,
               (SELECT sqlserver_start_time FROM sys.dm_os_sys_info) AS acilis`)
      simdi = new Date(r.simdi)
      const gun = Math.floor((simdi.getTime() - new Date(r.acilis).getTime()) / 86_400_000)
      return {
        durum: "ok",
        deger: `${hedef.ad} · ${hedef.ip}`,
        detay: [`SQL Server ${r.surum}`, `Hizmet ${gun} gündür kesintisiz açık`],
      }
    },
  )

  /* 2 ── Kapsam -------------------------------------------------------- */
  yield* adim("kapsam", async () => {
      const r = await sorgu<KapsamSatir>(KAPSAM_SQL)
      const acik   = r.filter((x) => x.sunucuda && x.durum === "ONLINE")
      const yok    = r.filter((x) => !x.sunucuda)
      const kapali = r.filter((x) => x.sunucuda && x.durum !== "ONLINE")
      kapsam = acik.length
      return {
        durum: yok.length > 0 ? "hata" : kapali.length > 0 ? "uyari" : "ok",
        deger: `${sayi(kapsam)} veritabanı`,
        detay: [
          "Kaynak: firma kayıtlarında yedeklemesi açık olanlar",
          yok.length > 0
            ? `${sayi(yok.length)} kayıt sunucuda bulunamadı: ${yok.map((x) => x.db).slice(0, 3).join(", ")}`
            : "Kayıtların tamamı sunucuda mevcut",
          ...(kapali.length > 0 ? [`${sayi(kapali.length)} veritabanı çevrimdışı`] : []),
        ],
      }
    },
  )

  /* 3 ── Günlük tam yedek ---------------------------------------------- */
  yield* adim("tam", async () => {
      const r = await sorgu<SonSatir>(`${SON_YEDEKLER}
        SELECT k.db, f.backup_finish_date AS son
        FROM k LEFT JOIN b f ON f.db = k.db AND f.type = 'D' AND f.is_copy_only = 0 AND f.rn = 1`)
      return ozetle(r, TAM_SAAT * 60, "tam yedek", simdi)
    },
  )

  /* 4 ── 15 dakikalık fark yedeği --------------------------------------- */
  yield* adim("diff", async () => {
      const r = await sorgu<SonSatir>(`${SON_YEDEKLER}
        SELECT k.db, i.backup_finish_date AS son
        FROM k LEFT JOIN b i ON i.db = k.db AND i.type = 'I' AND i.rn = 1`)
      return ozetle(r, DIFF_DK, "fark yedeği", simdi)
    },
  )

  /* 5 ── Zincir bütünlüğü ----------------------------------------------- */
  yield* adim("zincir", async () => {
      const r = await sorgu<ZincirSatir>(`${SON_YEDEKLER}
        /* Fark yedeği hiç yoksa zincir "kopuk" sayılmaz — onu bir önceki
           adım zaten gecikme olarak bildiriyor; burada iki kez sorun
           göstermek yanıltıcı olurdu (yedek-kontrol.sql ile aynı kural). */
        SELECT k.db,
               CASE WHEN i.backup_finish_date IS NULL THEN 1
                    WHEN f.backup_set_uuid IS NOT NULL AND i.differential_base_guid = f.backup_set_uuid THEN 1
                    ELSE 0 END AS uyumlu
        FROM k
        LEFT JOIN b f ON f.db = k.db AND f.type = 'D' AND f.is_copy_only = 0 AND f.rn = 1
        LEFT JOIN b i ON i.db = k.db AND i.type = 'I' AND i.rn = 1`)
      const bozuk = r.filter((x) => !x.uyumlu)
      return {
        durum: bozuk.length > 0 ? "hata" : "ok",
        deger: bozuk.length > 0 ? `${sayi(bozuk.length)} zincir kopuk` : `${sayi(r.length)} zincir sağlam`,
        detay: bozuk.length > 0
          ? ["Kopuk zincirde fark yedeği geri yüklenemez", bozuk.map((x) => x.db).slice(0, 3).join(", ")]
          : ["Tam yedek ve fark yedeği birlikte açılabiliyor", "En fazla 15 dakikalık veri geriye dönülüyor"],
      }
    },
  )

  /* 6 ── Bulut teslimi --------------------------------------------------- */
  yield* adim("bulut", async () => {
      const yedekler = await withSqlConnection({ ...sqlCfg, database: "msdb" }, async (pool) =>
        (await pool.request().query<{ db: string; tur: string; basla: string; yol: string; dkOnce: number }>(`
          SELECT b.database_name AS db, b.type AS tur,
                 CONVERT(varchar(19), b.backup_start_date, 120) AS basla,
                 mf.physical_device_name AS yol,
                 DATEDIFF(minute, b.backup_finish_date, GETDATE()) AS dkOnce
          FROM msdb.dbo.backupset b
          JOIN msdb.dbo.backupmediafamily mf ON mf.media_set_id = b.media_set_id
          WHERE mf.physical_device_name LIKE 'C:\\ProgramData\\SpareBackup\\%'
            AND b.backup_finish_date > DATEADD(hour, -${BULUT_SAAT}, GETDATE())`)).recordset)

      if (yedekler.length === 0) {
        return { durum: "hata", deger: "Yedek kaydı yok", detay: [`Son ${BULUT_SAAT} saatte hiç yedek alınmamış`] }
      }

      const gunler = [...new Set(yedekler.map((y) => bulutGunu(y.basla)))]
      const bulut  = await bulutListesi(hedef, gunler)

      let tamam = 0, bekleyen = 0, bos = 0
      const eksik: string[] = []
      for (const y of yedekler) {
        const ad = (y.yol.split("\\").pop() ?? "").replace(/\.bak$/i, ".zip")
        const boyut = bulut.dosyalar.get(`${bulutGunu(y.basla)}/${ad}`)
        if (boyut === undefined) { if (y.dkOnce < YUKLEME_PAYI) bekleyen++; else eksik.push(y.db) }
        else if (boyut === 0)    bos++
        else                     tamam++
      }
      const tam   = yedekler.filter((y) => y.tur === "D").length
      const fark  = yedekler.filter((y) => y.tur === "I").length
      const sorun = eksik.length + bos
      return {
        durum: sorun > 0 ? "hata" : "ok",
        deger: sorun > 0 ? `${sayi(sorun)} dosya eksik` : `${sayi(tamam)} dosyanın tamamı bulutta`,
        detay: [
          `Son ${BULUT_SAAT} saat: ${sayi(tam)} tam + ${sayi(fark)} fark yedeği`,
          `Bulutta ${sayi(bulut.dosyalar.size)} dosya tarandı (${gunler.join(", ")})`,
          sorun > 0
            ? `Eksik: ${[...new Set(eksik)].slice(0, 3).join(", ")}`
            : bekleyen > 0 ? `${sayi(bekleyen)} yeni yedek şu an yükleniyor` : "Eksik ya da boş dosya yok",
        ],
      }
    },
  )

  /* 7 ── İkinci arşiv ----------------------------------------------------- */
  yield* adim("arsiv", async () => {
      const [co] = await sorgu<{ guncel: number; toplam: number; son: Date | null }>(`${SON_YEDEKLER}
        SELECT SUM(CASE WHEN c.backup_finish_date > DATEADD(hour, -${TAM_SAAT}, GETDATE()) THEN 1 ELSE 0 END) AS guncel,
               COUNT(*) AS toplam, MAX(c.backup_finish_date) AS son
        FROM k LEFT JOIN b c ON c.db = k.db AND c.type = 'D' AND c.is_copy_only = 1 AND c.rn = 1`)

      const bm = await esitleBackupMaster(
        {
          ip: hedef.ip, username: hedef.username, password: hedef.password,
          agentPort: hedef.agentPort, apiKey: hedef.apiKey,
        },
        { kuruGosteri: true },
      )
      const sapma  = bm.isler.reduce((t, i) => t + i.cikan.length + i.eklenen.length, 0)
      const eskiCo = (co?.toplam ?? 0) - (co?.guncel ?? 0)
      const son    = co?.son ? new Date(co.son) : null
      return {
        durum: sapma > 0 || eskiCo > 0 ? "uyari" : "ok",
        deger: sapma > 0 ? `${sayi(sapma)} liste sapması` : `${sayi(bm.beklenen.length)} veritabanı listede`,
        detay: [
          `Hedefler: ${bm.isler.map((i) => i.ad).join(" · ") || "—"}`,
          son ? `Son kopya ${saat(son)} (${gecen(son, simdi)})` : "Kopya kaydı bulunamadı",
          eskiCo > 0
            ? `${sayi(eskiCo)} veritabanının kopyası 26 saatten eski`
            : "Ana yedeğin zincirine dokunmayan bağımsız kopya",
        ],
      }
    },
  )

  /* ── Sonuç ───────────────────────────────────────────────────────────── */
  const hata  = adimlar.filter((a) => a.durum === "hata")
  const uyari = adimlar.filter((a) => a.durum === "uyari")
  const durum: AdimDurum = hata.length > 0 ? "hata" : uyari.length > 0 ? "uyari" : "ok"
  const ozet =
    hata.length  > 0 ? `${hata.length} adımda sorun bulundu — ${hata.map((a) => a.baslik).join(", ")}`
  : uyari.length > 0 ? `${uyari.length} adım dikkat istiyor — ${uyari.map((a) => a.baslik).join(", ")}`
  : `${sayi(kapsam)} veritabanının yedeği eksiksiz ve geri yüklenebilir durumda`

  yield { tip: "bitti", sonuc: { durum, ozet, sureMs: Date.now() - basladi, bitisAt: new Date().toISOString() } }
}

/* ── Yardımcılar ─────────────────────────────────────────────────────── */

/** "Son yedek" listesini eşiğe göre özetler (tam ve fark adımları ortak) */
function ozetle(r: SonSatir[], esikDk: number, ad: string, simdi: Date) {
  const sinir  = simdi.getTime() - esikDk * 60_000
  const tarih  = r.map((x) => (x.son ? new Date(x.son) : null))
  const eski   = r.filter((_, i) => !tarih[i] || tarih[i]!.getTime() < sinir)
  const dolu   = tarih.filter((d): d is Date => d !== null)
  const enEski = dolu.length ? new Date(Math.min(...dolu.map((d) => d.getTime()))) : null
  const enYeni = dolu.length ? new Date(Math.max(...dolu.map((d) => d.getTime()))) : null
  return {
    durum: (eski.length > 0 ? "hata" : "ok") as AdimDurum,
    deger: eski.length > 0
      ? `${sayi(eski.length)} veritabanı geride`
      : `${sayi(r.length)} / ${sayi(r.length)} güncel`,
    detay: eski.length > 0
      ? [
          `Gecikmiş ${ad}: ${eski.map((x) => x.db).slice(0, 3).join(", ")}`,
          `En eski ${ad}: ${saat(enEski)} (${gecen(enEski, simdi)})`,
        ]
      : [
          `En yeni: ${saat(enYeni)} (${gecen(enYeni, simdi)})`,
          `En eski: ${saat(enEski)} (${gecen(enEski, simdi)})`,
        ],
  }
}

/** Spare Cloud klasörlerindeki dosya listesi — SQL sunucusundaki node ile */
async function bulutListesi(hedef: YedekTestiHedef, gunler: string[]) {
  const b64 = Buffer.from(SC_LISTE_KAYNAK, "utf8").toString("base64")
  const yol = "C:/Windows/Temp/hub-sc-liste.js"
  const cmd = [
    `[IO.File]::WriteAllBytes('${yol}',[Convert]::FromBase64String('${b64}'))`,
    `& 'C:/Program Files/SpareBackup/node/node.exe' '${yol}' '${SC_GOREV}' ${gunler.map((g) => `'${g}'`).join(" ")}`,
    `Remove-Item '${yol}' -ErrorAction SilentlyContinue`,
  ].join("; ")

  const r = await execOnAgent(hedef.ip, hedef.agentPort, hedef.apiKey, cmd, 180)
  const satir = (r.stdout || "").split(/\r?\n/).find((l) => l.startsWith("SCLISTE:") || l.startsWith("SCHATA:"))
  if (!satir || satir.startsWith("SCHATA:")) {
    throw new Error(satir?.slice(7).trim() || r.stderr || "Bulut dosya listesi alınamadı")
  }
  const veri = JSON.parse(zlib.gunzipSync(Buffer.from(satir.slice(8), "base64")).toString()) as {
    basePath: string
    klasorler: Record<string, [string, number][]>
  }
  const dosyalar = new Map<string, number>()
  for (const [gun, liste] of Object.entries(veri.klasorler)) {
    for (const [ad, boyut] of liste) dosyalar.set(`${gun}/${ad}`, boyut)
  }
  return { basePath: veri.basePath, dosyalar }
}
