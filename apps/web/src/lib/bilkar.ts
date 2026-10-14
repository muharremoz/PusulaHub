import "server-only"
import { firmaEkTemsilcileri, firmaTemsilcileri } from "@/lib/crm-temsilciler"

/**
 * Bilkar Bilgisayar — alt bayimiz (firma 346).
 *
 * Bilkar'ın kendi müşterilerine erişmesi için tek bir domain kullanıcısı var
 * (14.10.2026). Bu kullanıcı her Bilkar müşterisinin `<firkod>_users`
 * grubuna üyedir (C:\MUSTERI\<firkod> NTFS yetkisi buradan gelir) ve
 * terminaldeki masaüstünde, yöneticininkiyle aynı yapıda ama yalnız
 * kendi müşterilerini içeren bir MUSTERILER klasörü bulunur.
 */
export const BILKAR_KULLANICI = "346.bilkar"

/** Bilkar kullanıcısının terminaldeki masaüstü — profil ilk oturumda oluşur. */
export const BILKAR_MASAUSTU = `C:\\Users\\${BILKAR_KULLANICI}\\Desktop`

/**
 * Firma Bilkar müşterisi mi? CRM'de müşteri temsilcisi YA DA ek temsilcisi
 * BILKAR olan firma (kontrol panelindeki Bilkar bölümüyle aynı tanım).
 * CRM'e ulaşılamazsa false — kurulum durmaz, eksik kalan adım elle yapılır.
 */
export async function bilkarFirmasiMi(firkod: string): Promise<boolean> {
  const [temsilci, ek] = await Promise.all([firmaTemsilcileri(), firmaEkTemsilcileri()])
  return [temsilci.get(firkod), ek.get(firkod)].some((t) => /bilkar/i.test(t?.ad ?? ""))
}
