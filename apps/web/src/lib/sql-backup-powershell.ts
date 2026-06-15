/**
 * SQL yedek dosyası tarama için PowerShell komut üreticileri.
 *
 * PusulaAgent'ın `/api/exec` endpoint'ine gönderilecek komutları üretir.
 * Agent JSON parser'ı çift tırnakları bozduğu için (bkz. ad-powershell.ts
 * başındaki not), tüm string'ler tek tırnak + concat ile yazılır.
 */

/** PowerShell single-quoted string için ' karakterini '' yapar. */
function psQuote(s: string): string {
  return (s ?? "").replace(/'/g, "''")
}

/**
 * Verilen klasördeki `*.bak` dosyalarını listeler.
 *
 * Çıktı: tek satır JSON array (ConvertTo-Json -Compress), her eleman:
 *   { Name: string, Length: number, LastWriteTime: string (ISO) }
 *
 * Klasör yoksa veya hiç dosya yoksa boş array `[]` döner.
 *
 * Not: PS 5.1 tek elemanlı array'i ConvertTo-Json ile tek obje yapar —
 * parse tarafında (parseBackupListOutput) hem obje hem array kabul edilir.
 */
export function buildListBackupFiles(folderPath: string): string {
  const p = psQuote(folderPath)
  return [
    `$ErrorActionPreference = 'SilentlyContinue'`,
    `if (-not (Test-Path -LiteralPath '${p}')) { Write-Output '[]'; return }`,
    // .bak (restore) + .mdf/.ldf (attach) dosyalarını tara — Extension çıktıya eklenir.
    `$items = Get-ChildItem -LiteralPath '${p}' -File -Force | Where-Object { @('.bak','.mdf','.ldf') -contains $_.Extension.ToLower() }`,
    `$arr = @($items | ForEach-Object { [PSCustomObject]@{ Name = $_.Name; Length = $_.Length; LastWriteTime = $_.LastWriteTime.ToString('o'); Extension = $_.Extension.ToLower() } })`,
    `if ($arr.Count -eq 0) { Write-Output '[]' } else { $arr | ConvertTo-Json -Compress }`,
  ].join("; ")
}

/** Agent exec'inden dönen stdout'u parse eder ve normalize array'e çevirir. */
export interface RawBackupItem {
  Name:          string
  Length:        number
  LastWriteTime: string
  /** ".bak" | ".mdf" | ".ldf" — eski agent çıktısında olmayabilir (undefined). */
  Extension?:    string
}

export function parseBackupListOutput(stdout: string): RawBackupItem[] {
  const trimmed = (stdout ?? "").trim()
  if (!trimmed) return []
  try {
    const parsed = JSON.parse(trimmed)
    if (Array.isArray(parsed)) return parsed as RawBackupItem[]
    if (parsed && typeof parsed === "object") return [parsed as RawBackupItem]
    return []
  } catch {
    return []
  }
}

/**
 * Verilen yol listesinin her biri için dosyanın varlığını/boyutunu döner.
 *
 * Çıktı: JSON array, her eleman `{ Path, Exists, Length }`.
 * Dosya yoksa Exists=false, Length=0.
 *
 * Agent JSON parser'ı çift tırnakları bozduğu için yalnızca tek tırnak ile
 * yazılır. `$pathsN` değişkenleri üzerinden scriptblock kullanılır.
 */
export function buildCheckFilesExist(paths: string[]): string {
  const quoted = paths.map((p) => `'${psQuote(p)}'`).join(",")
  return [
    `$ErrorActionPreference = 'SilentlyContinue'`,
    `$paths = @(${quoted})`,
    `$result = @($paths | ForEach-Object { $p = $_; if (Test-Path -LiteralPath $p -PathType Leaf) { $i = Get-Item -LiteralPath $p -Force; [PSCustomObject]@{ Path = $p; Exists = $true; Length = $i.Length } } else { [PSCustomObject]@{ Path = $p; Exists = $false; Length = 0 } } })`,
    `if ($result.Count -eq 0) { Write-Output '[]' } else { $result | ConvertTo-Json -Compress }`,
  ].join("; ")
}

/**
 * ATTACH için ham .mdf (+ varsa .ldf) dosyalarını hedef klasöre yeni adla
 * kopyalayan PowerShell. SQL Server'ın FOR ATTACH yapabilmesi için dosyaların
 * `D:\SQLData\{firmaId}` altında, hedef DB adıyla durması gerekir.
 *
 *   srcMdf → destDir\{targetDb}.mdf
 *   srcLdf → destDir\{targetDb}.ldf   (srcLdf verilmişse)
 *
 * Hedef klasör yoksa oluşturulur. Var olan hedef dosyaların üzerine yazar
 * (-Force) — sihirbaz tekrar çalıştığında idempotent. Çıktı: 'OK' veya hata.
 */
export function buildCopyAttachFiles(opts: {
  srcMdf:   string
  srcLdf?:  string
  destDir:  string
  destMdf:  string   // sadece dosya adı (örn. 343_AsyaData.mdf)
  destLdf?: string
}): string {
  const sm = psQuote(opts.srcMdf)
  const dd = psQuote(opts.destDir)
  const dm = psQuote(opts.destMdf)
  const lines = [
    `$ErrorActionPreference = 'Stop'`,
    `if (-not (Test-Path -LiteralPath '${sm}')) { throw ('MDF bulunamadi: ' + '${sm}') }`,
    `if (-not (Test-Path -LiteralPath '${dd}')) { New-Item -ItemType Directory -Path '${dd}' -Force | Out-Null }`,
    `Copy-Item -LiteralPath '${sm}' -Destination (Join-Path '${dd}' '${dm}') -Force`,
  ]
  if (opts.srcLdf && opts.destLdf) {
    const sl = psQuote(opts.srcLdf)
    const dl = psQuote(opts.destLdf)
    lines.push(
      `if (Test-Path -LiteralPath '${sl}') { Copy-Item -LiteralPath '${sl}' -Destination (Join-Path '${dd}' '${dl}') -Force }`,
    )
  }
  lines.push(`Write-Output 'OK'`)
  return lines.join("; ")
}

/**
 * "Eski Datalar" restore'u için: Depo sunucusundaki bir .bak dosyasını SQL
 * sunucusunun yerel diskine kimlik-doğrulamalı kopyalar.
 *
 * SQL sunucusunun agent'ı (LocalSystem) Depo admin share'ine doğrudan
 * erişemiyor → önce Depo'nun Windows credential'ı ile `net use` mount edilir,
 * .bak yerele kopyalanır, mount kaldırılır. RESTORE bu yerel kopyadan yapılır
 * (SQL servis hesabı yereli her zaman okuyabilir; UNC'yi okuyamaz).
 *
 *   \\{depoIp}\d$\Eski Datalar\{firmaId}\{fileName}  →  {destDir}\{fileName}
 *
 * Çift tırnak yasak (agent JSON parser) → tek tırnak + concat. Backslash'ler
 * tek; execOnAgent JSON.stringify ile escape eder.
 */
export function buildPullBakFromDepo(opts: {
  depoIp:   string
  depoUser: string
  depoPass: string
  firmaId:  string
  fileName: string
  destDir:  string
}): string {
  const ip   = psQuote(opts.depoIp)
  const user = psQuote(opts.depoUser)
  const pass = psQuote(opts.depoPass)
  const fid  = psQuote(opts.firmaId)
  const fn   = psQuote(opts.fileName)
  const dd   = psQuote(opts.destDir)
  // PS literal'da \\{ip}\d$ üretmek için TS template'te \\\\ ve \\
  const share = `\\\\${ip}\\d$`
  const src   = `\\\\${ip}\\d$\\Eski Datalar\\${fid}\\${fn}`
  // ÖNEMLİ: net use'un stderr'ini PS seviyesinde 2>$null ile değil, cmd
  // içinde '>nul 2>&1' ile bastır — aksi halde ErrorActionPreference='Stop'
  // mount edilmemiş share'i silmeye çalışırken native stderr'i terminating
  // hataya çevirip akışı patlatır. Genel tercih SilentlyContinue; fail-fast
  // istediğimiz cmdlet'lere açık -ErrorAction Stop; net use'da $LASTEXITCODE
  // kontrolü + manuel throw (throw her zaman terminating).
  return [
    `$ErrorActionPreference='SilentlyContinue'`,
    `$share='${share}'`,
    `cmd /c ('net use ' + $share + ' /delete >nul 2>&1') | Out-Null`,
    `$mt = (net use $share '${pass}' /user:'${user}' 2>&1 | Out-String)`,
    `if ($LASTEXITCODE -ne 0) { throw ('Depo baglanti hatasi: ' + $mt.Trim()) }`,
    `try {`,
    `  $src='${src}'`,
    `  if (-not (Test-Path -LiteralPath $src)) { throw ('Yedek bulunamadi: ' + $src) }`,
    `  if (-not (Test-Path -LiteralPath '${dd}')) { New-Item -ItemType Directory -Path '${dd}' -Force -ErrorAction Stop | Out-Null }`,
    `  Copy-Item -LiteralPath $src -Destination (Join-Path '${dd}' '${fn}') -Force -ErrorAction Stop`,
    `  Write-Output 'OK'`,
    `} finally {`,
    `  cmd /c ('net use ' + $share + ' /delete >nul 2>&1') | Out-Null`,
    `}`,
  ].join("; ")
}

/** Kopyalanan geçici .bak dosyasını siler (restore sonrası temizlik). */
export function buildDeleteFile(filePath: string): string {
  const p = psQuote(filePath)
  return [
    `if (Test-Path -LiteralPath '${p}') { Remove-Item -LiteralPath '${p}' -Force -ErrorAction SilentlyContinue }`,
    `Write-Output 'OK'`,
  ].join("; ")
}

export interface RawCheckPathItem {
  Path:   string
  Exists: boolean
  Length: number
}

export function parseCheckPathsOutput(stdout: string): RawCheckPathItem[] {
  const trimmed = (stdout ?? "").trim()
  if (!trimmed) return []
  try {
    const parsed = JSON.parse(trimmed)
    if (Array.isArray(parsed)) return parsed as RawCheckPathItem[]
    if (parsed && typeof parsed === "object") return [parsed as RawCheckPathItem]
    return []
  } catch {
    return []
  }
}
