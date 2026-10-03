import { useState } from "react";
import { AlertTriangle, Check, Info, Loader2, Megaphone, OctagonAlert } from "lucide-react";
import { api, type Duyuru, type Durum } from "@/api";
import { Button } from "@/components/ui/button";

/** Servis zamanı UTC "YYYY-MM-DD HH:MM:SS". */
const tarih = (s: string) =>
  new Date(s.replace(" ", "T") + "Z").toLocaleString("tr-TR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

const ONEM: Record<Duyuru["onem"], { ikon: React.ReactNode; kutu: string; serit: string; ad: string }> = {
  bilgi: {
    ikon: <Info />,
    kutu: "bg-sky-500/10 text-sky-600 ring-sky-500/20 dark:text-sky-400",
    serit: "border-sky-500/30 bg-sky-500/5",
    ad: "Bilgi",
  },
  uyari: {
    ikon: <AlertTriangle />,
    kutu: "bg-amber-500/10 text-amber-600 ring-amber-500/20 dark:text-amber-400",
    serit: "border-amber-500/30 bg-amber-500/10",
    ad: "Uyarı",
  },
  kritik: {
    ikon: <OctagonAlert />,
    kutu: "bg-red-500/10 text-red-600 ring-red-500/20 dark:text-red-400",
    serit: "border-red-500/30 bg-red-500/10",
    ad: "Önemli",
  },
};

export const okunmamislar = (d: Durum) => (d.duyurular ?? []).filter((x) => !x.okundu);

function useOkundu(setDurum: (d: Durum) => void) {
  const [bekle, setBekle] = useState<string | null>(null);
  const okundu = async (id: string) => {
    setBekle(id);
    try {
      setDurum(await api<Durum>("/duyuru/okundu", { id }));
    } catch {
      /* servise ulaşılamadı — duyuru okunmamış kalır, sonra tekrar denenir */
    } finally {
      setBekle(null);
    }
  };
  return { bekle, okundu };
}

/** Ana ekranın üstünde: okunmamış duyurular (en fazla 2; fazlası "Duyurular"a yönlendirir). */
export function DuyuruSeritleri({ durum, setDurum, onTumu }: { durum: Durum; setDurum: (d: Durum) => void; onTumu: () => void }) {
  const { bekle, okundu } = useOkundu(setDurum);
  const l = okunmamislar(durum);
  if (l.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      {l.slice(0, 2).map((d) => {
        const o = ONEM[d.onem] ?? ONEM.bilgi;
        return (
          <div key={d.id} className={`flex items-start gap-3 rounded-lg border p-3 ${o.serit}`}>
            <span className={`flex size-8 shrink-0 items-center justify-center rounded-md ring-1 [&_svg]:size-4 ${o.kutu}`}>{o.ikon}</span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold">{d.baslik}</div>
              <p className="mt-0.5 line-clamp-3 text-sm whitespace-pre-line text-muted-foreground">{d.metin}</p>
            </div>
            <Button size="sm" variant="outline" className="shrink-0" disabled={bekle === d.id} onClick={() => void okundu(d.id)}>
              {bekle === d.id ? <Loader2 className="animate-spin" /> : <Check />} Okudum
            </Button>
          </div>
        );
      })}
      {l.length > 2 && (
        <button type="button" className="self-start text-xs text-muted-foreground underline-offset-2 hover:underline" onClick={onTumu}>
          {l.length - 2} duyuru daha
        </button>
      )}
    </div>
  );
}

/** Orta panel: tüm duyurular (yayında olanlar). */
export function DuyurularIcerik({ durum, setDurum }: { durum: Durum; setDurum: (d: Durum) => void }) {
  const { bekle, okundu } = useOkundu(setDurum);
  const l = durum.duyurular ?? [];
  if (l.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Megaphone className="size-5" />
        </span>
        <div className="text-sm font-medium">Duyuru yok</div>
        <p className="max-w-xs text-sm text-muted-foreground">Pusula bakım, kesinti ya da yenilik duyurduğunda burada görünür.</p>
      </div>
    );
  }
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-3 p-6">
      {l.map((d) => {
        const o = ONEM[d.onem] ?? ONEM.bilgi;
        return (
          <article key={d.id} className={`flex items-start gap-3 rounded-xl border bg-card p-4 shadow-xs ${d.okundu ? "" : "ring-1 ring-primary/15"}`}>
            <span className={`flex size-10 shrink-0 items-center justify-center rounded-lg ring-1 [&_svg]:size-5 ${o.kutu}`}>{o.ikon}</span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>{o.ad}</span>
                <span>·</span>
                <span>{tarih(d.olusturma)}</span>
                {!d.okundu && <span className="ml-auto size-2 rounded-full bg-primary" aria-label="Okunmadı" />}
              </div>
              <h2 className="mt-0.5 text-[15px] leading-snug font-semibold">{d.baslik}</h2>
              <p className="mt-1 text-sm whitespace-pre-line">{d.metin}</p>
              {!d.okundu && (
                <Button size="sm" variant="outline" className="mt-3" disabled={bekle === d.id} onClick={() => void okundu(d.id)}>
                  {bekle === d.id ? <Loader2 className="animate-spin" /> : <Check />} Okudum
                </Button>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}
