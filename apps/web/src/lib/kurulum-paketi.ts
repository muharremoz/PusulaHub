/**
 * Kurulum paketi (.zip) üretimi — TEK KAYNAK.
 *
 * NEDEN AYRI DOSYA (27.08.2026): paket iki yerden isteniyor — Hub'ın kendi
 * firma sayfası (`/api/companies/[firkod]/kurulum`) ve CRM'in firma erişim
 * sekmesi (CRM → `/api/hub/kurulum` → burası). Mantığı ikinci kez yazmak,
 * ini biçimi ya da sabitler değiştiğinde iki paketin ayrışması demekti.
 *
 * İçerik:
 *   · PusulaConnect.exe  — genel kurulum sihirbazı (değişmez, nötr)
 *   · ayarlar.ini        — o kullanıcıya özel değerler
 *
 * NEDEN ZIP, NEDEN TEK EXE DEĞİL: exe'ye ayar gömmek derleme gerektiriyor
 * (csc.exe) ve Hub Linux konteynerde çalışıyor — orada derleyici yok. Kurulum
 * programı yanındaki ayarlar.ini'yi okuyup gömülü değerleri ezecek şekilde
 * yazıldı.
 */

import { promises as fs } from "node:fs"
import path from "node:path"
import { getFirmaErisim } from "@/lib/firma-erisim"
import type { SupabaseLike } from "@/lib/firma-credentials"
import { createZip } from "@/lib/zip"

/** Sabitler — kurulum programının varsayılanlarıyla aynı. */
const VPN_SUNUCU = "vpn.pusulanet.net:17443"
const TUNEL_ADI = "Pusula"
const MSI_URL = "http://pusulanet.net/FortiClient.msi"
/*  ARM işlemcili makineler için AYRI paket. Fortinet ARM'i ayrı bir
 *  kurulum dosyasıyla dağıtıyor ve x64 paketi ARM'de KURULAMIYOR:
 *  çekirdek modu ağ sürücüleri öykünemiyor, kurulum 1603 veriyor
 *  (2026-08-28, Snapdragon X Plus'lı bir müşteri makinesinde yaşandı).
 *  Adres tanımlanana kadar boş; kurulum programı ARM makinede durumu
 *  kullanıcıya açıkça söylüyor, 131 MB'ı boşuna indirmiyor.          */
const MSI_URL_ARM = ""

/*  Kullanıcı adı üretilen .ini'ye düz metin gidiyor. Satır sonu ya da "="
 *  geçerse dosyaya başka anahtar enjekte edilebilirdi (örneğin msiurl'i
 *  değiştirip kurulum dosyasını başka yerden indirtmek). Beyaz liste ile
 *  kesiliyor — AD kullanıcı adlarında bu karakterler zaten yeterli.        */
export const GUVENLI_KULLANICI_ADI = /^[A-Za-z0-9._-]{1,64}$/

/** Exe farklı çalışma dizinlerinde aranıyor: yerel dev ile konteyner farklı. */
async function exeYolunuBul(): Promise<string | null> {
  const adaylar = [
    path.join(process.cwd(), "kurulum", "PusulaConnect.exe"),
    path.join(process.cwd(), "apps", "web", "kurulum", "PusulaConnect.exe"),
  ]
  for (const y of adaylar) {
    try {
      await fs.access(y)
      return y
    } catch {
      /* sıradaki adaya bak */
    }
  }
  return null
}

export type KurulumSonuc =
  | { ok: true; zip: Uint8Array; dosyaAdi: string }
  | { ok: false; hata: string; kod: number }

export async function kurulumPaketiUret(
  firkod: string,
  kullanici: string,
  sb?: SupabaseLike,
): Promise<KurulumSonuc> {
  if (!GUVENLI_KULLANICI_ADI.test(kullanici)) {
    return { ok: false, hata: "Geçersiz kullanıcı adı", kod: 400 }
  }

  const erisim = await getFirmaErisim(firkod, sb)
  if (!erisim) return { ok: false, hata: "Firma bulunamadı", kod: 404 }

  // RDP hedefi: DNS varsa o tercih edilir (IP değişse de kısayol çalışsın).
  const rdpHedef = erisim.windows?.dns || erisim.windows?.ip || ""
  if (!rdpHedef) {
    return {
      ok: false,
      hata: "Firmaya RDP sunucusu atanmamış — paket üretilemez",
      kod: 409,
    }
  }

  // Domain kısa adı: "pusuladc.local" -> "PUSULADC"
  const domain = (erisim.ad?.domain ?? "").split(".")[0].toUpperCase() || "PUSULADC"

  const ini = [
    `# ${firkod} / ${kullanici} icin uretildi - Pusula`,
    `# Bu dosya PusulaConnect.exe ile AYNI klasorde durmali.`,
    `# Icerik saf ASCII: musteri Not Defteri ile acabilir.`,
    ``,
    `firma     = ${firkod}`,
    `kullanici = ${kullanici}`,
    `vpn       = ${VPN_SUNUCU}`,
    `rdp       = ${rdpHedef}`,
    `tunel     = ${TUNEL_ADI}`,
    `domain    = ${domain}`,
    `msiurl    = ${MSI_URL}`,
    `msiurl_arm = ${MSI_URL_ARM}`,
    ``,
  ].join("\r\n")

  const exeYolu = await exeYolunuBul()
  if (!exeYolu) {
    return { ok: false, hata: "Kurulum programı sunucuda bulunamadı", kod: 500 }
  }
  const exe = await fs.readFile(exeYolu)

  // Tarih veriliyor: createZip varsayılanı 1980-01-01 ve müşteri paketi
  // "çok eski" görünüyor.
  const simdi = new Date()
  const zip = createZip([
    { name: "PusulaConnect.exe", data: new Uint8Array(exe), date: simdi },
    { name: "ayarlar.ini", data: new TextEncoder().encode(ini), date: simdi },
  ])

  return { ok: true, zip, dosyaAdi: `PusulaConnect-${kullanici}.zip` }
}
