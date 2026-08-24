import type { KumaMonitor } from "../_shared/types"

/**
 * Bir arıza için olası sebepler.
 *
 * ── Neden genel bir liste değil? ───────────────────────────────────────
 * "Kabloyu kontrol edin" tarzı sabit metinler bir izleme duvarında
 * gürültüdür: her arızada aynı şeyi yazar, kimse okumaz. Buradaki liste
 * iki kaynaktan besleniyor:
 *
 *   1. BAĞINTI — elimizdeki DİĞER monitörlerin durumu. Aynı makinenin ping
 *      monitörü de düşmüşse sorun servis değil makinedir; bunu söylemek
 *      tür bazlı her tahminden değerlidir.
 *   2. TÜR — bağıntı yoksa monitörün türü (ping / port / http / dns /
 *      keyword) neyin bozulmuş olabileceğini daraltıyor.
 *
 * Bağıntı bulunduğunda tür tahminleri KISALIYOR: elde somut bilgi varken
 * ihtimal saymak dikkati dağıtır.
 *
 * ── Sıra ───────────────────────────────────────────────────────────────
 * En olasıdan en az olasıya. Ekrana bakan kişi ilk satırdan başlasın.
 *
 * En fazla 3 satır: TV'de daha uzunu okunmuyor ve kart yükseliyor.
 */

const MAX = 3

const BY_TYPE: Record<string, string[]> = {
  ping: [
    "Makine kapalı ya da yeniden başlıyor",
    "Ağ yolu kopuk — anahtar veya VLAN",
    "Güvenlik duvarı ICMP yanıtını engelliyor",
  ],
  port: [
    "Servis durmuş, makine ayakta olabilir",
    "Uygulama çöktü, port dinlenmiyor",
    "Güvenlik duvarı portu kapattı",
  ],
  http: [
    "Uygulama hata dönüyor (5xx)",
    "Sertifika süresi dolmuş",
    "Ters vekil ayakta değil",
  ],
  keyword: [
    "Yanıt geliyor ama içerik beklenen değil",
    "Yukarı akış sağlayıcı zaman aşımında",
    "Besleme durmuş, veri tazelenmiyor",
  ],
  dns: [
    "Ad sunucusu yanıt vermiyor",
    "Alan adı kaydı değişmiş ya da silinmiş",
    "Alan adı süresi dolmuş olabilir",
  ],
}

/** Aynı makineyi işaret eden, ayakta olup olmadığını ölçen ping monitörü */
function hostPingOf(m: KumaMonitor, all: KumaMonitor[]): KumaMonitor | null {
  if (!m.hostname) return null
  const host = m.hostname.trim().toLowerCase()
  return (
    all.find(
      (x) =>
        x !== m &&
        x.type === "ping" &&
        (x.hostname ?? "").trim().toLowerCase() === host,
    ) ?? null
  )
}

export function causesFor(
  m: KumaMonitor,
  all: KumaMonitor[],
  /** Monitörün ait olduğu gövdenin bütün monitörleri */
  siblings: KumaMonitor[],
): string[] {
  const out: string[] = []

  /* ── 1. Bağıntı: makinenin kendisi de düşmüş mü? ── */
  const ping = hostPingOf(m, all)
  if (ping && ping.status === "down") {
    out.push("Makine de yanıt vermiyor: " + ping.name)
  }

  /* ── 2. Bağıntı: gövdenin tamamı mı düştü? ──
     Tek tek servis arızası ile ortak ağ/makine arızası bambaşka iki
     müdahale gerektiriyor; ayrımı burada yapıyoruz. */
  const down = siblings.filter((x) => x.status === "down")
  if (siblings.length > 1 && down.length === siblings.length) {
    out.push("Gövdenin tamamı düştü — ortak ağ sorunu")
  } else if (down.length > 1) {
    out.push(down.length + " monitör birden düştü — ortak sebep")
  }

  /*
   * Bağıntı bulunduysa tür tahminlerinden yalnız birini ekliyoruz.
   * Somut bilgi varken ihtimal sıralamak dikkati dağıtıyor.
   */
  const guesses = BY_TYPE[m.type] ?? []
  const room = out.length > 0 ? Math.min(1, MAX - out.length) : MAX
  out.push(...guesses.slice(0, Math.max(0, room)))

  return out.slice(0, MAX)
}
