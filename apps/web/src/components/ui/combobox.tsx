"use client";

/**
 * Projenin TEK combobox bileşeni — PusulaCRM UI kuralı:
 * "Dropdown daima arama içerir; shadcn `<Select>` kullanma, her zaman
 *  Combobox pattern'i (Popover + Command + Input + empty state)."
 *
 * Elle `Popover + Command` kurmayın; her açılır liste buradan gelir. Böylece
 * tetikleyici ölçüsü, arama kutusu, satır yüksekliği ve sağdaki onay işareti
 * tüm projede birebir aynı olur.
 *
 * İki kullanım biçimi vardır:
 *
 *   1) Basit (dahili arama) — küçük/orta listeler:
 *        <Combobox items={ROLES} getKey={r => r.value} getLabel={r => r.label}
 *                  value={role} onChange={setRole} placeholder="Seçiniz…" />
 *
 *   2) Kontrollü arama — büyük listeler veya sunucu tarafı arama:
 *        <Combobox items={filtrelenmis} search={q} onSearchChange={setQ} … />
 *      `search` verildiğinde dahili filtre DEVRE DIŞI kalır; süzmeyi çağıran yapar
 *      (`.slice(0, 50)` ile sınırlamayı unutmayın — cmdk 100+ item'da yavaşlar,
 *       bkz. CLAUDE.md "Command (cmdk) Combobox — Büyük Listede Yavaş Açılma").
 */

import * as React from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@muharremoz/pusula-ui";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";

/* Tetikleyici sınıfı — SelectTrigger ile birebir aynı olmalı. */
export const COMBOBOX_TRIGGER_CN =
  "w-full flex items-center justify-between gap-2 h-8 px-3 rounded-[5px] border border-input bg-transparent text-[13px] transition-[color,box-shadow] outline-none " +
  "hover:border-ring/50 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 " +
  "disabled:cursor-not-allowed disabled:opacity-50";

export interface ComboboxProps<T> {
  items: readonly T[];
  /** Her item için benzersiz anahtar — seçili değerle karşılaştırılan değerdir. */
  getKey: (item: T) => string;
  /** Aramada ve tetikleyicide kullanılan düz metin. */
  getLabel: (item: T) => string;
  /** Seçili anahtar (`""`/`undefined` → seçim yok). */
  value?: string;
  onChange: (key: string) => void;
  /** Satırın zengin görünümü; verilmezse `getLabel` yazılır. */
  renderItem?: (item: T) => React.ReactNode;
  /** Tetikleyicideki zengin görünüm; verilmezse seçili item'ın `getLabel`'ı. */
  renderValue?: (item: T) => React.ReactNode;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  /** Kontrollü arama — verilirse dahili filtre kapanır. */
  search?: string;
  onSearchChange?: (v: string) => void;
  /** Seçili olanı tekrar seçince temizlensin mi (varsayılan: hayır). */
  clearable?: boolean;
  disabled?: boolean;
  className?: string;
  /** Liste alanının azami yüksekliği. */
  maxListHeight?: string;
  /** Kendi tetikleyicini ver (alan görünümü yerine buton vb.). */
  trigger?: React.ReactNode;
  /** Liste yükleniyor — satırlar yerine iskelet gösterilir. */
  loading?: boolean;
  /** Popover hizası (özel tetikleyicide "end" işe yarar). */
  align?: "start" | "center" | "end";
  /** Popover genişliği; varsayılan tetikleyici genişliği. */
  contentClassName?: string;
}

