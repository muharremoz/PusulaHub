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
