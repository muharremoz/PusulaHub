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
    ta.setAttribute("readonly", "")
    document.body.appendChild(ta)
    ta.select()
    ta.setSelectionRange(0, text.length)
    const ok = document.execCommand("copy")
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}
