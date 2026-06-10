/**
 * Firma kurulum sihirbazı — IIS sitesi PowerShell komut üreticileri.
 *
 * `setup-fileops.ts` ile aynı kısıtlamaya tabidir:
 *   ⚠ Agent'ın JSON parser'ı (basit regex) `"command":"..."` içinde JSON
 *     escape'lerini anlamıyor. Bu yüzden **çift tırnak KULLANILMAZ**:
 *     bütün string literal'lar single-quote, interpolasyonlar `'foo' + $var`
 *     ile yapılır.
 */

/** PowerShell single-quoted string için ' karakterini '' yapar. */
function psQuote(s: string): string {
  return (s ?? "").replace(/'/g, "''")
}

/* ── Bir dosyanın içinde placeholder'ları replace et ─────────────────── */
/**
 * Hedefteki config dosyasında verilen anahtar/değer eşlemelerini sırayla
 * replace eder. Eski uygulama ile uyumlu basit string replace (regex değil).
 *
 * - Dosya yoksa: hata (config olmazsa site çalışmaz)
 * - UTF-8 ile okur, UTF-8 ile yazar
 * - Tüm anahtarlar string olarak değiştirilir
 *
 * @param filePath  hedef config dosyası (örn C:\inetpub\wwwroot\rfid_A001\appsettings.json)
 * @param replacements örn { '{firmaKod}': 'A001', '{port}': '8001' }
 */
export function buildReplaceInFile(filePath: string, replacements: Record<string, string>): string {
  const f = psQuote(filePath)
  const lines: string[] = [
    `$f='${f}'`,
    `if(-not (Test-Path -LiteralPath $f)){throw ('Config dosyasi bulunamadi: ' + $f)}`,
    `$c = Get-Content -LiteralPath $f -Raw -Encoding UTF8`,
  ]
  for (const [key, val] of Object.entries(replacements)) {
    const k = psQuote(key)
    const v = psQuote(val)
    lines.push(`$c = $c.Replace('${k}', '${v}')`)
  }
  lines.push(`Set-Content -LiteralPath $f -Value $c -Encoding UTF8 -NoNewline`)
  lines.push(`Write-Output 'UPDATED'`)
  return lines.join("; ")
}

/* ── web.config — connection string + httpRuntime patch'i ──────────────
 *
 * API hizmet klasörü kopyalandıktan sonra çağrılır. Yaptığı işler:
 *
 *  1) <connectionStrings>/<add connectionString="..."> içindeki
 *     - Data Source=...  → seçili SQL sunucusunun IP'si
 *     - User Id=...      → firma 1. kullanıcısı (örn. 778_AsyaBurma23)
 *     - Password=...     → kullanıcı şifresi
 *     - Initial Catalog  → DOKUNULMAZ (özellikle [DB] placeholder ise XML
 *       tarafında set ediliyor — onunla ayrı uğraşacağız)
 *
 *  2) <system.web>/<httpRuntime> üzerinde
 *     - maxRequestLength="51200" set (varsa override, yoksa attribute ekle)
 *
 * SQL parametreleri opsiyonel — verilmezse sadece maxRequestLength fix
 * çalışır. Dosya yoksa sessizce SKIP döner (hizmet web.config içermeyebilir).
 */
export function buildPatchWebConfig(opts: {
  configPath:   string
  sqlIp?:       string
  sqlUserId?:   string
  sqlPassword?: string
}): string {
  const f       = psQuote(opts.configPath)
  const ip      = psQuote(opts.sqlIp      ?? "")
  const u       = psQuote(opts.sqlUserId  ?? "")
  const pw      = psQuote(opts.sqlPassword ?? "")
  const hasSql  = !!(opts.sqlIp && opts.sqlUserId && opts.sqlPassword)

  const lines: string[] = [
    `$f='${f}'`,
    `if(-not (Test-Path -LiteralPath $f)){Write-Output 'SKIP_NO_FILE'; return}`,
    `[xml]$doc = Get-Content -LiteralPath $f -Raw -Encoding UTF8`,
  ]

  if (hasSql) {
    lines.push(
      `$ip='${ip}'`,
      `$u='${u}'`,
      `$pw='${pw}'`,
      `$adds = $doc.SelectNodes('//connectionStrings/add')`,
      // Her <add> elementinin connectionString attribute'unu regex ile parçala-değiştir
      `foreach($add in $adds){` +
        `$cs = $add.GetAttribute('connectionString'); ` +
        `if($cs){` +
          `$cs = [System.Text.RegularExpressions.Regex]::Replace($cs, '(?i)Data\\s*Source\\s*=\\s*[^;]+', ('Data Source=' + $ip)); ` +
          `$cs = [System.Text.RegularExpressions.Regex]::Replace($cs, '(?i)User\\s*Id\\s*=\\s*[^;]+', ('User Id=' + $u)); ` +
          `$cs = [System.Text.RegularExpressions.Regex]::Replace($cs, '(?i)Password\\s*=\\s*[^;]+', ('Password=' + $pw)); ` +
          `$add.SetAttribute('connectionString', $cs)` +
        `}` +
      `}`,
    )
  }

  lines.push(
    // httpRuntime/@maxRequestLength = 51200 (yoksa attribute eklenir)
    `$hrs = $doc.SelectNodes('//system.web/httpRuntime')`,
    `foreach($hr in $hrs){ $hr.SetAttribute('maxRequestLength', '51200') }`,
    // Kaydet — XmlDocument.Save UTF-8 (BOM'suz) yazar, XML declaration korunur
    `$doc.Save($f)`,
    `Write-Output 'PATCHED'`,
  )

  return lines.join("; ")
}

/* ── Users.xml — API uygulama-içi kullanıcı listesini güncelle ─────────
 *
 * Klasör kopyalandıktan sonra (SQL restore + login + mapping bittikten sonra)
 * çağrılır. Mevcut <User> ve <DB><Data> node'ları silinir, sihirbazdaki
 * kullanıcılar ve restore edilen DB'ler ile yeniden yazılır. XML kök yapısı
 * (XML declaration, <Users> root) korunur.
 *
 *   <User><Username>{firmaId}_{username}</Username>
 *         <Password>{password}</Password>
 *         <Data><Data>db1</Data>...<Data>dbN</Data></Data></User>
 *   ...
 *   <DB><Data>db1</Data>...<Data>dbN</Data></DB>
 *
 * Her kullanıcı tüm firma DB'lerine erişebilir (Admin gibi).
 * Dosya yoksa SKIP_NO_FILE döner. Kullanıcı/DB boşsa SKIP_EMPTY döner.
 *
 * NOT: PowerShell tarafında <User> tag adı PSObject property erişimi ile
 * sembolik isim olarak kullanıldığında karışıklık olabiliyor; bu yüzden
 * eski node'ları XPath ile bulup parent'tan RemoveChild ile siliyoruz.
 */
export function buildPatchUsersXml(opts: {
  configPath: string
  users:      Array<{ username: string; password: string }>
  dbNames:    string[]
}): string {
  const f = psQuote(opts.configPath)
  if (opts.users.length === 0 || opts.dbNames.length === 0) {
    return [
      `$f='${f}'`,
      `if(-not (Test-Path -LiteralPath $f)){Write-Output 'SKIP_NO_FILE'; return}`,
      `Write-Output 'SKIP_EMPTY'`,
    ].join("; ")
  }

  // Kullanıcı bloğu PS array literal'larıyla aktarılır — PS tarafında loop ile
  // <User> node'ları kurulur. Her field psQuote'lanır.
  const userLines = opts.users.map((u) =>
    `[pscustomobject]@{ Username='${psQuote(u.username)}'; Password='${psQuote(u.password)}' }`,
  ).join(", ")

  const dbLines = opts.dbNames.map((d) => `'${psQuote(d)}'`).join(", ")

  return [
    `$f='${f}'`,
    `if(-not (Test-Path -LiteralPath $f)){Write-Output 'SKIP_NO_FILE'; return}`,
    `$users = @(${userLines})`,
    `$dbs   = @(${dbLines})`,
    `[xml]$doc = Get-Content -LiteralPath $f -Raw -Encoding UTF8`,
    // Root <Users> yoksa oluştur
    `$root = $doc.SelectSingleNode('/Users')`,
    `if($null -eq $root){ $root = $doc.AppendChild($doc.CreateElement('Users')) }`,
    // Eski tüm child'ları temizle (User + DB)
    `foreach($n in @($root.SelectNodes('User'))){ [void]$root.RemoveChild($n) }`,
    `foreach($n in @($root.SelectNodes('DB'))){   [void]$root.RemoveChild($n) }`,
    // Yeni <User> node'ları
    `foreach($u in $users){` +
      `$userEl = $doc.CreateElement('User'); ` +
      `$un = $doc.CreateElement('Username'); $un.InnerText = $u.Username; [void]$userEl.AppendChild($un); ` +
      `$pw = $doc.CreateElement('Password'); $pw.InnerText = $u.Password; [void]$userEl.AppendChild($pw); ` +
      `$dWrap = $doc.CreateElement('Data'); ` +
      `foreach($db in $dbs){ $di = $doc.CreateElement('Data'); $di.InnerText = $db; [void]$dWrap.AppendChild($di) }; ` +
      `[void]$userEl.AppendChild($dWrap); ` +
      `[void]$root.AppendChild($userEl)` +
    `}`,
    // <DB> global liste
    `$dbEl = $doc.CreateElement('DB')`,
    `foreach($db in $dbs){ $di = $doc.CreateElement('Data'); $di.InnerText = $db; [void]$dbEl.AppendChild($di) }`,
    `[void]$root.AppendChild($dbEl)`,
    // Kaydet — XML declaration korunur, UTF-8 (BOM'suz)
    `$doc.Save($f)`,
    `Write-Output ('UPDATED users=' + $users.Count + ' dbs=' + $dbs.Count)`,
  ].join("; ")
}

/* ── IIS'te kullanılan portları listele ──────────────────────────────── */
/**
 * Sunucudaki TÜM IIS sitelerinin binding'lerinden port numaralarını toplar.
 * Sihirbaz port tahsisinde WizardPortAssignments sayacının dışında elle
 * kurulmuş siteler de olabilir (örn. 778_RFID → 26003) — canlı envanter
 * olmadan tahsis edilen port IIS'te çakışıp site start'ı patlatıyor.
 *
 * Çıktı: `PORTS:80,443,21001,26003` (binding'i olmayan sunucuda `PORTS:`)
 */
export function buildListIisUsedPorts(): string {
  return [
    `Import-Module WebAdministration -ErrorAction Stop`,
    `$ports = @()`,
    `foreach($s in (Get-Website)){` +
      `foreach($b in $s.bindings.Collection){` +
        `$bi = [string]$b.bindingInformation; ` +
        `foreach($seg in $bi.Split(':')){ if($seg -match '^[0-9]+$'){ $ports += [int]$seg } }` +
      `}` +
    `}`,
    `$ports = $ports | Sort-Object -Unique`,
    `Write-Output ('PORTS:' + ($ports -join ','))`,
  ].join("; ")
}

/* ── IIS sitesi oluştur (idempotent) ─────────────────────────────────── */
/**
 * WebAdministration modülü kullanır. Site varsa yeniden oluşturmaz, sadece
 * binding/path günceller. Yoksa New-Website ile oluşturur. App pool yok —
 * default app pool kullanılır.
 *
 * @param siteName     IIS site adı (örn RFID_A001)
 * @param physicalPath fiziksel klasör (örn C:\inetpub\wwwroot\rfid_a001)
 * @param port         dinleyeceği TCP port
 */
export function buildCreateIisSite(siteName: string, physicalPath: string, port: number): string {
  const n = psQuote(siteName)
  const p = psQuote(physicalPath)
  return [
    `Import-Module WebAdministration -ErrorAction Stop`,
    `$name='${n}'`,
    `$path='${p}'`,
    `$port=${port}`,
    `if(-not (Test-Path -LiteralPath $path)){throw ('Site klasoru bulunamadi: ' + $path)}`,
    `$existing = Get-Website | Where-Object { $_.Name -eq $name }`,
    `if($existing){` +
      `try{Set-ItemProperty -Path ('IIS:\\Sites\\' + $name) -Name physicalPath -Value $path -ErrorAction Stop}catch{}; ` +
      `try{$existing.Bindings.Collection.Clear()}catch{}; ` +
      `try{New-WebBinding -Name $name -Protocol http -Port $port -IPAddress * -ErrorAction Stop | Out-Null}catch{}; ` +
      `$result='EXISTS'` +
    `} else {` +
      `New-Website -Name $name -PhysicalPath $path -Port $port -Force | Out-Null; ` +
      `$result='CREATED'` +
    `}`,
    // Önce app pool'u başlat (site start'ın başarılı olması için gerekli)
    `try{` +
      `$poolName = (Get-ItemProperty -Path ('IIS:\\Sites\\' + $name) -Name applicationPool -ErrorAction Stop).Value; ` +
      `if($poolName){` +
        `$poolState = (Get-WebAppPoolState -Name $poolName -ErrorAction Stop).Value; ` +
        `if($poolState -ne 'Started'){Start-WebAppPool -Name $poolName -ErrorAction Stop | Out-Null}` +
      `}` +
    `}catch{}`,
    // Site'ı başlat — zaten çalışıyorsa atla
    `try{` +
      `$siteState = (Get-WebsiteState -Name $name -ErrorAction Stop).Value; ` +
      `if($siteState -ne 'Started'){Start-Website -Name $name -ErrorAction Stop | Out-Null}` +
    `}catch{}`,
    // Durumu doğrula — hâlâ Stopped ise hata fırlat (gerçek problem varsa göster)
    `Start-Sleep -Milliseconds 500`,
    `$finalState = (Get-WebsiteState -Name $name -ErrorAction SilentlyContinue).Value`,
    `if($finalState -eq 'Stopped'){throw ('Site olusturuldu ama baslatilamadi: ' + $name + ' (port ' + $port + ' kullaniliyor olabilir)')}`,
    // PowerShell error stream'ini temizle (eski yakalanan hatalar stderr'e sızmasın)
    `$Error.Clear()`,
    `$global:LASTEXITCODE=0`,
    `Write-Output ($result + ':' + $finalState)`,
  ].join("; ")
}
