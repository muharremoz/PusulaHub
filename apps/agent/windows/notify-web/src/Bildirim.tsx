import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { AlertTriangle, BellRing, Info, UserRound, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ExeVerisi, MesajTuru, SayfaMesaji } from "@/kopru";

/** Bilgi/uyarı 5 dk sonra kendiliğinden kapanır (eski popup'la aynı); acil kapanmaz. */
const OTOMATIK_KAPANMA_SN = 300;
const ERTELEME_DK = 10;
/** Gövde bu kadar satırı geçerse kısaltılır, "Tüm metni göster" çıkar. */
const KISA_SATIR = 4;

const TUR: Record<MesajTuru, { etiket: string; ikon: typeof Info; rozet: string; cubuk: string }> = {
  info: {
    etiket: "Bilgi",
    ikon: Info,
    rozet: "bg-sky-500/12 text-sky-700 ring-sky-500/20 dark:text-sky-300",
    cubuk: "bg-sky-500",
  },
  warning: {
    etiket: "Uyarı",
    ikon: AlertTriangle,
    rozet: "bg-amber-500/14 text-amber-700 ring-amber-500/25 dark:text-amber-300",
    cubuk: "bg-amber-500",
  },
  urgent: {
    etiket: "Acil",
    ikon: BellRing,
    rozet: "bg-red-500/12 text-red-700 ring-red-500/25 dark:text-red-300",
    cubuk: "bg-red-500",
  },
};

function saat(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const bugun = new Date().toDateString() === d.toDateString();
  const hm = d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
  return bugun ? hm : `${d.toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit" })} ${hm}`;
}

