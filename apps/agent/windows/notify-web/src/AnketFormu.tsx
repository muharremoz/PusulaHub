import { Check, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { METIN_SINIRI, type Anket, type AnketCevaplari, type AnketSorusu } from "@/anket";

/** Popup kartı içindeki anket — cevaplar üst bileşende tutulur (Gönder'de exe'ye gider). */
export function AnketFormu({
  anket,
  cevaplar,
  onChange,
  eksikler,
}: {
  anket: Anket;
  cevaplar: AnketCevaplari;
  onChange: (c: AnketCevaplari) => void;
  /** Gönder'e basılmış ama cevaplanmamış zorunlu sorular — kırmızı işaretlenir */
  eksikler: string[];
}) {
  const ata = (id: string, v: AnketCevaplari[string] | undefined) => {
    const yeni = { ...cevaplar };
    if (v === undefined) delete yeni[id];
    else yeni[id] = v;
    onChange(yeni);
  };

  return (
    <div className="space-y-3.5">
      {anket.sorular.map((s, i) => (
        <div key={s.id} className="space-y-1.5">
          <p className={cn("text-[13px] font-medium", eksikler.includes(s.id) && "text-red-600 dark:text-red-400")}>
            {anket.sorular.length > 1 && <span className="text-muted-foreground mr-1 tabular-nums">{i + 1}.</span>}
            {s.soru}
            {s.zorunlu && <span className="text-muted-foreground"> *</span>}
          </p>
          <Soru s={s} deger={cevaplar[s.id]} ata={(v) => ata(s.id, v)} />
          {eksikler.includes(s.id) && <p className="text-[11px] text-red-600 dark:text-red-400">Bu soru zorunlu.</p>}
        </div>
      ))}
    </div>
  );
}

function Soru({ s, deger, ata }: { s: AnketSorusu; deger: AnketCevaplari[string] | undefined; ata: (v: AnketCevaplari[string] | undefined) => void }) {
  if (s.tip === "tek" || s.tip === "coklu") {
    const secili = s.tip === "coklu" ? (Array.isArray(deger) ? deger : []) : typeof deger === "string" ? [deger] : [];
    return (
      <div className="flex flex-col gap-1">
        {(s.secenekler ?? []).map((o) => {
          const aktif = secili.includes(o);
          return (
            <button
              key={o}
              type="button"
              onClick={() => {
                if (s.tip === "tek") ata(aktif ? undefined : o);
                else {
                  const yeni = aktif ? secili.filter((x) => x !== o) : [...secili, o];
                  ata(yeni.length ? yeni : undefined);
                }
              }}
              className={cn(
                "flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left text-[13px] transition-colors",
                aktif ? "border-primary bg-primary/5" : "hover:bg-muted/60",
              )}
            >
              <span
                className={cn(
                  "flex size-4 shrink-0 items-center justify-center border",
                  s.tip === "tek" ? "rounded-full" : "rounded-[4px]",
                  aktif ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40",
                )}
              >
                {aktif && (s.tip === "tek" ? <span className="bg-primary-foreground size-1.5 rounded-full" /> : <Check className="size-3" />)}
              </span>
              {o}
            </button>
          );
        })}
      </div>
    );
  }

  if (s.tip === "puan") {
    const p = typeof deger === "number" ? deger : 0;
    return (
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            aria-label={`${n} puan`}
            onClick={() => ata(p === n ? undefined : n)}
            className="rounded-md p-0.5 transition-transform hover:scale-110"
          >
            <Star className={cn("size-6", n <= p ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40")} />
          </button>
        ))}
        {p > 0 && <span className="text-muted-foreground ml-1.5 text-[12px] tabular-nums">{p} / 5</span>}
      </div>
    );
  }

  const metin = typeof deger === "string" ? deger : "";
  return (
    <div className="space-y-0.5">
      <textarea
        rows={3}
        maxLength={METIN_SINIRI}
        value={metin}
        onChange={(e) => ata(e.target.value ? e.target.value : undefined)}
        placeholder="Yorumunuzu yazın"
        className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 w-full resize-none rounded-lg border px-2.5 py-1.5 text-[13px] outline-none select-text focus-visible:ring-3 dark:bg-input/30"
      />
      <p className="text-muted-foreground text-right text-[11px] tabular-nums">{metin.length} / {METIN_SINIRI}</p>
    </div>
  );
}
