import { redirect } from "next/navigation"

/**
 * /tv/agac → /tv
 *
 * Sayfa bu adreste geliştirildi ve tamamlanınca /tv nin yerini aldı. Bu
 * yönlendirme, TV tarayıcısında yer imi olarak duran eski adresin boşa
 * düşmemesi için var: bir izleme duvarında adresi elle düzeltecek kimse
 * olmayabilir, ekran sessizce 404 gösterirse günlerce fark edilmez.
 *
 * Kalıcı (308) değil geçici (307) yönlendirme kullanılıyor: tarayıcı
 * kalıcı yönlendirmeyi önbelleğe alıp saklıyor, ileride bu adres başka
 * bir şey için kullanılmak istenirse temizlemek zor oluyor.
 */
export default function TvAgacRedirect() {
  redirect("/tv")
}
