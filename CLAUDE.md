# PusulaHub — Claude Geliştirme Kuralları

## Proje Hakkında
PusulaHub, Windows/Linux sunucularını yöneten bir Next.js 15 (App Router) + TypeScript + Tailwind CSS v4 panelidir.
Monorepo yapısı: `apps/web` ana uygulama dizinidir.

---

## UI Geliştirme Kuralları

### shadcn/ui Zorunludur
- **Her UI elemanı için önce `src/components/ui/` içinde shadcn komponenti aranmalıdır.**
- shadcn'de karşılığı olan bir component için özel (custom) implementasyon YAPILMAZ.
- Örnek: tablo için `<table>` + custom div grid değil → `Table, TableHeader, TableRow, TableCell` kullanılır.
- Örnek: dialog için custom modal değil → `Dialog` veya `AlertDialog` kullanılır.
- Örnek: bildirim için custom toast değil → `sonner` (toast) kullanılır.
- Örnek: filtre butonları için custom pill değil → `Toggle` / `ToggleGroup` kullanılır.

### Mevcut shadcn Componentleri
Aşağıdaki componentler `src/components/ui/` altında kurulu ve kullanıma hazırdır:

| Component | Kullanım |
|-----------|----------|
| `alert` | Uyarı / bilgi kutuları |
| `alert-dialog` | Onay gerektiren işlemler (sil, devre dışı bırak) |
| `avatar` | Kullanıcı avatarı |
| `badge` | Durum etiketleri |
| `button` | Tüm butonlar |
| `calendar` | Tarih seçici |
| `card` | İçerik kartları |
| `chart` | Grafik / istatistik (Recharts tabanlı) |
| `checkbox` | Çoklu seçim |
| `collapsible` | Açılır/kapanır alan |
| `command` | Arama + combobox |
| `context-menu` | Sağ tık menüsü |
| `dialog` | Modal dialog |
| `drawer` | Mobil uyumlu sheet alternatifi |
| `dropdown-menu` | Açılır menü |
| `input` | Metin girişi |
| `label` | Form etiketi |
| `pagination` | Sayfalama |
| `popover` | Açılır kutu |
| `progress` | İlerleme çubuğu |
| `scroll-area` | Kaydırılabilir alan |
| `select` | Tek seçim dropdown |
| `separator` | Ayırıcı çizgi |
| `sheet` | Yan panel (drawer) |
| `sidebar` | Ana navigasyon sidebar |
| `skeleton` | Yükleme iskelet |
| `sonner` | Toast bildirimleri |
| `switch` | Aç/kapat toggle |
| `table` | Veri tabloları |
| `tabs` | Sekme navigasyonu |
| `toggle` | Tek toggle buton |
| `toggle-group` | Filtre pill grubu |
| `tooltip` | Açıklama balonu |

### Yeni Component Gerekirse
Projede olmayan bir shadcn componenti gerekiyorsa önce şu komutla kurulur:
```bash
npx shadcn@latest add <component-adı>
```
Kurulmadan custom implementasyon yapılmaz.

---

## Proje Tasarım Standardı

### Renk ve Yapı
- Dış kart arka planı: `#F4F2F0` (beige)
- İç kart arka planı: `#FFFFFF` + `boxShadow: "0 2px 4px rgba(0,0,0,0.06)"`
- Dış kart radius: `rounded-[8px]`
- İç kart radius: `rounded-[4px]`
- Input/buton radius: `rounded-[5px]`
- Dış kart padding: `p-2 pb-0`, alt boşluk için `<div className="h-2" />`

### Tipografi
- Başlık (section header): `text-[10px] font-medium text-muted-foreground tracking-wide uppercase`
- Tablo verisi: `text-[11px]`
- Mono değerler (IP, kullanıcı adı): `font-mono`
- Büyük sayı (KPI): `text-2xl font-bold tabular-nums`

### Tablo / Liste Standardı
- Header satırı: `bg-muted/30 border-b border-border/40`
- Veri satırı: `hover:bg-muted/20 transition-colors`
- Satır ayırıcı: `divide-y divide-border/40`
- Aksiyon menüsü: `MoreVertical` ikonlu `DropdownMenu` (ayrı ikon buton kullanılmaz)
- Footer: ikon + `X kayıt listeleniyor`
- Container: `rounded-[4px] overflow-hidden`

