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

/* ── firmano.bak (Firmano.exe'nin ürettiği dosya) ───────────────────── */
/**
 * Program klasörüne `firmano.bak` yazar — eskiden `Firmano.exe` ile elle
 * üretiliyordu (VB6, 2012). Biçimi 12 gerçek dosyadan çözüldü:
 *
 *   düz metin = <hedef sürücünün birim seri numarası, ondalık> + <firmaId, 7 hane sıfır dolgulu>
 *   şifreli   = her karakterin ASCII değerine KONUM numarası eklenir (1'den başlar)
 *   dosya     = şifreli metin + CRLF, ASCII
 *
 * Örnek: Terminal 1'in C: seri numarası 11109701, firma 2101 →
 * düz metin `111097010002101` → dosya `2344>=799:;>>>@` + CRLF.
 *
 * Seri numarası **hedef sürücüye** bağlıdır: dosya başka bir makineye
 * kopyalanırsa geçersiz olur, her sunucuda yeniden üretilmelidir.
 * VB Long (işaretli 32 bit) olarak yazılır — 0x7FFFFFFF üstü seriler negatif
 * görünür; eski örneklerde `-1539651687` gibi değerler bu yüzden var.
 */
export function buildWriteFirmanoBak(targetDir: string, firmaId: string): string {
  const d = psQuote(targetDir)
  const f = psQuote(firmaId)
  return [
    `$dir='${d}'`,
    `$firma='${f}'`,
    `if(-not (Test-Path -LiteralPath $dir)){throw ('Klasor bulunamadi: ' + $dir)}`,
    // Hedef klasörün sürücüsü (ör. 'C:')
    `$surucu=([IO.Path]::GetPathRoot((Resolve-Path -LiteralPath $dir).Path)).Substring(0,2)`,
    `$vol=Get-CimInstance Win32_LogicalDisk | Where-Object { $_.DeviceID -eq $surucu }`,
    `if(-not $vol -or -not $vol.VolumeSerialNumber){throw ('Birim seri numarasi okunamadi: ' + $surucu)}`,
    // VB Long ile aynı: işaretli 32 bit
    `$seri=[string][BitConverter]::ToInt32([BitConverter]::GetBytes([Convert]::ToUInt32($vol.VolumeSerialNumber,16)),0)`,
    `$dolgu='0000000' + $firma`,
    `$duz=$seri + $dolgu.Substring($dolgu.Length - 7)`,
    `$sb=New-Object System.Text.StringBuilder`,
    `for($i=0; $i -lt $duz.Length; $i++){ [void]$sb.Append([char]([int][char]$duz[$i] + $i + 1)) }`,
    `$yol=Join-Path $dir 'firmano.bak'`,
    `[IO.File]::WriteAllText($yol, $sb.ToString() + [char]13 + [char]10, [Text.Encoding]::ASCII)`,
    `Write-Output ('WRITTEN seri=' + $seri + ' ' + (Get-Item -LiteralPath $yol).Length + ' bayt')`,
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

/* ── Klasöre desktop.ini yaz + InfoTip olarak firma adını göster ────── */
/**
 * Klasöre tooltip (hover'da görünen açıklama) ekler:
 *   1) desktop.ini dosyası yazılır: [.ShellClassInfo] InfoTip=<firmaAdi>
 *   2) Dosyaya +sh (system + hidden) atanır
 *   3) Klasöre +s (system) atanır → Explorer desktop.ini'yi okur
 * Unicode Türkçe karakter için UTF-16 LE (ShellClassInfo resmi olarak Unicode bekler).
 */
export function buildWriteDesktopIni(folderPath: string, infoTip: string): string {
  const p  = psQuote(folderPath)
  const it = psQuote(infoTip)
  return [
    `$p='${p}'`,
    `if(-not (Test-Path -LiteralPath $p)){throw ('Klasor bulunamadi: ' + $p)}`,
    `$ini = Join-Path -Path $p -ChildPath 'desktop.ini'`,
    `$content = '[.ShellClassInfo]' + [Environment]::NewLine + 'InfoTip=${it}' + [Environment]::NewLine`,
    // Varsa attrib kaldır (yeniden yazabilmek için)
    `if(Test-Path -LiteralPath $ini){$null = attrib -s -h -r $ini 2>$null}`,
    `[System.IO.File]::WriteAllText($ini, $content, [System.Text.Encoding]::Unicode)`,
    `$null = attrib +s +h $ini`,
    `$null = attrib +s $p`,
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

/* ── Perakende parametre dosyası — <DATAKODU> bloğu (istisnai biçim) ──── */
/**
 * Perakende (programCode 909) programının parametre dosyasında data kodu,
 * diğer programlardaki `[DATA KODU] <id>` satırı yerine XML-tarzı bir blokla
 * tutulur:
 *
 *   <DATAKODU>
 *   <firmaId>
 *   </DATAKODU>
 *
 * Değer yine firmaId'dir (diğer programlarla aynı kaynak). Yalnızca BİÇİM
 * farklıdır. Dosyada var olan blok güncellenir; yoksa dosya sonuna eklenir.
 * Çift tırnak yasak → satır sonu için [char]13/[char]10 kullanılır.
 */
export function buildUpdateDataKoduXml(paramFilePath: string, firmaId: string): string {
  const f = psQuote(paramFilePath)
  const id = psQuote(firmaId)
  return [
    `$f='${f}'`,
    `if(-not (Test-Path -LiteralPath $f)){Write-Output 'SKIPPED'} else {` +
      `$nl = [string]([char]13) + [string]([char]10); ` +
      `$blk = '<DATAKODU>' + $nl + '${id}' + $nl + '</DATAKODU>'; ` +
      `$c = Get-Content -LiteralPath $f -Raw -Encoding UTF8; ` +
      `if($c -match '(?si)<DATAKODU>.*?</DATAKODU>'){` +
        `$c = [regex]::Replace($c, '(?si)<DATAKODU>.*?</DATAKODU>', $blk); ` +
        `Set-Content -LiteralPath $f -Value $c -NoNewline -Encoding UTF8; ` +
        `Write-Output 'UPDATED'` +
      `} else {` +
        `$c = $c.TrimEnd() + $nl + $blk + $nl; ` +
        `Set-Content -LiteralPath $f -Value $c -NoNewline -Encoding UTF8; ` +
        `Write-Output 'ADDED'` +
      `}` +
    `}`,
  ].join("; ")
}
