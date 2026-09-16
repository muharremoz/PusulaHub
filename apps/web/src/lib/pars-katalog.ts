/**
 * Pars (mobil rapor uygulaması) kataloğu — istemci ve sunucu ortak saf yardımcılar.
 *
 * Pars'ın veri kaynağı mobil sunucudaki PUSULA GOREV uygulamasının Access
 * veritabanıdır (Ayar.mdb). Sihirbaz oradan rapor/görev listesini okur,
 * seçimi kullanıcıya bırakır, sonra kullanıcı + yetki kayıtlarını yazar.
 *
 * Yetki mantığı TERStir: YasakliDatalar / YasakliRapor tablolarına YAZILMAYAN
 * her şey izinlidir. Bu yüzden "seçilen raporlar" istemciden gelir, sunucu
 * tarafı seçilmeyen HER kaydı yasaklı listesine yazar.
 */

/** Dtipler tablosu — program tipi. Sabit ID'ler Ayar.mdb'de böyle. */
export const PARS_TIPLER: Record<number, string> = {
  [-1]: "PERAKENDE",
  [-2]: "TOPTAN",
  [-3]: "ÜRETİM",
  [-4]: "STOKCARI",
  [1]:  "SİPARİŞ",
}

/**
 * Pusula program kodu → Pars tip ID.
 * Program kodları sirket.guvenlik.prgtur ile aynı: 909 Perakende, 011 Toptan,
 * 016 Üretim, 111 StokCari.
 */
export function parsTipFromProgramCode(programCode: string | null | undefined): number | null {
  const kod = (programCode ?? "").trim()
  switch (kod) {
    case "909": return -1
    case "011": return -2
    case "016": return -3
    case "111": return -4
    default:    return null
  }
}

export interface ParsScript {
  id:      number
  ad:      string
  tipId:   number | null
  mobil:   boolean
  musteri: boolean
}

export interface ParsData {
  did:   number
  data:  string
  tipId: number | null
}

export interface ParsUserRow {
  id:   number
  adi:  string
  tipi: number
}

/** Mobil uygulamanın bağlanacağı adres — müşteri mesajında gösterilir. */
export interface ParsBaglanti {
  /** Sunucu DNS'i, yoksa IP */
  host: string
  /** Hizmet ayarındaki port; tanımlı değilse null */
  port: number | null
  /** "iis.databag.net:8888" — port yoksa yalnız host */
  adres: string
}

export function parsBaglantiKur(dns: string | null | undefined, ip: string, port: number | null): ParsBaglanti {
  const host = (dns ?? "").trim() || ip
  return { host, port, adres: port ? `${host}:${port}` : host }
}

export interface ParsKatalog {
  dtipler: { tid: number; ad: string }[]
  datalar: ParsData[]
  scripts: ParsScript[]
  users:   ParsUserRow[]
  /** Katalog ucundan gelir; Ayar.mdb'den değil hizmet ayarından türer. */
  baglanti?: ParsBaglanti
}

/**
 * Müşteriye gidecek Pars bloğu — sihirbaz ve firma detayı AYNI metni üretsin
 * diye tek yerde. Boş kullanıcı listesinde boş dizi döner.
 */
export function parsMesajSatirlari(
  users: { username: string; password: string }[],
  baglanti?: ParsBaglanti | null,
): string[] {
  const dolu = users.filter((u) => u.username.trim())
  if (dolu.length === 0) return []
  const lines = ["Pars Mobil Uygulama Bilgileri:"]
  if (baglanti?.adres) lines.push(`Sunucu: ${baglanti.adres}`)
  dolu.forEach((u, i) => {
    lines.push(`Kullanıcı Adı: ${u.username.trim()}`)
    lines.push(`Şifre: ${u.password}`)
    if (i < dolu.length - 1) lines.push("")
  })
  return lines
}

/**
 * Firmaya özel görünen raporlar — Ayar.mdb'de bunu söyleyen bir alan yok,
 * ad kalıbından tahmin ediliyor. Yalnız VARSAYILAN seçimi etkiler; kullanıcı
 * listeden yine işaretleyebilir.
 */
const FIRMAYA_OZEL = /^\d{3,4}_|^\d{3,4}OTO|MARAL|VIVA|REGOLD|ELEGANC|ELIZI|ELİZİ|HASGUMUS|TAKOZ|^Cari Bildirim/i

export function parsRaporFirmayaOzelMi(ad: string): boolean {
  return FIRMAYA_OZEL.test(ad.trim())
}

/** Tip 0 → görev/zamanlayıcı; Dtipler'de olmayan tip → programı belirsiz. */
export function parsRaporGrubu(s: ParsScript, tipler: Set<number>): "program" | "belirsiz" {
  if (s.tipId === null || s.tipId === 0 || !tipler.has(s.tipId)) return "belirsiz"
  return "program"
}

/**
 * Varsayılan seçim: seçili programların tipindeki, mobilde görünen ve firmaya
 * özel olmayan raporlar. Diğer programların raporları ve görevler kapalı gelir.
 */