### Sheet Standardı
- Genişlik: `!w-[520px] !max-w-[520px]`
- Yapı: `p-0 flex flex-col gap-0`
- Header: `px-5 py-4 border-b border-border/50`
- İçerik: `<ScrollArea className="flex-1">` + `px-4 py-4 space-y-3`
- Section kart: `rounded-[5px] border border-border/50 overflow-hidden`
- Section başlık: `px-3 py-2 bg-muted/30 border-b border-border/40`
- Alan (field): `Label` + shadcn `Input`, `rounded-[5px] h-8 text-[11px]`
- Footer: `px-5 py-3 border-t border-border/50`

### AlertDialog Standardı
Silme, devre dışı bırakma gibi destructive işlemlerde mutlaka `AlertDialog` kullanılır.
- Onay butonu destructive işlemde: `bg-destructive text-white`

### Toast Standardı
- `sonner` paketi kullanılır: `import { toast } from "sonner"`
- Başarı: `toast.success("Mesaj", { description: "Alt bilgi" })`
- Hata: `toast.error("Mesaj")`
- Konum: `top-center`

---

## Proje Prensipleri

### 1. Hız
- API response süreleri minimize edilmeli
- Gereksiz re-render, büyük bundle, ağır kütüphane eklenmemeli
- DB sorgularında sadece gerekli kolonlar seçilmeli, `SELECT *` kullanılmaz
- Sayfalama (pagination) büyük listelerde zorunludur
- **Tüm veri yüklemeleri `Skeleton` ile gösterilir** — `loading` state'i olan her sayfa/bileşen, veri gelene kadar shadcn `Skeleton` komponenti kullanır. Spinner veya düz boş alan kullanılmaz.

### 2. Kaynak Tasarrufu
- Bağlı sunucularda ağır işlem yapılmaz (yoğun polling, büyük veri transferi yasak)
- Agent'lar minimum CPU/RAM kullanacak şekilde tasarlanır
- Monitoring aralıkları makul tutulur (örn. 30-60 sn), saniyede çoklu istek atılmaz

### 3. Güvenlik
- Tüm DB sorguları parametreli yazılır, string concatenation ile sorgu oluşturulmaz
- API endpoint'leri authentication kontrolü gerektirir
- Hassas bilgiler (şifre, token) loglara yazılmaz, response'a dahil edilmez
- `.env.local` asla commit edilmez

### 4. Boş Veri Durumu
- Bir sayfada gösterilecek veri yoksa boş alan + açıklayıcı mesaj + yönlendirme butonu gösterilir
- "Henüz kayıt yok" tarzı mesajlar yerine kullanıcıyı bir sonraki adıma yönlendiren UI kullanılır
- Örnek: "Henüz sunucu eklenmedi → Sunucu Ekle butonu" veya "Firma kurulum sihirbazına git"

---

## Bilinen Sorunlar ve Çözümler

### Sunucu Slug Routing — 404 Sorunu
Sunucu adında boşluk veya özel karakter varsa (örn. "Active Directory", "Terminal 1"), URL slug `active-directory` olur ama `LOWER(Name) = 'active directory'` ≠ `'active-directory'` → 404.

**Çözüm:** API route'larında önce `WHERE Id = ${id}` ile dene, bulunamazsa tüm sunucuları çekip JS'de `slugify(s.Name) === id` ile eşleştir. Detail route bu şekilde düzeltilmiştir: `apps/web/src/app/api/servers/[id]/detail/route.ts`

> Sunucu adını kullanan her yeni route'da (detail, notify, messages, exec) bu pattern uygulanmalıdır.

---

### Agent exec — PowerShell Komutlarında `"` Yasak
Agent `/api/exec` endpoint'i JSON regex-parse eder. Komut içinde çift tırnak `"` kullanılırsa parse bozulur, komut hata verir.

**Çözüm:** Tüm PS komutlarını tek tırnak `'` ile yaz. Değişken içinde `'` geçiyorsa `''` ile escape et (`psEscape` fonksiyonu).

---

