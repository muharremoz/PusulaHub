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
    `$items = Get-ChildItem -LiteralPath '${p}' -Filter '*.bak' -File -Force`,
    `$arr = @($items | ForEach-Object { [PSCustomObject]@{ Name = $_.Name; Length = $_.Length; LastWriteTime = $_.LastWriteTime.ToString('o') } })`,
    `if ($arr.Count -eq 0) { Write-Output '[]' } else { $arr | ConvertTo-Json -Compress }`,
  ].join("; ")
}

/** Agent exec'inden dönen stdout'u parse eder ve normalize array'e çevirir. */
export interface RawBackupItem {
  Name:          string
  Length:        number
  LastWriteTime: string
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
