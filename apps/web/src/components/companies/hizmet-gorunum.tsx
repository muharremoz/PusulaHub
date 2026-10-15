"use client"

import {
  ArrowLeftRight, Citrus, Coins, Compass, Globe, Image as ImageIcon,
  Nfc, ShoppingCart, Smartphone,
} from "lucide-react"
import { Icon } from "@/components/shared/icon"
import type { IconName } from "@/components/shared/icon-registry"

/**
 * Yeni Hizmet kartlarının ikon + rengi. Hizmet adına göre eşlenir (katalog
 * kullanıcı tarafından düzenlenebilir; yeni hizmet tanınmazsa türünün
 * varsayılanı kullanılır). Animasyonlu muadili olanlar `@/components/shared/icon`,
 * olmayanlar lucide-react.
 *
 * Renkler CRM tonunda (açık + koyu): kapalıyken yumuşak zemin, seçiliyken dolu.
 */
type Ikon = { animasyonlu: IconName } | { statik: React.ComponentType<{ className?: string }> }

interface Renk {
  /** Seçili değilken ikon kutusu */
  yumusak: string
  /** Seçiliyken ikon kutusu ve onay halkası (dolu) */
  dolu: string
  /** Seçiliyken kartın kendisi — 1 px çerçeve + hafif zemin, hizmetin renginde */
  kart: string
}

// Tailwind sınıfları tam yazılır (dinamik birleştirme JIT'te üretilmez).
const R = {
  mavi:      { yumusak: "bg-blue-500/15 text-blue-700 dark:text-blue-400",          dolu: "border-blue-600 bg-blue-600 text-white",       kart: "border-blue-500 bg-blue-500/[0.06]" },
  mor:       { yumusak: "bg-violet-500/15 text-violet-700 dark:text-violet-400",    dolu: "border-violet-600 bg-violet-600 text-white",   kart: "border-violet-500 bg-violet-500/[0.06]" },
  turuncu:   { yumusak: "bg-orange-500/15 text-orange-700 dark:text-orange-400",    dolu: "border-orange-600 bg-orange-600 text-white",   kart: "border-orange-500 bg-orange-500/[0.06]" },
  pembe:     { yumusak: "bg-pink-500/15 text-pink-700 dark:text-pink-400",          dolu: "border-pink-600 bg-pink-600 text-white",       kart: "border-pink-500 bg-pink-500/[0.06]" },
  yesil:     { yumusak: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400", dolu: "border-emerald-600 bg-emerald-600 text-white", kart: "border-emerald-500 bg-emerald-500/[0.06]" },
  sari:      { yumusak: "bg-amber-500/15 text-amber-700 dark:text-amber-400",       dolu: "border-amber-500 bg-amber-500 text-white",     kart: "border-amber-500 bg-amber-500/[0.06]" },
  limon:     { yumusak: "bg-lime-500/15 text-lime-700 dark:text-lime-400",          dolu: "border-lime-600 bg-lime-600 text-white",       kart: "border-lime-500 bg-lime-500/[0.06]" },
  gok:       { yumusak: "bg-sky-500/15 text-sky-700 dark:text-sky-400",             dolu: "border-sky-600 bg-sky-600 text-white",         kart: "border-sky-500 bg-sky-500/[0.06]" },
  camgobegi: { yumusak: "bg-cyan-500/15 text-cyan-700 dark:text-cyan-400",          dolu: "border-cyan-600 bg-cyan-600 text-white",       kart: "border-cyan-500 bg-cyan-500/[0.06]" },
  kirmizi:   { yumusak: "bg-rose-500/15 text-rose-700 dark:text-rose-400",          dolu: "border-rose-600 bg-rose-600 text-white",       kart: "border-rose-500 bg-rose-500/[0.06]" },
  indigo:    { yumusak: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-400",    dolu: "border-indigo-600 bg-indigo-600 text-white",   kart: "border-indigo-500 bg-indigo-500/[0.06]" },
  teal:      { yumusak: "bg-teal-500/15 text-teal-700 dark:text-teal-400",          dolu: "border-teal-600 bg-teal-600 text-white",       kart: "border-teal-500 bg-teal-500/[0.06]" },
  gri:       { yumusak: "bg-muted text-muted-foreground",                           dolu: "border-primary bg-primary text-primary-foreground", kart: "border-primary bg-card" },
} satisfies Record<string, Renk>

/** Ad (küçük harf, tr) → görünüm. Anahtar adın içinde geçerse eşleşir; ilk eşleşen kazanır. */
const ADA_GORE: Array<[string, Ikon, Renk]> = [
  ["mobil",      { statik: Smartphone },      R.mavi],
  ["rfid",       { statik: Nfc },             R.mor],
  ["transfer",   { statik: ArrowLeftRight },  R.turuncu],
  ["resim",      { statik: ImageIcon },       R.pembe],
  ["ticaret",    { statik: ShoppingCart },    R.yesil],
  ["sarraf",     { statik: Coins },           R.sari],
  ["kivi",       { statik: Citrus },          R.limon],
  ["pusula x",   { statik: Compass },         R.gok],
  ["stok",       { statik: Compass },         R.camgobegi],
  ["toptan",     { statik: Compass },         R.indigo],
  ["üretim",     { statik: Compass },         R.kirmizi],
  ["uretim",     { statik: Compass },         R.kirmizi],
  ["sipari",     { statik: Compass },         R.turuncu],
  ["perakende",  { statik: Compass },         R.teal],
  ["pars",       { animasyonlu: "chart-pie" }, R.mor],
]

const TURE_GORE: Record<string, [Ikon, Renk]> = {
  "iis-site":       [{ statik: Globe },   R.gri],
  "iis-resim":      [{ statik: ImageIcon }, R.pembe],
  "pusula-program": [{ statik: Compass }, R.gri],
  pars:             [{ animasyonlu: "chart-pie" }, R.mor],
}

export function hizmetGorunum(ad: string, tur: string): { ikon: Ikon; renk: Renk } {
  // İki çeviri birden: tr-TR "MOBIL"i "mobıl" yapar, en "ÜRETİM"i "üreti̇m" — biri tutar
  const a = ad.toLocaleLowerCase("tr-TR") + " " + ad.toLowerCase()
  const e = ADA_GORE.find(([k]) => a.includes(k))
  const [turIkon, turRenk] = TURE_GORE[tur] ?? [{ statik: Globe }, R.gri]
  // Pusula programlarının hepsi pusula ikonu; ayrım yalnız renkle (kullanıcı kararı)
  if (tur === "pusula-program") return { ikon: { statik: Compass }, renk: e?.[2] ?? turRenk }
  if (e) return { ikon: e[1], renk: e[2] }
  return { ikon: turIkon, renk: turRenk }
}

export function HizmetIkonu({ ikon, className }: { ikon: Ikon; className?: string }) {
  if ("animasyonlu" in ikon) return <Icon name={ikon.animasyonlu} size={16} className={className} />
  // Boyut className ile verilir (ör. size-3.5); verilmezse size-4
  const C = ikon.statik
  return <C className={className ?? "size-4"} />
}
