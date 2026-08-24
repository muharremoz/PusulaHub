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

import { isExchange, type KumaMonitor } from "./types"

export type TreeKey = "servers" | "ports" | "apps" | "dns" | "external" | "unclassified"

export interface TreeDef {
  key:   TreeKey
  label: string
  /** Gövde ne anlama geliyor — detay panelinde gösteriliyor */
  hint:  string
}

/** Ağaçta soldan sağa / yukarıdan aşağı gövde sırası */
export const TREES: TreeDef[] = [
  { key: "servers",      label: "Datacenter",         hint: "Fiziksel makineler" },
  { key: "ports",        label: "Portlar",            hint: "TCP port dinleniyor mu" },
  { key: "apps",         label: "Uygulamalar",        hint: "Servisler ve web uçları" },
  { key: "dns",          label: "DNS",                hint: "Alan adı çözümleme kontrolleri" },
  { key: "external",     label: "Döviz Kaynakları",   hint: "Dış sağlayıcılar — bizim kontrolümüz dışında" },
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
  /* ── Datacenter — fiziksel makineler ──
     Hepsi ping monitörü: "makine ayakta mı" sorusunu soruyorlar. Port
     kontrolleri buraya değil "Portlar" gövdesine gidiyor (aşağıdaki tür
     kuralı), çünkü onlar makinenin değil bir SERVİSİN dinlediğini
     doğruluyor. */
  "Active Directory": "servers",   // 10.15.2.4
  "SQL":              "servers",   // 10.15.2.2
  "SQL SERVER":       "servers",   // 10.15.2.2 — ping
  "Terminal 1":       "servers",   // 10.15.2.5
  "Depo":             "servers",   // 10.15.2.200
  "Mobil":            "servers",   // 10.15.2.3

  /* ── Uygulamalar — servisler, web uçları ── */
  "HUB":              "apps",      // hub.pusulanet.net
  "SWITCH":           "apps",      // switch.pusulanet.net
  "CRM":              "apps",      // crm.pusulanet.net
  "FLOW":             "apps",      // spareflow.pusulanet.net
  /* Coolify bir PORT monitörü (10.15.2.7:8000) — tür kuralı onu "Portlar"
     gövdesine düşürürdü. Burada açıkça eşlendiği için Uygulamalar'da
     kalıyor: açık eşleme tür kuralından önce geliyor. */
  "Coolify":          "apps",      // 10.15.2.7:8000
  "Fastify API":      "apps",      // 10.15.2.6:3000
  "Pusula Kur API":   "apps",      // 10.15.2.6:8080
  "Supabase":         "apps",      // 10.15.2.7 — /auth/v1/health, apikey başlığıyla

  /* ── DNS — alan adı çözümleme kontrolleri ──
     Bunlar bir servisin çalışıp çalışmadığını değil, adının çözümlenip
     çözümlenmediğini test ediyor. Uygulamalardan ayrı bir şey. */
  "IIS":               "dns",      // iis.databag.net
  "PS1":               "dns",      // ps1.databag.net
  "Pusula VPN":        "dns",      // vpn.pusulanet.net
  "Pusulanet.net":     "dns",
  "Pusulayazilim.net": "dns",
  "kur.pusulanet.net": "dns",

  /* ── Dış dünya ── */
  // Döviz kaynakları aşağıdaki önek kuralıyla yakalanıyor
}

/* ══════════════════════════════════════════════════════════
   Alt gruplar
   ──────────────────────────────────────────────────────────
   Bir gövdedeki monitörler tek bir yığın değil: Portlar hangi makinenin
   portu olduğuna, Uygulamalar da işlevine göre ayrılıyor. Ağaçta
   odaklanınca yapraklar bu başlıklar altında açılıyor.

   Alt grup tanımlı OLMAYAN gövdelerde (DNS, Döviz Kaynakları) ağaç düz
   liste çizer.

   Etiket değiştirmek için yalnız buraya dokunmak yeterli — ağaç ve
   başlıklar hepsi bu tanımdan okuyor.
══════════════════════════════════════════════════════════ */

export interface SubGroupDef {
  key:   string
  label: string
  /** Hangi gövdenin altında */
  tree:  TreeKey
  /** Bu gövdede açıkça eşlenmemiş monitörler buraya düşer */
  fallback?: boolean
}

/** Ağaçta yukarıdan aşağı sıra */
export const SUBGROUPS: SubGroupDef[] = [
  { key: "cloud", label: "Pusula Cloud",      tree: "servers", fallback: true },
  { key: "edge",  label: "Spare Backup",      tree: "ports" },
  { key: "db",    label: "Veritabanı",        tree: "ports" },
  { key: "app",   label: "Uygulama Portları", tree: "ports",   fallback: true },
  { key: "mgmt",  label: "Pusula Management", tree: "apps",    fallback: false },
  { key: "api",   label: "API Servisleri",    tree: "apps",    fallback: false },
  { key: "svc",   label: "Diğer Servisler",   tree: "apps",    fallback: true },
]

/** İstisna listesi — burada olmayan monitör gövdesinin fallback grubuna düşer */
const SUBGROUP_MAP: Record<string, string> = {
  /* Portlar — hangi makinenin portu olduğuna göre */
  "SQL PORT":  "db",      // 10.15.2.2:1433
  "SPARE FTP": "edge",    // 192.168.169.203 — ayrı fiziksel makine

  /* Pusula Management — platformun kendi uygulamaları ve altyapısı */
  "CRM":      "mgmt",
  "HUB":      "mgmt",
  "FLOW":     "mgmt",
  "SWITCH":   "mgmt",
  "Coolify":  "mgmt",
  "Supabase": "mgmt",

  /* API Servisleri — dışarıya veri veren uçlar */
  "Fastify API":    "api",   // 10.15.2.6:3000/backup/stats
  "Pusula Kur API": "api",   // 10.15.2.6:8080/health
}

/**
 * Monitörün alt grubu. Gövdesinde alt grup tanımlı değilse null döner ve
 * ağaç düz liste çizer.
 */
export function subGroupOf(m: Pick<KumaMonitor, "name" | "type">): string | null {
  const tree = treeOf(m)
  const defs = SUBGROUPS.filter((d) => d.tree === tree)
  if (defs.length === 0) return null

  const explicit = SUBGROUP_MAP[m.name.trim()]
  if (explicit && defs.some((d) => d.key === explicit)) return explicit
  return (defs.find((d) => d.fallback) ?? defs[0]).key
}

/**
 * Bir monitörün hangi gövdeye ait olduğunu söyler.
 *
 * Sıra: açık eşleme → tür kuralı → önek kuralı → sınıflandırılmamış.
 * Açık eşleme türden ÖNCE geliyor: bir port monitörünü istisnaen başka bir
 * gövdede tutmak gerekirse MAPe yazmak yeterli.
 * Önek kuralı sayesinde Kuma'ya yeni bir "Döviz - X" eklendiğinde burayı
 * güncellemeye gerek kalmıyor.
 */
export function treeOf(m: Pick<KumaMonitor, "name" | "type">): TreeKey {
  const name = m.name.trim()
  const direct = MAP[name]
  if (direct) return direct
  if (m.type === "port") return "ports"
  if (isExchange(name)) return "external"
  return "unclassified"
}

/** Bir gövde ve altındaki monitörler */
export interface TreeGroup {
  def:      TreeDef
  monitors: KumaMonitor[]
}

/** Monitörleri gövdelere böler. Boş gövdeler dışarıda bırakılır. */
export function groupIntoTrees(monitors: KumaMonitor[]): TreeGroup[] {
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
