/**
 * Firma/AD kullanıcısı şifre üretici — connection string, XML, URL ve shell
 * bağlamlarında sorun çıkartabilecek karakterler dışarıda tutulur.
 *
 * AD karmaşıklık kuralı: 4 kategoriden (büyük, küçük, rakam, özel) en az 3'ü
 * + minimum 7 karakter. Bu generator 12 karakter üretir ve 4 kategoriyi de
 * garanti eder.
 *
 * ── Çıkarılan özel karakterler ve nedenleri ──
 *   &  — XML escape gerektirir (&amp;), URL query separator
 *   <  >  — XML element delimiter
 *   "  '  — string literal / attribute delimiter (web.config, JSON, SQL)
 *   ;  — connection string separator (Data Source=X;Password=Y;...)
 *   =  — connection string key=value ayırıcısı
 *   \  — escape karakteri (PowerShell, JSON, path)
 *   %  — URL percent-encoding, batch %VAR% syntax
 *   /  — URL path / regex
 *   :  — URL scheme, drive letter
 *   `  — PowerShell escape character
 *   |  — pipe (shell, batch)
 *   ^  — caret (batch escape)
 *   ~  — home dir / temp file
 *   ,  — CSV / locale-bağımlı decimal
 *
 * Kalanlar: ! @ # $ * + - ? _ . — 10 karakter, AD complexity için yeterli.
 */

const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ"
const LOWER = "abcdefghjkmnpqrstuvwxyz"
const DIGIT = "23456789"
const SAFE_SPECIAL = "!@#$*+-?_."

const ALL = UPPER + LOWER + DIGIT + SAFE_SPECIAL

function rand(s: string): string {
  return s[Math.floor(Math.random() * s.length)]
}

/**
 * 12 karakterlik güvenli şifre üretir.
 * 4 kategoriden en az 1'er garanti edilir, kalanlar tüm karakter setinden
 * rastgele çekilip Fisher-Yates ile karıştırılır.
 */
export function generateSafePassword(length: number = 12): string {
  const min = Math.max(length, 8)
  const base = [rand(UPPER), rand(LOWER), rand(DIGIT), rand(SAFE_SPECIAL)]
  for (let i = base.length; i < min; i++) base.push(rand(ALL))
  for (let i = base.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[base[i], base[j]] = [base[j], base[i]]
  }
  return base.join("")
}
