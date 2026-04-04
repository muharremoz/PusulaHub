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
