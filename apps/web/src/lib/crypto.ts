import { createCipheriv, createDecipheriv, randomBytes } from "crypto"

/**
 * AES-256-GCM ile şifreleme helper'ı.
 *
 * Kullanım: Servers tablosundaki Password / SqlPassword gibi
 * geri-alınabilir (reversible) olması gereken hassas alanlar için.
 *
 * Format: enc:v1:<iv-b64>:<tag-b64>:<ciphertext-b64>
 *   - enc:v1: → versiyon etiketi (prefix), legacy plaintext'ten ayırır
 *   - iv      → 12 byte (GCM için standart)
 *   - tag     → 16 byte auth tag
 *   - cipher  → utf8 plaintext'in GCM çıktısı
 *
 * Master key .env'deki ENCRYPTION_KEY'den okunur (base64, 32 byte).
 */

const PREFIX = "enc:v1:"
const ALGO = "aes-256-gcm"
const IV_LEN = 12

let cachedKey: Buffer | null = null

function getKey(): Buffer {
  if (cachedKey) return cachedKey
  const raw = process.env.ENCRYPTION_KEY
  if (!raw) {
    throw new Error("ENCRYPTION_KEY tanımlı değil (.env.local'e ekleyin).")
  }
  const key = Buffer.from(raw, "base64")
  if (key.length !== 32) {
    throw new Error(
      `ENCRYPTION_KEY 32 byte olmalı (base64 decode sonrası). Şu an: ${key.length} byte.`,
    )
  }
  cachedKey = key
  return key
}

/**
 * Düz metni şifreler ve `enc:v1:...` formatında döner.
 * Boş/undefined/null gelirse aynen döner (null-safe).
 */
export function encrypt(plain: string | null | undefined): string | null {
  if (plain === null || plain === undefined || plain === "") return plain ?? null
  // Zaten şifreliyse tekrar şifreleme
  if (plain.startsWith(PREFIX)) return plain

  const iv = randomBytes(IV_LEN)
  const cipher = createCipheriv(ALGO, getKey(), iv)
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()

  return (
    PREFIX +
    iv.toString("base64") +
    ":" +
    tag.toString("base64") +
    ":" +
    ciphertext.toString("base64")
  )
}

/**
 * Şifreli değeri çözer.
 * - `enc:v1:` prefix'i yoksa legacy plaintext kabul edilir ve aynen döner.
 * - Boş/null değerler aynen döner.
 * - Çözme başarısızsa null döner (bozuk veya yanlış key).
 */
export function decrypt(value: string | null | undefined): string | null {
  if (value === null || value === undefined || value === "") return value ?? null
  if (!value.startsWith(PREFIX)) return value // legacy plaintext

  try {
    const body = value.slice(PREFIX.length)
    const [ivB64, tagB64, cipherB64] = body.split(":")
    if (!ivB64 || !tagB64 || !cipherB64) return null

    const iv = Buffer.from(ivB64, "base64")
    const tag = Buffer.from(tagB64, "base64")
    const ciphertext = Buffer.from(cipherB64, "base64")

    const decipher = createDecipheriv(ALGO, getKey(), iv)
    decipher.setAuthTag(tag)
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()])
    return plaintext.toString("utf8")
  } catch (err) {
    console.error("[crypto.decrypt] çözme hatası:", err)
    return null
  }
}

/**
 * Değerin şifrelenmiş (enc:v1 formatında) olup olmadığını kontrol eder.
 * Migration scriptlerinde idempotentlik için kullanılır.
 */
export function isEncrypted(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith(PREFIX)
}
