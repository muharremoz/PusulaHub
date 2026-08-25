"use client";

// Standart liste kartı — PusulaCRM tasarım dilinden birebir port.
// Yapı: (A) başlık şeridi + sayaç rozeti + aksiyon, (B) beyaz liste alanı.
// Referans: PusulaCRM/src/app/(app)/settings/users/_components/kullanicilar-icerik.tsx
//
// Kritik token'lar — sayfalarda sabit hex YAZILMAZ:
//   dış kart   : bg-[var(--section-bg)] rounded-[8px] p-2
//   liste alanı: bg-card rounded-t-[10px] border-t + sadece ÜSTTE yumuşak gölge

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export function ListeKarti({
  baslik,
  ikon,
  /** Toplam kayıt — sayaç rozeti için. */
  toplam,
  /** Filtre sonrası kayıt sayısı; `toplam`dan farklıysa "filtreli/toplam" gösterilir. */
  filtreli,
  /** Sağa yaslanan birincil aksiyon (ör. "Yeni Kayıt" butonu). */
  aksiyon,
  children,
  className,
}: {
  baslik: React.ReactNode;
  ikon?: React.ReactNode;
  toplam?: number;
  filtreli?: number;
  aksiyon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  const sayac =
    toplam == null
      ? null
      : filtreli == null || filtreli === toplam
        ? String(toplam)
        : `${filtreli}/${toplam}`;

  return (
    <div className={cn("bg-[var(--section-bg)] flex flex-col rounded-[8px] p-2", className)}>
      {/* (A) Başlık şeridi */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5">
        <div className="text-muted-foreground flex items-center gap-1.5">
          {ikon}
          <span className="text-[13px] font-medium leading-5">{baslik}</span>
          {sayac && (
            <span className="border-border text-muted-foreground rounded-full border bg-card px-1.5 text-[10px] tabular-nums">
              {sayac}
            </span>
          )}
        </div>
        {aksiyon && <div className="flex shrink-0 items-center gap-1.5">{aksiyon}</div>}
      </div>

      {/* (B) Liste alanı — zebra şeritler burada tanımlı, sayfalar tekrar yazmaz. */}
      <div
        className={cn(
          "border-border flex min-h-0 flex-1 flex-col overflow-hidden rounded-t-[10px] border-t bg-card shadow-[0_-2px_6px_-4px_rgba(15,31,27,0.10)]",
          "[&_tbody_tr:nth-child(even)]:bg-muted/45",
        )}
      >
        {children}
      </div>
    </div>
  );
}

/** Başlık şeridindeki birincil aksiyon butonu — CRM ile aynı ölçü/ton. */
export function ListeAksiyonButonu({
  children,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={cn(
        "bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-1.5 rounded-[5px] px-2.5 py-1 text-[12px] font-medium transition-colors",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

/** Tablo başlık satırı — `<thead>` standardı. */
export function ListeThead({ children }: { children: React.ReactNode }) {
  return (
    <thead className="bg-muted/20 border-border border-b">
      <tr className="text-muted-foreground text-[10px] uppercase tracking-wider whitespace-nowrap">
        {children}
      </tr>
    </thead>
  );
}

/** Boş durum satırı — filtre varken farklı mesaj gösterir. */
export function ListeBosSatir({
  sutunSayisi,
  toplam,
  bosMesaj = "Henüz kayıt yok.",
  filtreliMesaj = "Filtreye uyan kayıt yok.",
}: {
  sutunSayisi: number;
  toplam: number;
  bosMesaj?: string;
  filtreliMesaj?: string;
}) {
  return (
    <tr>
      <td
        colSpan={sutunSayisi}
        className="text-muted-foreground px-4 py-10 text-center text-[13px]"
      >
        {toplam === 0 ? bosMesaj : filtreliMesaj}
      </td>
    </tr>
  );
}

/**
 * Liste alt şeridi — sayfalama. Tek sayfaya sığan listelerde hiç render
 * edilmez (gereksiz kontrol göstermemek için).
 */
export function ListeSayfalama({
  sayfa,
  onSayfaChange,
  toplam,
  sayfaBoyu = 25,
}: {
  sayfa: number;
  onSayfaChange: (s: number) => void;
  /** Filtre sonrası toplam kayıt. */
  toplam: number;
  sayfaBoyu?: number;
}) {
  const sonSayfa = Math.max(1, Math.ceil(toplam / sayfaBoyu));
  if (toplam <= sayfaBoyu) return null;

  const bas = (sayfa - 1) * sayfaBoyu + 1;
  const son = Math.min(sayfa * sayfaBoyu, toplam);
  const okCn =
    "text-muted-foreground hover:text-foreground hover:bg-muted/60 flex size-6 items-center justify-center rounded-[5px] transition-colors disabled:pointer-events-none disabled:opacity-40";

  return (
    <div className="border-border/60 text-muted-foreground flex items-center justify-between border-t px-4 py-2 text-[11px]">
      <span className="tabular-nums">
        {bas}–{son} / {toplam} kayıt
      </span>
      <span className="flex items-center gap-1">
        <button
          type="button"
          className={okCn}
          disabled={sayfa <= 1}
          onClick={() => onSayfaChange(sayfa - 1)}
          aria-label="Önceki sayfa"
        >
          <ChevronLeft className="size-3.5" />
        </button>
        <span className="px-1 tabular-nums">
          {sayfa} / {sonSayfa}
        </span>
        <button
          type="button"
          className={okCn}
          disabled={sayfa >= sonSayfa}
          onClick={() => onSayfaChange(sayfa + 1)}
          aria-label="Sonraki sayfa"
        >
          <ChevronRight className="size-3.5" />
        </button>
      </span>
    </div>
  );
}
