# Custom Components Registry

Bu dosya, projede tekrar kullanılabilir özel bileşenlerin kayıtlarını tutar.
Yeni bir bileşen oluşturduğunuzda buraya ekleyin. Bir yerde bu bileşenlerden birini kullanmanız istendiğinde, yeniden üretmek yerine bu dosyadaki kodu referans alın.

---

## 1. Klasör Seçici Dialog (FolderPickerDialog)

Klasör ağacı gösteren, açılır/kapanır düğümlü custom bir seçici dialog.

**Kullanıldığı yer:** `src/app/settings/page.tsx` → `GeneralPanel`

### Gereksinimler

```
lucide-react: ChevronDown, ChevronRight, FolderOpen
shadcn/ui: Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, Button
React: useState
```

### Tip Tanımı

```tsx
type FolderNode = { name: string; children: FolderNode[] };
```

### State

```tsx
const [showFolderPicker, setShowFolderPicker] = useState(false);
const [selectedFolder, setSelectedFolder] = useState("");
const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(["C:"]));
```

### Veri Yapısı (Mock)

```tsx
const folderTree: FolderNode[] = [
  { name: "C:", children: [
    { name: "Program Files", children: [
      { name: "SpareBackup", children: [] },
      { name: "Common Files", children: [] },
    ]},
    { name: "Temp", children: [
      { name: "SpareBackup", children: [] },
      { name: "Logs", children: [] },
    ]},
    { name: "Users", children: [
      { name: "Public", children: [] },
      { name: "Bulut", children: [
        { name: "Documents", children: [] },
        { name: "Desktop", children: [] },
      ]},
    ]},
    { name: "Windows", children: [] },
  ]},
  { name: "D:", children: [
    { name: "Backup", children: [] },
    { name: "Data", children: [] },
  ]},
];
```

### Expand/Collapse Fonksiyonu

```tsx
const toggleExpand = (path: string) => {
  setExpandedFolders((prev) => {
    const next = new Set(prev);
    if (next.has(path)) next.delete(path); else next.add(path);
    return next;
  });
};
```

### Render Fonksiyonu

```tsx
const renderFolder = (folder: FolderNode, parentPath: string, depth: number): React.ReactNode => {
  const fullPath = parentPath ? `${parentPath}\\${folder.name}` : folder.name;
  const isExpanded = expandedFolders.has(fullPath);
  const isSelected = selectedFolder === fullPath;
  const hasChildren = folder.children.length > 0;
  return (
    <div key={fullPath}>
      <button
        className={`w-full flex items-center gap-1.5 px-2 py-1.5 text-left text-xs rounded-[4px] transition-colors ${
          isSelected ? "bg-foreground text-background" : "hover:bg-black/5"
        }`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={() => {
          setSelectedFolder(fullPath);
          if (hasChildren) toggleExpand(fullPath);
        }}
      >
        {hasChildren ? (
          isExpanded
            ? <ChevronDown className="h-3 w-3 shrink-0" />
            : <ChevronRight className="h-3 w-3 shrink-0" />
        ) : (
          <span className="w-3 shrink-0" />
        )}
        <FolderOpen className={`h-3.5 w-3.5 shrink-0 ${isSelected ? "text-background" : "text-amber-500"}`} />
        <span className="truncate">{folder.name}</span>
      </button>
      {isExpanded && hasChildren && folder.children.map((c) => renderFolder(c, fullPath, depth + 1))}
    </div>
  );
};
```

### Dialog JSX

