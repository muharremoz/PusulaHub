import "server-only"
import { firmaEkTemsilcileri, firmaTemsilcileri } from "@/lib/crm-temsilciler"

/**
 * Bilkar Bilgisayar — alt bayimiz (firma 346).
 *
 * Bilkar'ın kendi müşterilerine erişmesi için domain kullanıcıları var
 * (14.10.2026 346.bilkar; 15.10'da 346.mehmet olarak yeniden adlandırıldı,
 * 346.fatih eklendi). Her kullanıcı her Bilkar müşterisinin `<firkod>_users`
 * grubuna üyedir (C:\MUSTERI\<firkod> NTFS yetkisi buradan gelir) ve
 * terminaldeki masaüstünde, yöneticininkiyle aynı yapıda ama yalnız
 * kendi müşterilerini içeren bir MUSTERILER klasörü bulunur.
 */
export const BILKAR_KULLANICILARI = ["346.mehmet", "346.fatih"] as const

/** Bilkar kullanıcısının terminaldeki masaüstü — profil ilk oturumda oluşur. */
export function bilkarMasaustu(kullanici: string): string {
  return `C:\\Users\\${kullanici}\\Desktop`
}

/**
 * Firma Bilkar müşterisi mi? CRM'de müşteri temsilcisi YA DA ek temsilcisi
 * BILKAR olan firma (kontrol panelindeki Bilkar bölümüyle aynı tanım).
 * CRM'e ulaşılamazsa false — kurulum durmaz, eksik kalan adım elle yapılır.
 */
export async function bilkarFirmasiMi(firkod: string): Promise<boolean> {
  const [temsilci, ek] = await Promise.all([firmaTemsilcileri(), firmaEkTemsilcileri()])
  return [temsilci.get(firkod), ek.get(firkod)].some((t) => /bilkar/i.test(t?.ad ?? ""))
}
