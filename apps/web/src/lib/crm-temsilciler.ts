import "server-only"

/**
 * CRM'deki firma temsilcileri — `GET /api/internal/firma-temsilciler`.
 *
 * Temsilci verisi PARS'ta toplu uçtan alınamıyor (firma başına
 * `GetAccountDetail.AnlKIM`); CRM bunu kendi tarafında topluyor ve tek
 * istekte veriyor. Yanıt ~1,1 MB / 5.800 firma olduğundan süreç içinde
 * önbelleğe alınır.
 *
 * CRM'e ulaşılamazsa firma listesi temsilcisiz ama ÇALIŞIR kalmalı:
 * hata yutulur, elde bayat veri varsa o kullanılır.
 */

export interface CrmTemsilci {
  /** Platformun ortak kullanıcı kimliği — Hub kullanıcısıyla doğrudan eşleşir */
  id:       string
  ad:       string
  parsKodu: number | null
  aktif:    boolean
}

interface CrmYanit {
  ok?:       boolean
  toplam?:   number
  firmalar?: { firkod: string; temsilci: CrmTemsilci | null; ekTemsilci?: CrmTemsilci | null }[]
}

interface Haritalar {
  temsilci: Map<string, CrmTemsilci>
  /** CRM'deki ek temsilci (customers.secondary_manager_id) — ör. EMRE + BILKAR */
  ek:       Map<string, CrmTemsilci>
}

const TTL_MS = 15 * 60_000
let onbellek: { t: number; harita: Haritalar } | null = null
let akan: Promise<Haritalar> | null = null

async function cek(): Promise<Haritalar> {
  const kok = (process.env.CRM_URL ?? "https://crm.pusulanet.net").replace(/\/+$/, "")
  const anahtar = process.env.INTERNAL_APP_KEY
  if (!anahtar) throw new Error("INTERNAL_APP_KEY tanımlı değil")

  const r = await fetch(`${kok}/api/internal/firma-temsilciler`, {
    headers: { "x-internal-key": anahtar },
    cache:   "no-store",
    signal:  AbortSignal.timeout(30_000),
  })
  if (!r.ok) throw new Error(`CRM ${r.status}`)
  const j = (await r.json()) as CrmYanit
  const harita: Haritalar = { temsilci: new Map(), ek: new Map() }
  for (const f of j.firmalar ?? []) {
    if (!f.firkod) continue
    if (f.temsilci?.id) harita.temsilci.set(String(f.firkod), f.temsilci)
    if (f.ekTemsilci?.id) harita.ek.set(String(f.firkod), f.ekTemsilci)
  }
  return harita
}

/**
 * firkod → temsilci haritası. 15 dk önbellekli; CRM hata verirse elde bayat
 * veri varsa o döner, yoksa BOŞ harita (çağıran akış bozulmasın).
 */
export async function firmaTemsilcileri(): Promise<Map<string, CrmTemsilci>> {
  return (await haritalar()).temsilci
}

/** firkod → ek temsilci. Aynı istek/önbellekten; olmayan firma haritada yok. */
export async function firmaEkTemsilcileri(): Promise<Map<string, CrmTemsilci>> {
  return (await haritalar()).ek
}

async function haritalar(): Promise<Haritalar> {
  if (onbellek && Date.now() - onbellek.t < TTL_MS) return onbellek.harita
  // Aynı anda gelen isteklerde tek çağrı yapılsın (1,1 MB yanıt).
  if (!akan) {
    akan = cek()
      .then((harita) => { onbellek = { t: Date.now(), harita }; return harita })
      .catch((err) => {
        console.error("[crm-temsilciler]", err instanceof Error ? err.message : err)
        return onbellek?.harita ?? { temsilci: new Map<string, CrmTemsilci>(), ek: new Map<string, CrmTemsilci>() }
      })
      .finally(() => { akan = null })
  }
  return akan
}
