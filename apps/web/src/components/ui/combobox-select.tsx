"use client";

/**
 * Select yerine geçen, ARAMA İÇEREN combobox — PusulaCRM UI kuralı:
 * "Dropdown daima arama içerir; shadcn `<Select>` kullanma, her zaman
 *  Combobox pattern'i (Popover + Command + Input + empty state)."
 *
 * shadcn Select ile AYNI API'yi sunar (Select / SelectTrigger / SelectValue /
 * SelectContent / SelectItem / SelectGroup / SelectLabel / SelectSeparator),
 * böylece çağrı yerlerinde JSX değişmeden yalnız import yolu değişir.
 *
 * Görünüm, elle yazılmış `Popover + Command` combobox'larıyla BİREBİR aynıdır
 * (aynı tetikleyici, aynı `CommandInput`, aynı `Check` işaretli satırlar) —
 * tek sheet içinde iki farklı dropdown görünmesin diye.
 *
 * Not: `shouldFilter={false}` + harici filtre kullanılır. cmdk'nın kendi
 * filtresi 100+ item'da dropdown açılışını saniyelere çıkarıyor (CLAUDE.md,
 * "Command (cmdk) Combobox — Büyük Listede Yavaş Açılma").
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

/* ── Bağlam ── */

type Ctx = {
  value?: string;
  onValueChange?: (v: string) => void;
  open: boolean;
  setOpen: (v: boolean) => void;
  disabled?: boolean;
  /** SelectItem'lar kendi etiketlerini buraya kaydeder (SelectValue göstersin diye). */
  register: (value: string, label: string) => void;
  labels: Map<string, string>;
};

const SelectCtx = React.createContext<Ctx | null>(null);
const useSelectCtx = () => {
  const c = React.useContext(SelectCtx);
  if (!c) throw new Error("SelectItem/SelectTrigger yalnız <Select> içinde kullanılır.");
  return c;
};

/** Arama sorgusu — SelectContent ile SelectItem arasında paylaşılır. */
const QueryCtx = React.createContext<string>("");

/* ── Select (kök) ── */

export function Select({
  value,
  onValueChange,
  disabled,
  children,
}: {
  value?: string;
  onValueChange?: (v: string) => void;
  disabled?: boolean;
  defaultValue?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const [labels, setLabels] = React.useState<Map<string, string>>(new Map());

  const register = React.useCallback((v: string, label: string) => {
    setLabels((prev) => {
      if (prev.get(v) === label) return prev;
      const next = new Map(prev);
      next.set(v, label);
      return next;
    });
  }, []);

  const ctx = React.useMemo<Ctx>(
    () => ({ value, onValueChange, open, setOpen, disabled, register, labels }),
    [value, onValueChange, open, disabled, register, labels],
  );

  return (
    <SelectCtx.Provider value={ctx}>
      <Popover open={open} onOpenChange={disabled ? undefined : setOpen}>
        {children}
      </Popover>
    </SelectCtx.Provider>
  );
}

/* ── Tetikleyici — elle yazılan combobox'larla aynı görünüm ── */

export function SelectTrigger({
  className,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { disabled, open } = useSelectCtx();
  return (
    <PopoverTrigger asChild>
      <button
        type="button"
        role="combobox"
        aria-expanded={open}
        disabled={disabled}
        className={cn(
          "w-full flex items-center justify-between gap-2 h-8 px-3 rounded-[5px] border border-input bg-transparent text-[13px] transition-[color,box-shadow] outline-none",
          "hover:border-ring/50 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        {...props}
      >
        <span className="min-w-0 flex-1 truncate text-left">{children}</span>
        <ChevronsUpDown className="size-3.5 text-muted-foreground shrink-0" />
      </button>
    </PopoverTrigger>
  );
}

/* ── Seçili değerin etiketi ── */

export function SelectValue({ placeholder }: { placeholder?: React.ReactNode }) {
  const { value, labels } = useSelectCtx();
  const label = value != null ? labels.get(value) : undefined;
  if (label) return <>{label}</>;
  return <span className="text-muted-foreground">{placeholder ?? ""}</span>;
}

/* ── İçerik (Command + arama + liste) ── */

export function SelectContent({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
  position?: string;
}) {
  const [query, setQuery] = React.useState("");
  const { open } = useSelectCtx();

  // Popover kapanınca arama sıfırlansın.
  React.useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  return (
    <PopoverContent
      align="start"
      className={cn("w-[var(--radix-popover-trigger-width)] min-w-44 p-0 rounded-[5px]", className)}
    >
      <Command shouldFilter={false}>
        <CommandInput
          placeholder="Ara…"
          className="text-[13px] h-8"
          value={query}
          onValueChange={setQuery}
        />
        <CommandList className="max-h-60" onWheel={(e) => e.stopPropagation()}>
          <CommandEmpty className="text-[11px] text-muted-foreground py-3 text-center">
            Bulunamadı.
          </CommandEmpty>
          <CommandGroup>
            <QueryCtx.Provider value={query}>{children}</QueryCtx.Provider>
          </CommandGroup>
        </CommandList>
      </Command>
    </PopoverContent>
  );
}

/* ── Seçenek ── */

export function SelectItem({
  value,
  className,
  children,
  disabled,
}: {
  value: string;
  className?: string;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  const { value: selected, onValueChange, setOpen, register } = useSelectCtx();
  const query = React.useContext(QueryCtx);

  // Etiket metni — SelectValue'nun gösterebilmesi için köke kaydedilir.
  const label = React.useMemo(() => metinCikar(children), [children]);
  React.useEffect(() => {
    register(value, label);
  }, [register, value, label]);

  const q = query.trim().toLocaleLowerCase("tr-TR");
  if (q && !label.toLocaleLowerCase("tr-TR").includes(q)) return null;

  const aktif = selected === value;
  return (
    <CommandItem
      value={value}
      disabled={disabled}
      onSelect={() => {
        onValueChange?.(value);
        setOpen(false);
      }}
      className={cn("text-[13px]", className)}
    >
      <span className="min-w-0 flex-1 truncate">{children}</span>
      <Check className={cn("size-3.5 ml-2 shrink-0", aktif ? "opacity-100" : "opacity-0")} />
    </CommandItem>
  );
}

/* ── Gruplama yardımcıları (API uyumu için) ── */

export function SelectGroup({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

export function SelectLabel({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "text-muted-foreground px-2 py-1 text-[10px] font-medium uppercase tracking-wider",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function SelectSeparator({ className }: { className?: string }) {
  return <div className={cn("bg-border my-1 h-px", className)} />;
}

/** React children'dan düz metin çıkarır (SelectValue etiketi ve arama için). */
function metinCikar(node: React.ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(metinCikar).join("");
  if (React.isValidElement(node)) {
    return metinCikar((node.props as { children?: React.ReactNode }).children);
  }
  return "";
}
