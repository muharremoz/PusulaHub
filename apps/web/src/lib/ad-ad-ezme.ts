import "server-only"

/**
 * AD ad-soyad değişikliği sonrası geçici "ezme" kaydı.
 *
 * Neden: firma kullanıcı listesi agent raporundan geliyor ve agent AD'yi
 * 5 dk'lık ağır-veri önbelleğinde tutuyor. Set-ADUser'dan hemen önce başlamış
 * normal bir poll eski adı getirip `lastReport`'u ezebiliyor → isim 5 dk'ya
 * kadar eskiye dönüyor, kullanıcı "kaydetmedi" sanıyor (19.09.2026).
 *
 * Kural: değişiklik yapılınca yeni ad burada tutulur; rapor yeni adı
 * getirince (ya da süre dolunca) kayıt düşer.
 */

const SURE_MS = 10 * 60 * 1000 // agent ağır-veri aralığının (5 dk) iki katı

type Ezme = { displayName: string; bitis: number }

const g = global as typeof global & { _pusulaAdAdEzme?: Map<string, Ezme> }
if (!g._pusulaAdAdEzme) g._pusulaAdAdEzme = new Map<string, Ezme>()
const ezmeler = g._pusulaAdAdEzme

const anahtar = (firkod: string, username: string) =>
  `${firkod}|${username.toLowerCase()}`

export function adEzmeKaydet(firkod: string, username: string, displayName: string): void {
  ezmeler.set(anahtar(firkod, username), { displayName, bitis: Date.now() + SURE_MS })
}

/**
 * Rapordaki adı düzeltir. Rapor yeni adı zaten gösteriyorsa ya da süre
 * dolduysa kayıt silinir ve rapor olduğu gibi döner.
 */
export function adEzmeUygula(firkod: string, username: string, rapordaki: string): string {
  const k = anahtar(firkod, username)
  const e = ezmeler.get(k)
  if (!e) return rapordaki
  if (Date.now() > e.bitis || rapordaki === e.displayName) {
    ezmeler.delete(k)
    return rapordaki
  }
  return e.displayName
}
