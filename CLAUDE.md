# PusulaHub — Claude Geliştirme Kuralları

> **Biriken iş:** [`TODO.md`](./TODO.md) — yapılacak işler + yapılanların log'u. Yeni oturumda önce bir göz at.

## Proje Hakkında
PusulaHub, Windows/Linux sunucularını yöneten bir Next.js 15 (App Router) + TypeScript + Tailwind CSS v4 panelidir.
Monorepo yapısı: `apps/web` ana uygulama dizinidir.

**Altyapı/deploy:** Coolify + self-hosted Supabase (`hub` şeması), `main`'e push ile
otomatik deploy → **[docs/YENI-SISTEM.md](docs/YENI-SISTEM.md)**. Eski on-prem prod
(10.10.10.5, PM2, MSSQL) **emekli** — `docs/prod-server.md` sadece geçmiş referansı.

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
| ~~`select`~~ | **KULLANMA** → `@/components/ui/combobox` (`Combobox`/`ComboboxMulti`) veya `combobox-select` |
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

> **Tek kaynak: PusulaCRM.** Hub'ın görsel dili PusulaCRM ile **birebir aynıdır**.
> Yeni bir desen gerekince önce `C:\Projeler\PusulaCRM` içindeki karşılığına bak;
> liste/tablo işleri için `PusulaCRM/docs/liste-tasarim-deseni.md` uygulanır.
> Sidebar/app-shell zaten ortak paketten gelir: `@muharremoz/pusula-ui`.

### Renk — SABİT HEX YASAK

Sayfalarda `#F4F2F0`, `#eef3ff`, `#1d64ff` gibi sabit renk **yazılmaz**. Her şey
token üzerinden gider (`globals.css`), böylece koyu tema bedava çalışır.

| Token | Açık | Koyu | Kullanım |
|---|---|---|---|
| `--page-bg` | `#F7F7F8` | `#0F1113` | Sayfa zemini |
| `--section-bg` | `#F0F0F0` | `#131519` | Bölüm paneli (dış kart) |
| `--card` | `#FFFFFF` | `#17191C` | Beyaz kart |
| `--card-shadow` | ince gölge | ışık çizgisi + gölge | Kart elevation |
| `--primary` | `#171717` | `#F5F5F5` | **Siyah/beyaz nötr** — CTA/vurgu |

Kullanım: `bg-[var(--section-bg)]`, `bg-card`, `bg-[var(--page-bg)]`,
`style={{ boxShadow: "var(--card-shadow)" }}`, `bg-primary text-primary-foreground`.

**Koyu tema zorunlu.** Yeni bir renk sınıfı yazarken açık-tema-only üçlü
(`bg-red-50 text-red-700 border-red-200`) kullanma; CRM tonunu kullan:
`bg-red-500/15 text-red-700 dark:text-red-400`.

### Radius
Proje geneli **5px**. `--radius-sm..4xl` hepsi 5px'e sabitlenmiştir.
İstisna: bölüm paneli `rounded-[8px]`, liste alanının üst köşeleri `rounded-t-[10px]`.

### Tipografi / yoğunluk (compact)
- Tablo/liste başlığı: `text-[10px] font-medium text-muted-foreground uppercase tracking-wider`
- Liste satırı: `text-[14px] font-medium leading-[20px]`, hücre `px-4 py-1.5 whitespace-nowrap`
- İkincil metin: `text-muted-foreground text-[12px]`. Boş değer: `—`
- Rozet: `inline-flex rounded-[5px] px-2 py-0.5 text-[11px] font-medium`
- Mono değerler (IP, kullanıcı adı): `font-mono`
- Büyük sayı (KPI): `text-2xl font-bold tabular-nums`

### Liste / tablo standardı

Hazır bileşenler: `@/components/shared/liste-karti` ve
`@/components/shared/liste-filtreleri`. Referans uygulama:
[users/page.tsx](apps/web/src/app/(main)/users/page.tsx).

```tsx
<ListeKarti
  baslik="Kullanıcı Yönetimi"
  ikon={<User className="size-3.5" />}
  toplam={users.length}
  filtreli={filtered.length}
  aksiyon={<ListeAksiyonButonu onClick={...}><Plus className="size-3.5" />Yeni</ListeAksiyonButonu>}
>
  <div className="overflow-x-auto">
    <table className="w-full text-[14px] font-medium leading-[20px]">
      <ListeThead>
        <th className="px-4 py-1.5 text-left font-medium">
          <MetinFiltre label="Kullanıcı" value={adFiltre} onChange={setAdFiltre} />
        </th>
        {/* ... */}
        <th className="px-4 py-1.5 text-right font-medium">İşlem</th>
      </ListeThead>
      <tbody>{/* satırlar — hover:bg-muted/20 */}</tbody>
    </table>
  </div>
</ListeKarti>
```

