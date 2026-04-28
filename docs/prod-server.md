# Üretim Sunucusu — 10.10.10.5

**Tek başvuru noktası**: tüm prod ortam bilgileri, erişim kimlikleri,
yönetim komutları, deploy akışı ve yaşanmış tuzaklar bu dosyada.

---

## 1) Sunucu

| Alan | Değer |
|---|---|
| IP (LAN) | `10.10.10.5` |
| Hostname | `PUSULA2024` |
| OS | Windows Server 2019 |
| Kurulum kökü | `C:\PusulaProd\` |
| Log'lar | `C:\PusulaProd\logs\*.log` |
| RDP | `10.10.10.5:3389` |
| **Administrator parolası** | `Serv108Psl.*` |

### WAN
- Domain: **`app.pusulanet.net`** → 10.10.10.5'e DNS yönlendi (28.04.2026)
- Port 80 → `127.0.0.1:4000` (Switch) — netsh portproxy
- IIS Default Web Site → `Stop-Website` + `serverAutoStart=$false` (port 80 boşaltıldı)

---

## 2) SQL Server

| Alan | Değer |
|---|---|
| Edition | SQL Server 2022 (16.00.1000) |
| Endpoint | `localhost,1433` (LAN'dan da: `10.10.10.5,1433`) |
| **sa parolası** | `P67S96L332008%` |
| DB'ler | `PusulaHub` (5635 firma), `SpareFlow` (41 müşteri / 34 kurulum) |
| Recovery model | FULL |

### Hızlı bağlantı (PowerShell)
```powershell
$cs = "Server=10.10.10.5,1433;Database=PusulaHub;User Id=sa;Password=P67S96L332008%;TrustServerCertificate=True;"
$conn = New-Object System.Data.SqlClient.SqlConnection $cs; $conn.Open()
```

> SSMS: doğrudan `10.10.10.5` + sa / parolayla bağlanılır.

---

## 3) PM2 — 3 + 1 process

| ID | Process | Port | Kurulum | Script |
|---|---|---|---|---|
| 0 | switch | 4000 | `C:\PusulaProd\PusulaSwitch` | next start --port 4000 |
| 1 | hub | 4242 | `C:\PusulaProd\PusulaHub\apps\web` | node -r tsx/cjs server.ts |
| 2 | spareflow | 4243 | `C:\PusulaProd\SpareFlow\spare-flow-ui` | node server.js |
| - | pm2-logrotate | (modül) | - | 10 MB rotate, 30 dosya, gzip, gece 00:00 |

```powershell
pm2 list
pm2 logs hub --lines 50 --nostream
pm2 restart hub
pm2 monit                 # canlı CPU/RAM
pm2 save                  # boot persistence
```

### Boot startup
`pm2-windows-startup install` ile bir defa kurulu. Reboot sonrası 3 process otomatik kalkar.

---

## 4) Panel erişimi

| URL | Açıklama |
|---|---|
| **http://10.10.10.5/** | Ana panel (port 80 → 4000 portproxy) |
| http://10.10.10.5:4000 | Switch direkt |
| http://10.10.10.5:4242 | Hub direkt (basePath /apps/hub) |
| http://10.10.10.5:4243 | SpareFlow direkt (basePath /apps/spareflow) |
| **http://app.pusulanet.net/** | WAN |

---

## 5) Günlük deploy

```powershell
cd C:\PusulaProd\PusulaHub
.\deploy.ps1 hub          # sadece Hub
.\deploy.ps1 switch       # sadece Switch
.\deploy.ps1 spareflow    # sadece SpareFlow
.\deploy.ps1 all          # 3'ünü birden
```

Her uygulama için: `git pull && pnpm install && pnpm build && pm2 restart`.

---

## 6) Uzaktan yönetim — WinRM

Dev makineden RDP açmadan komut çalıştırma. Sunucuda WinRM 5985 açık.

```powershell
# Dev PC'de bir kerelik (Yönetici PowerShell)
Set-Item WSMan:\localhost\Client\TrustedHosts -Value "10.10.10.5" -Force