export function Bildirim({ veri, gonder }: { veri: ExeVerisi; gonder: (m: SayfaMesaji) => void }) {
  const { mesaj, kullanici, hatirlatma } = veri;
  const t = TUR[mesaj.type] ?? TUR.info;
  const acil = mesaj.type === "urgent";
  const Ikon = t.ikon;

  const kartRef = useRef<HTMLDivElement>(null);
  const govdeRef = useRef<HTMLParagraphElement>(null);
  const [acik, setAcik] = useState(false);
  const [uzun, setUzun] = useState(false);
  const [cikiyor, setCikiyor] = useState(false);
  const [uzerinde, setUzerinde] = useState(false);

  // Gövde kısaltılmış halde taşıyor mu
  useLayoutEffect(() => {
    const g = govdeRef.current;
    if (g && !acik) setUzun(g.scrollHeight > g.clientHeight + 1);
  }, [mesaj.body, acik]);

  // Kart boyutu → exe pencereyi karta oturtur (gölge payı dahil)
  useEffect(() => {
    const k = kartRef.current;
    if (!k) return;
    const bildir = () => {
      const r = k.getBoundingClientRect();
      gonder({ tur: "boyut", genislik: Math.ceil(r.width) + 48, yukseklik: Math.ceil(r.height) + 48 });
    };
    bildir();
    const ro = new ResizeObserver(bildir);
    ro.observe(k);
    return () => ro.disconnect();
  }, [gonder]);

  // Çıkış animasyonu bitince exe'ye haber ver
  const bitir = (m: SayfaMesaji) => {
    if (cikiyor) return;
    setCikiyor(true);
    setTimeout(() => gonder(m), 180);
  };

  // Otomatik kapanma — fare kartın üzerindeyken durur
  const kalanRef = useRef(OTOMATIK_KAPANMA_SN * 1000);
  useEffect(() => {
    if (acil || uzerinde || cikiyor) return;
    const basla = Date.now();
    const id = setTimeout(() => bitir({ tur: "kapat" }), kalanRef.current);
    return () => {
      clearTimeout(id);
      kalanRef.current -= Date.now() - basla;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acil, uzerinde, cikiyor]);

  return (
    // Konumu exe verir (bilgi/uyarı sağ alt, acil ekran ortası); sayfa yalnız kartı ve gölge payını çizer.
    <div className="p-6">
      <div
        ref={kartRef}
        onMouseEnter={() => setUzerinde(true)}
        onMouseLeave={() => setUzerinde(false)}
        style={{ boxShadow: "var(--kart-golge)" }}
        className={cn(
          "bg-card text-card-foreground relative w-[400px] overflow-hidden rounded-2xl border",
          acil && "w-[460px]",
          cikiyor
            ? "animate-out fade-out-0 zoom-out-95 fill-mode-forwards duration-150"
            : acil
              ? "animate-in fade-in-0 zoom-in-95 duration-300"
              : "animate-in fade-in-0 slide-in-from-bottom-4 duration-300 ease-out",
        )}
      >
        {/* Üst satır: gönderen + saat + kapat */}
        <div className="text-muted-foreground flex items-center gap-2 px-4 pt-3.5 text-[12px]">
          <span className="bg-primary text-primary-foreground flex size-[18px] items-center justify-center rounded-[5px] text-[10px] font-semibold">
            P
          </span>
          <span className="text-foreground/80 font-medium">{mesaj.from || "Pusula Yazılım"}</span>
          <span>·</span>
          <span>{hatirlatma ? "hatırlatma" : saat(mesaj.sentAt)}</span>
          <span className="ml-auto flex min-w-0 items-center gap-1" title={`Sayın ${kullanici}`}>
            <UserRound className="size-3.5 shrink-0" />
            <span className="truncate">{kullanici}</span>
          </span>
          {!acil && (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Kapat"
              className="text-muted-foreground -mr-1.5"
              onClick={() => bitir({ tur: "kapat" })}
            >
              <X />
            </Button>
          )}
        </div>

        {/* Başlık */}
        <div className="flex gap-3 px-4 pt-3">
          <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl ring-1", t.rozet)}>
            <Ikon className="size-5" />
          </span>
          <div className="min-w-0 pt-0.5">
            <span className={cn("inline-flex rounded-[5px] px-1.5 py-px text-[10.5px] font-medium ring-1", t.rozet)}>
              {t.etiket}
            </span>
            <h1 className="mt-1 text-[15px] leading-snug font-semibold text-balance">{mesaj.title}</h1>
          </div>
        </div>

        {/* Gövde */}
        <div className="px-4 pt-2.5 pl-[68px]">
          <p
            ref={govdeRef}
            className={cn("text-muted-foreground text-[13px] leading-relaxed whitespace-pre-line select-text")}
            style={acik ? undefined : { display: "-webkit-box", WebkitLineClamp: KISA_SATIR, WebkitBoxOrient: "vertical", overflow: "hidden" }}
          >
            {/* Kısaltılmışken boş satırlar yer yemesin */}
            {acik ? mesaj.body : mesaj.body.replace(/\n\s*\n+/g, "\n")}
          </p>
          {(uzun || acik) && (
            <button
              className="text-foreground/80 hover:text-foreground mt-1 text-[12px] font-medium underline-offset-4 hover:underline"
              onClick={() => setAcik((a) => !a)}
            >
              {acik ? "Daha az göster" : "Tüm metni göster"}
            </button>
          )}
        </div>

        {/* Alt satır */}
        <div className="flex items-center gap-2 px-4 pt-4 pb-4">
          <div className="ml-auto flex gap-2">
            {!acil && (
              <Button variant="outline" size="sm" onClick={() => bitir({ tur: "ertele", dakika: ERTELEME_DK })}>
                {ERTELEME_DK} dk sonra hatırlat
              </Button>
            )}
            <Button size="sm" autoFocus onClick={() => bitir({ tur: "okudum" })}>
              Okudum, anladım
            </Button>
          </div>
        </div>

        {/* Geri sayım — fare üzerindeyken durur */}
        {!acil && (
          <div className="bg-muted h-[3px]">
            <div
              className={cn("geri-sayim h-full", t.cubuk, uzerinde && "geri-sayim-dur")}
              style={{ ["--sure" as string]: `${OTOMATIK_KAPANMA_SN}s` }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
