import { useEffect, useState } from "react";
import { Loader2, ShieldCheck, Smartphone } from "lucide-react";
import QRCode from "qrcode";
import { api, type Durum } from "@/api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSeparator, InputOTPSlot } from "@/components/ui/input-otp";

/**
 * İki adımlı doğrulama (TOTP) pencereleri. Kural: kullanıcı açar; açıkken her "Pusula'ya bağlan"da
 * doğrulama uygulamasındaki 6 haneli kod sorulur. Şifre artık Windows kimlik kasasında durmaz
 * (bkz. Rdp.KasaliKaydet) — kod olmadan bu bilgisayardan Pusula'ya bağlanılamaz.
 */

/** 6 haneli kod girişi (3+3). Dolunca onEnter tetiklenir. */
export function KodGirisi({ deger, onDeger, onTamam, otomatikOdak }: { deger: string; onDeger: (v: string) => void; onTamam?: () => void; otomatikOdak?: boolean }) {
  return (
    <InputOTP
      maxLength={6}
      value={deger}
      onChange={(v) => onDeger(v.replace(/\D/g, ""))}
      onComplete={() => onTamam?.()}
      autoFocus={otomatikOdak}
      inputMode="numeric"
      pattern="[0-9]*"
      containerClassName="justify-center"
    >
      <InputOTPGroup>
        {[0, 1, 2].map((i) => <InputOTPSlot key={i} index={i} className="size-11 text-lg font-semibold" />)}
      </InputOTPGroup>
      <InputOTPSeparator />
      <InputOTPGroup>
        {[3, 4, 5].map((i) => <InputOTPSlot key={i} index={i} className="size-11 text-lg font-semibold" />)}
      </InputOTPGroup>
    </InputOTP>
  );
}

/** Açma: QR okut → oturum şifresini gir → ilk kodu gir. */
export function IkiAcPenceresi({ acik, onKapat, setDurum, kullanici }: { acik: boolean; onKapat: () => void; setDurum: (d: Durum) => void; kullanici: string }) {
  const [kurulum, setKurulum] = useState<{ gizli: string; uri: string } | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [sifre, setSifre] = useState("");
  const [kod, setKod] = useState("");
  const [bekle, setBekle] = useState(false);
  const [hata, setHata] = useState<string | null>(null);

  useEffect(() => {
    if (!acik) return;
    setKurulum(null); setQr(null); setSifre(""); setKod(""); setHata(null);
    void api<{ gizli: string; uri: string }>("/iki/baslat", {})
      .then(async (k) => {
        setKurulum(k);
        setQr(await QRCode.toDataURL(k.uri, { margin: 1, width: 220, errorCorrectionLevel: "M" }));
      })
      .catch((e) => setHata((e as Error).message));
  }, [acik]);

  const onayla = async () => {
    if (kod.length !== 6 || !sifre) return;
    setBekle(true); setHata(null);
    try {
      setDurum(await api<Durum>("/iki/onayla", { kod, sifre }));
      onKapat();
    } catch (e) {
      setHata((e as Error).message);
      setKod("");
    } finally {
      setBekle(false);
    }
  };

  return (
    <Dialog open={acik} onOpenChange={(o) => !o && onKapat()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><ShieldCheck className="size-5" /> İki adımlı doğrulamayı aç</DialogTitle>
          <DialogDescription>Açınca her "Pusula'ya bağlan"da telefonunuzdaki 6 haneli kod sorulur.</DialogDescription>
        </DialogHeader>

        <ol className="flex flex-col gap-4 text-sm">
          <li className="flex flex-col gap-2">
            <span><b>1.</b> Telefonunuzda Google Authenticator veya Microsoft Authenticator'ı açın ve bu kodu okutun:</span>
            <div className="flex items-center gap-4">
              <div className="flex size-[140px] shrink-0 items-center justify-center rounded-lg border bg-white p-1.5">
                {qr ? <img src={qr} alt="Doğrulama QR kodu" className="size-full" /> : <Loader2 className="size-5 animate-spin text-muted-foreground" />}
              </div>
              <div className="min-w-0 text-xs text-muted-foreground">
                Okutamıyorsanız uygulamada "anahtar gir"i seçip şunu yazın:
                <div className="mt-1 rounded-md bg-muted px-2 py-1.5 text-sm font-semibold tracking-wider break-all text-foreground select-all">
                  {kurulum ? kurulum.gizli.match(/.{1,4}/g)?.join(" ") : "…"}
                </div>
                <div className="mt-1">Hesap: Pusula Connect · {kullanici}</div>
              </div>
            </div>
          </li>
          <li className="flex flex-col gap-2">
            <span><b>2.</b> Pusula oturum şifreniz <span className="text-muted-foreground">(bu bilgisayarda kodla korunarak saklanır)</span>:</span>
            <Input type="password" value={sifre} onChange={(e) => setSifre(e.target.value)} placeholder="Oturum şifresi" />
          </li>
          <li className="flex flex-col gap-2">
            <span><b>3.</b> Uygulamada görünen 6 haneli kod:</span>
            <KodGirisi deger={kod} onDeger={setKod} onTamam={() => void onayla()} />
          </li>
        </ol>

        {hata && <p className="text-sm text-destructive">{hata}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={onKapat}>Vazgeç</Button>
          <Button disabled={bekle || !kurulum || kod.length !== 6 || !sifre} onClick={() => void onayla()}>
            {bekle ? <Loader2 className="animate-spin" /> : <ShieldCheck />} Aç
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Kod sorma penceresi: bağlanma, kapatma, şifre değiştirme için ortak. */
export function KodPenceresi({
  acik, baslik, aciklama, dugme, onKapat, onOnay,
}: {
  acik: boolean;
  baslik: string;
  aciklama: string;
  dugme: string;
  onKapat: () => void;
  /** Hata fırlatırsa mesaj pencerede gösterilir, pencere açık kalır. */
  onOnay: (kod: string) => Promise<void>;
}) {
  const [kod, setKod] = useState("");
  const [bekle, setBekle] = useState(false);
  const [hata, setHata] = useState<string | null>(null);

  useEffect(() => {
    if (acik) { setKod(""); setHata(null); }
  }, [acik]);

  const gonder = async () => {
    if (kod.length !== 6 || bekle) return;
    setBekle(true); setHata(null);
    try {
      await onOnay(kod);
      onKapat();
    } catch (e) {
      setHata((e as Error).message);
      setKod("");
    } finally {
      setBekle(false);
    }
  };

  return (
    <Dialog open={acik} onOpenChange={(o) => !o && onKapat()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader className="items-center text-center">
          <span className="mb-1 flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Smartphone className="size-5" />
          </span>
          <DialogTitle>{baslik}</DialogTitle>
          <DialogDescription>{aciklama}</DialogDescription>
        </DialogHeader>
        <div className="py-2">
          <KodGirisi deger={kod} onDeger={setKod} onTamam={() => void gonder()} otomatikOdak />
        </div>
        {hata && <p className="text-center text-sm text-destructive">{hata}</p>}
        <DialogFooter className="sm:justify-center">
          <Button variant="outline" onClick={onKapat}>Vazgeç</Button>
          <Button disabled={bekle || kod.length !== 6} onClick={() => void gonder()}>
            {bekle ? <Loader2 className="animate-spin" /> : null} {dugme}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
