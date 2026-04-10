/**
 * Active Directory PowerShell komut üreticileri.
 *
 * Hub agent'ın `/api/exec` endpoint'ine PowerShell stringleri gönderir;
 * agent bunu `powershell.exe -NonInteractive -Command "..."` şeklinde
 * çalıştırır. Bütün komutlar:
 *
 *   - Idempotent — varsa hata vermeden geçer
 *   - Tek satırlı (agent stdin parser tek satır bekliyor olabilir; biz `;` ile zincirliyoruz)
 *   - **Çift tırnak KULLANMAZ** — agent'ın JSON parser'ı (`HandleExec` içinde basit regex)
 *     JSON escape'lerini anlamadığı için, komut içindeki herhangi bir `"` ilk
 *     `\"` sekansında komutu keser. Tüm string literal'lar single-quote ile,
 *     değişken interpolasyonları ise string concatenation (`'foo' + $var`) ile
 *     yapılır. Filter argümanları ise scriptblock form (`-Filter { ... }`) ile
 *     verilir — bu sayede hiç çift tırnak gerekmez.
 *   - Kullanıcı girdisi `psQuote` ile escape edilir
 *
 * Çıkış kuralı: Başarılı = stdout'a `OK` / `CREATED` / `EXISTS` yazılır,
 * hata varsa stderr'e PowerShell exception'ı düşer.
 */

/** PowerShell single-quoted string için ' karakterini '' yapar. */
function psQuote(s: string): string {
  return (s ?? "").replace(/'/g, "''")
}

/* ── Firmalar parent OU ────────────────────────────────────────────── */
export function buildEnsureFirmalarOu(): string {
  return [
    `Import-Module ActiveDirectory -ErrorAction Stop`,
    `$d=(Get-ADDomain).DistinguishedName`,
    `$ou=Get-ADOrganizationalUnit -Filter { Name -eq 'Firmalar' } -SearchBase $d -SearchScope OneLevel -ErrorAction SilentlyContinue`,
    `if(-not $ou){New-ADOrganizationalUnit -Name 'Firmalar' -Path $d -ProtectedFromAccidentalDeletion $false}`,
    `Write-Output 'OK'`,
  ].join("; ")
}

/* ── Firma OU (Firmalar altında) ───────────────────────────────────── */
export function buildEnsureFirmaOu(firmaId: string): string {
  const f = psQuote(firmaId)
  return [
    `Import-Module ActiveDirectory -ErrorAction Stop`,
    `$d=(Get-ADDomain).DistinguishedName`,
    `$p='OU=Firmalar,' + $d`,
    `$ou=Get-ADOrganizationalUnit -Filter { Name -eq '${f}' } -SearchBase $p -SearchScope OneLevel -ErrorAction SilentlyContinue`,
    `if(-not $ou){New-ADOrganizationalUnit -Name '${f}' -Path $p -ProtectedFromAccidentalDeletion $false}`,
    `Write-Output 'OK'`,
  ].join("; ")
}

/* ── Güvenlik grubu: {firmaId}_users ────────────────────────────────── */
export function buildEnsureGroup(firmaId: string): string {
  const f = psQuote(firmaId)
  const groupName = `${f}_users`
  return [
    `Import-Module ActiveDirectory -ErrorAction Stop`,
    `$d=(Get-ADDomain).DistinguishedName`,
    `$p='OU=${f},OU=Firmalar,' + $d`,
    `$g=Get-ADGroup -Filter { Name -eq '${groupName}' } -SearchBase $p -ErrorAction SilentlyContinue`,
    `if(-not $g){New-ADGroup -Name '${groupName}' -SamAccountName '${groupName}' -GroupCategory Security -GroupScope Global -Path $p}`,
    `Write-Output 'OK'`,
  ].join("; ")
}

/* ── Domain kullanıcısı ─────────────────────────────────────────────── */
export interface AdUserInput {
  /** Tam SamAccountName, ör: "343.ahmet" (firmaId prefix dahil) */
  username:    string
  password:    string
  displayName: string
  email:       string
  phone:       string
  /** Office alanı = firma adı */
  office:      string
}

export function buildCreateUser(firmaId: string, user: AdUserInput): string {
  const f = psQuote(firmaId)
  const u = psQuote(user.username)
  const pw = psQuote(user.password)
  const dn = psQuote(user.displayName || user.username)
  const em = psQuote(user.email || "")
  const ph = psQuote(user.phone || "")
  const of = psQuote(user.office || "")

  // displayName → GivenName + Surname best-effort
  const parts = (user.displayName || "").trim().split(/\s+/).filter(Boolean)
  const given   = parts.length > 0 ? parts[0]                : user.username
  const surname = parts.length > 1 ? parts.slice(1).join(" ") : ""
  const givenP   = psQuote(given)
  const surnameP = psQuote(surname)

  return [
    `Import-Module ActiveDirectory -ErrorAction Stop`,
    `$d=(Get-ADDomain).DistinguishedName`,
    `$dns=(Get-ADDomain).DNSRoot`,
    `$p='OU=${f},OU=Firmalar,' + $d`,
    `$upn='${u}@' + $dns`,
    `$ex=Get-ADUser -Filter { SamAccountName -eq '${u}' } -ErrorAction SilentlyContinue`,
    `if($ex){Write-Output 'EXISTS'} else {` +
      `$sec=ConvertTo-SecureString '${pw}' -AsPlainText -Force; ` +
      `New-ADUser -Name '${u}' -SamAccountName '${u}' -UserPrincipalName $upn ` +
      `-GivenName '${givenP}' -Surname '${surnameP}' -DisplayName '${dn}' ` +
      `-EmailAddress '${em}' -OfficePhone '${ph}' -Office '${of}' ` +
      `-Description '${pw}' ` +
      `-AccountPassword $sec -Enabled $true -Path $p ` +
      `-ChangePasswordAtLogon $false -PasswordNeverExpires $true; ` +
      `Write-Output 'CREATED'` +
    `}`,
  ].join("; ")
}

/* ── Kullanıcıyı gruba ekle ─────────────────────────────────────────── */
export function buildAddGroupMember(firmaId: string, username: string): string {
  const f = psQuote(firmaId)
  const u = psQuote(username)
  const groupName = `${f}_users`
  return [
    `Import-Module ActiveDirectory -ErrorAction Stop`,
    `try{Add-ADGroupMember -Identity '${groupName}' -Members '${u}' -ErrorAction Stop; Write-Output 'ADDED'}` +
    `catch{if($_.Exception.Message -match 'already a member'){Write-Output 'EXISTS'} else {throw}}`,
  ].join("; ")
}
