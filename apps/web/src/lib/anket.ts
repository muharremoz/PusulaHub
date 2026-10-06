/**
 * Anket = soruları olan mesaj (hub.messages.survey). Cevaplar hub.message_recipients.answers.
 *
 * GİDİŞ: agent /api/notify gövdesini OLDUĞU GİBİ PusulaNotify'a verir → `survey` alanı
 *   agent'a dokunmadan popup'a ulaşır. (Eski WinForms popup anketi göstermez: yalnız
 *   yeni WebView2 popup'ı — apps/agent/windows/notify-exe.)
 * DÖNÜŞ: agent'ın tek kanalı /api/ack, yalnız msgId + username taşır. Cevap msgId'ye
 *   eklenir:  "<msgId>~a~<base64url(JSON cevaplar)>". Poller ayırır (cevapAyir).
 *   Popup tarafı: apps/agent/windows/notify-web/src/anket.ts — biçim AYNI kalmalı.
 */

export type SoruTipi = "tek" | "coklu" | "puan" | "metin"

export interface AnketSorusu {
  id: string
  tip: SoruTipi
  soru: string
  /** tek / coklu için seçenekler */
  secenekler?: string[]
  zorunlu: boolean
}

export interface Anket {
  sorular: AnketSorusu[]
}

/** soru id → cevap: tek=seçenek metni, coklu=seçenekler, puan=1..5, metin=yazı */
export type AnketCevaplari = Record<string, string | string[] | number>

export const CEVAP_AYRACI = "~a~"
export const METIN_SINIRI = 500
export const SORU_SINIRI = 10
export const SECENEK_SINIRI = 8

/** Gönderilmeden önce anketi doğrular/temizler. Hata varsa metin döner. */
export function anketDogrula(a: unknown): { anket: Anket } | { hata: string } {
  const sorular = (a as Anket | null)?.sorular
  if (!Array.isArray(sorular) || sorular.length === 0) return { hata: "Ankette en az bir soru olmalı" }
  if (sorular.length > SORU_SINIRI) return { hata: `En fazla ${SORU_SINIRI} soru eklenebilir` }
  const temiz: AnketSorusu[] = []
  for (const [i, s] of sorular.entries()) {
    const soru = String(s?.soru ?? "").trim()
    if (!soru) return { hata: `${i + 1}. sorunun metni boş` }
    if (!["tek", "coklu", "puan", "metin"].includes(s?.tip)) return { hata: `${i + 1}. sorunun tipi geçersiz` }
    let secenekler: string[] | undefined
    if (s.tip === "tek" || s.tip === "coklu") {
      secenekler = [...new Set((s.secenekler ?? []).map((x) => String(x).trim()).filter(Boolean))]
      if (secenekler.length < 2) return { hata: `${i + 1}. soruda en az iki seçenek olmalı` }
      if (secenekler.length > SECENEK_SINIRI) return { hata: `${i + 1}. soruda en fazla ${SECENEK_SINIRI} seçenek olabilir` }
    }
    temiz.push({ id: `s${i + 1}`, tip: s.tip, soru: soru.slice(0, 300), secenekler, zorunlu: !!s.zorunlu })
  }
  return { anket: { sorular: temiz } }
}

/** ACK msgId'sini ayırır: düz msgId ya da msgId + cevaplar. Bozuk cevap → yalnız okundu sayılır. */
export function cevapAyir(ackMsgId: string): { msgId: string; cevaplar: AnketCevaplari | null } {
  const i = ackMsgId.indexOf(CEVAP_AYRACI)
  if (i < 0) return { msgId: ackMsgId, cevaplar: null }
  const msgId = ackMsgId.slice(0, i)
  try {
    const json = Buffer.from(ackMsgId.slice(i + CEVAP_AYRACI.length), "base64url").toString("utf8")
    const c = JSON.parse(json)
    return { msgId, cevaplar: c && typeof c === "object" && !Array.isArray(c) ? (c as AnketCevaplari) : null }
  } catch {
    return { msgId, cevaplar: null }
  }
}

/** Gelen cevapları ankete göre süzer (bilinmeyen soru/seçenek atılır, metin kısaltılır). */
export function cevapTemizle(anket: Anket, c: AnketCevaplari): AnketCevaplari {
  const out: AnketCevaplari = {}
  for (const s of anket.sorular) {
    const v = c[s.id]
    if (v === undefined || v === null) continue
    if (s.tip === "tek" && typeof v === "string" && s.secenekler?.includes(v)) out[s.id] = v
    else if (s.tip === "coklu" && Array.isArray(v)) {
      const sec = v.filter((x) => typeof x === "string" && s.secenekler?.includes(x))
      if (sec.length) out[s.id] = sec
    } else if (s.tip === "puan") {
      const n = Number(v)
      if (Number.isInteger(n) && n >= 1 && n <= 5) out[s.id] = n
    } else if (s.tip === "metin" && typeof v === "string" && v.trim()) out[s.id] = v.trim().slice(0, METIN_SINIRI)
  }
  return out
}