Yapı: dış panel `bg-[var(--section-bg)] rounded-[8px] p-2` → liste alanı
`rounded-t-[10px] border-t bg-card` + **sadece üstte** yumuşak dış gölge.

**Sütun başlığı filtreleri** — her filtrelenebilir başlık bir Popover trigger'ıdır:
`MetinFiltre` (serbest metin), `SecimFiltre` (çoklu seçim + adet rozeti),
`SayiAralikFiltre` (min–max), `TarihFiltre` (Bugün/Bu hafta/Bu ay/aralık + Calendar).
Filtreler tek `useMemo` içinde **VE (AND)** ile birleşir, erken `return false` deseniyle.

Boş durum: `toplam === 0` ise "Henüz kayıt yok.", filtreliyse "Filtreye uyan kayıt yok."

### UI primitive kuralları (ÖNEMLİ)

- **Açılır listeler tek bileşenden.** Elle `Popover + Command` KURMA:
  - `@/components/ui/combobox` → **`Combobox`** (tek seçim) ve **`ComboboxMulti`** (çoklu).
    Zengin satır (`renderItem`), zengin tetikleyici değeri (`renderValue`), özel
    tetikleyici (`trigger`), yükleniyor iskeleti (`loading`), kontrollü arama
    (`search`/`onSearchChange` — büyük listede `.slice(0, 50)` ile birlikte) destekler.
  - `@/components/ui/combobox-select` → shadcn `Select` ile **aynı API**; eski
    `<Select><SelectItem>` bloklarını değiştirmeden kullanmak için. Aynı paneli çizer.
  - `@/components/ui/select` (shadcn) **kullanma**.
  Onay işareti daima **sağda**, satırlar `text-[13px]`, popover tetikleyici genişliğinde.
- **Checkbox / form alanı** → `@/components/shared/form`: `Checkbox` (CRM'in özel
  `size-4 rounded border` kutusu, aktifken primary dolgu) ve `Field` (etiketli alan).
  Native `<input type="checkbox">` ve pusula-ui Checkbox **kullanılmaz**.
