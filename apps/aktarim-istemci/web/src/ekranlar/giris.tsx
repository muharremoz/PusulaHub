import { useState } from "react";
import { REGEXP_ONLY_DIGITS_AND_CHARS } from "input-otp";
import { AlertCircle, ArrowRight, Loader2, UploadCloud } from "lucide-react";
import { api, type Durum } from "@/api";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { InputOTP, InputOTPGroup, InputOTPSeparator, InputOTPSlot } from "@/components/ui/input-otp";
import { Kabuk } from "./ortak";

type P = { durum: Durum; setDurum: (d: Durum) => void };
const KOD_UZUNLUK = 8;

/** Pusula'nın verdiği aktarım kodu: 8 karakter, "ABCD-EFGH". */
export function GirisEkrani({ durum, setDurum }: P) {
  const [kod, setKod] = useState("");
  const [bekle, setBekle] = useState(false);
  const [hata, setHata] = useState<string | null>(null);

  const gonder = async (k = kod) => {
    if (k.length !== KOD_UZUNLUK) return setHata("Kodun 8 karakterini de girin.");
    setBekle(true);
    setHata(null);
    try {
      setDurum(await api<Durum>("/giris", { kod: `${k.slice(0, 4)}-${k.slice(4)}` }));
    } catch (e) {
      setHata((e as Error).message);
      setKod("");
    } finally {
      setBekle(false);
    }
  };

  return (
    <Kabuk genis>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="mb-1 flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <UploadCloud className="size-6" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Pusula Aktarım</h1>
          <p className="text-sm text-muted-foreground">Pusula'nın size verdiği aktarım kodunu girin.</p>
        </div>

        <div className="flex flex-col items-center gap-4">
          <InputOTP
            maxLength={KOD_UZUNLUK}
            pattern={REGEXP_ONLY_DIGITS_AND_CHARS}
            value={kod}
            autoFocus
            disabled={bekle}
            onChange={(v) => {
              setKod(v.toUpperCase());
              if (hata) setHata(null);
            }}
            onComplete={(v: string) => void gonder(v.toUpperCase())}
            pasteTransformer={(p) => p.replace(/[^a-z0-9]/gi, "").toUpperCase()}
          >
            <InputOTPGroup>
              {[0, 1, 2, 3].map((i) => (
                <InputOTPSlot key={i} index={i} className="size-11 text-base font-medium uppercase" />
              ))}
            </InputOTPGroup>
            <InputOTPSeparator />
            <InputOTPGroup>
              {[4, 5, 6, 7].map((i) => (
                <InputOTPSlot key={i} index={i} className="size-11 text-base font-medium uppercase" />
              ))}
            </InputOTPGroup>
          </InputOTP>

          {hata && (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertDescription>{hata}</AlertDescription>
            </Alert>
          )}

          <Button className="w-full" size="lg" disabled={bekle || kod.length !== KOD_UZUNLUK} onClick={() => void gonder()}>
            {bekle ? (
              <>
                <Loader2 className="animate-spin" /> Doğrulanıyor…
              </>
            ) : (
              <>
                Devam <ArrowRight />
              </>
            )}
          </Button>
        </div>

        <p className="text-center text-xs text-muted-foreground">
          {durum.makine} · sürüm {durum.surum}
        </p>
      </div>
    </Kabuk>
  );
}
