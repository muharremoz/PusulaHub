/**
 * Firma kurulum sihirbazı — dosya sistemi PowerShell komut üreticileri.
 *
 * Hub agent'ın `/api/exec` endpoint'ine gider. `ad-powershell.ts` ile aynı
 * kısıtlamaya tabidir:
 *
 *   ⚠ Agent'ın JSON parser'ı (basit regex) `"command":"..."` içinde JSON
 *     escape'lerini anlamıyor. Bu yüzden **çift tırnak KULLANILMAZ**:
 *     bütün string literal'lar single-quote, interpolasyonlar `'foo' + $var`
 *     ile yapılır.
 *
 * Her komut idempotent: ikinci çalıştırmada hata vermez. Başarı durumunda
 * stdout'a `OK` / `COPIED` / `UPDATED` / `SKIPPED` yazılır.
 */

/** PowerShell single-quoted string için ' karakterini '' yapar. */
function psQuote(s: string): string {
  return (s ?? "").replace(/'/g, "''")
}

/* ── Klasör oluştur (idempotent) ────────────────────────────────────── */
export function buildCreateDir(absolutePath: string): string {
  const p = psQuote(absolutePath)
  return [
    `$p='${p}'`,
    `if(-not (Test-Path -LiteralPath $p)){New-Item -Path $p -ItemType Directory -Force | Out-Null}`,
    `Write-Output 'OK'`,
  ].join("; ")
}

/* ── Klasör içeriğini kopyala (robocopy) ────────────────────────────── */
/**
 * Kaynak klasör varsa içeriği (alt klasörler dahil) hedef klasöre kopyalanır.
 * Robocopy exit code'u:
 *   0-7  → başarı / kısmi başarı (dosya kopyalandı/aynıydı)
 *   8+   → gerçek hata
 * /XJ ile junction/symlink atlanır (eski uygulama ile uyum).
 * /NFL /NDL /NJH /NJS → log sessizliği için.
 */
export function buildCopyFolder(sourcePath: string, destinationPath: string): string {
  const src = psQuote(sourcePath)
  const dst = psQuote(destinationPath)
  return [
    `$src='${src}'`,
    `$dst='${dst}'`,
    `if(-not (Test-Path -LiteralPath $src)){throw ('Kaynak klasor bulunamadi: ' + $src)}`,
    `if(-not (Test-Path -LiteralPath $dst)){New-Item -Path $dst -ItemType Directory -Force | Out-Null}`,
    `$null = robocopy $src $dst /E /XJ /NFL /NDL /NJH /NJS /R:1 /W:1`,
    `if($LASTEXITCODE -lt 8){$global:LASTEXITCODE=0; Write-Output 'COPIED'} else {throw ('robocopy exit: ' + $LASTEXITCODE)}`,
  ].join("; ")
}

/* ── NTFS yetkilerini ayarla (icacls) ────────────────────────────────── */
/**
 * Eski uygulama ile birebir aynı set:
 *   inheritance:r      → mirasla gelen izinler kaldırılır
 *   CREATOR OWNER: F   → (OI)(CI) tam yetki
 *   SYSTEM: F          → (OI)(CI) tam yetki
 *   {securityGroup}: F → (OI)(CI) tam yetki
 *   Administrators: F  → (OI)(CI) tam yetki
 * /T → alt klasörler dahil
 */
export function buildSetNtfsPermissions(path: string, securityGroup: string): string {
  const p = psQuote(path)
  const g = psQuote(securityGroup)
  return [
    `$p='${p}'`,
    `$null = icacls $p /inheritance:r`,
    `if($LASTEXITCODE -ne 0){throw ('icacls inheritance exit: ' + $LASTEXITCODE)}`,
    `$null = icacls $p /grant 'CREATOR OWNER:(OI)(CI)F' /grant 'SYSTEM:(OI)(CI)F' /grant '${g}:(OI)(CI)F' /grant 'Administrators:(OI)(CI)F' /T /C`,
    `if($LASTEXITCODE -ne 0){throw ('icacls grant exit: ' + $LASTEXITCODE)}`,
    `$global:LASTEXITCODE=0`,
    `Write-Output 'OK'`,
  ].join("; ")
}

/* ── Parametre TXT dosyasında [DATA KODU] satırını güncelle ─────────── */
/**
 * Eski uygulama ile aynı davranış:
 *   - Dosya yoksa: SKIPPED (hata değil, devam et)
 *   - Dosyada `[DATA KODU]` ile başlayan satır varsa: satırı `[DATA KODU] {firmaId}` ile değiştir
 *   - Satır yoksa: dosyanın sonuna `[DATA KODU] {firmaId}` ekle
 *   - UTF-8 ile yazılır
 */
export function buildUpdateParamTxt(paramFilePath: string, firmaId: string): string {
  const f = psQuote(paramFilePath)
  const id = psQuote(firmaId)
  return [
    `$f='${f}'`,
    `if(-not (Test-Path -LiteralPath $f)){Write-Output 'SKIPPED'} else {` +
      `$target = '[DATA KODU] ${id}'; ` +
      `$lines = Get-Content -LiteralPath $f -Encoding UTF8; ` +
      `$updated = $false; ` +
      `$out = foreach($line in $lines){if($line -match '^\\[DATA KODU\\]'){$updated = $true; $target} else {$line}}; ` +
      `if(-not $updated){$out = @($out) + @($target)}; ` +
      `Set-Content -LiteralPath $f -Value $out -Encoding UTF8; ` +
      `Write-Output 'UPDATED'` +
    `}`,
  ].join("; ")
}
