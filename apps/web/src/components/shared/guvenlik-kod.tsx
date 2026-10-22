"use client"

/**
 * guvenlik.KOD alanı — sihirbaz SQL adımı ve firma detayı "Yeni Veritabanı Ekle" ortak.
 * Kod boşsa firma numarası yazılır; başka firmanın guvenlik kaydında kullanılan kod turuncu uyarı verir.
 * Kural ve sıralama: lib/guvenlik-kod.ts
 */

import { useEffect, useMemo, useState } from "react"
import { AlertTriangle, ListOrdered } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@muharremoz/pusula-ui"
import { cn } from "@/lib/utils"
import { kodDegeri, kodGecerliMi, type KodCakismasi } from "@/lib/guvenlik-kod"

/** Kodların başka firmada kullanılıp kullanılmadığını sorar (400 ms gecikmeli). kod → çakışma */
export function useKodCakismalari(firmaId: string, kodlar: string[], sqlServerId?: string | null): Map<number, KodCakismasi> {
  const [sonuc, setSonuc] = useState<Map<number, KodCakismasi>>(new Map())
  const anahtar = useMemo(
    () => [...new Set(kodlar.map((k) => kodDegeri(k, firmaId)).filter((k) => Number.isFinite(k)))].sort().join(","),
    [kodlar, firmaId],
  )
  useEffect(() => {
    if (!firmaId || !anahtar) { setSonuc(new Map()); return }
    const t = window.setTimeout(() => {
      fetch("/api/setup/guvenlik-kod", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firkod: firmaId, kodlar: anahtar.split(",").map(Number), sqlServerId: sqlServerId ?? undefined }),
      })
        .then((r) => r.json())
        .then((d: { cakisma?: KodCakismasi[] }) => setSonuc(new Map((d.cakisma ?? []).map((c) => [c.kod, c]))))
        .catch(() => setSonuc(new Map()))
    }, 400)
    return () => window.clearTimeout(t)
  }, [firmaId, anahtar, sqlServerId])
  return sonuc
}

/** Kod hücresi: boşken firma numarası yer tutucu; geçersiz ya da başka firmada kullanılıyorsa turuncu. */
export function KodHucresi({ value, onChange, firmaId, cakismalar }: {
  value: string
  onChange: (v: string) => void
  firmaId: string
  cakismalar: Map<number, KodCakismasi>
}) {
  const gecersiz = value.trim() !== "" && !kodGecerliMi(value)
  const c = gecersiz ? undefined : cakismalar.get(kodDegeri(value, firmaId))
  const uyari = gecersiz ? "Kod yalnız rakam olmalı" : c ? `${c.kod} başka firmada kullanılıyor: ${c.firmaId ?? "?"} · ${c.srkadi} (${c.dataYolu})` : null
  const input = (
    <Input
      value={value}
      inputMode="numeric"
      placeholder={firmaId}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 9))}
      className={cn("h-7 w-[92px] px-2 text-[13px] tabular-nums", uyari && "border-amber-500/70 text-amber-700 dark:text-amber-400")}
    />
  )
  if (!uyari) return input
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="relative inline-flex">
          {input}
          <AlertTriangle className="pointer-events-none absolute top-1/2 right-1.5 size-3 -translate-y-1/2 text-amber-500" />
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-[12px]">{uyari}</TooltipContent>
    </Tooltip>
  )
}

/** "Kodları sırala" — seçili datalara 4515, 45151, 45152… verir. */
export function KodSiralaDugmesi({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="h-7 gap-1.5 rounded-[5px] px-2 text-[12px]" onClick={onClick} disabled={disabled}>
          <ListOrdered className="size-3.5" />Kodları sırala
        </Button>
      </TooltipTrigger>
      <TooltipContent className="text-[12px]">İlk data firma numarasını, diğerleri sıra ekini alır (4515, 45151, 45152…)</TooltipContent>
    </Tooltip>
  )
}
