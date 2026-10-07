import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { AlertTriangle, BellRing, CircleCheck, Info, UserRound, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { exeIcinde, type ExeVerisi, type MesajTuru, type SayfaMesaji } from "@/kopru";
import { AnketFormu } from "@/AnketFormu";
import { eksikZorunlular, type AnketCevaplari } from "@/anket";

/** Bilgi/uyarı 5 dk sonra kendiliğinden kapanır (eski popup'la aynı); acil kapanmaz. */
const OTOMATIK_KAPANMA_SN = 300;
const ERTELEME_DK = 10;
/** Gövde bu kadar satırı geçerse kısaltılır, "Tüm metni göster" çıkar. */
const KISA_SATIR = 4;
/** Anket gönderilince teşekkür kartı bu kadar görünür, sonra cevaplar iletilip pencere kapanır. */
const TESEKKUR_MS = 3000;

const TUR: Record<MesajTuru, { etiket: string; ikon: typeof Info; rozet: string }> = {
  info: {
    etiket: "Bilgi",
    ikon: Info,
    rozet: "bg-sky-500/12 text-sky-700 ring-sky-500/20 dark:text-sky-300",
  },
  warning: {
    etiket: "Uyarı",
    ikon: AlertTriangle,
    rozet: "bg-amber-500/14 text-amber-700 ring-amber-500/25 dark:text-amber-300",
  },
  urgent: {
    etiket: "Acil",
    ikon: BellRing,
    rozet: "bg-red-500/12 text-red-700 ring-red-500/25 dark:text-red-300",
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
  const anket = mesaj.survey?.sorular?.length ? mesaj.survey : null;
  const Ikon = t.ikon;
  /*  Exe içinde pencere kartla aynı boyda ve renk anahtarıyla şeffaf: yarı saydam piksel
   *  (gölge, dış hale) çizilemez → kenar boşluğu ve gölge yok, acilde hale yerine kalın kenar. */
  const exe = exeIcinde();
  const pay = exe ? 0 : 48;

  const kartRef = useRef<HTMLDivElement>(null);
  const govdeRef = useRef<HTMLParagraphElement>(null);
  const [acik, setAcik] = useState(false);
  const [uzun, setUzun] = useState(false);
  const [cikiyor, setCikiyor] = useState(false);
  const [uzerinde, setUzerinde] = useState(false);
  const [cevaplar, setCevaplar] = useState<AnketCevaplari>({});
  const [eksikler, setEksikler] = useState<string[]>([]);
  const [tesekkur, setTesekkur] = useState(false);

  // Anket gönderilince önce teşekkür kartı (07.10.2026), sonra cevaplar exe'ye gider ve pencere kapanır.
  // Cevaplar ancak bitir() ile gittiği için "Kapat" da aynı yolu kullanır — kullanıcı beklemeden kapatsa da cevap kaybolmaz.
  const tesekkurBitti = useRef(false);
  const cevaplariIlet = () => {
    if (tesekkurBitti.current) return;
    tesekkurBitti.current = true;
    bitir({ tur: "okudum", cevaplar });
  };
  const anketiGonder = () => {
    if (!anket) return;
    const e = eksikZorunlular(anket, cevaplar);
    setEksikler(e);
    if (e.length === 0) setTesekkur(true);
  };
  useEffect(() => {
    if (!tesekkur) return;
    const id = setTimeout(cevaplariIlet, TESEKKUR_MS);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tesekkur]);

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
      gonder({ tur: "boyut", genislik: Math.ceil(r.width) + pay, yukseklik: Math.ceil(r.height) + pay });
    };
    bildir();
    const ro = new ResizeObserver(bildir);
    ro.observe(k);
    return () => ro.disconnect();
  }, [gonder, pay]);

  // Çıkış animasyonu bitince exe'ye haber ver
  const bitir = (m: SayfaMesaji) => {
    if (cikiyor) return;
    setCikiyor(true);
    setTimeout(() => gonder(m), 180);
  };

  // Otomatik kapanma — fare kartın üzerindeyken durur
  const kalanRef = useRef(OTOMATIK_KAPANMA_SN * 1000);
  useEffect(() => {
    if (acil || anket || uzerinde || cikiyor) return;
    const basla = Date.now();
    const id = setTimeout(() => bitir({ tur: "kapat" }), kalanRef.current);
    return () => {
      clearTimeout(id);
      kalanRef.current -= Date.now() - basla;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acil, anket, uzerinde, cikiyor]);

  return (
    // Konumu exe verir (bilgi/uyarı sağ alt, acil ekran ortası); sayfa yalnız kartı ve gölge payını çizer.
    <div className={exe ? "" : "p-6"}>
      <div
        ref={kartRef}
        onMouseEnter={() => setUzerinde(true)}
        onMouseLeave={() => setUzerinde(false)}
        style={exe ? undefined : { boxShadow: "var(--kart-golge)" }}
        className={cn(
          "bg-card text-card-foreground relative w-[400px] overflow-hidden rounded-2xl border",
          anket && "w-[440px]",
          // Acil: kırmızı kenar + dış hale — bilgi/uyarıdan ilk bakışta ayrılsın
          acil && (exe ? "w-[460px] border-2 border-red-600" : "w-[460px] border-red-500/70 ring-4 ring-red-500/20 dark:border-red-500/60"),
          exe && "rounded-xl",
          cikiyor
            ? "animate-out fade-out-0 zoom-out-95 fill-mode-forwards duration-150"
            : acil
              ? "animate-in fade-in-0 zoom-in-95 duration-300"
              : "animate-in fade-in-0 slide-in-from-bottom-4 duration-300 ease-out",
        )}
      >
        {tesekkur ? (
          <div className="flex flex-col items-center px-6 pt-8 pb-6 text-center animate-in fade-in-0 zoom-in-95 duration-300">
            <span className="flex size-12 items-center justify-center rounded-full bg-emerald-500/12 text-emerald-600 ring-1 ring-emerald-500/25 dark:text-emerald-400">
              <CircleCheck className="size-6" />
            </span>
            <h1 className="mt-3 text-[16px] font-semibold">Teşekkür ederiz</h1>
            <p className="text-muted-foreground mt-1 text-[13px] leading-relaxed text-balance">
              Cevaplarınız bize ulaştı. Görüşleriniz hizmetimizi geliştirmemize yardımcı olacak.
            </p>
            <Button variant="outline" size="sm" className="mt-5" onClick={cevaplariIlet}>Kapat</Button>
          </div>
        ) : (<>
        {/* Başlık alanı: acilde kırmızı bant */}
        <div className={cn(acil && "border-b border-red-500/20 bg-red-600 pb-3.5 text-white dark:bg-red-700")}>
        {/* Üst satır: gönderen + saat + kapat */}
        <div className={cn("flex items-center gap-2 px-4 pt-3.5 text-[12px]", acil ? "text-white/80" : "text-muted-foreground")}>
          <span className={cn("font-medium", acil ? "text-white" : "text-foreground/80")}>{mesaj.from || "Pusula Yazılım"}</span>
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
          {acil ? (
            // Beyaz kutuda kırmızı ikon + yavaş nabız halkası
            <span className="relative flex size-10 shrink-0">
              <span className="absolute inset-0 animate-ping rounded-xl bg-white/40 [animation-duration:1.8s]" />
              <span className="relative flex size-10 items-center justify-center rounded-xl bg-white text-red-600 shadow-sm">
                <Ikon className="size-5" />
              </span>
            </span>
          ) : (
            <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl ring-1", t.rozet)}>
              <Ikon className="size-5" />
            </span>
          )}
          <div className="min-w-0 pt-0.5">
            <span
              className={cn(
                "inline-flex rounded-[5px] px-1.5 py-px text-[10.5px] font-medium ring-1",
                acil ? "bg-white/15 tracking-wide text-white uppercase ring-white/30" : t.rozet,
              )}
            >
              {t.etiket}
            </span>
            <h1 className={cn("mt-1 leading-snug font-semibold text-balance", acil ? "text-[17px]" : "text-[15px]")}>{mesaj.title}</h1>
          </div>
        </div>
        </div>

        {/* Gövde */}
        <div className={cn("px-4 pl-[68px]", acil ? "pt-3.5" : "pt-2.5")}>
          <p
            ref={govdeRef}
            className={cn("text-[13px] leading-relaxed whitespace-pre-line select-text", acil ? "text-foreground/85" : "text-muted-foreground")}
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

        {/* Anket — uzun anket kart içinde kayar (pencere ekrandan taşmasın) */}
        {anket && (
          <div className="mt-3 max-h-[440px] overflow-y-auto border-t px-4 pt-3 pl-[68px]">
            <AnketFormu anket={anket} cevaplar={cevaplar} onChange={(c) => { setCevaplar(c); setEksikler([]); }} eksikler={eksikler} />
          </div>
        )}

        {/* Alt satır */}
        <div className="flex items-center gap-2 px-4 pt-4 pb-4">
          <div className="ml-auto flex gap-2">
            {!acil && (
              <Button variant="outline" size="sm" onClick={() => bitir({ tur: "ertele", dakika: ERTELEME_DK })}>
                {anket ? "Daha sonra" : `${ERTELEME_DK} dk sonra hatırlat`}
              </Button>
            )}
            {anket ? (
              <Button size="sm" onClick={anketiGonder}>Gönder</Button>
            ) : (
              <Button
                size="sm"
                autoFocus
                className={cn(acil && "bg-red-600 text-white hover:bg-red-700 dark:bg-red-600 dark:hover:bg-red-500")}
                onClick={() => bitir({ tur: "okudum" })}
              >
                Okudum, anladım
              </Button>
            )}
          </div>
        </div>
        </>)}
      </div>
    </div>
  );
}
