/**
 * Firmanın terminal (RDP) sunucusunu değiştirme — PowerShell komut üreticileri.
 *
 * Akış (bkz. /api/companies/[firkod]/terminal-degistir):
 *   1) ön kontrol: eski klasör (boyut, dosya, firmano.bak'lı alt klasörler), hedefte klasör var mı,
 *      hedeften eskiye SMB erişimi, firmanın eski sunucuda açık oturumu
 *   2) HEDEF ajanı eski sunucunun C$\MUSTERI\<firma> klasörünü robocopy ile çeker — arka plan
 *      süreci (uzun sürebilir; ajan exec 60 sn), Hub ilerlemeyi log'dan yoklar
 *   3) firmano.bak hedef sürücünün seri numarasıyla yeniden üretilir (kopyası geçersizdir)
 *   4) NTFS yetkileri + desktop.ini, 5) atama değişir, 6) eski klasör yeniden adlandırılır (silinmez)
 *
 * Agent exec kuralları (setup-fileops.ts ile aynı): çift tırnak YOK, ^ YOK, tek satır.
 * Şifre içeren betik base64 ile taşınır — tırnak/özel karakter derdi olmaz. JSON çıktılar da 'B64:' önekli
 * base64'tür: ajan çıktısı konsol kod sayfasından geçer, Türkçe yol adları (MUSTERILER\HOLLANDA ÖZKAN) bozuluyordu.
 */

