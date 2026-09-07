/**
 * SQL Backup Master — yedek görevlerine veritabanı ekleme.
 *
 * ── Neden dosyaya yazıyoruz? ───────────────────────────────────────────
 * SQL Backup Master üçüncü parti bir ürün (Key Metric Software), kaynağı
 * bizde değil ve desteklenen bir komut satırı / API arayüzü yok — exe
 * içinde bulunan `RunJob*` dizgileri iş kaydındaki "farklı kullanıcı
 * olarak çalıştır" alanları, komut satırı anahtarı değil.
 *
 * Geriye tek yol kalıyor: ürünün kendi veri dosyasını düzenlemek.
 *   C:\ProgramData\Key Metric Software\SQL Backup Master\Jobs.xml
 *
 * Yapı (2026-09 itibarıyla, v6 gövdesi):
 *   <ArrayOfBackupJob xmlns="…/SQLBackupMaster.Data">
 *     <BackupJob>
 *       <BackupAllNonSystemDBs>false</BackupAllNonSystemDBs>
 *       <Source>
 *         <BackupDatabaseNames xmlns:d4p1="…/Serialization/Arrays">
 *           <d4p1:string>4714_AKNUR26</d4p1:string>
 *
 * Dikkat: `BackupDatabaseNames` KÖK ad alanında, çocukları ise Arrays
 * ad alanında. XPath'te kök için önek şart, yeni düğüm oluştururken de
 * Arrays ad alanı verilmeli — yoksa ürün kaydı okumaz.
 *
 * ── Neden kritik olmayan adım? ─────────────────────────────────────────
 * Bu yol kırılgan: ürün güncellemesi şemayı değiştirebilir, masaüstü
 * arayüzü açıksa dosyanın üstüne yazabilir. O yüzden sihirbazda kurulumu
 * DURDURMUYOR. Başarısız olursa kurulum devam eder ve "Elle Yapılacak
 * Adımlar" modalında madde kırmızı kalır — yani otomasyon çalışmadığında
 * eski elle akışa düşülür, hiçbir şey sessizce kaçmaz.
 *
 * ── `BackupAllNonSystemDBs` neden kullanılmıyor? ───────────────────────
 * Üründe "tüm sistem dışı veritabanları" seçeneği var ve açılsa bu kod
 * hiç gerekmezdi. Bilinçli olarak açılmıyor: sunucuda yedeklenmesi
 * istenmeyen eski yıl veritabanları duruyor ve hepsini kapsama almak
 * yedek boyutunu gereksiz büyütürdü.
 */

/** Ürünün görev dosyası — kurulum yolu sabit (ProgramData altında). */
const JOBS_XML = "C:/ProgramData/Key Metric Software/SQL Backup Master/Jobs.xml"

/** Windows servis adı — `Get-CimInstance Win32_Service` ile doğrulandı. */
const SERVICE = "SQL Backup Master"

/** Masaüstü arayüzünün süreç adı (uzantısız) */
const UI_PROCESS = "SQLBackupMaster"

const DATA_NS   = "http://schemas.datacontract.org/2004/07/SQLBackupMaster.Data"
const ARRAYS_NS = "http://schemas.microsoft.com/2003/10/Serialization/Arrays"