### IISSites — CHECK Constraint Sessiz Fail
`IISSites.Status` kolonu `CHECK (Status IN ('Started', 'Stopped'))` kısıtına sahip. Agent `"Unknown"` gibi farklı bir değer gönderirse INSERT sessizce reddedilir, hata fırlatmaz.

**Kural:** Agent ve agent-poller'dan gelen tüm status değerleri DB constraint'e uygun olmalı. Fallback her zaman constraint listesindeki geçerli bir değer olmalı.

---

### Switch + Hub — İki Next Dev Server Çakışması
PusulaSwitch (:4000) gateway olarak `/apps/hub/*` isteklerini Hub'a (:4242) rewrite ediyor. **İki uygulama da `next dev` modunda çalışırsa** tarayıcıda `Cannot read properties of undefined (reading 'call')` / `originalFactory is undefined` hatası + dev overlay'de `(outdated) Webpack` etiketi görülür. Sebep: Switch'in HMR runtime'ı (`:4000/_next/*`) ve Hub'ın HMR runtime'ı (`:4242/apps/hub/_next/*`) aynı browser window'da yan yana çalışınca webpack module registry çakışır.

**Çözüm:** Switch'i production modda çalıştır (HMR gereksiz), Hub dev'de kalsın.

```bash
# Switch — nadir değişir
cd PusulaSwitch && pnpm build && pnpm start   # :4000

# Hub — aktif geliştirme
cd PusulaHub/apps/web && pnpm dev             # :4242, HMR çalışır
```

Switch kodunda değişiklik olursa `pnpm build && pnpm start` tekrar.

---

### SpareFlow — LAN'daki Diğer PC'de Dashboard Skeleton'da Takılıyor
Aynı hatanın SpareFlow versiyonu. SpareFlow `next dev` modunda Switch
gateway (`:4000/apps/spareflow/*`) arkasından LAN'daki başka bir PC'ye
sunulduğunda HMR WebSocket (`/apps/spareflow/_next/webpack-hmr`)
proxy'den geçemiyor (`ERR_INVALID_HTTP_RESPONSE`). Turbopack dev chunk'ları
tutarsız yükleniyor, useEffect hiç ateşlenmiyor, `loading` state hep
`true` kalıyor → 4 skeleton kartta takılıp kalıyor. API'ler 200 döner,
`fetch("/api/dashboard/summary")` console'dan manuel çağırıldığında
veri gelir — ama sayfa render olmaz.

**Çözüm:** SpareFlow'u da prod modda çalıştır (`ecosystem.config.js`
zaten böyle ayarlı: `args: "/c npm run start"`, `env: { PORT: "4243" }`).

```bash
cd "C:/GitHub/Pusula Yazılım/SpareFlow/spare-flow-ui"
npm run build
pm2 restart spareflow
```

> Kural: Switch gateway arkasındaki her alt uygulama **prod modda**
> çalıştırılmalıdır. Sadece Hub dev modda kalabilir çünkü doğrudan
> `:4242` üzerinden geliştirilir, gateway arkasından değil.

---

### SpareFlow — Client Fetch basePath Patch'i `<head>`'de Olmalı
SpareFlow `basePath: "/apps/spareflow"` ile çalışıyor. Next client-side
`fetch("/api/...")` çağrılarına basePath'i otomatik eklemez — runtime
monkey-patch gerekir. Patch'i **`<FetchBasePath />` gibi bir
component'in `useEffect`'ine koymak yetmez**: React child effect'leri
parent effect'lerinden önce ateşlenir, yani `Sidebar`'ın
`fetch("/api/auth/me")` çağrısı patch uygulanmadan çalışır ve istek
Switch gateway'in `/api/auth/me`'sine düşer (Switch bu path'i kendi
session handler'ına yönlendiriyor, farklı şekilde bir JSON döner,
SpareFlow UI sessizce kırılır).

**Çözüm:** Patch'i `app/layout.tsx`'te `<head>` içinde inline `<script>`
olarak ver — React hydration'dan **önce** senkron çalışsın:

