/**
 * Cross-context clipboard helper.
 *
 * `navigator.clipboard.writeText` yalnızca **secure context**'te çalışır
 * (HTTPS veya `localhost`). Hub LAN'da HTTP üzerinden sunulduğu için
 * tarayıcı `navigator.clipboard`'u tanımsız yapar veya `NotAllowedError`
 * fırlatır → tüm copy butonları sessiz fail eder.
 *
 * Bu util önce modern API'yi dener, başarısız olursa eski
 * `document.execCommand('copy')` yöntemine düşer (gizli textarea + select +
 * execCommand). Eski yöntem HTTP'de de çalışır.
 *
 * Kullanım:
 * ```ts
 * import { copyToClipboard } from "@/lib/clipboard"
 * if (await copyToClipboard(text)) toast.success("Kopyalandı")
 * else toast.error("Kopyalanamadı")
 * ```
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  // 1) Modern API — secure context'te
  if (typeof navigator !== "undefined" && navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // fall through to legacy
    }
  }

  // 2) Legacy fallback — execCommand
  if (typeof document === "undefined") return false
  try {
    const ta = document.createElement("textarea")
    ta.value = text
    // Görünmez ama selectable olmalı
    ta.style.position   = "fixed"
    ta.style.top        = "0"
    ta.style.left       = "0"
    ta.style.width      = "1px"
    ta.style.height     = "1px"
    ta.style.padding    = "0"
    ta.style.border     = "none"
    ta.style.outline    = "none"
    ta.style.boxShadow  = "none"
    ta.style.background = "transparent"
    ta.style.opacity    = "0"
    ta.setAttribute("readonly", "")

    // Radix Dialog gibi focus-trap eden bir container açıksa, textarea'yı
    // document.body'ye eklersek FocusScope focus'u anında geri çalar → seçim
    // boşalır → execCommand boş kopyalar ("kopyalandı" der ama pano boş).
    // Çözüm: açık dialog varsa textarea'yı ONUN İÇİNE ekle (aynı focus scope),
    // yoksa body'ye. Böylece focus() seçimde kalır.
    const openDialog = document.querySelector(
      "[role='dialog'][data-state='open']",
    ) as HTMLElement | null
    const host = openDialog ?? document.body
    host.appendChild(ta)

    // Kullanıcının mevcut metin seçimini koru
    const selection  = document.getSelection()
    const savedRange = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null

    ta.focus({ preventScroll: true })
    ta.select()
    ta.setSelectionRange(0, text.length)
    const ok = document.execCommand("copy")

    host.removeChild(ta)

    // Önceki seçimi geri yükle
    if (savedRange && selection) {
      selection.removeAllRanges()
      selection.addRange(savedRange)
    }
    return ok
  } catch {
    return false
  }
}
