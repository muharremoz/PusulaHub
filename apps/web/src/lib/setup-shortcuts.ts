/**
 * Firma kurulum sihirbazı — masaüstü kısayol (.lnk) PowerShell komut üreticileri.
 *
 * WScript.Shell COM nesnesi ile .lnk dosyası oluşturur. Hub agent'ın `/api/exec`
 * endpoint'ine gider.
 *
 * ⚠ Agent JSON parser kısıtlaması: komut içinde çift tırnak KULLANILMAZ.
 *   Tüm string literal'lar single-quote ile yazılır.
 */

/** PowerShell single-quoted string için ' karakterini '' yapar. */
function psQuote(s: string): string {
  return (s ?? "").replace(/'/g, "''")
}

/**
 * Verilen yola bir .lnk kısayolu oluşturur.
 *
 * @param shortcutPath  Kısayol dosyasının tam yolu (.lnk uzantılı, ör. C:\...\Program.lnk)
 * @param targetPath    Hedef exe veya klasör yolu (yerel veya UNC)
 */
export function buildCreateShortcut(shortcutPath: string, targetPath: string): string {
  const sc = psQuote(shortcutPath)
  const tg = psQuote(targetPath)
  return [
    `$ws = New-Object -comObject WScript.Shell`,
    `$lnk = $ws.CreateShortcut('${sc}')`,
    `$lnk.TargetPath = '${tg}'`,
    `$lnk.Save()`,
    `Write-Output 'OK'`,
  ].join("; ")
}

/**
 * Windows dosya/klasör adında geçersiz olan karakterleri _ ile değiştirir.
 * Boşluklar korunur (Windows'ta geçerli).
 */
export function sanitizeWindowsName(name: string): string {
  return (name ?? "").replace(/[\\/:*?"<>|]/g, "_").trim()
}
