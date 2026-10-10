import { useEffect, useState } from "react";
import { Eye, EyeOff, KeyRound, Loader2, LockKeyhole } from "lucide-react";
import { api, type Durum } from "@/api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Kabuk, cikisYap } from "./ortak";

/**
 * Uygulama şifresi (0.7.0): kullanıcının kendi belirlediği şifre. Serviste yalnız özeti durur; 5 hatada 10 dk kilit;
 * unutulursa Pusula (Hub > Connect) sıfırlar. İki adımlı doğrulamadan bağımsız: açılışta (kilit ekranı) ve/veya
 * her "Pusula'ya bağlan"da sorulur (Ayarlar > Güvenlik).
 */

const EN_AZ = 4;

/** Şifre kutusu: göster/gizle düğmeli. Enter → onEnter. */
export function SifreKutusu({
  id, deger, onDeger, onEnter, otomatikOdak, yerTutucu, yeniSifre,
}: {
  id?: string; deger: string; onDeger: (v: string) => void; onEnter?: () => void; otomatikOdak?: boolean; yerTutucu?: string;
  /** Tarayıcı/WebView şifre önerisi ve otomatik doldurma kapatılır */
  yeniSifre?: boolean;
}) {
  const [goster, setGoster] = useState(false);
  return (
    <div className="relative">
      <Input
        id={id}
        type={goster ? "text" : "password"}
        value={deger}
        onChange={(e) => onDeger(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") onEnter?.(); }}
        autoFocus={otomatikOdak}
        placeholder={yerTutucu}
        autoComplete={yeniSifre ? "new-password" : "current-password"}
        className="h-10 pr-10 text-base"
        spellCheck={false}
      />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setGoster((g) => !g)}
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground hover:text-foreground"
        aria-label={goster ? "Şifreyi gizle" : "Şifreyi göster"}
      >
        {goster ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}

/** Yeni şifre + tekrar; kural kontrolü yerelde, asıl denetim serviste. */
function YeniSifreAlanlari({
  sifre, setSifre, tekrar, setTekrar, onEnter, ilkOdak,
}: { sifre: string; setSifre: (v: string) => void; tekrar: string; setTekrar: (v: string) => void; onEnter: () => void; ilkOdak?: boolean }) {
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="yeni-sifre">Yeni şifre</Label>
        <SifreKutusu id="yeni-sifre" deger={sifre} onDeger={setSifre} otomatikOdak={ilkOdak} yeniSifre yerTutucu={`En az ${EN_AZ} karakter`} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="yeni-sifre-tekrar">Yeni şifre (tekrar)</Label>
        <SifreKutusu id="yeni-sifre-tekrar" deger={tekrar} onDeger={setTekrar} onEnter={onEnter} yeniSifre />
      </div>
    </>
  );
}

export function yeniSifreHatasi(sifre: string, tekrar: string): string | null {
  if (sifre.length < EN_AZ) return `Şifre en az ${EN_AZ} karakter olmalı.`;
  if (sifre.trim() !== sifre) return "Şifre boşlukla başlayamaz ya da bitemez.";
  if (sifre !== tekrar) return "Şifreler aynı değil.";
  return null;
}

/** Açma: kullanıcı yeni şifre belirler. */
export function SifreAcPenceresi({ acik, onKapat, setDurum }: { acik: boolean; onKapat: () => void; setDurum: (d: Durum) => void }) {
  const [sifre, setSifre] = useState("");
  const [tekrar, setTekrar] = useState("");
  const [bekle, setBekle] = useState(false);
  const [hata, setHata] = useState<string | null>(null);

  useEffect(() => {
    if (acik) { setSifre(""); setTekrar(""); setHata(null); }
  }, [acik]);

  const ac = async () => {
    const h = yeniSifreHatasi(sifre, tekrar);
    if (h) { setHata(h); return; }
    setBekle(true); setHata(null);
    try {
      setDurum(await api<Durum>("/uyg-sifre/ac", { sifre }));
      onKapat();
    } catch (e) {
      setHata((e as Error).message);
    } finally {
      setBekle(false);
    }
  };

  return (
    <Dialog open={acik} onOpenChange={(o) => !o && onKapat()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><KeyRound className="size-5" /> Uygulama şifresi belirle</DialogTitle>
          <DialogDescription>
            Bu şifre Pusula Connect'e özeldir; oturum şifrenizden farklı olabilir. Ayarlar'dan açılışta ya da her bağlanışta sorulmasını seçebilirsiniz.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 py-1">
          <YeniSifreAlanlari sifre={sifre} setSifre={setSifre} tekrar={tekrar} setTekrar={setTekrar} onEnter={() => void ac()} ilkOdak />
          <p className="text-xs text-muted-foreground">Unutursanız Pusula'dan sıfırlatabilirsiniz; şifre bizde saklanmaz, yeniden belirlersiniz.</p>
        </div>
        {hata && <p className="text-sm text-destructive">{hata}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={onKapat}>Vazgeç</Button>
          <Button disabled={bekle || !sifre || !tekrar} onClick={() => void ac()}>
            {bekle ? <Loader2 className="animate-spin" /> : <KeyRound />} Aç
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Değiştirme: mevcut + yeni + tekrar. */
export function SifreDegistirPenceresi({ acik, onKapat, setDurum }: { acik: boolean; onKapat: () => void; setDurum: (d: Durum) => void }) {
  const [eski, setEski] = useState("");
  const [sifre, setSifre] = useState("");
  const [tekrar, setTekrar] = useState("");
  const [bekle, setBekle] = useState(false);
  const [hata, setHata] = useState<string | null>(null);

  useEffect(() => {
    if (acik) { setEski(""); setSifre(""); setTekrar(""); setHata(null); }
  }, [acik]);

  const degistir = async () => {
    if (!eski) { setHata("Mevcut şifrenizi girin."); return; }
    const h = yeniSifreHatasi(sifre, tekrar);
    if (h) { setHata(h); return; }
    setBekle(true); setHata(null);
    try {
      setDurum(await api<Durum>("/uyg-sifre/degistir", { eski, yeni: sifre }));
      onKapat();
    } catch (e) {
      setHata((e as Error).message);
      setEski("");
    } finally {
      setBekle(false);
    }
  };

  return (
    <Dialog open={acik} onOpenChange={(o) => !o && onKapat()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><KeyRound className="size-5" /> Uygulama şifresini değiştir</DialogTitle>
          <DialogDescription>Önce mevcut şifrenizi, sonra yeni şifreyi iki kez girin.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 py-1">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="eski-sifre">Mevcut şifre</Label>
            <SifreKutusu id="eski-sifre" deger={eski} onDeger={setEski} otomatikOdak />
          </div>
          <YeniSifreAlanlari sifre={sifre} setSifre={setSifre} tekrar={tekrar} setTekrar={setTekrar} onEnter={() => void degistir()} />
        </div>
        {hata && <p className="text-sm text-destructive">{hata}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={onKapat}>Vazgeç</Button>
          <Button disabled={bekle || !eski || !sifre || !tekrar} onClick={() => void degistir()}>
            {bekle ? <Loader2 className="animate-spin" /> : null} Değiştir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Açılış kilidi: "Uygulama açılışında şifre sor" açıksa, şifre girilene kadar uygulama bu ekranla açılır. */
export function SifreKilitEkrani({ durum, setDurum }: { durum: Durum; setDurum: (d: Durum) => void }) {
  const [sifre, setSifre] = useState("");
  const [bekle, setBekle] = useState(false);
  const [hata, setHata] = useState<string | null>(null);

  const gonder = async () => {
    if (!sifre || bekle) return;
    setBekle(true); setHata(null);
    try {
      setDurum(await api<Durum>("/uyg-sifre/dogrula", { sifre }));
    } catch (e) {
      setHata((e as Error).message);
      setSifre("");
    } finally {
      setBekle(false);
    }
  };

  return (
    <Kabuk>
      <div className="flex flex-col items-center gap-4 text-center">
        <span className="flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary">
          <LockKeyhole className="size-5" />
        </span>
        <div className="flex flex-col gap-1">
          <h1 className="text-lg font-semibold">Uygulama şifresi</h1>
          <p className="text-sm text-muted-foreground">
            {durum.kayit?.kullanici ? <><b className="text-foreground">{durum.kayit.kullanici}</b> · </> : null}
            Pusula Connect için belirlediğiniz şifreyi girin.
          </p>
        </div>
        <div className="w-full text-left">
          <SifreKutusu deger={sifre} onDeger={setSifre} onEnter={() => void gonder()} otomatikOdak />
        </div>
        {hata && <p className="text-sm text-destructive">{hata}</p>}
        <Button className="w-full" disabled={bekle || !sifre} onClick={() => void gonder()}>
          {bekle ? <Loader2 className="animate-spin" /> : <LockKeyhole />} Devam
        </Button>
        <p className="text-xs text-muted-foreground">Şifrenizi unuttuysanız Pusula'yı arayın; sıfırlandığında bu ekran kendiliğinden kalkar.</p>
        <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => void cikisYap()}>Uygulamayı kapat</Button>
      </div>
    </Kabuk>
  );
}

/** Şifre sorma penceresi: bağlanma ve kapatma için ortak. */
export function SifrePenceresi({
  acik, baslik, aciklama, dugme, onKapat, onOnay,
}: {
  acik: boolean;
  baslik: string;
  aciklama: string;
  dugme: string;
  onKapat: () => void;
  /** Hata fırlatırsa mesaj pencerede gösterilir, pencere açık kalır. */
  onOnay: (sifre: string) => Promise<void>;
}) {
  const [sifre, setSifre] = useState("");
  const [bekle, setBekle] = useState(false);
  const [hata, setHata] = useState<string | null>(null);

  useEffect(() => {
    if (acik) { setSifre(""); setHata(null); }
  }, [acik]);

  const gonder = async () => {
    if (!sifre || bekle) return;
    setBekle(true); setHata(null);
    try {
      await onOnay(sifre);
      onKapat();
    } catch (e) {
      setHata((e as Error).message);
      setSifre("");
    } finally {
      setBekle(false);
    }
  };

  return (
    <Dialog open={acik} onOpenChange={(o) => !o && onKapat()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader className="items-center text-center">
          <span className="mb-1 flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary">
            <KeyRound className="size-5" />
          </span>
          <DialogTitle>{baslik}</DialogTitle>
          <DialogDescription>{aciklama}</DialogDescription>
        </DialogHeader>
        <div className="py-2">
          <SifreKutusu deger={sifre} onDeger={setSifre} onEnter={() => void gonder()} otomatikOdak />
        </div>
        {hata && <p className="text-center text-sm text-destructive">{hata}</p>}
        <DialogFooter className="sm:justify-center">
          <Button variant="outline" onClick={onKapat}>Vazgeç</Button>
          <Button disabled={bekle || !sifre} onClick={() => void gonder()}>
            {bekle ? <Loader2 className="animate-spin" /> : null} {dugme}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