const psQuote = (s: string) => (s ?? "").replace(/'/g, "''")

export const firmaKlasoru = (firkod: string) => `C:\\MUSTERI\\${firkod}`
const isBase = (firkod: string) => `C:\\Windows\\Temp\\pusula-tasima-${firkod.replace(/[^A-Za-z0-9_-]/g, "")}`
/** Hedefte "bu klasörü Hub taşıması oluşturdu" işareti — yarıda kalan taşıma yeniden başlatılabilir. */
const ISARET = ".pusula-tasima"

/** Eski sunucuda: klasör özeti (JSON). Admin masaüstündeki MUSTERILER\<ad> klasörü desktop.ini InfoTip=firkod ile bulunur. */
export function buildKaynakOzeti(firkod: string): string {
  const k = psQuote(firmaKlasoru(firkod))
  const f = psQuote(firkod)
  return [
    `$k='${k}'`,
    `$f='${f}'`,
    `$var = Test-Path -LiteralPath $k`,
    `$dosya = 0; $bayt = [long]0; $alt = @(); $fb = @()`,
    `if($var){ Get-ChildItem -LiteralPath $k -Recurse -File -Force -EA SilentlyContinue | ForEach-Object { $dosya++; $bayt += $_.Length }; $alt = @(Get-ChildItem -LiteralPath $k -Directory -Force -EA SilentlyContinue | ForEach-Object { $_.Name }); $fb = @(Get-ChildItem -LiteralPath $k -Directory -Force -EA SilentlyContinue | Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName 'firmano.bak') } | ForEach-Object { $_.Name }) }`,
    `$ms = $null; $mk = 'C:\\Users\\Administrator\\Desktop\\MUSTERILER'`,
    `if(Test-Path -LiteralPath $mk){ foreach($d in Get-ChildItem -LiteralPath $mk -Directory -Force -EA SilentlyContinue){ $ini = Join-Path $d.FullName 'desktop.ini'; if((Test-Path -LiteralPath $ini) -and ((Get-Content -LiteralPath $ini -Raw -EA SilentlyContinue) -match ('InfoTip=' + [regex]::Escape($f) + '\\s*$'))){ $ms = $d.FullName; break } } }`,
    `[pscustomobject]@{ var = $var; dosya = $dosya; bayt = $bayt; alt = $alt; firmanoBak = $fb; masaustu = $ms } | ConvertTo-Json -Compress | ForEach-Object { 'B64:' + [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($_)) }`,
  ].join("; ")
}

/** Hedef sunucuda: klasör durumu + eski sunucuya SMB erişimi (net use ile denenir, hemen bırakılır). */
export function buildHedefOzeti(firkod: string, kaynakIp: string, kullanici: string | null, sifre: string | null): string {
  const k = psQuote(firmaKlasoru(firkod))
  const unc = psQuote(`\\\\${kaynakIp}\\C$`)
  const betik = [
    `$k='${k}'`,
    `$var = Test-Path -LiteralPath $k`,
    `$oge = 0; if($var){ $oge = @(Get-ChildItem -LiteralPath $k -Force -EA SilentlyContinue | Where-Object { $_.Name -ne '${ISARET}' }).Count }`,
    `$isaret = $var -and (Test-Path -LiteralPath (Join-Path $k '${ISARET}'))`,
    `$unc = '${unc}'`,
    kullanici
      ? `$null = net use $unc /delete /y 2>&1; $null = net use $unc '${psQuote(sifre ?? "")}' /user:'${psQuote(kullanici)}' 2>&1; $bag = $LASTEXITCODE`
      : `$bag = 0`,
    `$eris = Test-Path -LiteralPath ($unc + '\\MUSTERI\\${psQuote(firkod)}')`,
    kullanici ? `$null = net use $unc /delete /y 2>&1` : ``,
    `$c = Get-CimInstance Win32_LogicalDisk -Filter 'DeviceID=''C:'''`,
    `[pscustomobject]@{ var = $var; oge = $oge; isaret = $isaret; smb = $eris; netUse = $bag; bosBayt = [long]$c.FreeSpace } | ConvertTo-Json -Compress | ForEach-Object { 'B64:' + [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($_)) }`,
  ].filter(Boolean).join("; ")
  return base64Calistir(betik)
}

/**
 * Hedef sunucuda kopyayı ARKA PLANDA başlatır: betik C:\Windows\Temp'e yazılır, ayrı süreçle çalışır,
 * bitince .sonuc dosyasına robocopy çıkış kodunu yazar ve kendini (şifre içerdiği için) siler.
 * Admin masaüstündeki MUSTERILER\<ad> klasörü (kısayollar) de taşınır — hedefleri C:\MUSTERI\... aynı kalır.
 */
export function buildKopyaBaslat(firkod: string, kaynakIp: string, kullanici: string | null, sifre: string | null, masaustu: string | null): string {
  const b = isBase(firkod)
  const k = firmaKlasoru(firkod)
  const unc = `\\\\${kaynakIp}\\C$`
  const kaynak = `${unc}\\MUSTERI\\${firkod}`
  const satirlar = [
    `$ErrorActionPreference = 'Continue'`,
    `$unc = '${psQuote(unc)}'`,
    kullanici ? `$null = net use $unc /delete /y 2>&1; $null = net use $unc '${psQuote(sifre ?? "")}' /user:'${psQuote(kullanici)}' 2>&1` : ``,
    `New-Item -ItemType Directory -Force -Path '${psQuote(k)}' | Out-Null`,
    `Set-Content -LiteralPath '${psQuote(k)}\\${ISARET}' -Value ((Get-Date).ToString('s') + ' ${psQuote(kaynakIp)}')`,
    // /COPY:DAT: veri+öznitelik+zaman (ACL değil — yetkiler sonra firmaya göre yeniden verilir)
    `robocopy '${psQuote(kaynak)}' '${psQuote(k)}' /E /COPY:DAT /DCOPY:DAT /XJ /R:2 /W:2 /MT:16 /NP /NDL /NJH /BYTES /XF firmano.bak /LOG:'${psQuote(b)}.log' | Out-Null`,
    `$rc = $LASTEXITCODE`,
    masaustu
      ? `$ms = '${psQuote(masaustu.replace(/^C:/i, unc))}'; $mh = '${psQuote(masaustu)}'; if(Test-Path -LiteralPath $ms){ robocopy $ms $mh /E /COPY:DAT /DCOPY:DAT /R:1 /W:1 /NP /NJH /NJS | Out-Null }`
      : ``,
    kullanici ? `$null = net use $unc /delete /y 2>&1` : ``,
    `Set-Content -LiteralPath '${psQuote(b)}.sonuc' -Value $rc`,
    `Remove-Item -LiteralPath $PSCommandPath -Force -EA SilentlyContinue`,
  ].filter(Boolean)
  const icerik = Buffer.from(satirlar.join("\r\n"), "utf8").toString("base64")
  return [
    `$b='${psQuote(b)}'`,
    `Remove-Item -LiteralPath ($b + '.log'), ($b + '.sonuc') -Force -EA SilentlyContinue`,
    `[IO.File]::WriteAllText($b + '.ps1', [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${icerik}')), (New-Object Text.UTF8Encoding $true))`,
    `$p = Start-Process powershell.exe -ArgumentList ('-NoProfile -ExecutionPolicy Bypass -File ' + $b + '.ps1') -WindowStyle Hidden -PassThru`,
    `Write-Output ('STARTED ' + $p.Id)`,
  ].join("; ")
}

/** Kopyanın durumu: bitti mi (çıkış kodu), kaç dosya yazıldı (log satırları). */
export function buildKopyaDurumu(firkod: string): string {
  const b = psQuote(isBase(firkod))
  return [
    `$b='${b}'`,
    `$rc = $null; if(Test-Path -LiteralPath ($b + '.sonuc')){ $rc = [int]((Get-Content -LiteralPath ($b + '.sonuc') -Raw).Trim()) }`,
    `$n = 0; if(Test-Path -LiteralPath ($b + '.log')){ $n = @(Select-String -LiteralPath ($b + '.log') -Pattern 'New File|Newer|Older|Changed' -EA SilentlyContinue).Count }`,
    `$hata = @(); if(Test-Path -LiteralPath ($b + '.log')){ $hata = @(Select-String -LiteralPath ($b + '.log') -Pattern 'ERROR ' -EA SilentlyContinue | Select-Object -First 5 | ForEach-Object { $_.Line.Trim() }) }`,
    `[pscustomobject]@{ bitti = ($rc -ne $null); rc = $rc; dosya = $n; hata = $hata } | ConvertTo-Json -Compress | ForEach-Object { 'B64:' + [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($_)) }`,
  ].join("; ")
}

/** Hedefte doğrulama: dosya sayısı + toplam boyut (firmano.bak hariç — yeniden üretilir). */
export function buildHedefSay(firkod: string): string {
  const k = psQuote(firmaKlasoru(firkod))
  return [
    `$k='${k}'`,
    `$n = 0; $bayt = [long]0`,
    `Get-ChildItem -LiteralPath $k -Recurse -File -Force -EA SilentlyContinue | Where-Object { $_.Name -ne 'firmano.bak' -and $_.Name -ne '${ISARET}' } | ForEach-Object { $n++; $bayt += $_.Length }`,
    `[pscustomobject]@{ dosya = $n; bayt = $bayt } | ConvertTo-Json -Compress | ForEach-Object { 'B64:' + [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($_)) }`,
  ].join("; ")
}

/** Eski sunucuda: klasörü ve masaüstü kısayol klasörünü yeniden adlandırır (silmez). Açık dosya varsa hata verir. */
export function buildEskiyiAdlandir(firkod: string, masaustu: string | null, ek: string): string {
  const k = psQuote(firmaKlasoru(firkod))
  // Masaüstü klasör adı firma adıdır (Türkçe karakter) → base64 ile
  return base64Calistir([
    `$k='${k}'`,
    `if(Test-Path -LiteralPath $k){ Rename-Item -LiteralPath $k -NewName ('${psQuote(firkod)}' + '${psQuote(ek)}') -ErrorAction Stop }`,
    masaustu ? `$m='${psQuote(masaustu)}'; if(Test-Path -LiteralPath $m){ Rename-Item -LiteralPath $m -NewName ((Split-Path $m -Leaf) + '${psQuote(ek)}') -EA SilentlyContinue }` : ``,
    `Write-Output 'OK'`,
  ].filter(Boolean).join("; "))
}

/** Betiği base64 ile çalıştırır (şifre gibi özel karakterli değerler için). */
function base64Calistir(betik: string): string {
  const b64 = Buffer.from(betik, "utf8").toString("base64")
  return `Invoke-Expression ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${b64}')))`
}

export const TASIMA_ISARETI = ISARET
