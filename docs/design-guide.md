# SpareBackup UI Tasarım Rehberi

Bu dosya, projenin tüm sayfalarında uygulanması gereken tasarım kurallarını tanımlar.
Referans sayfa: `src/app/tasks/page.tsx`

---

## Renk Paleti

| Kullanım          | Renk      | Açıklama                        |
| ----------------- | --------- | ------------------------------- |
| Dış kart alanı    | `#F4F2F0` | Warm gray, tüm kart dış alanı  |
| İç kart alanı     | `#FFFFFF` | Beyaz, ana içerik alanı         |
| Tab arka planı    | `#F4F2F0` | Dış kart rengi ile aynı        |
| Metin (başlık)    | Foreground | Tailwind varsayılan             |
| Metin (ikincil)   | `text-muted-foreground` | Label, footer, alt bilgi |

---

## Nested Kart Tasarımı (Ana Bileşen Deseni)

Tüm kartlar 2 katmanlı iç içe yapıda olmalıdır:

### Dış Alan
- Arka plan: `#F4F2F0`
- Border radius: `8px`
- Padding: `8px` (p-2), alt kısım: `0` (pb-0)
- Footer bu alanda yer alır

### İç Alan (Beyaz Kart)
- Arka plan: `#FFFFFF`
- Border radius: `4px`
- Padding: `px-4 py-3`
- Gölge: `0 2px 4px rgba(0,0,0,0.06)` — sadece alt kısımda, çok hafif
- Ana içerik (sayılar, tablolar vb.) bu alanda yer alır

### Footer
- Dış alanda, iç kartın altında
- Font: `text-[11px]`
- Renk: `text-muted-foreground`
- İkon + metin formatında

```tsx
// Örnek Yapı
<div className="rounded-[8px] p-2 pb-0" style={{ backgroundColor: "#F4F2F0" }}>
  <div
    className="rounded-[4px] px-4 py-3"
    style={{ backgroundColor: "#FFFFFF", boxShadow: "0 2px 4px rgba(0,0,0,0.06)" }}
  >
    {/* İç içerik */}
  </div>
  <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground px-2 py-2">
    {/* Footer: ikon + metin */}
  </div>
</div>
```

---

## Özet Kartları (Stats Cards)

- Grid düzeni: eşit sütunlar (`grid-cols-N`)
- `items-stretch` ile eşit yükseklik
- Dış alan: `flex flex-col`, iç alan: `flex-1`
- Başlık: `text-[11px] font-medium text-muted-foreground tracking-wide`
- Büyük değer: `text-2xl font-bold tracking-tight`
- Alt bilgi: `text-[11px] text-muted-foreground`

---

## Tablo Tasarımı

Tablolar da nested kart yapısında olur:

- **Dış alan (#F4F2F0):** Başlık (isim + sayı badge) ve footer
- **İç beyaz alan (#FFFFFF):** Tablo header + satırlar

### Tablo Header
- Font: `text-[11px] font-medium text-muted-foreground tracking-wide`
- Arka plan: `bg-muted/30`
- Alt border: `border-b`

### Tablo Satırları
- Padding: `px-5 py-1.5` (kompakt)
- Hover: `hover:bg-muted/20`
- Ayırıcı: `border-b border-border/40`
- Grid layout: `grid-cols-[...]` ile kolon oranları

### Durum Badge
- Border radius: `rounded-[5px]`
- Font: `text-[10px]`
- Padding: `px-2.5 py-0.5`

### İlerleme Çubuğu
- Yükseklik: `h-1.5`
- Border radius: `rounded-[5px]`
- Renkler: `≥95% → emerald-500`, `≥80% → amber-500`, `<80% → destructive`

### Aksiyon Menüsü
- Her satırın sonunda `MoreVertical` (3 nokta) dropdown
- Menü: Çalıştır, Durdur, Düzenle, Kopyala, Devre Dışı, Sil (destructive)

---

## Tab Bileşeni

- Arka plan: `#F4F2F0` (inline style)
- Yükseklik: `!h-11`
- Border radius: `rounded-[8px]`
- Padding: `p-1`
- Trigger stilı: `rounded-[6px] text-xs flex-none px-5`

---

## Genel Kurallar

1. **Radius:** Kartlar `8px`, iç alanlar `4px`, badge ve butonlar `5px-6px`
2. **Gölge:** Sadece iç beyaz alanlara, sadece alt kısımda, çok hafif
3. **Font boyutları:** Label `11px`, içerik `xs-sm`, büyük değerler `2xl`
4. **Boşluklar:** Kartlar arası `gap-3`, iç padding `p-2`
5. **Tüm sayfalar** bu nested kart desenini kullanmalıdır