```tsx
const fetchBasePathPatch = `(function(){
  if (typeof window === "undefined" || window.__fetchPatched) return;
  window.__fetchPatched = true;
  var BP = "/apps/spareflow";
  var orig = window.fetch.bind(window);
  window.fetch = function(input, init){
    // ... /api/ ile başlıyorsa BP prefix'le
  };
})();`;

<head><script dangerouslySetInnerHTML={{ __html: fetchBasePathPatch }} /></head>
```

Debug için: tarayıcı console'dan `window.__fetchPatched` → `true` olmalı.
`fetch("/api/auth/me")` SpareFlow şeklini (`{id, email, perms, ...}`)
dönmeli — Switch şeklini (`{user: {...}}`) DEĞİL.

---

### LAN HTTP'de Cookie Secure Flag → Sonsuz Login Döngüsü
Hub/Switch login endpoint'leri cookie'yi `secure: true` basarsa Chrome/Edge
HTTP üzerinden (LAN, `10.10.10.x`) cookie'yi reddeder, kullanıcı login sonrası
yine login ekranına düşer. `localhost` istisnası sadece lokal makineyi kurtarır.

**Çözüm:** `secure` flag'i istek protokolüne göre dinamik belirle:

```ts
const proto   = req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(":", "")
const isHttps = proto === "https"
res.cookies.set(COOKIE_NAME, jwt, { /* ... */ secure: isHttps })
```

`process.env.NODE_ENV === "production"` ile belirlemek YANLIŞ — prod
build HTTP üzerinden de çalışabilir.

---

