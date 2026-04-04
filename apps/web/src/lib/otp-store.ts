/* ══════════════════════════════════════════════════════════
   OTP Store — In-memory, Next.js hot-reload safe
   Kodlar 5 dakika geçerlidir.
══════════════════════════════════════════════════════════ */

const TTL_MS = 5 * 60 * 1000

interface OTPEntry {
  code: string
  expiresAt: number
  action: string
}

const g = global as typeof global & { _otpStore?: Map<string, OTPEntry> }
if (!g._otpStore) g._otpStore = new Map()
const store = g._otpStore

function randomCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000))
}

export function generateOTP(key: string, action: string): string {
  const code = randomCode()
  store.set(key, { code, expiresAt: Date.now() + TTL_MS, action })
  return code
}

export function verifyOTP(key: string, code: string): boolean {
  const entry = store.get(key)
  if (!entry) return false
  if (Date.now() > entry.expiresAt) { store.delete(key); return false }
  if (entry.code !== code) return false
  store.delete(key)
  return true
}
