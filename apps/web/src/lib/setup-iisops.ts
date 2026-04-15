/**
 * Firma kurulum sihirbazı — IIS sitesi PowerShell komut üreticileri.
 *
 * `setup-fileops.ts` ile aynı kısıtlamaya tabidir:
 *   ⚠ Agent'ın JSON parser'ı (basit regex) `"command":"..."` içinde JSON
 *     escape'lerini anlamıyor. Bu yüzden **çift tırnak KULLANILMAZ**:
 *     bütün string literal'lar single-quote, interpolasyonlar `'foo' + $var`
 *     ile yapılır.
 */

/** PowerShell single-quoted string için ' karakterini '' yapar. */
function psQuote(s: string): string {
  return (s ?? "").replace(/'/g, "''")
}

/* ── Bir dosyanın içinde placeholder'ları replace et ─────────────────── */
/**
 * Hedefteki config dosyasında verilen anahtar/değer eşlemelerini sırayla
 * replace eder. Eski uygulama ile uyumlu basit string replace (regex değil).
 *
 * - Dosya yoksa: hata (config olmazsa site çalışmaz)
 * - UTF-8 ile okur, UTF-8 ile yazar
 * - Tüm anahtarlar string olarak değiştirilir
 *
 * @param filePath  hedef config dosyası (örn C:\inetpub\wwwroot\rfid_A001\appsettings.json)
 * @param replacements örn { '{firmaKod}': 'A001', '{port}': '8001' }
 */
export function buildReplaceInFile(filePath: string, replacements: Record<string, string>): string {
  const f = psQuote(filePath)
  const lines: string[] = [
    `$f='${f}'`,
    `if(-not (Test-Path -LiteralPath $f)){throw ('Config dosyasi bulunamadi: ' + $f)}`,
    `$c = Get-Content -LiteralPath $f -Raw -Encoding UTF8`,
  ]
  for (const [key, val] of Object.entries(replacements)) {
    const k = psQuote(key)
    const v = psQuote(val)
    lines.push(`$c = $c.Replace('${k}', '${v}')`)
  }
  lines.push(`Set-Content -LiteralPath $f -Value $c -Encoding UTF8 -NoNewline`)
  lines.push(`Write-Output 'UPDATED'`)
  return lines.join("; ")
}

/* ── IIS sitesi oluştur (idempotent) ─────────────────────────────────── */
/**
 * WebAdministration modülü kullanır. Site varsa yeniden oluşturmaz, sadece
 * binding/path günceller. Yoksa New-Website ile oluşturur. App pool yok —
 * default app pool kullanılır.
 *
 * @param siteName     IIS site adı (örn RFID_A001)
 * @param physicalPath fiziksel klasör (örn C:\inetpub\wwwroot\rfid_a001)
 * @param port         dinleyeceği TCP port
 */
export function buildCreateIisSite(siteName: string, physicalPath: string, port: number): string {
  const n = psQuote(siteName)
  const p = psQuote(physicalPath)
  return [
    `Import-Module WebAdministration -ErrorAction Stop`,
    `$name='${n}'`,
    `$path='${p}'`,
    `$port=${port}`,
    `if(-not (Test-Path -LiteralPath $path)){throw ('Site klasoru bulunamadi: ' + $path)}`,
    `$existing = Get-Website | Where-Object { $_.Name -eq $name }`,
    `if($existing){` +
      `try{Set-ItemProperty -Path ('IIS:\\Sites\\' + $name) -Name physicalPath -Value $path -ErrorAction Stop}catch{}; ` +
      `try{$existing.Bindings.Collection.Clear()}catch{}; ` +
      `try{New-WebBinding -Name $name -Protocol http -Port $port -IPAddress * -ErrorAction Stop | Out-Null}catch{}; ` +
      `$result='EXISTS'` +
    `} else {` +
      `New-Website -Name $name -PhysicalPath $path -Port $port -Force | Out-Null; ` +
      `$result='CREATED'` +
    `}`,
    // Önce app pool'u başlat (site start'ın başarılı olması için gerekli)
    `try{` +
      `$poolName = (Get-ItemProperty -Path ('IIS:\\Sites\\' + $name) -Name applicationPool -ErrorAction Stop).Value; ` +
      `if($poolName){` +
        `$poolState = (Get-WebAppPoolState -Name $poolName -ErrorAction Stop).Value; ` +
        `if($poolState -ne 'Started'){Start-WebAppPool -Name $poolName -ErrorAction Stop | Out-Null}` +
      `}` +
    `}catch{}`,
    // Site'ı başlat — zaten çalışıyorsa atla
    `try{` +
      `$siteState = (Get-WebsiteState -Name $name -ErrorAction Stop).Value; ` +
      `if($siteState -ne 'Started'){Start-Website -Name $name -ErrorAction Stop | Out-Null}` +
    `}catch{}`,
    // Durumu doğrula — hâlâ Stopped ise hata fırlat (gerçek problem varsa göster)
    `Start-Sleep -Milliseconds 500`,
    `$finalState = (Get-WebsiteState -Name $name -ErrorAction SilentlyContinue).Value`,
    `if($finalState -eq 'Stopped'){throw ('Site olusturuldu ama baslatilamadi: ' + $name + ' (port ' + $port + ' kullaniliyor olabilir)')}`,
    // PowerShell error stream'ini temizle (eski yakalanan hatalar stderr'e sızmasın)
    `$Error.Clear()`,
    `$global:LASTEXITCODE=0`,
    `Write-Output ($result + ':' + $finalState)`,
  ].join("; ")
}
