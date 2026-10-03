import { useState } from "react";
import { Download, Loader2, Sparkles, X } from "lucide-react";
import { api, type Durum } from "@/api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";

/**
 * Yeni sürüm bildirimi — pencerenin alt ortasında yüzen şerit. Uygulama açılışta ve açıkken 30 dakikada bir
 * sürüm arar; bulunca şerit çıkar: "Güncelle" → indirilir (SHA-256 doğrulanır), kurulur, uygulama yeniden
 * açılır. "Yenilikler" sürüm notlarını gösterir. Kapatılırsa o sürüm için bir daha çıkmaz (daha yenisi
 * gelince yine çıkar; Ayarlar > Hakkında'dan da güncellenebilir). Oturum açıkken gösterilmez.
 */
export function GuncellemePenceresi({ durum, setDurum }: { durum: Durum; setDurum: (d: Durum) => void }) {
  const g = durum.guncelleme;
  const [kapatilan, setKapatilan] = useState<string | null>(null);
  const [notlarAcik, setNotlarAcik] = useState(false);
  const [hata, setHata] = useState<string | null>(null);

  const gorunur = g.mevcut && !!g.surum && (kapatilan !== g.surum || g.suruyor) && !durum.oturum?.acik;
  const notlar = (g.notlar ?? "").split(/\r?\n/).map((s) => s.replace(/^[-•*]\s*/, "").trim()).filter(Boolean);
  const hataMetni = hata ?? g.hata;

  const guncelle = async () => {
    setHata(null);
    try {
      setDurum(await api<Durum>("/guncelle", {}));
    } catch (e) {
      setHata((e as Error).message);
    }
  };

  if (!gorunur) return null;

  return (
    <>
      <div className="pointer-events-none fixed inset-x-0 bottom-5 z-50 flex justify-center px-4">
        <div
          role="status"
          className="pointer-events-auto flex max-w-full items-center gap-3 rounded-xl border bg-card py-2 pr-2 pl-3 shadow-lg animate-in fade-in slide-in-from-bottom-4 duration-300"
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Sparkles className="size-4" />
          </span>

          {g.suruyor ? (
            <div className="flex w-56 flex-col gap-1.5 pr-2">
              <div className="text-sm font-medium">
                {(g.yuzde ?? 0) < 100 ? `Güncelleniyor… %${g.yuzde ?? 0}` : "Kuruluyor, uygulama yeniden açılacak…"}
              </div>
              <Progress value={g.yuzde ?? 0} className="h-1.5" />
            </div>
          ) : (
            <>
              <div className="min-w-0">
                <div className="text-sm font-medium">Yeni sürüm hazır: {g.surum}</div>
                <div className={hataMetni ? "truncate text-xs text-destructive" : "text-xs text-muted-foreground"}>
                  {hataMetni ?? `Şu an ${durum.surum} · birkaç saniye sürer`}
                </div>
              </div>
              {notlar.length > 0 && (
                <Button size="sm" variant="ghost" onClick={() => setNotlarAcik(true)}>Yenilikler</Button>
              )}
              <Button size="sm" onClick={() => void guncelle()}>
                <Download /> {hataMetni ? "Tekrar dene" : "Güncelle"}
              </Button>
              <Button size="icon" variant="ghost" className="size-8 text-muted-foreground" aria-label="Kapat" onClick={() => setKapatilan(g.surum)}>
                <X />
              </Button>
            </>
          )}
        </div>
      </div>

      <Dialog open={notlarAcik && !g.suruyor} onOpenChange={setNotlarAcik}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <span className="mb-1 flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Sparkles className="size-5" />
            </span>
            <DialogTitle>Pusula Connect {g.surum}</DialogTitle>
            <DialogDescription>Şu an {durum.surum} kullanıyorsunuz. Uygulama güncellenip kendiliğinden yeniden açılır.</DialogDescription>
          </DialogHeader>
          <ul className="flex list-disc flex-col gap-1 rounded-lg border bg-muted/40 p-3 pl-7 text-sm">
            {notlar.map((n, i) => <li key={i}>{n}</li>)}
          </ul>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNotlarAcik(false)}>Sonra</Button>
            <Button onClick={() => { setNotlarAcik(false); void guncelle(); }}>
              {g.suruyor ? <Loader2 className="animate-spin" /> : <Download />} Şimdi güncelle
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