/** PowerShell tek tırnaklı string için ' → '' */
function psQuote(s: string): string {
  return (s ?? "").replace(/'/g, "''")
}

/**
 * Verilen veritabanlarını Jobs.xml'deki TÜM yedek görevlerine ekler.
 *
 * Komut agent'ın `/api/exec` ucuna gidiyor; CLAUDE.md kuralları geçerli:
 * çift tırnak YOK (hepsi tek tırnak), tek satır (`;` ile zincirlenmiş),
 * yollar ileri bölü ile.
 *
 * Akış — sırası önemli:
 *   1. Arayüz açıksa DUR. Açık arayüz kapanırken bellekteki hali dosyanın
 *      üstüne yazar ve eklediğimiz kayıt sessizce kaybolur.
 *   2. Zaman damgalı yedek al (ürünün kendi .bak'ı üzerine yazılıyor,
 *      ona güvenilmez).
 *   3. Servisi durdur — çalışırken dosyayı yeniden okuyabilir.
 *   4. XML'i düzenle, zaten varsa tekrar ekleme.
 *   5. Kaydet, servisi ESKİ durumuna döndür.
 *   6. Dosyayı yeniden okuyup adların gerçekten yazıldığını doğrula.
 *      Şema değişirse burada patlar; sessizce "başarılı" demez.
 */
export function buildAddDatabasesToBackupJobs(dbNames: string[]): string {
  const liste = dbNames.map((d) => `'${psQuote(d)}'`).join(",")

  return [
    `$ErrorActionPreference='Stop'`,
    `$dbs=@(${liste})`,
    `$f='${JOBS_XML}'`,
    `$svc='${SERVICE}'`,

    /* 1) Arayüz açıksa dokunma */
    `if (Get-Process -Name '${UI_PROCESS}' -ErrorAction SilentlyContinue) { throw ('SQL Backup Master arayuzu acik; kapatilmadan Jobs.xml duzenlenemez') }`,
    `if (-not (Test-Path -LiteralPath $f)) { throw ('Jobs.xml bulunamadi: ' + $f) }`,

    /* 2) Kendi yedeğimiz */
    `Copy-Item -LiteralPath $f -Destination ($f + '.hub-' + (Get-Date -Format yyyyMMddHHmmss)) -Force`,

    /* 3) Servisi durdur (eski durumu hatırla) */
    `$s=Get-Service -Name $svc -ErrorAction SilentlyContinue`,
    `$calisiyordu = ($s -ne $null) -and ($s.Status -eq 'Running')`,
    `if ($calisiyordu) { Stop-Service -Name $svc -Force; (Get-Service -Name $svc).WaitForStatus('Stopped', (New-TimeSpan -Seconds 25)) }`,

    /* 4) Düzenle */
    `$x=New-Object System.Xml.XmlDocument`,
    `$x.PreserveWhitespace=$true`,
    `$x.Load($f)`,
    `$ns=New-Object System.Xml.XmlNamespaceManager($x.NameTable)`,
    `$ns.AddNamespace('s','${DATA_NS}')`,
    `$listeler=$x.SelectNodes('//s:BackupDatabaseNames',$ns)`,
    `if ($listeler.Count -eq 0) { if ($calisiyordu) { Start-Service -Name $svc }; throw ('Jobs.xml icinde BackupDatabaseNames bulunamadi - urun semasi degismis olabilir') }`,
    `$eklendi=0`,
    `foreach ($l in $listeler) { foreach ($db in $dbs) { $var=$false; foreach ($c in $l.ChildNodes) { if ($c.InnerText -eq $db) { $var=$true } }; if (-not $var) { $e=$x.CreateElement('d4p1','string','${ARRAYS_NS}'); $e.InnerText=$db; $null=$l.AppendChild($e); $eklendi=$eklendi+1 } } }`,
    `if ($eklendi -gt 0) { $x.Save($f) }`,

    /* 5) Servisi geri başlat — düzenleme hata verse de servis ayakta kalsın */
    `if ($calisiyordu) { Start-Service -Name $svc }`,

    /* 6) Doğrula: yazdığımızı gerçekten okuyabiliyor muyuz */
    `$y=New-Object System.Xml.XmlDocument`,
    `$y.Load($f)`,
    `$ns2=New-Object System.Xml.XmlNamespaceManager($y.NameTable)`,
    `$ns2.AddNamespace('s','${DATA_NS}')`,
    `$gorevler=$y.SelectNodes('//s:BackupDatabaseNames',$ns2)`,
    `foreach ($db in $dbs) { foreach ($g in $gorevler) { $bulundu=$false; foreach ($c in $g.ChildNodes) { if ($c.InnerText -eq $db) { $bulundu=$true } }; if (-not $bulundu) { throw ('Dogrulama basarisiz: ' + $db + ' goreve yazilamadi') } } }`,

    `Write-Output ('OK ' + $eklendi + ' kayit / ' + $listeler.Count + ' gorev')`,
  ].join("; ")
}
