/**
 * Pars — Ayar.mdb (Access) okuma/yazma PowerShell üreticileri.
 *
 * Mobil sunucuda Access dosyasını yalnız 32-bit Jet 4.0 sağlayıcısı açabiliyor
 * (64-bit ACE kurulu değil). Agent'ın /api/exec'i 64-bit PowerShell çalıştırdığı
 * için betik SysWOW64 powershell'e `-EncodedCommand` ile devredilir: base64
 * içinde tırnak, `^` ve satır sonu olmadığından agent'ın parser tuzaklarına
 * (bkz. CLAUDE.md) takılmaz, betik de rahatça çok satırlı yazılır.
 *
 * Betikler sonucu tek satırda `PARSJSON:{...}` olarak basar; çağıran taraf
 * `parsJsonAyikla` ile çözer.
 */

import type { ParsKatalog } from "@/lib/pars-katalog"

/** PowerShell single-quoted string için ' → ''. */
function psQuote(s: string): string {
  return (s ?? "").replace(/'/g, "''")
}

/** 32-bit PowerShell'e devredilen komut — agent /api/exec'e bu gider. */
export function buildPars32BitCommand(script: string): string {
  const b64 = Buffer.from(script, "utf16le").toString("base64")
  return `& $env:WINDIR\\SysWOW64\\WindowsPowerShell\\v1.0\\powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand ${b64}`
}

function jetBaglanti(dbPath: string, dbPassword: string): string {
  return `$cs = 'Provider=Microsoft.Jet.OLEDB.4.0;Data Source=${psQuote(dbPath)};Jet OLEDB:Database Password=${psQuote(dbPassword)};'`
}

const ORTAK_BASLIK = [
  `$ErrorActionPreference = 'Stop'`,
  // "Preparing modules for first use" ilerleme kaydı stderr'e CLIXML olarak düşüyor
  `$ProgressPreference = 'SilentlyContinue'`,
  `[Console]::OutputEncoding = [Text.Encoding]::UTF8`,
].join("\n")

/**
 * Katalog okuma: Dtipler, Datalar, Scripts, Users (şifresiz).
 * Çıktı: PARSJSON:{dtipler:[{TID,DTIP}],datalar:[{DID,Data,TipID}],scripts:[...],users:[{ID,Adi,Tipi}]}
 */
export function buildParsKatalogOku(dbPath: string, dbPassword: string): string {
  const script = `
${ORTAK_BASLIK}
${jetBaglanti(dbPath, dbPassword)}
$c = New-Object System.Data.OleDb.OleDbConnection $cs
$c.Open()
function Oku($sql) {
  $cmd = $c.CreateCommand(); $cmd.CommandText = $sql
  $r = $cmd.ExecuteReader()
  $l = New-Object System.Collections.ArrayList
  while ($r.Read()) {
    $o = @{}
    for ($i = 0; $i -lt $r.FieldCount; $i++) { $v = $r.GetValue($i); if ($v -is [DBNull]) { $v = $null }; $o[$r.GetName($i)] = $v }
    [void]$l.Add($o)
  }
  $r.Close()
  return ,$l.ToArray()
}
$out = @{
  dtipler = Oku 'SELECT TID, DTIP FROM Dtipler'
  datalar = Oku 'SELECT DID, Data, TipID FROM Datalar'
  scripts = Oku 'SELECT ScriptID, ScriptAdi, TipID, Mobil, Musteri FROM Scripts'
  users   = Oku 'SELECT ID, Adi, Tipi FROM Users'
}
$c.Close()
'PARSJSON:' + (ConvertTo-Json -InputObject $out -Compress -Depth 4)
`
  return buildPars32BitCommand(script)
}

export interface ParsYazmaGirdisi {
  /** Firmanın Pars'a bağlanacak veritabanları (SQL DB adı) + program tipi. */
  datalar: { data: string; tipId: number }[]
  users:   { adi: string; tipi: 0 | 1; sifre: string }[]
  /** İzinli rapor ID'leri — bunların DIŞINDAKİ her Scripts kaydı yasaklanır. */
  izinliRaporlar: number[]
  /**
   * Firmanın Ayar.mdb'de ZATEN olan Pars kullanıcı ID'leri (Users.ID).
   * Yeni data hepsine yasaklanırken bunlar dışarıda kalır — yoksa firmanın
   * eski kullanıcısı, sonradan eklenen kendi datasını göremezdi.
   */
  mevcutFirmaKullanicilari?: number[]
}

/**
 * Kullanıcı + yetki yazma. Tek transaction: hata olursa hiçbir şey kalmaz.
 *  1) Kullanıcı adı çakışması → hata
 *  2) Datalar: yoksa ekle, DID'yi al
 *  3) Yeni data → firma dışındaki TÜM mevcut kullanıcılara yasak (ters yetki:
 *     satırı olmayan görür); firmanın eski kullanıcılarına ise açılır
 *  4) Her yeni kullanıcı: Users → YasakliDatalar (firma dışı tüm datalar)
 *     → YasakliRapor (izinli olmayan tüm scriptler) → UserDefaultData (tip başına ilk data)
 * Çıktı: PARSJSON:{ok:true,users:[{adi,id}],datalar:[{data,did,yeni}]} | {ok:false,error}
 */
export function buildParsKullaniciYaz(dbPath: string, dbPassword: string, girdi: ParsYazmaGirdisi): string {
  const json = JSON.stringify(girdi)
  const script = `
${ORTAK_BASLIK}
${jetBaglanti(dbPath, dbPassword)}
$g = ConvertFrom-Json '${psQuote(json)}'
$c = New-Object System.Data.OleDb.OleDbConnection $cs
$c.Open()
$tx = $c.BeginTransaction()
function Komut($sql, $p) {
  $cmd = $c.CreateCommand(); $cmd.Transaction = $tx; $cmd.CommandText = $sql
  foreach ($v in @($p)) { [void]$cmd.Parameters.AddWithValue('?', $v) }
  return $cmd
}
function Skalar($sql, $p) { return (Komut $sql $p).ExecuteScalar() }
function Calistir($sql, $p) { [void](Komut $sql $p).ExecuteNonQuery() }
function Liste($sql) {
  $cmd = $c.CreateCommand(); $cmd.Transaction = $tx; $cmd.CommandText = $sql
  $r = $cmd.ExecuteReader(); $l = New-Object System.Collections.ArrayList
  while ($r.Read()) { [void]$l.Add($r.GetValue(0)) }
  $r.Close(); return ,$l.ToArray()
}
try {
  $users   = @($g.users)
  $datalar = @($g.datalar)
  $izinli  = @($g.izinliRaporlar | ForEach-Object { [int]$_ })
  if ($users.Count -eq 0) { throw 'Kullanici listesi bos' }

  foreach ($u in $users) {
    $n = [int](Skalar 'SELECT COUNT(*) FROM Users WHERE Adi = ?' @([string]$u.adi))
    if ($n -gt 0) { throw ('Pars kullanicisi zaten var: ' + $u.adi) }
  }

  # Yeni data eklemeden ONCE var olan kullanicilar: yasak satirlari bunlara yazilacak.
  $eskiHam = Liste 'SELECT ID FROM Users'
  $eskiKullanicilar = @(foreach ($x in $eskiHam) { [int]$x })

  $firmaDatalar = @()
  foreach ($d in $datalar) {
    $did = Skalar 'SELECT DID FROM Datalar WHERE Data = ?' @([string]$d.data)
    $yeni = $false
    if ($did -eq $null -or $did -is [DBNull]) {
      Calistir 'INSERT INTO Datalar (Data, TipID) VALUES (?, ?)' @([string]$d.data, [int]$d.tipId)
      $did = Skalar 'SELECT @@IDENTITY' @()
      $yeni = $true
    }
    $firmaDatalar += @{ data = [string]$d.data; did = [int]$did; tipId = [int]$d.tipId; yeni = $yeni }
  }
  $izinliDatalar = @($firmaDatalar | ForEach-Object { $_.data })

  <#  Yetki TERS calisiyor: YasakliDatalar'da satiri OLMAYAN her kullanici o
      datayi gorur. Yeni eklenen data icin mevcut kullanicilara yasak
      yazilmazsa BASKA FIRMALARIN kullanicilari yeni firmanin datasini
      gorur (16.09.2026'da yasandi: 6399'un iki datasini 22 kullanici
      goruyordu). Bu yuzden her YENI data, o an var olan tum kullanicilara
      yasaklanir. Zaten kayitli datalarda yasaklar yerinde kabul edilir.  #>
  # Firmanin kendi eski kullanicilari haric: onlar yeni datayi GORMELI.
  $firmaninEskileri = @(foreach ($x in @($g.mevcutFirmaKullanicilari)) { [int]$x })
  $eskiyeYasak = 0
  foreach ($fd in $firmaDatalar) {
    if (-not $fd.yeni) { continue }
    foreach ($uid in $eskiKullanicilar) {
      if ($firmaninEskileri -contains $uid) { continue }
      $var = [int](Skalar 'SELECT COUNT(*) FROM YasakliDatalar WHERE UID = ? AND DATAAD = ?' @($uid, [string]$fd.data))
      if ($var -eq 0) { Calistir 'INSERT INTO YasakliDatalar (UID, DATAAD) VALUES (?, ?)' @($uid, [string]$fd.data); $eskiyeYasak++ }
    }
  }

  <#  Firmanin eski kullanicilari yeni datayi gorsun: eskiden yazilmis bir
      yasak satiri varsa (baska bir kurulumda firma disi sayilmis olabilir)
      kaldirilir ve tipine gore varsayilan data atanir.                    #>
  $eskidenAcilan = 0
  foreach ($uid in $firmaninEskileri) {
    foreach ($fd in $firmaDatalar) {
      $s = [int](Skalar 'SELECT COUNT(*) FROM YasakliDatalar WHERE UID = ? AND DATAAD = ?' @($uid, [string]$fd.data))
      if ($s -gt 0) { Calistir 'DELETE FROM YasakliDatalar WHERE UID = ? AND DATAAD = ?' @($uid, [string]$fd.data); $eskidenAcilan++ }
      $v = [int](Skalar 'SELECT COUNT(*) FROM UserDefaultData WHERE UUID = ? AND UTID = ?' @($uid, [int]$fd.tipId))
      if ($v -eq 0) { Calistir 'INSERT INTO UserDefaultData (UUID, UTID, UDID) VALUES (?, ?, ?)' @($uid, [int]$fd.tipId, [int]$fd.did) }
    }
  }

  # Liste ',$dizi' dondurur: pipeline'a tek nesne olarak gider; @() ile sarmak
  # tek elemanli dizi yapar (yasandi: 15 data tek satira birlesti) — foreach ile acilir
  $dataHam      = Liste 'SELECT Data FROM Datalar'
  $tumDatalar   = @(foreach ($x in $dataHam) { [string]$x })
  $scriptHam    = Liste 'SELECT ScriptID FROM Scripts'
  $tumScriptler = @(foreach ($x in $scriptHam) { [int]$x })

  $olusan = @()
  foreach ($u in $users) {
    Calistir 'INSERT INTO Users (Adi, Tipi, sifre) VALUES (?, ?, ?)' @([string]$u.adi, [int]$u.tipi, [string]$u.sifre)
    $uid = [int](Skalar 'SELECT @@IDENTITY' @())
    foreach ($ad in $tumDatalar) {
      if ($izinliDatalar -notcontains [string]$ad) { Calistir 'INSERT INTO YasakliDatalar (UID, DATAAD) VALUES (?, ?)' @($uid, [string]$ad) }
    }
    foreach ($sid in $tumScriptler) {
      if ($izinli -notcontains $sid) { Calistir 'INSERT INTO YasakliRapor (UID, RAPOR) VALUES (?, ?)' @($uid, $sid) }
    }
    $tipVerildi = @{}
    foreach ($fd in $firmaDatalar) {
      if ($tipVerildi.ContainsKey($fd.tipId)) { continue }
      Calistir 'INSERT INTO UserDefaultData (UUID, UTID, UDID) VALUES (?, ?, ?)' @($uid, [int]$fd.tipId, [int]$fd.did)
      $tipVerildi[$fd.tipId] = $true
    }
    $olusan += @{ adi = [string]$u.adi; id = $uid }
  }

  $tx.Commit()
  'PARSJSON:' + (ConvertTo-Json -InputObject @{ ok = $true; users = $olusan; datalar = $firmaDatalar; yasakliData = ($tumDatalar.Count - $izinliDatalar.Count); yasakliRapor = ($tumScriptler.Count - $izinli.Count); eskiyeYasak = $eskiyeYasak; eskidenAcilan = $eskidenAcilan } -Compress -Depth 4)
} catch {
  try { $tx.Rollback() } catch { }
  'PARSJSON:' + (ConvertTo-Json -InputObject @{ ok = $false; error = $_.Exception.Message } -Compress)
} finally {
  $c.Close()
}
`
  return buildPars32BitCommand(script)
}

/**
 * Yalnız VERİLEN kullanıcıların şifrelerini okur (Users.sifre — düz metin).
 * Katalog okuması bilerek şifresiz; bu betik firma Erişim ekranı için var ve
 * yalnız o firmanın kullanıcı ID'lerini alır — tüm Pars kullanıcılarının
 * şifrelerini dökmez. ID'ler tam sayı olarak doğrulanıp sorguya gömülür.
 * Çıktı: PARSJSON:{users:[{ID,Adi,sifre}]}
 */
export function buildParsSifreOku(dbPath: string, dbPassword: string, ids: number[]): string {
  const temiz = [...new Set(ids.filter((n) => Number.isInteger(n) && n > 0))]
  const liste = temiz.length ? temiz.join(",") : "-1"
  const script = `
${ORTAK_BASLIK}
${jetBaglanti(dbPath, dbPassword)}
$c = New-Object System.Data.OleDb.OleDbConnection $cs
$c.Open()
$cmd = $c.CreateCommand(); $cmd.CommandText = 'SELECT ID, Adi, sifre FROM Users WHERE ID IN (${liste})'
$r = $cmd.ExecuteReader()
$l = New-Object System.Collections.ArrayList
while ($r.Read()) {
  $o = @{}
  for ($i = 0; $i -lt $r.FieldCount; $i++) { $v = $r.GetValue($i); if ($v -is [DBNull]) { $v = $null }; $o[$r.GetName($i)] = $v }
  [void]$l.Add($o)
}
$r.Close()
$c.Close()
'PARSJSON:' + (ConvertTo-Json -InputObject @{ users = $l.ToArray() } -Compress -Depth 3)
`
  return buildPars32BitCommand(script)
}

/** Betik çıktısındaki `PARSJSON:{...}` satırını çözer; yoksa null. */
export function parsJsonAyikla<T = unknown>(stdout: string): T | null {
  const m = (stdout ?? "").match(/PARSJSON:(\{[\s\S]*\})/)
  if (!m) return null
  try { return JSON.parse(m[1]) as T } catch { return null }
}

/** Ham katalog çıktısını (Access kolon adları) istemci DTO'suna çevirir. */
export function parsKatalogNormalize(raw: unknown): ParsKatalog {
  const r = (raw ?? {}) as Record<string, unknown[]>
  const dizi = (k: string) => Array.isArray(r[k]) ? r[k] as Record<string, unknown>[] : []
  const num = (v: unknown): number | null => {
    const n = typeof v === "number" ? v : Number(v)
    return Number.isFinite(n) ? n : null
  }
  const bool = (v: unknown) => v === true || v === 1 || v === -1 || v === "True"
  return {
    dtipler: dizi("dtipler")
      .map((x) => ({ tid: num(x.TID) ?? 0, ad: String(x.DTIP ?? "") }))
      .filter((x) => x.ad),
    datalar: dizi("datalar")
      .map((x) => ({ did: num(x.DID) ?? 0, data: String(x.Data ?? ""), tipId: num(x.TipID) }))
      .filter((x) => x.data),
    scripts: dizi("scripts")
      .map((x) => ({
        id: num(x.ScriptID) ?? 0,
        ad: String(x.ScriptAdi ?? "").trim(),
        tipId: num(x.TipID),
        mobil: bool(x.Mobil),
        musteri: bool(x.Musteri),
      }))
      .filter((x) => x.id > 0)
      .sort((a, b) => a.ad.localeCompare(b.ad, "tr")),
    users: dizi("users")
      .map((x) => ({ id: num(x.ID) ?? 0, adi: String(x.Adi ?? ""), tipi: num(x.Tipi) ?? 0 }))
      .filter((x) => x.adi),
  }
}