# Her komut için
$pass = ConvertTo-SecureString "Serv108Psl.*" -AsPlainText -Force
$cred = New-Object PSCredential("Administrator", $pass)
Invoke-Command -ComputerName 10.10.10.5 -Credential $cred -ScriptBlock {
  pm2 list
  Get-Content C:\PusulaProd\logs\hub-err.log -Tail 50
}
```

---

## 7) Bağımlı altyapı (Ubuntu 10.15.2.6)

| Servis | Detay |
|---|---|
| **Fastify API** | pm2 `fastify-api`, `:3000`, admin key `69432a3c21bcb...` |
| **Uptime Kuma** | docker, `:3001`, admin `muharrem.oz@pusulanet.net` / `4Dr616R4wwqA` |

Ubuntu SSH: `root` / `4Dr616R4wwqA`. SQLite Kuma DB: `/opt/uptime-kuma/data/kuma.db`.

### Sunucudan altyapıya erişim — FortiClient VPN
**Mutlaka kurulu olmalı**, "Always Up / Auto Connect on Boot" aktif. Yoksa
SpareFlow Fastify (`10.15.2.6:3000`) ve SFTP (`192.168.169.203:6598`) WAN
fallback'e düşer, dashboard yavaş yüklenir / boş gelir.

```powershell
# VPN test
Test-NetConnection 10.15.2.6 -Port 3000        # Fastify
Test-NetConnection 192.168.169.203 -Port 6598  # SFTP
```

---

## 8) Windows Agent (5 sunucu)

| Sunucu | IP | Hostname | WinRM |
|---|---|---|---|
| Mobil | 10.15.2.3 | PUSULAMOBILEAPP | ✓ |
| SQL | 10.15.2.2 | PUSULASQL | ✓ |
| Terminal 1 | 10.15.2.5 | PUSULARDP | ✓ |
| Active Directory | 10.15.2.4 | PUSULAPC | ✗ (SMB+WMI ile) |
| Depo | 10.15.2.200 | PUSULARESIM | ✗ (SMB+WMI ile) |

Hepsinde local user **`alusup`** (admin), parolaları `Servers.Password`'da
AES-256-GCM ile şifrelenmiş. Decrypt için `apps/web/.env.local` ENCRYPTION_KEY
+ Node `crypto.createDecipheriv('aes-256-gcm', ...)`.

Agent recompile runbook için: dev makinemde memory'de var (`project_agent_remote_deploy.md`).
Tek satırda: dev'den `PusulaAgent.cs` + `PusulaNotify.cs` + `KUR.bat` byte[]'larını
WinRM/SMB ile push, KUR.bat içeriğini inline PowerShell olarak çalıştır
(admin elevation prompt'u WinRM'de takılır).

---

## 9) Bilinen tuzaklar (yaşandı, çözüldü)

### NODE_ENV — PM2 env'inde **zorunlu**
`apps/web/server.ts:20` `dev = NODE_ENV !== "production"`. PM2 env'de
yoksa Hub dev modda kalır → `.env.production` yüklenmez → `Login failed
for user 'SA'`. `ecosystem.prod.config.js` her 3 app'te `env: { NODE_ENV:
"production" }` set. Env değişikliği için `pm2 delete + start` zorunlu
(sadece `pm2 restart` env'i güncellemez).

### PM2 Windows wrapper log capture
`script: "cmd.exe", args: "/c pnpm start"` Windows'ta alt process
stdout/stderr'ını PM2 log dosyalarına yazmıyordu (boş). Çözüm:
`package.json` start script'inin gerçek karşılığını ver — Hub için
`script: "server.ts", interpreter: "node", interpreter_args: "-r tsx/cjs"`,
Switch için `next CLI`, SpareFlow için `server.js`.

### ENCRYPTION_KEY — DEV ↔ PROD aynı olmalı
`Servers.Password` ve `Servers.SqlPassword` AES-256-GCM ile şifreli. Dev'de
şifrelenen bir değer prod'da çözülemez ise (key farklı) Hub agent-poller'da
`[crypto.decrypt] çözme hatası` her 10sn yazar. Dev `.env.local`'deki key
prod `.env.production`'a aynen kopyalanmalı.

### `Add-Content` UTF-16 BOM tuzağı
PowerShell 5.1 `Add-Content` UTF-16 LE BOM ile yazıyor → dotenv parse edemiyor
→ env okunmamış gibi davranıyor. Doğru kullanım:
```powershell
[IO.File]::WriteAllText($envPath, $content, [System.Text.UTF8Encoding]::new($false))
```

### SQL FK error 1750 — asıl mesaj gizleniyor
`Could not create constraint or index. See previous errors.` (number=1750)
Hub log'unda asıl hata `precedingErrors: [Array]` içinde gizlenir. Manuel SQL
ile reproduce et, gerçek mesajı oku. İki yaygın kök neden:
1. **FK kolon tipi/uzunluğu eşleşmiyor** (örn. `Messages.Id NVARCHAR(50)` ↔
   `MessageRecipients.MessageId UNIQUEIDENTIFIER`) → tip+uzunluk birebir eşle
2. **DB-wide named constraint çakışması** → yeni tablolarda **anonymous**
   constraint kullan (`PRIMARY KEY` yerine `CONSTRAINT PK_X PRIMARY KEY`
   kullanma)

### Server 2019 + winget
`setup-prod.ps1` Node + Git'i `winget` ile kurmaya çalışır. Server 2019'da
winget yok. Önce manuel MSI kur, sonra script idempotent şekilde devam eder.

### IIS 80'i Default Web Site tutuyor
Port 80'i Default Web Site dinliyordu, portproxy 80 → 4000 yapamadık. Çözüm:
```powershell
Stop-Website "Default Web Site"
Set-ItemProperty "IIS:\Sites\Default Web Site" -Name serverAutoStart -Value $false
netsh interface portproxy add v4tov4 listenaddress=0.0.0.0 listenport=80 connectaddress=127.0.0.1 connectport=4000
```

---

## 10) `setup-prod.ps1` ön koşulları (sıradaki kurulum için)

1. SQL Server Express + SSMS kurulu
2. `PusulaHub` ve `SpareFlow` DB'leri oluşturulmuş, dev'den restore edilmiş
3. Node + Git **manuel** kurulu (Server 2019'da winget yok):
   - https://github.com/git-for-windows/git/releases (Git for Windows)
   - https://nodejs.org/dist/v20.18.0/node-v20.18.0-x64.msi
4. PowerShell **Yönetici** olarak: `Set-ExecutionPolicy -Scope Process Bypass`
5. `setup-prod.ps1`'i `C:\setup-prod.ps1`'e kopyala, çalıştır
6. SA parolasını sorduğunda gir (`P67S96L332008%`)
7. Sonradan: `pm2-startup install` (boot persistence)

---

## 11) Faydalı tek satırlar

```powershell
# Tüm process durumu + uzaktan log
pm2 list
pm2 logs hub --lines 100 --nostream

# DB'den son mesajlar
sqlcmd -S 10.10.10.5 -U sa -P 'P67S96L332008%' -d PusulaHub -Q "SELECT TOP 5 Subject, SentAt FROM Messages ORDER BY SentAt DESC"

# Acil — Hub kapandıysa
pm2 restart hub
pm2 logs hub --err --lines 30 --nostream

# Disk yer
Get-PSDrive C | Select Used, Free

# Eski log'lar
Get-ChildItem C:\PusulaProd\logs\*.log.gz | Sort LastWriteTime -Desc | Select Name, Length, LastWriteTime
```
