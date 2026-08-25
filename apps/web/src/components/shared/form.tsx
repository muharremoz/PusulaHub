"use client";

/**
 * Form parçaları — PusulaCRM tasarım dilinden birebir.
 *
 * CRM kuralı: native veya shadcn-default checkbox/radio/select KULLANILMAZ;
 * her seçim öğesinin özel varyantı olur. Dropdown daima arama içerir
 * (`@/components/ui/combobox-select`).
 */

import * as React from "react";
import { Check } from "lucide-react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * Etiketli form alanı — sheet ve modal içindeki tüm alanlar bunu kullanır.
 *
 *   <Field label="Firma" required><FirmaCombobox … /></Field>
 */
export function Field({
  label,
  required,
  hint,
  children,
  className,
}: {
  label: string;
  required?: boolean;
  /** Alanın altında görünen küçük açıklama. */
  hint?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <Label className="text-foreground/80 text-[12px] font-medium">
        {label}
        {required && <span className="text-primary"> *</span>}
      </Label>
      {children}
      {hint && <p className="text-muted-foreground text-[11px]">{hint}</p>}
    </div>
  );
}

/**
 * Özel checkbox — CRM'in `size-4 rounded border` kutusu; aktifken primary dolgu.
 * shadcn/Radix Checkbox ile AYNI props (`checked` / `onCheckedChange`), böylece
 * çağrı yerlerinde JSX değişmez.
 */
export function Checkbox({
  checked,
  onCheckedChange,
  disabled,
  className,
  id,
  ...props
}: {
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
  id?: string;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onChange" | "checked">) {
  const aktif = !!checked;
  return (
    <button
      type="button"
      role="checkbox"
      id={id}
      aria-checked={aktif}
      disabled={disabled}
      onClick={() => onCheckedChange?.(!aktif)}
      className={cn(
        "flex size-4 shrink-0 items-center justify-center rounded-[4px] border outline-none transition-colors",
        "focus-visible:ring-ring/50 focus-visible:ring-2",
        "disabled:cursor-not-allowed disabled:opacity-50",
        aktif ? "border-primary bg-primary text-primary-foreground" : "border-border hover:border-primary/50",
        className,
      )}
      {...props}
    >
      {aktif && <Check className="size-3" />}
    </button>
  );
}