### Next 15 Edge Middleware — Absolute Location Header Zorunlu
`src/middleware.ts` içinde 307/308 redirect yapılırken Location header **absolute URL** olmalı. Relative (`/login?next=...`) verilirse Next 15 edge adapter (adapter.js:318) `new NextURL(location)` ile parse ederken "Invalid URL" atar ve tüm istekler 500 döner (vercel/next.js#67277).

```ts
const fwdProto = req.headers.get("x-forwarded-proto")
const fwdHost  = req.headers.get("x-forwarded-host")
const origin   = fwdHost ? `${fwdProto ?? "http"}://${fwdHost}` : req.nextUrl.origin

return new NextResponse(null, {
  status: 307,
  headers: { Location: `${origin}/login?next=${encodeURIComponent(next)}` },
})
```

Ayrıca `server.ts`'de `next()` çağrısına **hostname ve port zorunlu** — eksikse Next internal URL builder `http://localhost:undefined/...` üretir:
```ts
const app = next({ dev, hostname: "localhost", port })
```

---

### Command (cmdk) Combobox — Büyük Listede Yavaş Açılma
`Popover + Command` kombinasyonunda çok sayıda item (100+) varsa dropdown açılışı 3-4 saniye sürebilir. `cmdk` varsayılan olarak tüm item'ları iç filtreyle işler.

**Çözüm:** `shouldFilter={false}` + harici filtre + `.slice(0, 50)` ile max 50 item render et.

```tsx
const [search, setSearch] = useState("")

const filtered = search.trim()
  ? items.filter((c) => c.name.toLowerCase().includes(search.toLowerCase())).slice(0, 50)
  : items.slice(0, 50)

// JSX:
<Command shouldFilter={false}>
  <CommandInput value={search} onValueChange={setSearch} />
  <CommandList className="max-h-52 overflow-y-auto" onWheel={(e) => e.stopPropagation()}>
    <CommandGroup>
      {filtered.map((c) => (
        <CommandItem key={c.id} value={c.id} onSelect={() => { setSearch("") }}>
          {c.name}
        </CommandItem>
      ))}
    </CommandGroup>
  </CommandList>
</Command>
```

- `onWheel={(e) => e.stopPropagation()}` → Popover içinde mouse wheel scroll'u çalıştırır.
- Seçim sonrası `setSearch("")` ile arama temizlenir.

---

## Windows Agent Deploy

Agent kodu `apps/agent/windows/` altındadır. Üç ana dosya:
- **`PusulaAgent.cs`** — tüm agent mantığı (C#, Windows Service)
- **`PusulaNotify.cs`** — kullanıcı oturumuna inject edilen popup uygulaması
- **`KUR.bat`** — her ikisini derler + Windows Service olarak kurar

### Agent Güncelleme Adımları

| Değişiklik | Kopyalanacak Dosyalar |
|---|---|
| Sadece agent mantığı | `PusulaAgent.cs` + `KUR.bat` |
| Sadece popup | `PusulaNotify.cs` + `KUR.bat` |
| İkisi de | `PusulaAgent.cs` + `PusulaNotify.cs` + `KUR.bat` |

Ardından sunucuda admin olarak `KUR.bat` çalıştırılır. Script:
- Her iki C# dosyasını `csc.exe` ile derler
- Eski servisi durdurur ve siler
- `sc create PusulaAgent ... --service start= auto` ile Windows Service olarak kurar
- Servisi başlatır → sunucu yeniden başlasa da otomatik çalışır

> **Önemli — eski `csc.exe` uyumluluğu:** Sunucularda .NET Framework 2.0/3.5 `csc.exe` olabilir.
> C# 6.0+ özellikleri **kullanılmaz**: `?.` operatörü, `=>` method body, `$""` string interpolation.

> **Not:** `PusulaAgent.ps1` artık kullanılmıyor. Asıl agent `PusulaAgent.cs`'dir.

### Kullanıcı Mesajlaşma Sistemi
WTS session injection ile kullanıcılara anlık popup gönderme ve okundu takibi için:
→ **[docs/messaging-system.md](docs/messaging-system.md)**

---

## PM2 ile 3 Uygulamayı Yönetme

PusulaSwitch + PusulaHub + SpareFlow PM2 altında yönetilir. Config:
`ecosystem.config.js` (repo kökünde). 3 uygulamayı da boot'ta otomatik
başlatır, crash olursa restart eder, tek komutla yönetim sağlar.

### İlk Kurulum (bir defa)
```bash
npm i -g pm2 pm2-windows-startup
cd "C:/GitHub/Pusula Yazılım/PusulaHub"
pm2 start ecosystem.config.js
pm2 save
pm2-startup install      # Windows boot'ta otomatik baslat
```

### Günlük Kullanım
```bash
pm2 list                 # durum
pm2 logs hub             # canli log (hub / switch / spareflow)
pm2 restart hub          # sadece birini yeniden baslat
pm2 restart all          # hepsini
pm2 monit                # CPU/RAM panel
pm2 stop spareflow       # durdur
```

Log dosyalari: `C:\GitHub\Pusula Yazılım\logs\*.log`

### Önemli Notlar
- `ecosystem.config.js` mutlak path kullanir (`C:/GitHub/Pusula Yazılım/...`).
  Baska makinede farkliysa path'leri guncelle.
- Windows'ta `.cmd` dosyalari direkt spawn edilemedigi icin `cmd.exe /c`
  ile sarmalandi (`script: "cmd.exe"`, `args: "/c pnpm dev"`).
- PM2 boot'ta `pm2-startup install` ile kullanici login'inde calisir.
  Login gerektirmeden servis olarak calismasi icin `pm2-installer`
  (ayri kurulum) gerekir.
- Config degistirirsen: `pm2 delete all && pm2 start ecosystem.config.js && pm2 save`

---

## Uygulamayı Başlatma

Port **4242** sabittir (`server.ts`). Başlatmadan önce port kontrolü yapılır:

```powershell
# 1) Port kontrolü
netstat -ano | findstr ":4242" | findstr LISTENING

# 2) Doluysa — PowerShell ile öldür (PID yukarıdaki çıktıdan alınır)
powershell -Command "Stop-Process -Id <PID> -Force"

# 3) Başlat
pnpm dev
```

> **Kural:** `taskkill` ve `wmic` **kullanılmaz** — Git Bash path sorunu nedeniyle çalışmaz.
> Port kapalıysa doğrudan `pnpm dev` başlatılır, beklenmeden çıktı kontrol edilir.

---

## Teknoloji Stack

- **Framework**: Next.js 15 (App Router)
- **Dil**: TypeScript
- **Stil**: Tailwind CSS v4
- **UI**: shadcn/ui + Radix UI
- **İkon**: lucide-react
- **Grafik**: Recharts (shadcn chart wrapper)
- **Animasyon**: tailwindcss-animate, motion
- **Toast**: sonner
- **Paket yöneticisi**: pnpm (monorepo)
- **Build**: Turborepo