```tsx
<Dialog open={showFolderPicker} onOpenChange={setShowFolderPicker}>
  <DialogContent className="sm:max-w-lg rounded-[8px]">
    <DialogHeader>
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-[5px] bg-amber-500/10 text-amber-500">
          <FolderOpen className="h-5 w-5" />
        </div>
        <div>
          <DialogTitle className="text-base">Klasör Seç</DialogTitle>
          <DialogDescription className="text-[11px]">
            Geçici dosyaların saklanacağı dizini seçin
          </DialogDescription>
        </div>
      </div>
    </DialogHeader>
    <div
      className="rounded-[5px] p-2 max-h-[320px] overflow-y-auto space-y-0.5"
      style={{ backgroundColor: "#F4F2F0" }}
    >
      {folderTree.map((f) => renderFolder(f, "", 0))}
    </div>
    {selectedFolder && (
      <div className="flex items-center gap-2 text-xs">
        <span className="text-muted-foreground">Seçili:</span>
        <code className="bg-muted px-2 py-0.5 rounded text-[11px] font-mono">
          {selectedFolder}
        </code>
      </div>
    )}
    <DialogFooter className="gap-2 sm:gap-2">
      <Button
        variant="outline" size="sm" className="rounded-[5px] text-xs"
        onClick={() => setShowFolderPicker(false)}
      >
        İptal
      </Button>
      <Button
        size="sm" className="rounded-[5px] text-xs"
        disabled={!selectedFolder}
        onClick={() => {
          setTargetValue(selectedFolder); // hedef state'e ata
          setShowFolderPicker(false);
        }}
      >
        Seç
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

### Tetikleme Butonu

```tsx
<Button
  variant="outline" size="sm"
  className="h-8 rounded-[5px] text-xs bg-white border-border/40 shrink-0 gap-1"
  onClick={() => {
    setSelectedFolder(currentValue); // mevcut değeri seçili yap
    setShowFolderPicker(true);
  }}
>
  <FolderOpen className="h-3.5 w-3.5" />
  Gözat
</Button>
```

### Tasarım Detayları

| Özellik | Değer |
|---------|-------|
| Ağaç arka plan | `#F4F2F0` |
| Seçili satır | `bg-foreground text-background` |
| Hover | `hover:bg-black/5` |
| Klasör ikonu rengi | `text-amber-500` (normal), `text-background` (seçili) |
| İndent | Her seviye `16px` |
| Satır padding | `py-1.5` |
| Font | `text-xs` |
| Max yükseklik | `320px` scroll |

---

## 2. Custom Dropdown (Select)

Projede tüm combobox/dropdown ihtiyaçları için kullanılacak standart bileşen. Native `<select>` yerine her zaman bu bileşen tercih edilmelidir.

**Kaynak:** `src/components/ui/select.tsx` (Base UI tabanlı)

### Gereksinimler

```
@base-ui/react/select
lucide-react: ChevronDownIcon, CheckIcon, ChevronUpIcon
@/components/ui/select: Select, SelectContent, SelectItem, SelectTrigger, SelectValue
```

### Import

```tsx
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
```

### Temel Kullanım

```tsx
<Select defaultValue="option-1">
  <SelectTrigger className="h-8 w-full rounded-[5px] bg-white text-sm">
    <SelectValue />
  </SelectTrigger>
  <SelectContent alignItemWithTrigger={false}>
    <SelectItem value="option-1">Seçenek 1</SelectItem>
    <SelectItem value="option-2">Seçenek 2</SelectItem>
    <SelectItem value="option-3">Seçenek 3</SelectItem>
  </SelectContent>
</Select>
```

### Önemli Prop'lar

| Prop | Açıklama |
|------|----------|
| `defaultValue` | Başlangıç değeri |
| `alignItemWithTrigger={false}` | **Zorunlu.** Dropdown'ı trigger'ın altında açar. Bu olmadan liste inline/üst üste biner. |

### SelectTrigger Boyutları

| Size | Class |
|------|-------|
| default | `h-8` (32px) |
| sm | `h-7` (28px) — `size="sm"` prop ile |

### Stil Kuralları

| Özellik | Değer |
|---------|-------|
| Trigger border radius | `rounded-[5px]` |
| Trigger arka plan | `bg-white` |
| Font | `text-sm` |
| Popup gölge | `shadow-md` + `ring-1 ring-foreground/10` |
| Seçili item | Check ikonu (✓) sağda |
| Hover item | `bg-accent text-accent-foreground` |
| Animasyon | `fade-in` + `zoom-in-95` + `slide-in-from-top-2` |

### Emoji / İkon Destekli Kullanım

```tsx
<Select defaultValue="eu-west">
  <SelectTrigger className="h-8 w-full rounded-[5px] bg-white text-sm">
    <SelectValue />
  </SelectTrigger>
  <SelectContent alignItemWithTrigger={false}>
    <SelectItem value="eu-west">🇪🇺 Avrupa (Batı)</SelectItem>
    <SelectItem value="eu-central">🇪🇺 Avrupa (Merkez)</SelectItem>
    <SelectItem value="us-east">🇺🇸 Amerika (Doğu)</SelectItem>
  </SelectContent>
</Select>
```