- **İkonlar tek kaynaktan.** Animasyonlu ikonlar [lucide-animated.com](https://lucide-animated.com)
  (pqoqubbw) kaynaklı, `@/components/ui/<name>.tsx` altında; merkezi kayıt
  `@/components/shared/icon-registry.ts`. Kullanım: `<Icon name="users" size={14} />`
  (`@/components/shared/icon`). Yeni ikon:
  `npx --yes shadcn@latest add "https://lucide-animated.com/r/<name>.json"` + registry'ye kayıt.
  Statik `lucide-react` **sadece** o isimde animasyonlu muadil yoksa fallback.
  `iconsax-reactjs` **kullanılmaz** (projeden kaldırıldı).
- **Tarih seçimi daima** shadcn `Calendar` + `Popover`. Native `<input type="date">` yok.
- **Aksiyon menüsü daima** `DropdownMenu` (`@muharremoz/pusula-ui`), `MoreVertical`
  ikonuyla. **Ayraç (`DropdownMenuSeparator`) liste satırı menüsünde kullanılmaz.**
  Yıkıcı öğe: `text-rose-600 focus:text-rose-600`.
- `window.confirm/alert` yok → `AlertDialog` + `sonner` toast.
- İstisna: button, card, sheet, badge, tooltip, sidebar gibi layout primitive'leri
  shadcn default OK.

### Sheet standardı

CRM ile aynı: kenara yapışık değil, **12px boşluklu yüzen panel** — yuvarlak
köşe, section-bg başlık şeridi. Bu görünüm `components/ui/sheet.tsx`'in
**varsayılanıdır**; çağrı yerinde tekrar yazılmaz.

```tsx
<Sheet open={open} onOpenChange={onClose}>
  <SheetContent className="!w-[520px] !max-w-[520px]">
    <SheetHeader>
      <span className="bg-primary/10 text-primary ring-primary/20 flex size-9 shrink-0 items-center justify-center rounded-[5px] ring-1">
        <Icon name="zap" size={18} />
      </span>
      <SheetTitle>Başlık</SheetTitle>
      <SheetDescription>Kısa açıklama.</SheetDescription>
    </SheetHeader>

    <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
      <Field label="Firma" required><FirmaCombobox … /></Field>
      <Field label="Açıklama"><Textarea rows={4} className="resize-none" /></Field>
    </div>

    <SheetFooter className="flex-row">
      <Button variant="outline" className="flex-1" onClick={onClose}>İptal</Button>
      <Button className="flex-1" onClick={kaydet}>Kaydet</Button>
    </SheetFooter>
  </SheetContent>
</Sheet>
```

- **Panel**: `inset-*-3`, `rounded-[10px]`, `overflow-hidden`, `bg-popover` — bileşende hazır.
  Çağrı yerinde yalnız genişlik verilir (`!w-[520px] !max-w-[520px]`).
- **Header**: `bg-[var(--section-bg)] border-b p-4` — bileşende hazır. İkon rozeti
  `size-9 rounded-[5px] bg-primary/10 text-primary ring-1 ring-primary/20`.
  Başlık `text-[15px] font-semibold`, açıklama `text-[12px]`.
- **İçerik**: `flex flex-1 flex-col gap-3 overflow-y-auto p-4`.
- **Footer**: `SheetFooter className="flex-row"` (`border-t p-4` hazır), butonlar `flex-1`.
- **Alan**: `Field` (`@/components/shared/form`) — `Label` `text-foreground/80 text-[12px]
  font-medium`, zorunluysa `*` primary renkte.
- **Kontroller**: `Input` / `Textarea` → `h-8`, `rounded-[5px]`, `text-[13px]` (bileşen
  varsayılanı). Dropdown → `Combobox` / `combobox-select`. Checkbox → `@/components/shared/form`.

> Not: CRM'in sheet'i `@base-ui/react` üzerine kurulu, Hub'ınki Radix üzerinde
> kalır — **görünüm** aynıdır, altyapı farklıdır. Yeni sheet yazarken Radix
> API'sini kullan (`asChild`, `data-[state=open]`), base-ui'ye geçirme.

### AlertDialog standardı
Silme / devre dışı bırakma gibi destructive işlemlerde zorunlu.
Onay butonu: `bg-destructive text-white`.

### Toast standardı
`sonner` — `toast.success("Mesaj", { description: "Alt bilgi" })`,
`toast.error("Mesaj")`. Konum: `top-center`.

### Tema
`next-themes`, `attribute="class"`, **varsayılan `system`** (açık + koyu).
Kullanıcı menüsünden tek tıkla geçiş. Yeni yazılan her şey koyu temada da
okunabilir olmalı.

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

Aynı endpoint'in iki tuzağı daha var:

**1) `^` sessizce karakter yiyor — regex karakter sınıfı kullanma.**
Komut `powershell.exe -Command "..."` olarak çalıştırılıyor ve `^` yol boyunca
escape karakteri gibi yorumlanıyor. Sonuç: ifade hata vermez, **sessizce yanlış
çalışır**.

```powershell
# YANLIS — 4000 karakterlik base64'ten 247 gecerli karakteri yedi (hata vermeden)
((Get-Content $f -Raw) -replace '[^A-Za-z0-9+/=]','').Length   # -> 3753

# DOGRU
((Get-Content $f -Raw) -replace '\s','').Length                # -> 4000
```

Boşluk temizliği için `-replace '\s',''` veya `.Trim()` kullan. Yaşandı:
agent'a dosya aktarırken hash tutmadı, sebebi bulmak yarım saat aldı.

**2) Çok satırlı komut gönderme — satır sonları literal `\n` oluyor.**
Komutu tek satırda `;` ile ayırarak yaz. Aksi halde bir sonraki parametreye
`SilentlyContinue\n'--- baslik ---'` gibi birleşik değer geçer ve
"Cannot bind parameter" hatası alırsın.

---

### Agent'ı Uzaktan Güncelleme (KUR.bat'sız)

`C:\PusulaAgent\__update.ps1` yerleşik güncelleyicidir: servisi durdurur,
`PusulaAgent.exe`'yi `.bak` olarak yedekler, `PusulaAgent.exe.new`'i yerine
taşır, servisi başlatır ve `update.log`'a yazar. Sunucuya RDP/SMB erişimi
olmadan agent güncellemenin yolu budur.

Akış:
1. Yerelde `KUR.bat`'takiyle **birebir aynı** bayraklarla derle
   (`/target:winexe /optimize+ /platform:anycpu` + aynı `/r:` listesi).
2. Exe'yi base64'e çevir, `/api/exec` ile parça parça yaz
   (`Set-Content` + `Add-Content`, ~6000 karakter). Yolları **ileri bölü** ile
   yaz (`C:/PusulaAgent/...`) — betik dilinin `\a`, `\P` kaçışlarına takılmaz.