export function Combobox<T>({
  items,
  getKey,
  getLabel,
  value,
  onChange,
  renderItem,
  renderValue,
  placeholder = "Seçiniz…",
  searchPlaceholder = "Ara…",
  emptyText = "Bulunamadı.",
  search,
  onSearchChange,
  clearable = false,
  disabled,
  className,
  maxListHeight = "max-h-60",
  trigger,
  loading,
  align = "start",
  contentClassName,
}: ComboboxProps<T>) {
  const [open, setOpen] = React.useState(false);
  const [icQuery, setIcQuery] = React.useState("");

  // Arama dışarıdan yönetiliyorsa dahili filtre uygulanmaz.
  const kontrollu = search !== undefined;
  const query = kontrollu ? search : icQuery;

  const setQuery = (v: string) => {
    if (kontrollu) onSearchChange?.(v);
    else setIcQuery(v);
  };

  // Popover kapanınca arama sıfırlansın.
  React.useEffect(() => {
    if (open) return;
    if (kontrollu) onSearchChange?.("");
    else setIcQuery("");
    // onSearchChange kimliği her render değişebilir; yalnız `open`'a bağlıyız.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const gosterilecek = React.useMemo(() => {
    if (kontrollu) return items;
    const q = query.trim().toLocaleLowerCase("tr-TR");
    if (!q) return items;
    return items.filter((i) => getLabel(i).toLocaleLowerCase("tr-TR").includes(q));
  }, [items, query, kontrollu, getLabel]);

  const secili = React.useMemo(
    () => (value ? items.find((i) => getKey(i) === value) : undefined),
    [items, value, getKey],
  );

  return (
    <Popover open={open} onOpenChange={disabled ? undefined : setOpen}>
      <PopoverTrigger asChild>
        {trigger ?? (
          <button
            type="button"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className={cn(COMBOBOX_TRIGGER_CN, !secili && "text-muted-foreground", className)}
          >
            <span className="min-w-0 flex-1 truncate text-left">
              {secili ? (renderValue ? renderValue(secili) : getLabel(secili)) : placeholder}
            </span>
            <ChevronsUpDown className="size-3.5 text-muted-foreground shrink-0" />
          </button>
        )}
      </PopoverTrigger>

      <PopoverContent
        align={align}
        className={cn("w-[var(--radix-popover-trigger-width)] min-w-44 p-0 rounded-[5px]", contentClassName)}
      >
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={searchPlaceholder}
            className="text-[13px] h-8"
            value={query}
            onValueChange={setQuery}
          />
          <CommandList
            className={cn(maxListHeight, "overflow-y-auto")}
            onWheel={(e) => e.stopPropagation()}
          >
            {loading ? (
              <div className="space-y-1 p-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="bg-muted/60 h-7 w-full animate-pulse rounded-[5px]" />
                ))}
              </div>
            ) : null}
            {!loading && (
              <CommandEmpty className="text-[11px] text-muted-foreground py-3 text-center">
                {emptyText}
              </CommandEmpty>
            )}
            <CommandGroup>
              {loading ? null : gosterilecek.map((item) => {
                const key = getKey(item);
                const aktif = key === value;
                return (
                  <CommandItem
                    key={key}
                    value={key}
                    onSelect={() => {
                      onChange(clearable && aktif ? "" : key);
                      setOpen(false);
                    }}
                    className="text-[13px]"
                  >
                    <span className="min-w-0 flex-1 truncate">
                      {renderItem ? renderItem(item) : getLabel(item)}
                    </span>
                    <Check className={cn("size-3.5 ml-2 shrink-0", aktif ? "opacity-100" : "opacity-0")} />
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/* ══════════════════════════════════════════════════════════════
   Çoklu seçim — aynı panel, satırlarda onay kutusu.
   ══════════════════════════════════════════════════════════════ */

export interface ComboboxMultiProps<T>
  extends Omit<ComboboxProps<T>, "value" | "onChange" | "renderValue" | "clearable"> {
  /** Seçili anahtarlar. */
  values: readonly string[];
  onValuesChange: (next: string[]) => void;
  /** Tetikleyici metni; verilmezse "N öğe seçildi". */
  renderSummary?: (secili: readonly string[]) => React.ReactNode;
}

export function ComboboxMulti<T>({
  items,
  getKey,
  getLabel,
  values,
  onValuesChange,
  renderItem,
  renderSummary,
  placeholder = "Seçiniz…",
  searchPlaceholder = "Ara…",
  emptyText = "Bulunamadı.",
  search,
  onSearchChange,
  disabled,
  className,
  maxListHeight = "max-h-60",
  trigger,
  loading,
  align = "start",
  contentClassName,
}: ComboboxMultiProps<T>) {
  const [open, setOpen] = React.useState(false);
  const [icQuery, setIcQuery] = React.useState("");

  const kontrollu = search !== undefined;
  const query = kontrollu ? search : icQuery;
  const setQuery = (v: string) => {
    if (kontrollu) onSearchChange?.(v);
    else setIcQuery(v);
  };

  const gosterilecek = React.useMemo(() => {
    if (kontrollu) return items;
    const q = query.trim().toLocaleLowerCase("tr-TR");
    if (!q) return items;
    return items.filter((i) => getLabel(i).toLocaleLowerCase("tr-TR").includes(q));
  }, [items, query, kontrollu, getLabel]);

  const toggle = (key: string) =>
    onValuesChange(values.includes(key) ? values.filter((v) => v !== key) : [...values, key]);

  return (
    <Popover open={open} onOpenChange={disabled ? undefined : setOpen}>
      <PopoverTrigger asChild>
        {trigger ?? (
          <button
            type="button"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className={cn(COMBOBOX_TRIGGER_CN, values.length === 0 && "text-muted-foreground", className)}
          >
            <span className="min-w-0 flex-1 truncate text-left">
              {values.length === 0
                ? placeholder
                : renderSummary
                  ? renderSummary(values)
                  : `${values.length} öğe seçildi`}
            </span>
            <ChevronsUpDown className="size-3.5 text-muted-foreground shrink-0" />
          </button>
        )}
      </PopoverTrigger>

      <PopoverContent
        align={align}
        className={cn("w-[var(--radix-popover-trigger-width)] min-w-44 p-0 rounded-[5px]", contentClassName)}
      >
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={searchPlaceholder}
            className="text-[13px] h-8"
            value={query}
            onValueChange={setQuery}
          />
          <CommandList className={cn(maxListHeight, "overflow-y-auto")} onWheel={(e) => e.stopPropagation()}>
            {!loading && (
              <CommandEmpty className="text-[11px] text-muted-foreground py-3 text-center">
                {emptyText}
              </CommandEmpty>
            )}
            <CommandGroup>
              {gosterilecek.map((item) => {
                const key = getKey(item);
                const secili = values.includes(key);
                return (
                  <CommandItem
                    key={key}
                    value={key}
                    onSelect={() => toggle(key)}
                    className="text-[13px] gap-2"
                  >
                    <span className="min-w-0 flex-1 truncate">
                      {renderItem ? renderItem(item) : getLabel(item)}
                    </span>
                    <span
                      className={cn(
                        "flex size-4 shrink-0 items-center justify-center rounded-[4px] border",
                        secili ? "border-primary bg-primary text-primary-foreground" : "border-border",
                      )}
                    >
                      {secili && <Check className="size-3" />}
                    </span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
