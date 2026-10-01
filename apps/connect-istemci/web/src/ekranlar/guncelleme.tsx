import { useState } from "react";
import { Download, Loader2, Sparkles } from "lucide-react";
import { api, type Durum } from "@/api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";

/**
 * Açılışta yeni sürüm varsa sorulur: "Şimdi güncelle" → indirilir (SHA-256 doğrulanır), kurulur, uygulama
 * yeniden açılır. "Sonra" → bu açılışta bir daha sorulmaz (Ayarlar > Hakkında'dan ya da sol paneldeki
 * düğmeden güncellenebilir). Oturum açıkken sorulmaz.
 */
export function GuncellemePenceresi({ durum, setDurum }: { durum: Durum; setDurum: (d: Durum) => void }) {
  const g = durum.guncelleme;
  const [ertelenen, setErtelenen] = useState<string | null>(null);
  const [hata, setHata] = useState<string | null>(null);

  const acik = g.mevcut && !!g.surum && ertelenen !== g.surum && !durum.oturum?.acik;
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

  return (
    <Dialog open={acik} onOpenChange={(o) => !o && !g.suruyor && setErtelenen(g.surum)}>
      <DialogContent className="sm:max-w-md" showCloseButton={!g.suruyor}>
        <DialogHeader>
          <span className="mb-1 flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Sparkles className="size-5" />
          </span>
          <DialogTitle>Yeni sürüm hazır: {g.surum}</DialogTitle>
          <DialogDescription>
            Şu an {durum.surum} kullanıyorsunuz. Güncelleme birkaç saniye sürer; uygulama kendiliğinden yeniden açılır.
          </DialogDescription>
        </DialogHeader>

        {notlar.length > 0 && (
          <div className="rounded-lg border bg-muted/40 p-3">
            <div className="mb-1.5 text-xs font-medium text-muted-foreground">Bu sürümde</div>
            <ul className="flex list-disc flex-col gap-1 pl-4 text-sm">
              {notlar.map((n, i) => <li key={i}>{n}</li>)}
            </ul>
          </div>
        )}

        {g.suruyor && (
          <div className="flex flex-col gap-1.5">
            <Progress value={g.yuzde ?? 0} />
            <div className="text-xs text-muted-foreground">{(g.yuzde ?? 0) < 100 ? `İndiriliyor… %${g.yuzde ?? 0}` : "Kuruluyor, uygulama yeniden açılacak…"}</div>
          </div>
        )}

        {hataMetni && !g.suruyor && <p className="text-sm text-destructive">{hataMetni}</p>}

        <DialogFooter>
          <Button variant="outline" disabled={g.suruyor} onClick={() => setErtelenen(g.surum)}>Sonra</Button>
          <Button disabled={g.suruyor} onClick={() => void guncelle()}>
            {g.suruyor ? <Loader2 className="animate-spin" /> : <Download />} {hataMetni ? "Tekrar dene" : "Şimdi güncelle"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
