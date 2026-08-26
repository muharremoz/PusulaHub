"use client";

// Standart liste sütun-başlığı filtreleri — PusulaCRM tasarım dilinden birebir port.
// Tasarım kaynağı: PusulaCRM/docs/liste-tasarim-deseni.md
// Tüm "tablo listesi" sayfaları bunları kullanır: başlığa tıkla → popover filtre.
// Aktifken trigger arka planı vurgulanır + (çoklu seçimde) adet rozeti gösterilir.

import { useState } from "react";
import { ListFilter, Search, Check, CalendarDays } from "lucide-react";
import { tr } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger, Highlight } from "@muharremoz/pusula-ui";
import { Calendar } from "@/components/ui/calendar";

const pad2 = (n: number) => String(n).padStart(2, "0");

/** ymd → gg.aa.yy (rozet dar, yıl iki hane yeter). */
function kisaTarih(ymd: string): string {
  const [y, a, g] = ymd.split("-");
  return `${g}.${a}.${y.slice(2)}`;
}

const TRIGGER_BASE =
  "-mx-1 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap uppercase tracking-wider outline-none transition-colors";

/* ---------- Metin filtresi (serbest metin) ---------- */
export function MetinFiltre({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild><button
            type="button"
            className={cn(
              TRIGGER_BASE,
              value ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground",
            )}
          >
        {label}
        <ListFilter className={cn("size-3", value ? "text-primary" : "opacity-40")} />
      </button></PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-2">
        <div className="relative">
          <Search className="text-muted-foreground absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2" />
          <input
            autoFocus
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={`${label} ara…`}
            className="border-border focus:border-primary/50 focus:ring-primary/20 h-8 w-full rounded-md border bg-card pl-8 pr-2 text-[12px] outline-none focus:ring-2"
          />
        </div>
        {value && (
          <button
            type="button"
            onClick={() => onChange("")}
            className="text-muted-foreground hover:text-foreground mt-2 text-[11px]"
          >
            Temizle
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}

/* ---------- Çoklu seçim filtresi (checkbox liste) ---------- */
export function SecimFiltre<T extends string>({
  label,
  options,
  getLabel,
  selected,
  onChange,
  aranabilir = false,
  ilkGosterim = 5,
}: {
  label: string;
  options: readonly T[];
  getLabel: (o: T) => string;
  selected: T[];
  onChange: (next: T[]) => void;
  /**
   * Uzun listelerde arama kutusu. Opsiyonel: mevcut kullanım yerlerinin
   * davranışı değişmesin diye varsayılan kapalı.
   */
  aranabilir?: boolean;
  /** İlk açılışta gösterilen seçenek sayısı; "Devamını göster" bu kadar ekler. */
  ilkGosterim?: number;
}) {
  const [open, setOpen] = useState(false);
  const [ara, setAra] = useState("");
  /**
   * Görünen seçenek sayısı — "Devamını göster" her basışta `ilkGosterim`
   * kadar artırıyor.
   *
   * Eskiden kısaltma yalnız `aranabilir` filtrelerde vardı; Talepler'deki
   * "Atanan" gibi listeler 20+ satırla ekranı boydan boya kaplıyordu.
   * Popover kapanınca sınır başa dönüyor.
   */
  const [limit, setLimit] = useState(ilkGosterim);
  const toggle = (o: T) =>
    onChange(selected.includes(o) ? selected.filter((x) => x !== o) : [...selected, o]);

  // Alfabetik (Türkçe) sıralama — kullanıcı aradığını göz taramasıyla bulsun.
  const sirali = aranabilir
    ? [...options].sort((a, b) => getLabel(a).localeCompare(getLabel(b), "tr"))
    : options;
  const q = ara.trim().toLocaleLowerCase("tr-TR");
  const eslesen = q
    ? sirali.filter((o) => getLabel(o).toLocaleLowerCase("tr-TR").includes(q))
    : sirali;
  // Kısaltılmış listede SEÇİLİ olanlar hep görünür; aksi halde kullanıcı
  // neyi seçtiğini göremiyor.
  // Aramada tüm eşleşenler görünür (zaten daraltılmış liste). Kısaltılmış
  // listede SEÇİLİ olanlar hep görünür; aksi halde kullanıcı neyi seçtiğini
  // göremiyor.
  const gosterilecek = q
    ? eslesen
    : [
        ...eslesen.slice(0, limit),
        ...eslesen.slice(limit).filter((o) => selected.includes(o)),
      ];
  const gizliSayi = eslesen.length - gosterilecek.length;
  // Filtrelenecek değer yoksa düz başlık göster (boş/tıklanan dropdown olmasın).
  // Etiket YİNE <button>: sunucuda seçenekler henüz boşken <span>, istemcide
  // liste gelince <button> render edilince hidrasyon uyuşmazlığı çıkıyordu.
  if (options.length === 0 && selected.length === 0) {
    return (
      <button type="button" disabled className={cn(TRIGGER_BASE, "text-muted-foreground cursor-default")}>
        {label}
      </button>
    );
  }
  return (
    <Popover
      open={open}
      onOpenChange={(a) => {
        setOpen(a);
        // Popover kapanınca sınır ve arama başa dönsün.
        if (!a) {
          setLimit(ilkGosterim);
          setAra("");
        }
      }}
    >
      <PopoverTrigger asChild><button
            type="button"
            className={cn(
              TRIGGER_BASE,
              selected.length ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground",
            )}
          >
        {label}
        {selected.length > 0 ? (
          <span className="bg-primary text-primary-foreground inline-flex h-3.5 min-w-3.5 items-center justify-center rounded-full px-1 text-[9px] font-semibold tabular-nums">
            {selected.length}
          </span>
        ) : (
          <ListFilter className="size-3 opacity-40" />
        )}
      </button></PopoverTrigger>
      <PopoverContent align="start" className="w-52 p-1">
        {aranabilir && (
          <div className="border-border mb-1 flex items-center gap-1.5 border-b px-1.5 pb-1.5">
            <Search className="text-muted-foreground size-3 shrink-0" />
            <input
              autoFocus
              value={ara}
              onChange={(e) => setAra(e.target.value)}
              placeholder="Ara…"
              className="text-foreground placeholder:text-muted-foreground/70 min-w-0 flex-1 bg-transparent text-[12px] outline-none"
            />
          </div>
        )}
        <Highlight
          mode="parent"
          hover
          containerClassName="flex flex-col"
          className="absolute inset-0 z-0 rounded-md bg-muted/50"
          transition={{ type: "spring", stiffness: 350, damping: 35 }}
        >
          {gosterilecek.map((o) => {
          const aktif = selected.includes(o);
          return (
            <button
              key={o}
              type="button"
              onClick={() => toggle(o)}
              className="relative z-[1] flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors"
            >
              <span
                className={cn(
                  "flex size-4 shrink-0 items-center justify-center rounded border",
                  aktif ? "border-primary bg-primary text-primary-foreground" : "border-border",
                )}
              >
                {aktif && <Check className="size-3" />}
              </span>
              {getLabel(o)}
            </button>
          );
        })}
        </Highlight>
        {aranabilir && eslesen.length === 0 && (
          <p className="text-muted-foreground px-2 py-2 text-center text-[11px]">Eşleşme yok.</p>
        )}
        {!q && gizliSayi > 0 && (
          <button
            type="button"
            onClick={() => setLimit((n) => n + ilkGosterim)}
            className="text-muted-foreground hover:text-foreground border-border w-full border-t px-2 py-1.5 text-left text-[11px]"
          >
            Devamını göster ({gizliSayi})
          </button>
        )}
        {selected.length > 0 && (
          <button
            type="button"
            onClick={() => onChange([])}
            className="text-muted-foreground hover:text-foreground border-border mt-1 w-full border-t px-2 py-1.5 text-left text-[11px]"
          >
            Temizle
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}

/* ---------- Sayısal aralık filtresi (min – max) ---------- */
export type SayiAralikDeger = { min?: number; max?: number };

export function SayiAralikFiltre({
  label,
  value,
  onChange,
}: {
  label: string;
  value: SayiAralikDeger;
  onChange: (v: SayiAralikDeger) => void;
}) {
  const [open, setOpen] = useState(false);
  const aktif = value.min != null || value.max != null;
  const fmt = (n: number) => new Intl.NumberFormat("tr-TR").format(n);
  const ozet =
    value.min != null && value.max != null
      ? `${fmt(value.min)} – ${fmt(value.max)}`
      : value.min != null
        ? `≥ ${fmt(value.min)}`
        : value.max != null
          ? `≤ ${fmt(value.max)}`
          : null;
  const set = (k: "min" | "max", raw: string) =>
    onChange({ ...value, [k]: raw === "" ? undefined : Number(raw) });
  const inputCn =
    "border-border focus:border-primary/50 focus:ring-primary/20 h-8 w-full rounded-md border bg-card px-2 text-[12px] tabular-nums outline-none focus:ring-2";
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild><button
            type="button"
            className={cn(
              TRIGGER_BASE,
              aktif ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground",
            )}
          >
        {label}
        {aktif ? (
          <span className="bg-primary text-primary-foreground inline-flex items-center justify-center rounded-full px-2 py-0.5 text-[11px] font-semibold normal-case tabular-nums">
            {ozet}
          </span>
        ) : (
          <ListFilter className="size-3 opacity-40" />
        )}
      </button></PopoverTrigger>
      <PopoverContent align="end" className="w-56 bg-card p-2">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground w-8 shrink-0 text-[11px]">Min</span>
            <input
              type="number"
              inputMode="decimal"
              value={value.min ?? ""}
              onChange={(e) => set("min", e.target.value)}
              placeholder="0"
              className={inputCn}
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground w-8 shrink-0 text-[11px]">Max</span>
            <input
              type="number"
              inputMode="decimal"
              value={value.max ?? ""}
              onChange={(e) => set("max", e.target.value)}
              placeholder="—"
              className={inputCn}
            />
          </div>
          {aktif && (
            <button
              type="button"
              onClick={() => onChange({})}
              className="text-muted-foreground hover:text-foreground text-left text-[11px]"
            >
              Temizle
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/* ---------- Tarih filtresi (Bugün / Bu hafta / Bu ay / Tarih aralığı) ---------- */
export type TarihFiltreDeger = {
  mode: "tum" | "bugun" | "buhafta" | "buay" | "aralik";
  from?: string;
  to?: string;
};

/**
 * Tarih filtresi eşleşmesi — liste sayfaları aynı kuralı paylaşsın diye burada.
 * (Toplantı notlarında yereldi; yazılım istekleri listesi de aynı filtreyi
 * kullanınca ortak yere alındı — 24.08.2026.)
 */
export function tarihUygun(iso: string, f: TarihFiltreDeger): boolean {
  if (f.mode === "tum") return true;
  const gun = iso.slice(0, 10);
  const bugun = new Date();
  const ymd = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate(),
    ).padStart(2, "0")}`;
  if (f.mode === "bugun") return gun === ymd(bugun);
  if (f.mode === "buhafta") {
    // Hafta pazartesi başlar (tr).
    const bas = new Date(bugun);
    bas.setDate(bugun.getDate() - ((bugun.getDay() + 6) % 7));
    return gun >= ymd(bas) && gun <= ymd(bugun);
  }
  if (f.mode === "buay") {
    const d = new Date(`${gun}T00:00:00`);
    return d.getMonth() === bugun.getMonth() && d.getFullYear() === bugun.getFullYear();
  }
  if (f.from && gun < f.from) return false;
  if (f.to && gun > f.to) return false;
  return true;
}

export function TarihFiltre({
  label,
  value,
  onChange,
  /** "Bu ay" seçeneği etiketi (ör. "Bu ay (doğum günü)"). */
  buAyLabel = "Bu ay",
  /** Gösterilecek hazır seçenekler (sıralı). Varsayılan: üçü de — proje
      genelinde tüm tarih seçiciler aynı davransın (14.08.2026). */
  hizli = ["bugun", "buhafta", "buay"],
  triggerClassName,
  align = "start",
  buyuk = false,
}: {
  label: string;
  value: TarihFiltreDeger;
  onChange: (v: TarihFiltreDeger) => void;
  buAyLabel?: string;
  hizli?: ("bugun" | "buhafta" | "buay")[];
  /** Sütun başlığı dışında kullanılırken ölçüyü hizalamak için. */
  triggerClassName?: string;
  /** Popover hizası — sütun başlığında "start", serbest kullanımda "center" iyi durur. */
  align?: "start" | "center" | "end";
  /** Sayfa başı kullanımı için bir boy büyük tetikleyici + rozet. */
  buyuk?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const aktif = value.mode !== "tum";
  const ymd = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const range = {
    from: value.from ? new Date(`${value.from}T00:00:00`) : undefined,
    to: value.to ? new Date(`${value.to}T00:00:00`) : undefined,
  };
  const hizliLabel: Record<"bugun" | "buhafta" | "buay", string> = {
    bugun: "Bugün",
    buhafta: "Bu hafta",
    buay: buAyLabel,
  };
  const ozet =
    value.mode === "bugun"
      ? "Bugün"
      : value.mode === "buhafta"
        ? "Bu hafta"
        : value.mode === "buay"
          ? "Bu ay"
          : value.mode === "aralik"
            ? // Seçilen aralığın kendisini yaz: "Aralık" tek başına hangi
              // tarihlerin seçildiğini söylemiyordu. Tek güne daralmışsa tek
              // tarih, aynı yıl içindeyse yıl bir kez — rozet sütun başlığına
              // sığmayıp alt satıra taşıyordu.
              value.from && value.to
              ? value.from === value.to
                ? kisaTarih(value.from)
                : value.from.slice(0, 4) === value.to.slice(0, 4)
                  ? `${kisaTarih(value.from).slice(0, 5)} – ${kisaTarih(value.to)}`
                  : `${kisaTarih(value.from)} – ${kisaTarih(value.to)}`
              : value.from
                ? `${kisaTarih(value.from)} –`
                : value.to
                  ? `– ${kisaTarih(value.to)}`
                  : "Aralık"
            : null;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild><button
            type="button"
            className={cn(
              TRIGGER_BASE,
              // Sütun başlığında etiket HEP nötr — tarih filtresi varsayılan
              // dönemle sürekli dolu olduğundan mor etiket diğer sütunlardan
              // ayrışıyordu (14.08.2026). Renk yalnız rozette. Sayfa-başı
              // (buyuk) kullanım eski vurgulu halinde.
              buyuk && aktif
                ? "bg-primary/10 text-primary font-semibold"
                : "text-muted-foreground hover:text-foreground",
              buyuk && "gap-1.5 text-[12px]",
              triggerClassName,
            )}
          >
        {label}
        {aktif ? (
          <span
            className={cn(
              "bg-primary text-primary-foreground inline-flex items-center justify-center rounded-full font-semibold whitespace-nowrap normal-case tabular-nums",
              buyuk ? "px-2.5 py-0.5 text-[12px]" : "px-2 py-0.5 text-[11px]",
            )}
          >
            {ozet}
          </span>
        ) : (
          <ListFilter className={cn("opacity-40", buyuk ? "size-3.5" : "size-3")} />
        )}
      </button></PopoverTrigger>
      <PopoverContent align={align} className="w-auto bg-card p-2">
        {/* Yatay düzen (14.08.2026): hazır seçenekler SOL sütunda, takvim
            SAĞDA her zaman açık. Ayrı "Tarih aralığı" maddesine gerek kalmadı —
            takvimden gün seçmek aralık moduna geçirir. */}
        <div className="flex items-stretch gap-2">
          {/* Hazır seçenek yoksa (ör. personel raporu, hizli=[]) sol sütun hiç
              çizilmez — takvimin yanında boş şerit kalmasın. */}
          {(hizli.length > 0 || aktif) && (
          <div className="flex min-w-36 flex-col">
            <Highlight
              mode="parent"
              hover
              containerClassName="flex flex-col gap-0.5"
              className="absolute inset-0 z-0 rounded-md bg-muted/50"
              transition={{ type: "spring", stiffness: 350, damping: 35 }}
            >
              {hizli.map((h) => (
                <button
                  key={h}
                  type="button"
                  onClick={() => {
                    onChange({ mode: h });
                    setOpen(false);
                  }}
                  className={cn(
                    "relative z-[1] flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors",
                    value.mode === h && "text-primary font-medium",
                  )}
                >
                  <CalendarDays className="size-3.5" />
                  {hizliLabel[h]}
                </button>
              ))}
            </Highlight>
            <div className="flex-1" />
            {aktif && (
              <button
                type="button"
                onClick={() => {
                  onChange({ mode: "tum" });
                  setOpen(false);
                }}
                className="text-muted-foreground hover:text-foreground border-border mt-1 w-full border-t px-2 py-1.5 text-left text-[11px]"
              >
                Temizle
              </button>
            )}
          </div>
          )}
          <div
            className={cn(
              (hizli.length > 0 || aktif) && "border-border border-l pl-2",
            )}
          >
            <Calendar
              mode="range"
              selected={range}
              onSelect={(r) =>
                onChange({
                  mode: "aralik",
                  from: r?.from ? ymd(r.from) : undefined,
                  to: r?.to ? ymd(r.to) : undefined,
                })
              }
              captionLayout="dropdown"
              startMonth={new Date(2015, 0)}
              endMonth={new Date(new Date().getFullYear() + 1, 11)}
              defaultMonth={range.from ?? new Date()}
              locale={tr}
            />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
