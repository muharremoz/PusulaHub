# PusulaHub - "Baglanti Testi" masaustu kisayolu
#
# Zamanlanmis gorev (SYSTEM, her oturum acilisinda) tarafindan calistirilir.
# Firma kullanicilarinin (C:\Users\<firma>.<kullanici>) masaustunde kisayol
# yoksa olusturur. Ortak masaustu (Public\Desktop) kullanilamaz: firma
# kullanicilarinda NoCommonGroups ilkesi acik, ortak ogeler gorunmez.
#
# NOT: Dosya ASCII - PowerShell 5.1 BOM'suz UTF-8'i ANSI okuyor; Turkce
# karakterler [char] ile uretilir.

$ErrorActionPreference = 'Stop'
$hedef = 'C:\Program Files\Pusula\BaglantiTesti\PusulaBaglantiTesti.exe'
$ad = 'Ba' + [char]0x011F + 'lant' + [char]0x0131 + ' Testi.lnk'
$aciklama = 'Pusula Ba' + [char]0x011F + 'lant' + [char]0x0131 + ' Testi'
$log = Join-Path $env:ProgramData 'Pusula\baglanti-testi-kisayol.log'

function Yaz([string]$m) {
  try {
    if ((Test-Path $log) -and (Get-Item $log).Length -gt 1MB) { Remove-Item $log -Force }
    Add-Content -Path $log -Value ((Get-Date).ToString('yyyy-MM-dd HH:mm:ss') + '  ' + $m)
  } catch { }
}

if (-not (Test-Path -LiteralPath $hedef)) { Yaz ('program yok: ' + $hedef); return }

$ws = New-Object -ComObject WScript.Shell
$yeni = 0; $var = 0; $hata = 0
foreach ($pr in Get-ChildItem 'C:\Users' -Directory | Where-Object { $_.Name -match '^[0-9]+\.' }) {
  $masaustu = Join-Path $pr.FullName 'Desktop'
  if (-not (Test-Path -LiteralPath $masaustu)) { continue }
  $lnk = Join-Path $masaustu $ad
  if (Test-Path -LiteralPath $lnk) { $var++; continue }
  try {
    $k = $ws.CreateShortcut($lnk)
    $k.TargetPath = $hedef
    $k.WorkingDirectory = Split-Path $hedef
    $k.IconLocation = $hedef + ',0'
    $k.Description = $aciklama
    $k.Save()
    $yeni++
  } catch { $hata++; Yaz ('HATA ' + $pr.Name + ': ' + $_.Exception.Message) }
}
if ($yeni -or $hata) { Yaz ('ozet: yeni=' + $yeni + ' var=' + $var + ' hata=' + $hata) }
Write-Output ('yeni=' + $yeni + ' var=' + $var + ' hata=' + $hata)
