import { useEffect, useState } from "react";
import { ArrowLeftRight, Loader2 } from "lucide-react";
import { api, type Durum } from "@/api";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ESKI_PROGRAMLAR, PUSULAX, YaziciAjaniBolumu } from "./yazici-ajani";

/**
 * Ayarlar > Yazdırma — tek yardımcı: Pusula X'in yazdırma ajanı ya da Pusula programlarının RFID yardımcısı.
 * Hiçbiri kurulu değilken en üstte program seçimi; biri kuruluyken o gösterilir, "Değiştir" ile kaldırılıp
 * diğerine geçilir. İstemci de zorlar: birini kurmak diğerini kaldırır.
 */
type Tur = "pusulax" | "pusula";

export function YazdirmaBolumu({ durum, setDurum }: { durum: Durum; setDurum: (d: Durum) => void }) {
  const aktif: Tur | null = durum.yazdirma?.kurulu ? "pusulax" : durum.rfid?.kurulu ? "pusula" : null;
  const [secilen, setSecilen] = useState<Tur>(aktif ?? "pusulax");
  const [onay, setOnay] = useState(false);
  const [bekle, setBekle] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  useEffect(() => {
    if (aktif) setSecilen(aktif);
  }, [aktif]);
  const tur = aktif ?? secilen;
  const tanim = tur === "pusula" ? ESKI_PROGRAMLAR : PUSULAX;
  const tazele = () => api<Durum>("/durum").then(setDurum).catch(() => {});

  const degistir = async () => {
    setBekle(true);
    setHata(null);
    try {
      await api(`${tanim.uc}/kaldir`, {});
      await tazele();
      setSecilen(tur === "pusula" ? "pusulax" : "pusula");
    } catch (e) {
      setHata((e as Error).message);
    } finally {
      setBekle(false);
      setOnay(false);
    }
  };

  const ust = aktif ? (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="text-xs text-muted-foreground">
        Program: <span className="font-medium text-foreground">{tur === "pusula" ? "Pusula" : "Pusula X"}</span>
        {hata && <span className="ml-2 text-destructive">{hata}</span>}
      </div>
      <Button size="sm" variant="outline" className="h-6 gap-1 px-2 text-xs [&_svg]:size-3" onClick={() => setOnay(true)} disabled={bekle}>
        <ArrowLeftRight /> Değiştir
      </Button>
    </div>
  ) : (
    <div className="flex flex-col gap-1.5 px-4 py-3">
      <Label className="text-xs">Yazdırma hangi program için?</Label>
      <ToggleGroup type="single" variant="outline" value={secilen} onValueChange={(v) => v && setSecilen(v as Tur)} className="w-full">
        <ToggleGroupItem value="pusulax" className="flex-1">Pusula X</ToggleGroupItem>
        <ToggleGroupItem value="pusula" className="flex-1">Pusula</ToggleGroupItem>
      </ToggleGroup>
    </div>
  );

  return (
    <>
      <YaziciAjaniBolumu key={tur} tur={tanim} baslik="Yazdırma yardımcısı" ust={ust} onDegisti={() => void tazele()} />
      <AlertDialog open={onay} onOpenChange={(o) => !o && setOnay(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Yazdırma yardımcısı değiştirilsin mi?</AlertDialogTitle>
            <AlertDialogDescription>
              Aynı anda tek yazdırma yardımcısı kullanılır. {tur === "pusula" ? "Pusula" : "Pusula X"} yardımcısı kaldırılır; ardından{" "}
              {tur === "pusula" ? "Pusula X" : "Pusula"} yardımcısını kurabilirsiniz.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Vazgeç</AlertDialogCancel>
            <AlertDialogAction disabled={bekle} onClick={(e) => { e.preventDefault(); void degistir(); }}>
              {bekle ? <Loader2 className="animate-spin" /> : <ArrowLeftRight />} Değiştir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
