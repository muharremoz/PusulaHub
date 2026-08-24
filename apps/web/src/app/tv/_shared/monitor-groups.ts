/**
 * Monitör → ağaç gövdesi eşlemesi.
 *
 * ── Neden Hub'da, Kuma'da değil? ───────────────────────────────────────
 * Kuma'da tag tanımlanabiliyor ama Hub bu tag'leri OKUYAMIYOR: veri
 * Prometheus `/metrics` ucundan geliyor ve o uç yalnız monitor_name,
 * monitor_type, monitor_url, monitor_hostname, monitor_port veriyor —
 * tag yok. Tag'ler Kuma'nın SQLite'ında; oraya erişen tek yol
 * (`kuma-history.ts`) SSH + plink.exe'ye bağlı, Windows'a sabitlenmiş ve
 * Linux'taki prod'da çalışmaz.
 *
 * Bu yüzden gruplama şimdilik burada duruyor. Ama tek çıkış noktası
 * `treeOf()` — ileride kaynak değişirse (Kuma durum sayfası grupları,
 * yeni bir DB tablosu, vs.) yalnız bu dosya değişir, ağaç arayüzü
 * gruplamanın nereden geldiğini bilmez.
 *
 * ── Eşlenmemiş monitör ne olur? ────────────────────────────────────────
 * "İki yerde bakım" riski var: Kuma'ya monitör eklenip buraya
 * eklenmezse kaybolabilir. Kaybolmasın diye eşlenmeyen her monitör
 * `unclassified` gövdesine düşer ve ağaçta AÇIKÇA "Sınıflandırılmamış"
 * dalında görünür. Sessiz kayıp yok.
 */

import { EXCHANGE_PREFIX, type KumaMonitor } from "./types"

export type TreeKey = "servers" | "apps" | "external" | "unclassified"

export interface TreeDef {
  key:   TreeKey
  label: string
  /** Gövde ne anlama geliyor — detay panelinde gösteriliyor */
  hint:  string
}

/** Ağaçta soldan sağa / yukarıdan aşağı gövde sırası */
export const TREES: TreeDef[] = [
  { key: "servers",      label: "Sunucular",          hint: "Fiziksel makineler" },
  { key: "apps",         label: "Uygulamalar",        hint: "Servisler ve web uçları" },
  { key: "external",     label: "Dış Dünya",          hint: "Bizim kontrolümüz dışında" },
  { key: "unclassified", label: "Sınıflandırılmamış", hint: "Eşleme tablosuna eklenmesi gerekiyor" },
]

/**
 * Kuma'daki monitör adı → gövde.
 *
 * Anahtarlar Kuma'daki adla BİREBİR aynı olmalı. Kuma'da bir monitörü
 * yeniden adlandırırsan burayı da güncelle; yoksa "Sınıflandırılmamış"a
 * düşer (ki bu bilinçli bir uyarı, hata değil).
 */
const MAP: Record<string, TreeKey> = {
  /* ── Sunucular — fiziksel makineler ── */
  "Active Directory": "servers",   // 10.15.2.4
  "SQL":              "servers",   // 10.15.2.2
  "SQL SERVER":       "servers",   // 10.15.2.2
  "Terminal 1":       "servers",   // 10.15.2.5
  "Depo":             "servers",   // 10.15.2.200
  "Mobil":            "servers",   // 10.15.2.3
  "SPARE FTP":        "servers",   // 192.168.169.203 — Makdos'ta ayrı sunucu

  /* ── Uygulamalar — servisler, web uçları ── */
  "HUB":              "apps",      // hub.pusulanet.net
  "SWITCH":           "apps",      // switch.pusulanet.net
  "CRM":              "apps",      // crm.pusulanet.net
  "FLOW":             "apps",      // spareflow.pusulanet.net
  "IIS":              "apps",      // iis.databag.net
  "PARS":             "apps",      // iis.databag.net
  "PS1":              "apps",      // ps1.databag.net
  "PUSULA LISANS":    "apps",      // pars.pusulanet.net
  "Pusula VPN":       "apps",      // vpn.pusulanet.net
  "Fastify API":      "apps",      // 10.15.2.6:3000
  "Pusula Kur API":   "apps",      // 10.15.2.6:8080

  /* ── Dış dünya ── */
  "Pusulanet.net":     "external",
  "Pusulayazilim.net": "external",
  "kur.pusulanet.net": "external",
  // Döviz kaynakları aşağıdaki önek kuralıyla yakalanıyor
}

/**
 * Bir monitörün hangi gövdeye ait olduğunu söyler.
 *
 * Sıra: açık eşleme → önek kuralı → sınıflandırılmamış.
 * Önek kuralı sayesinde Kuma'ya yeni bir "Döviz - X" eklendiğinde burayı
 * güncellemeye gerek kalmıyor.
 */
export function treeOf(m: Pick<KumaMonitor, "name">): TreeKey {
  const name = m.name.trim()
  const direct = MAP[name]
  if (direct) return direct
  if (name.startsWith(EXCHANGE_PREFIX)) return "external"
  return "unclassified"
}

/** Monitörleri gövdelere böler. Boş gövdeler dışarıda bırakılır. */
export function groupIntoTrees(
  monitors: KumaMonitor[],
): Array<{ def: TreeDef; monitors: KumaMonitor[] }> {
  const buckets = new Map<TreeKey, KumaMonitor[]>()
  for (const m of monitors) {
    const key = treeOf(m)
    const arr = buckets.get(key)
    if (arr) arr.push(m)
    else buckets.set(key, [m])
  }

  return TREES.map((def) => ({
    def,
    /**
     * Ada göre SABİT sıra. `useTvData` listeleri "önce arızalılar" diye
     * sıralıyor; ağaçta öyle olursa bir monitör düştüğünde tüm dallar yer
     * değiştirir ve ekran zıplar. Konum sabit kalsın, değişen tek şey renk
     * olsun — göz nereye bakacağını öğrensin.
     */
    monitors: (buckets.get(def.key) ?? []).sort((a, b) =>
      a.name.localeCompare(b.name, "tr"),
    ),
  })).filter((t) => t.monitors.length > 0)
}