3. Sunucuda `[Convert]::FromBase64String` ile çöz, **SHA256'yı yerelle
   karşılaştır** — eşleşmeden devam etme.
4. `__update.ps1`'i `Start-Process` ile **ayrı süreç** olarak başlat: updater
   servisi durduruyor, exec komutu servisin çocuğu olduğu için aksi halde
   kendini de öldürür.
5. Agent geri gelene kadar `/api/report`'u yokla, sonra exe SHA'sını doğrula.

**Geri dönüş yolu bırak.** Agent düşerse başka erişim kanalı yok. Tetiklemeden
önce birkaç dakika sonrası için tek seferlik bir görev kur; servis ayakta
değilse `.bak`'i geri yükleyip başlatsın, sonra kendini silsin:

```powershell
schtasks /Create /TN PusulaAgentRollback /TR 'powershell -NoProfile -ExecutionPolicy Bypass -File C:/PusulaAgent/__rollback.ps1' /SC ONCE /ST <HH:mm> /RU SYSTEM /RL HIGHEST /F
```

**Sunucudaki `PusulaAgent.cs`'i de güncellemeyi unutma.** Sadece exe'yi
değiştirirsen kaynak eski kalır; ileride biri `KUR.bat` çalıştırdığında
düzeltme sessizce geri alınır.

---

### IISSites — CHECK Constraint Sessiz Fail
`IISSites.Status` kolonu `CHECK (Status IN ('Started', 'Stopped'))` kısıtına sahip. Agent `"Unknown"` gibi farklı bir değer gönderirse INSERT sessizce reddedilir, hata fırlatmaz.

**Kural:** Agent ve agent-poller'dan gelen tüm status değerleri DB constraint'e uygun olmalı. Fallback her zaman constraint listesindeki geçerli bir değer olmalı.

---

### SQL Server FK — Tip + Uzunluk Birebir Eşleşmeli
Yeni bir tablo oluştururken Foreign Key kurarken, **referans aldığın
kolonun hem TIPİ hem UZUNLUĞU** birebir eşleşmek zorunda. Aksi halde:

```
Error 1750: Could not create constraint or index. See previous errors.
```

Bu hata **Hub log'unda yanıltıcıdır** — gerçek mesajı (`Column 'X' is not
the same data type/length as referencing column 'Y'`) `precedingErrors`
array'inde gizlenir. Asıl hatayı görmek için **manuel SQL** ile CREATE
TABLE'ı doğrudan çalıştır:

```powershell
$cmd.CommandText = "<CREATE TABLE ... FOREIGN KEY ...>"
try { $cmd.ExecuteNonQuery() } catch { $_.Exception.Message }  # asıl mesaj
```

**Yaşandığı yer:** `MessageRecipients.MessageId UNIQUEIDENTIFIER` →
`Messages.Id NVARCHAR(50)` (eski create.sql) → tip uyuşmazlığı → fail.
Çözüm: `MessageId NVARCHAR(50)`.

**Bonus tuzak — DB-wide constraint name uniqueness:** SQL Server
constraint adları (`PK_X`, `DF_X_Y`, `FK_X_Y`) DB-wide unique olmalı.
`IF OBJECT_ID(...) IS NULL` guard'ı tabloyu skip etse bile, parser
constraint adlarını compile-time çözebilir → çakışma → 1750. **Yeni
tablolarda named constraint kullanma**, anonymous bırak (`Id PRIMARY KEY`,
`Type DEFAULT 'info'` gibi) — SQL otomatik benzersiz ad üretir.

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

## Ubuntu Altyapı Sunucusu — 10.15.2.6

Tek bir Ubuntu 22.04 VM, iki rol: **Fastify API** (SpareFlow backend) ve **Uptime Kuma** (tüm sunucuların izlenmesi). LAN only, Pusula network.

### Erişim
| Alan | Değer |
|---|---|
| **LAN IP** | `10.15.2.6` |
| **WAN IP** | `185.130.59.123` |
| **OS** | Ubuntu 22.04.5 LTS |
| **SSH Kullanıcı** | `root` |
| **SSH Parola** | `4Dr616R4wwqA` |

SSH (Windows, Git Bash yok, `taskkill` gibi):
```bash
"C:/Program Files/PuTTY/plink.exe" -ssh -l root -pw "4Dr616R4wwqA" 10.15.2.6 "<komut>"
```

> **Kural:** Bu sunucuda **var olan hiç bir şeye dokunmadan** ekleme yapılır. Fastify API (pm2 `fastify-api`) ve Kuma ayrı ayrı çalışır, birbirini etkilemez. Detaylı Fastify dokümanı: `SpareFlow/docs/fastify-server.md`.

### Fastify API — pm2
| Alan | Değer |
|---|---|
| **Port** | `3000` |
| **pm2 adı** | `fastify-api` |
| **Dizin** | `/root/my-fastify-app/` |
| **Admin API Key** | `69432a3c21bcb005cb0cfd2df2b22c266efeab5a4096e0500ace5a77bdd24f1a` |
| **Auth** | `X-API-Key` header (whitelist: `127.0.0.1`, `10.15.2.x`) |

### Uptime Kuma — Docker
| Alan | Değer |
|---|---|
| **URL** | `http://10.15.2.6:3001` (LAN only) |
| **Container** | `uptime-kuma` (image `louislam/uptime-kuma:1`) |
| **Volume host** | `/opt/uptime-kuma/data/` |
| **SQLite** | `/opt/uptime-kuma/data/kuma.db` |
| **Admin** | `muharrem.oz@pusulanet.net` / `4Dr616R4wwqA` |
| **Metrics API Key** | `uk1_l-jozwsUDnKTqtTttP8POfK89thi2a9hxsSaj2XC` (Hub env: `UPTIME_KUMA_METRICS_TOKEN`) |
| **Prometheus** | `GET /metrics` — Basic auth, username boş |

