import "server-only"
import { execOnAgent } from "@/lib/agent-poller"
import { withSqlConnection } from "@/lib/sql-external"

/**
 * SQL Backup Master iş listelerini `sirket.dbo.guvenlik` ile eşitler.
 *
 * ── Neden ─────────────────────────────────────────────────────────────
 * Backup Master (ikinci arşiv: Google Drive + FTP) yedeklenecek veritabanlarını
 * `Jobs.xml` içinde TEK TEK ADIYLA tutuyor ve bu liste elle güncelleniyordu.
 * Ayrışınca iki yönde de sorun çıkıyor:
 *   - Listede olup sunucuda olmayan ad → her turda "Database does not exist",
 *     iş "Finished with errors" biter (2026-09-21, 4434 hayalet adları).
 *   - Kapsamda olup listede olmayan DB → ikinci arşivde sessiz boşluk
 *     (2026-09-19 `URNTRANSFER`, 2026-09-21 `983_URETIM26`).
 * Tek doğru kaynak `guvenlik.YedekAl`: SpareBackup zaten onu okuyor.
 *
 * ── İstisna ───────────────────────────────────────────────────────────
 * `Sirket` veritabanının guvenlik'te satırı YOK (guvenlik tablosunun kendisi
 * orada duruyor) ama yedeklenmesi şart — listede her zaman kalır.
 *
 * ── Yazma yordamı ─────────────────────────────────────────────────────
 * Backup Master servisi kapanırken Jobs.xml'i kendisi yeniden yazıyor; bu
 * yüzden dosya servis DURDURULDUKTAN SONRA okunur. Yazmadan önce zaman damgalı
 * yedek alınır, son 10 dk içinde günlük yazılmışsa (iş sürüyor olabilir)
 * hiçbir şey yapılmaz. Yalnız veritabanı listesi değişir; zamanlama,
 * COPY_ONLY ve hedef ayarlarına dokunulmaz.
 */

const XML = "C:/ProgramData/Key Metric Software/SQL Backup Master/Jobs.xml"
const LOG_KLASOR = "C:/ProgramData/Key Metric Software/SQL Backup Master/logs"
const SERVIS = "SQL Backup Master"
/** guvenlik'ten türetilemeyen, listede kalması şart olan veritabanları */
export const BM_ISTISNA = ["Sirket"]

export interface BackupMasterSqlHedef {
  ip:        string
  /** SQL kimlik bilgileri — guvenlik sorgusu için (agent SYSTEM ile sirket'e erişemiyor) */
  username:  string
  password:  string
  agentPort: number
  apiKey:    string
}

export interface BmEsitlemeSonuc {
  /** Jobs.xml yazıldı mı */
  degisti:   boolean
  /** Olması gereken liste */
  beklenen:  string[]
  /** İş adı → (listeden çıkarılanlar, eklenenler) */
  isler:     { ad: string; once: number; sonra: number; cikan: string[]; eklenen: string[] }[]
  /** Yazılmadıysa sebebi (ör. çalışan iş) */
  atlandi?:  string
  yedekAdi?: string
}

/** Tek satır PowerShell — agent exec kuralları: çift tırnak yok, `^` yok, çok satır yok. */
function okuKomutu(): string {
  return [
    `$t=[IO.File]::ReadAllText('${XML}')`,
    "$b=[regex]::Matches($t,'<BackupDatabaseNames[^>]*>(.*?)</BackupDatabaseNames>','Singleline')",
    "$i=0; foreach ($x in $b) { $i++; $ad=[regex]::Matches($x.Groups[1].Value,'<[a-zA-Z0-9]+:string>([^<]*)</[a-zA-Z0-9]+:string>') | ForEach-Object { $_.Groups[1].Value }; 'IS' + $i + '=' + ($ad -join ',') }",
    "'ISIM=' + (([regex]::Matches($t,'<Name>([^<]*)</Name>') | ForEach-Object { $_.Groups[1].Value }) -join ',')",
  ].join("; ")
}

function yazKomutu(beklenen: string[]): string {
  const b64 = Buffer.from(beklenen.join("\n"), "utf8").toString("base64")
  return [
    `$lg=(Get-ChildItem '${LOG_KLASOR}' | Sort-Object LastWriteTime | Select-Object -Last 1)`,
    "if ($lg -and $lg.LastWriteTime -gt (Get-Date).AddMinutes(-10)) { 'ATLANDI=son 10 dk icinde gunluk yazilmis, yedek isi suruyor olabilir'; exit }",
    `$f='${XML}'`,
    "$bak=$f + '.hub-esitle-' + (Get-Date -Format 'yyyyMMddHHmmss'); Copy-Item -LiteralPath $f -Destination $bak",
    "'YEDEK=' + (Split-Path $bak -Leaf)",
    `Stop-Service '${SERVIS}' -ErrorAction Stop; (Get-Service '${SERVIS}').WaitForStatus('Stopped','00:02:00')`,
    "try {",
    `  $adlar=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${b64}')) -split [char]10 | Where-Object { $_ }`,
    "  $t=[IO.File]::ReadAllText($f)",
    "  $b=[regex]::Matches($t,'<BackupDatabaseNames[^>]*>(.*?)</BackupDatabaseNames>','Singleline')",
    "  if ($b.Count -lt 1) { throw 'liste blogu yok' }",
    "  $on=[regex]::Match($t,'<([a-zA-Z0-9]+):string>').Groups[1].Value; if (-not $on) { $on='d4p1' }",
    "  $ic=($adlar | ForEach-Object { '<' + $on + ':string>' + $_ + '</' + $on + ':string>' }) -join ''",
    "  $yeni=$t; for ($i=$b.Count-1; $i -ge 0; $i--) { $m=$b[$i]; $ac=$m.Value.Substring(0, $m.Value.IndexOf([char]62)+1); $yeni=$yeni.Substring(0,$m.Index) + $ac + $ic + '</BackupDatabaseNames>' + $yeni.Substring($m.Index + $m.Length) }",
    "  $null=[xml]$yeni",
    "  [IO.File]::WriteAllText($f,$yeni,(New-Object Text.UTF8Encoding $true))",
    "  $s=[IO.File]::ReadAllText($f); $b2=[regex]::Matches($s,'<BackupDatabaseNames[^>]*>(.*?)</BackupDatabaseNames>','Singleline')",
    "  $i=0; foreach ($x in $b2) { $i++; 'SONUC' + $i + '=' + ([regex]::Matches($x.Groups[1].Value,'<[a-zA-Z0-9]+:string>')).Count }",
    "} catch { 'HATA=' + $_.Exception.Message } finally { " +
      `Start-Service '${SERVIS}'; (Get-Service '${SERVIS}').WaitForStatus('Running','00:01:00'); 'SERVIS=' + (Get-Service '${SERVIS}').Status }`,
  ].join("; ")
}

