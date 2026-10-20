import { useState } from "react";
import { Check, Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { api, type Anket, type AnketCevaplari, type AnketSorusu, type Durum } from "@/api";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

/** Hub'daki METIN_SINIRI ile aynı (servis de kısaltıyor). */
const METIN_SINIRI = 500;

/**
 * Anketli duyurunun formu. Doğrulama asıl olarak serviste (zorunlu soru, geçersiz
 * seçenek); burada yalnız eksik zorunluyu göndermeden önce gösteriyoruz.
 */
export function AnketFormu({ duyuruId, anket, setDurum }: { duyuruId: string; anket: Anket; setDurum: (d: Durum) => void }) {
  const [cevap, setCevap] = useState<AnketCevaplari>({});
  const [gonderiliyor, setGonderiliyor] = useState(false);
  const yaz = (id: string, v: string | string[] | number | undefined) =>
    setCevap((c) => {
      const y = { ...c };
      if (v === undefined || (Array.isArray(v) && v.length === 0) || v === "") delete y[id];
      else y[id] = v;
      return y;
    });

  const eksik = anket.sorular.filter((s) => s.zorunlu && cevap[s.id] === undefined);

  const gonder = async () => {
    if (eksik.length) {
      toast.error("Zorunlu soruları yanıtlayın", { description: eksik.map((s) => s.soru).join(" · ") });
      return;
    }
    setGonderiliyor(true);
    try {
      setDurum(await api<Durum>("/duyuru/cevap", { id: duyuruId, cevaplar: cevap }));
      toast.success("Yanıtınız alındı", { description: "Teşekkür ederiz." });
    } catch (e) {
      toast.error("Yanıt gönderilemedi", { description: (e as Error).message });
    } finally {
      setGonderiliyor(false);
    }
  };

  return (
    <div className="mt-3 flex flex-col gap-4 rounded-lg border bg-muted/30 p-4">
      {anket.sorular.map((s, i) => (
        <Soru key={s.id} no={i + 1} s={s} deger={cevap[s.id]} yaz={(v) => yaz(s.id, v)} />
      ))}
      <div className="flex items-center gap-2">
        <Button size="sm" disabled={gonderiliyor} onClick={() => void gonder()}>
          {gonderiliyor ? <Loader2 className="animate-spin" /> : <Send />} Gönder
        </Button>
        {eksik.length > 0 && <span className="text-xs text-muted-foreground">{eksik.length} zorunlu soru yanıtlanmadı</span>}
      </div>
    </div>
  );
}

/** Yanıt verildikten sonra formun yerinde duran teşekkür satırı. */
export function AnketYanitlandi() {
  return (
    <div className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
      <Check className="size-3.5" /> Yanıtınız alındı, teşekkür ederiz.
    </div>
  );
}

function Soru({ no, s, deger, yaz }: { no: number; s: AnketSorusu; deger: AnketCevaplari[string] | undefined; yaz: (v: string | string[] | number | undefined) => void }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="text-sm font-medium">
        {no}. {s.soru}
        {s.zorunlu && <span className="ml-0.5 text-primary">*</span>}
      </div>

      {s.tip === "puan" && (
        <div className="flex items-center gap-1.5">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => yaz(deger === n ? undefined : n)}
              className={`size-9 rounded-md border text-sm font-semibold tabular-nums transition-colors ${
                deger === n ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted"
              }`}
            >
              {n}
            </button>
          ))}
          <span className="ml-2 text-xs text-muted-foreground">1 = hiç memnun değilim · 5 = çok memnunum</span>
        </div>
      )}

      {s.tip === "tek" && (
        <div className="flex flex-wrap gap-1.5">
          {(s.secenekler ?? []).map((x) => (
            <button
              key={x}
              type="button"
              onClick={() => yaz(deger === x ? undefined : x)}
              className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
                deger === x ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted"
              }`}
            >
              {x}
            </button>
          ))}
        </div>
      )}

      {s.tip === "coklu" && (
        <div className="flex flex-col gap-1.5">
          {(s.secenekler ?? []).map((x) => {
            const secili = Array.isArray(deger) && deger.includes(x);
            return (
              <label key={x} className="flex cursor-pointer items-center gap-2 text-sm">
                <Checkbox
                  checked={secili}
                  onCheckedChange={(v) => {
                    const l = Array.isArray(deger) ? deger : [];
                    yaz(v ? [...l, x] : l.filter((y) => y !== x));
                  }}
                />
                {x}
              </label>
            );
          })}
        </div>
      )}

      {s.tip === "metin" && (
        <textarea
          rows={3}
          maxLength={METIN_SINIRI}
          value={typeof deger === "string" ? deger : ""}
          onChange={(e) => yaz(e.target.value)}
          className="w-full resize-none rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          placeholder="Yazınız…"
        />
      )}
    </div>
  );
}
