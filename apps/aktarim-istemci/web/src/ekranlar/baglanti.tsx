import { useState } from "react";
import { AlertCircle, CheckCircle2, Database, Loader2, XCircle } from "lucide-react";
import { api, type Durum } from "@/api";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Ipucu, Kabuk } from "./ortak";

type P = { durum: Durum; setDurum: (d: Durum) => void };

/** Otomatik bağlanılamadı: sunucu + (isteğe bağlı) SQL kullanıcısı elle. Kullanıcı boşsa Windows oturumu. */
export function SqlGirisEkrani({ durum, setDurum }: P) {
  const [sunucu, setSunucu] = useState(durum.yerelSunucular[0] ?? ".");
  const [kullanici, setKullanici] = useState("sa");
  const [sifre, setSifre] = useState("");
  const [bekle, setBekle] = useState(false);
  const [hata, setHata] = useState<string | null>(null);

  const baglan = async () => {
    setBekle(true);
    setHata(null);
    try {
      setDurum(await api<Durum>("/sql/elle", { sunucu, kullanici, sifre }));
    } catch (e) {
      setHata((e as Error).message);
    } finally {
      setBekle(false);
    }
  };

  return (
    <Kabuk genis>
      <div className="flex flex-col gap-5">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20">
            <Database className="size-5" />
          </span>
          <div>
            <h1 className="text-lg font-semibold">SQL Server bağlantısı</h1>
            <p className="text-sm text-muted-foreground">{durum.mesaj ?? "Pusula verilerinin bulunduğu SQL Server'ı girin."}</p>
          </div>
        </div>

        {durum.sqlDenemeleri.length > 0 && (
          <div className="rounded-md border text-xs">
            {durum.sqlDenemeleri.map((d, i) => (
              <div key={i} className="flex items-start gap-2 border-b px-3 py-2 last:border-b-0">
                {d.hata ? <XCircle className="mt-0.5 size-3.5 shrink-0 text-destructive" /> : <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-foreground" />}
                <div className="min-w-0">
                  <span className="font-mono">{d.sunucu}</span>
                  <span className="text-muted-foreground"> · {d.kaynak === "windows" ? "Windows oturumu" : d.kaynak}</span>
                  {d.hata && <Ipucu metin={d.hata}><div className="truncate text-muted-foreground">{d.hata}</div></Ipucu>}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="sunucu">Sunucu</Label>
            <Input id="sunucu" value={sunucu} onChange={(e) => setSunucu(e.target.value)} placeholder=". ya da .\SQLEXPRESS" className="font-mono" />
            {durum.yerelSunucular.length > 1 && (
              <div className="flex flex-wrap gap-1">
                {durum.yerelSunucular.map((s) => (
                  <button key={s} type="button" onClick={() => setSunucu(s)} className="rounded border px-2 py-0.5 font-mono text-xs hover:bg-muted">
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="kullanici">Kullanıcı</Label>
              <Input id="kullanici" value={kullanici} onChange={(e) => setKullanici(e.target.value)} placeholder="boş = Windows" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="sifre">Şifre</Label>
              <Input id="sifre" type="password" value={sifre} onChange={(e) => setSifre(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void baglan()} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Şifre yalnız bu bilgisayarda kullanılır, Pusula'ya gönderilmez.</p>
        </div>

        {hata && (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertDescription>{hata}</AlertDescription>
          </Alert>
        )}

        <Button size="lg" disabled={bekle || !sunucu.trim()} onClick={() => void baglan()}>
          {bekle ? <><Loader2 className="animate-spin" /> Bağlanılıyor…</> : "Bağlan"}
        </Button>

        <div className="flex items-center gap-3 border-t pt-4">
          <p className="flex-1 text-xs text-muted-foreground">
            Bu bilgisayardan yalnız resim, program ya da dosya aktarılacaksa SQL Server gerekmez.
          </p>
          <Button variant="outline" disabled={bekle} onClick={() => void api<Durum>("/sql/atla", {}).then(setDurum).catch((e) => setHata((e as Error).message))}>
            SQL olmadan devam et
          </Button>
        </div>
      </div>
    </Kabuk>
  );
}