export function parsVarsayilanSecim(scripts: ParsScript[], secilenTipler: number[]): number[] {
  const tipSet = new Set(secilenTipler)
  return scripts
    .filter((s) => s.mobil && s.tipId !== null && tipSet.has(s.tipId) && !parsRaporFirmayaOzelMi(s.ad))
    .map((s) => s.id)
}

/* ── Şifre ─────────────────────────────────────────────── */

// Telefonda yazılacak: karışan karakterler yok (0/o, 1/l/i), yalnız küçük harf + rakam.
const PARS_HARF  = "abcdefghjkmnpqrstuvwxyz"
const PARS_RAKAM = "23456789"

/** 6 karakterlik basit Pars şifresi — en az 1 harf + 1 rakam garanti. */
export function parsSifreUret(): string {
  const rnd = (s: string) => s[Math.floor(Math.random() * s.length)]
  const tum = PARS_HARF + PARS_RAKAM
  const dizi = [rnd(PARS_HARF), rnd(PARS_RAKAM)]
  while (dizi.length < 6) dizi.push(rnd(tum))
  for (let i = dizi.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[dizi[i], dizi[j]] = [dizi[j], dizi[i]]
  }
  return dizi.join("")
}

/** Sihirbazda girilen Pars şifresi kuralı: 6 karakter, harf/rakam. */
export function parsSifreGecerliMi(sifre: string): boolean {
  return /^[A-Za-z0-9]{6}$/.test(sifre)
}

/** Kullanıcı adı: boşluk ve tırnak yok, 2-40 karakter. Datadaki kullanıcıyla aynı yazılır. */
export function parsKullaniciAdiGecerliMi(adi: string): boolean {
  const s = adi.trim()
  return s.length >= 2 && s.length <= 40 && !/[\s'"]/.test(s)
}

/**
 * Data adından firma kodu — Pars datası `<firmaKodu>_<ad>` deseninde
 * (3745_SEYIDOGLU26, 877_Siparis). Öneki olmayanlarda (ALTAN2026) null.
 */
export function parsDataFirmaKodu(data: string): string | null {
  const m = (data ?? "").trim().match(/^(\d{3,5})[_.-]/)
  return m ? m[1] : null
}

/**
 * Kullanıcı adından firma kodu — `5973.canta1` gibi noktalı adlarda önek.
 * Datası olmayan/öneksiz data kullanan kullanıcılar için ikinci ipucu.
 */
export function parsKullaniciAdiFirmaKodu(username: string): string | null {
  const m = (username ?? "").trim().match(/^(\d{3,5})[._-]/)
  return m ? m[1] : null
}

/** Karşılaştırma için sadeleştirir: harfler büyük, TR karakterler düz, rakam/ayraç yok. */
function sadelestir(s: string): string {
  return (s ?? "")
    .toLocaleUpperCase("tr-TR")
    .replace(/İ/g, "I").replace(/Ş/g, "S").replace(/Ğ/g, "G").replace(/Ü/g, "U").replace(/Ö/g, "O").replace(/Ç/g, "C")
    .replace(/[^A-Z]/g, "")
}

/**
 * Datası okunamayan kullanıcı için firma TAHMİNİ: kullanıcı adı, data adının
 * içinde geçiyor mu (cihan → 5055_CIHAN24, merve1 → 5339_MERVE).
 * Kesin değildir — arayüzde "tahmin" diye gösterilir, otomatik seçilmez.
 */
export function parsFirmaTahmini(username: string, tumDatalar: string[]): { kod: string; data: string } | null {
  const ad = sadelestir(username)
  if (ad.length < 4) return null
  for (const uzunluk of [ad.length, 5]) {
    const parca = ad.slice(0, uzunluk)
    if (parca.length < 4) continue
    for (const d of tumDatalar) {
      const kod = parsDataFirmaKodu(d)
      if (!kod) continue
      if (sadelestir(d).includes(parca)) return { kod, data: d }
    }
  }
  return null
}

/** Ayar.mdb'de var olan bir Pars kullanıcısı — Hub'a aktarım ekranı için. */
export interface ParsMevcutKullanici {
  parsUserId: number
  username:   string
  /** 1 admin, 0 kullanıcı */
  tipi:       number
  /** Kullanıcının görebildiği datalar */
  datalar:    string[]
  /** Datalardan (ya da kullanıcı adı önekinden) tespit edilen firma kodları */
  firmaKodlari: string[]
  /** Kesin eşleşme yoksa ad benzerliğinden tahmin — otomatik seçilmez */
  firmaTahmini: { kod: string; data: string } | null
  /** Hub'da company_pars_users'ta zaten kayıtlı mı (hangi firmaya) */
  hubFirmaId: string | null
}

/** Sihirbaz durumundaki Pars kullanıcı satırı. */
export interface ParsWizardUser {
  id:       number
  username: string
  password: string
  /** true → Users.Tipi = 1 (admin), false → 0 (kullanıcı) */
  admin:    boolean
}