function anahtarlar(cikti: string): Record<string, string> {
  const o: Record<string, string> = {}
  for (const l of cikti.split(/\r?\n/)) {
    const i = l.indexOf("=")
    if (i > 0) o[l.slice(0, i).trim()] = l.slice(i + 1).trim()
  }
  return o
}

/**
 * Kapsam listesini okur, Jobs.xml ile karşılaştırır, fark varsa yazar.
 * `kuruGosteri` true ise yalnız farkı döner (yazmaz).
 */
export async function esitleBackupMaster(
  hedef: BackupMasterSqlHedef,
  opts: { kuruGosteri?: boolean } = {},
): Promise<BmEsitlemeSonuc> {
  // 1) Olması gereken: guvenlik.YedekAl=1 ∩ sunucuda ONLINE + istisnalar
  const kapsam = await withSqlConnection(
    { server: hedef.ip, user: hedef.username, password: hedef.password, database: "master", requestTimeout: 60_000 },
    async (pool) => {
      const r = await pool.request().query<{ ad: string }>(`
        SELECT DISTINCT LTRIM(RTRIM(g.DataYolu)) AS ad
        FROM sirket.dbo.guvenlik g
        JOIN sys.databases d ON d.name COLLATE DATABASE_DEFAULT = LTRIM(RTRIM(g.DataYolu)) COLLATE DATABASE_DEFAULT
        WHERE g.YedekAl = 1 AND d.state_desc = 'ONLINE'`)
      return r.recordset.map((x) => x.ad)
    },
  )
  if (kapsam.length === 0) throw new Error("guvenlik'te YedekAl=1 kaydı bulunamadı — eşitleme yapılmadı")

  const beklenen = [...new Set([...kapsam, ...BM_ISTISNA])].sort((a, b) => a.localeCompare(b, "tr"))

  // 2) Mevcut listeler
  const oku = await execOnAgent(hedef.ip, hedef.agentPort, hedef.apiKey, okuKomutu(), 90)
  const v = anahtarlar(oku.stdout ?? "")
  const isimler = (v.ISIM ?? "").split(",").filter(Boolean)
  const mevcut = Object.keys(v).filter((k) => /^IS\d+$/.test(k)).sort()
    .map((k) => (v[k] ? v[k].split(",").filter(Boolean) : []))
  if (mevcut.length === 0) throw new Error("Jobs.xml okunamadı ya da iş listesi bulunamadı")

  const isler = mevcut.map((liste, i) => ({
    ad:      isimler[i] ?? `İş ${i + 1}`,
    once:    liste.length,
    sonra:   beklenen.length,
    cikan:   liste.filter((x) => !beklenen.includes(x)),
    eklenen: beklenen.filter((x) => !liste.includes(x)),
  }))
  const farkVar = isler.some((j) => j.cikan.length > 0 || j.eklenen.length > 0)
  if (!farkVar || opts.kuruGosteri) return { degisti: false, beklenen, isler }

  // 3) Yaz
  const yaz = await execOnAgent(hedef.ip, hedef.agentPort, hedef.apiKey, yazKomutu(beklenen), 240)
  const y = anahtarlar(yaz.stdout ?? "")
  if (y.ATLANDI) return { degisti: false, beklenen, isler, atlandi: y.ATLANDI }
  if (y.HATA)    throw new Error(`Jobs.xml yazılamadı: ${y.HATA}`)
  const yazilan = Object.keys(y).filter((k) => /^SONUC\d+$/.test(k)).map((k) => Number(y[k]))
  if (yazilan.length === 0 || yazilan.some((n) => n !== beklenen.length)) {
    throw new Error(`Jobs.xml doğrulanamadı (beklenen ${beklenen.length}, yazılan ${yazilan.join("/") || "—"})`)
  }
  return { degisti: true, beklenen, isler, yedekAdi: y.YEDEK }
}

/** Kısa özet — SSE adımı / API yanıtı için. */
export function bmOzet(s: BmEsitlemeSonuc): string {
  if (s.atlandi) return `Backup Master eşitlemesi atlandı: ${s.atlandi}`
  if (!s.degisti) return `Backup Master listesi zaten güncel (${s.beklenen.length} veritabanı)`
  const ek = s.isler[0]?.eklenen.length ?? 0
  const cik = s.isler[0]?.cikan.length ?? 0
  return `Backup Master listesi eşitlendi: ${s.beklenen.length} veritabanı (+${ek} / −${cik})`
}