### ⚠️ Kurallar

- **Native `<select>` ASLA kullanılmamalıdır.** Her zaman bu custom bileşeni tercih edin.
- `alignItemWithTrigger={false}` prop'u her zaman eklenmelidir.
- Dialog içinde kullanılıyorsa dropdown z-index sorunu yaşanmaz (`z-50` + Portal).

---

## 3. Varsayılan Modal Tasarımı

Projede tüm modallar için kullanılacak standart yapı. 3 katmanlı tasarım: gri dış kabuk → beyaz içerik alanı → footer.

**Referans:** `src/components/targets/NewTargetModal.tsx`

### Gereksinimler

```
shadcn/ui: Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, Button
```

### Import

```tsx
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
```

### Yapı Şablonu

```tsx
<Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
  <DialogContent
    className="sm:max-w-[640px] rounded-[8px] p-0 gap-0 overflow-hidden border-0"
    style={{ backgroundColor: "#F4F2F0" }}
  >
    {/* ── Header ── */}
    <DialogHeader className="px-6 pt-6 pb-0">
      <DialogTitle className="text-xl font-bold tracking-tight">
        Modal Başlığı
      </DialogTitle>
      <DialogDescription className="text-[13px]">
        Açıklama metni buraya gelir.
      </DialogDescription>
    </DialogHeader>

    {/* ── İçerik Alanı (Beyaz Kart) ── */}
    <div className="mx-3 mt-5 mb-0">
      <div
        className="rounded-[4px] px-5 py-5 min-h-[200px]"
        style={{ backgroundColor: "#FFFFFF", boxShadow: "0 2px 4px rgba(0,0,0,0.06)" }}
      >
        {/* İçerik buraya */}
      </div>
    </div>

    {/* ── Footer ── */}
    <div className="px-6 py-3.5 flex items-center justify-end gap-2">
      <Button variant="ghost" className="text-sm" onClick={onClose}>
        İptal
      </Button>
      <Button className="rounded-[5px] gap-1" disabled={!isValid}>
        <Plus className="h-4 w-4" />
        Kaydet
      </Button>
    </div>
  </DialogContent>
</Dialog>
```

### Katmanlı Yapı

```
┌─────────────────────────────────────────┐
│  #F4F2F0 — Dış kabuk (DialogContent)    │
│                                         │
│  ┌─ Header ───────────────────────────┐ │
│  │  Başlık (text-xl, font-bold)       │ │
│  │  Açıklama (text-[13px])            │ │
│  └────────────────────────────────────┘ │
│                                         │
│  ┌─ Beyaz İçerik Kartı ──────────────┐ │
│  │  #FFFFFF — rounded-[4px]           │ │
│  │  boxShadow: 0 2px 4px             │ │
│  │  px-5 py-5, min-h-[200px]         │ │
│  │                                    │ │
│  │  • Form alanları                   │ │
│  │  • Seçim kartları                  │ │
│  │  • Dinamik içerik                  │ │
│  └────────────────────────────────────┘ │
│                                         │
│  ┌─ Footer ───────────────────────────┐ │
│  │          [İptal]  [+ Kaydet]       │ │
│  └────────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

### Stil Kuralları

| Özellik | Değer |
|---------|-------|
| Dış arka plan | `#F4F2F0` |
| İç kart arka plan | `#FFFFFF` |
| İç kart gölge | `0 2px 4px rgba(0,0,0,0.06)` |
| İç kart radius | `rounded-[4px]` |
| Modal radius | `rounded-[8px]` |
| Modal genişlik | `sm:max-w-[640px]` |
| Başlık | `text-xl font-bold tracking-tight` |
| Açıklama | `text-[13px]` |
| Header padding | `px-6 pt-6 pb-0` |
| İçerik margin | `mx-3 mt-5 mb-0` |
| İçerik padding | `px-5 py-5` |
| Footer padding | `px-6 py-3.5` |
| İptal butonu | `variant="ghost"`, `text-sm` |
| Kaydet butonu | `rounded-[5px]`, `gap-1` |