Hub entegrasyonu: `apps/web/src/lib/kuma.ts` + `/api/monitoring` endpoint'i, 30sn in-memory cache. `/monitoring` sayfası bu veriyi tüketir.

### Kuma Monitor DB İşlemleri

UI'dan yapılamayan toplu değişiklikler için SQLite'a direkt yazılır. **Önemli:** Kuma DB'yi runtime'da cache'liyor — `docker stop` / edit / `docker start` şart, yoksa değişiklik görünmez.

```bash
# Monitor listele
plink -ssh -l root -pw "4Dr616R4wwqA" 10.15.2.6 \
  "sqlite3 /opt/uptime-kuma/data/kuma.db 'SELECT id, name, type, url, accepted_statuscodes_json FROM monitor;'"

# Heartbeat hata mesajları (bir monitor neden DOWN diye bakmak için)
plink ... "sqlite3 /opt/uptime-kuma/data/kuma.db \
  'SELECT id, monitor_id, status, msg, time FROM heartbeat WHERE monitor_id=6 ORDER BY time DESC LIMIT 5;'"

# Güvenli update pattern
plink ... "docker stop uptime-kuma && \
  sqlite3 /opt/uptime-kuma/data/kuma.db \"UPDATE monitor SET headers='{...}' WHERE id=6;\" && \
  docker start uptime-kuma"
```

### Bilinen Tuzaklar

- **Docker bridge vs LAN:** Kuma container'ı `10.15.2.6:3000` veya `172.17.0.1:3000` ile host'a erişebilir — ikisi de çalışır. Ama container IP'si (`172.17.0.x`) Fastify'ın LAN whitelist'inde değil → Fastify auth'lu endpoint'i `401` döner. Çözüm: monitor'e `headers={"X-API-Key":"<admin-key>"}` ekle.
- **accepted_statuscodes manuel eklerken kaybolur:** JSON import ederken set edilse de, kullanıcı UI'dan "Edit" yaptığında default `["200-299"]`'a dönebilir. Auth'lu endpoint'te `401` beklenen durumsa bunu listeye ekle.
- **Kuma import'u çok fazla NOT NULL alanı ister:** JSON backup ile import yaparken `invertKeyword`, `keyword`, `timeout`, `port`, `packetSize`, `expiryNotification` gibi alanlar eksik olursa SQLite constraint hatası verir. Referans: `kuma-import.json`.

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

## Deploy — Coolify (otomatik)

**Prod artık on-prem sunucuda (10.10.10.5) DEĞİL, PM2 de kullanılmıyor.**
Hub `https://hub.pusulanet.net` adresinde Coolify üzerinde çalışır; veriler
self-hosted Supabase'de (`hub` şeması). `main` branch'ine push → self-hosted
runner → otomatik deploy.

```bash
git push origin main
```

> Detay (env, Supabase, migration, runner, kullanıcı/yetki):
> **[docs/YENI-SISTEM.md](docs/YENI-SISTEM.md)** — deploy ve altyapı için tek
> başvuru dosyası. `docs/prod-server.md` yalnız emekliye ayrılan eski prod'un
> referansıdır, yeni işlerde kullanılmaz.

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