### Form Alanları (İçerik Kartı İçinde)

```tsx
{/* Bölüm başlığı */}
<p className="text-[11px] font-medium text-muted-foreground tracking-wide mb-3">
  Bölüm Başlığı
</p>

{/* Label + Input */}
<div className="space-y-1">
  <Label className="text-[11px] text-muted-foreground">Alan Adı</Label>
  <Input placeholder="Placeholder" className="h-8 text-sm rounded-[5px] bg-white" />
</div>

{/* İki kolonlu grid */}
<div className="grid grid-cols-2 gap-3">
  <div className="space-y-1">
    <Label className="text-[11px] text-muted-foreground">Sol Alan</Label>
    <Input className="h-8 text-sm rounded-[5px] bg-white" />
  </div>
  <div className="space-y-1">
    <Label className="text-[11px] text-muted-foreground">Sağ Alan</Label>
    <Input className="h-8 text-sm rounded-[5px] bg-white" />
  </div>
</div>

{/* Dinamik bölüm ayracı */}
<div className="mt-5 pt-5 border-t">
  {/* Alt içerik */}
</div>
```

### ⚠️ Kurallar

- Modal'ın `p-0 gap-0 overflow-hidden border-0` class'ları **zorunludur** (varsayılan Dialog padding'ini sıfırlar).
- İçerik her zaman beyaz kart (`#FFFFFF`) içinde olmalıdır; doğrudan `#F4F2F0` üzerine form elemanı koyulmaz.
- Input'lar her zaman `h-8 text-sm rounded-[5px] bg-white` class'larıyla kullanılır.
- Label'lar her zaman `text-[11px] text-muted-foreground` class'larıyla kullanılır.

---

## 4. Spare Cloud Premium Kart

Spare Cloud hedefi listelerde ve seçimlerde diğer hedeflerden farklı, premium bir görünümle sunulmalıdır. Tüm projede aynı stil uygulanır.

**Kullanıldığı yer:** `src/components/new-task-wizard.tsx` (StepTarget), `src/components/targets/targets-data.ts`

### Tanıma Kuralı

```tsx
const isSpareCloud = target.type === "Spare Cloud";
```

### Kart Konteyneri

```tsx
// Normal durum
className="border-indigo-200/60 bg-gradient-to-r from-indigo-50/40 via-purple-50/30 to-transparent hover:from-indigo-50/80 hover:via-purple-50/60"

// Seçili durum
className="border-indigo-500 bg-gradient-to-r from-indigo-50 via-purple-50 to-blue-50"
```

### İkon Kutusu

```tsx
// Normal
className="bg-gradient-to-br from-indigo-500/20 to-purple-500/20 text-indigo-600"

// Seçili
className="bg-gradient-to-br from-indigo-600 to-purple-600 text-white"
```

### Badge (Önerilen)

```tsx
<span className="text-[9px] font-bold uppercase tracking-wider bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-1.5 py-0.5 rounded-full shrink-0">
  Önerilen
</span>
```

### Metin Renkleri

| Eleman | Normal | Seçili |
|--------|--------|--------|
| Başlık | `text-indigo-900` | varsayılan |
| Detay | `text-indigo-600/70` | varsayılan |

### Checkmark (Seçili)

```tsx
className="bg-gradient-to-br from-indigo-600 to-purple-600 text-white"
```

### Renk Paleti

| Token | Değer |
|-------|-------|
| Birincil gradient başlangıç | `indigo-600` |
| Birincil gradient bitiş | `purple-600` |
| Arka plan gradient | `indigo-50 → purple-50 → blue-50` |
| Border (normal) | `indigo-200/60` |
| Border (seçili) | `indigo-500` |
| İkon arka plan | `indigo-500/20 → purple-500/20` |

### ⚠️ Kurallar

- Spare Cloud her zaman listenin **ilk elemanı** olmalıdır.
- `type === "Spare Cloud"` kontrolü ile ayrıştırılır; hardcoded ID kullanılmaz.
- Badge text her zaman **"Önerilen"** olmalıdır.
- Gradient yönü kart için `to-r` (sağa), ikon/badge için `to-br` (sağ alta).
