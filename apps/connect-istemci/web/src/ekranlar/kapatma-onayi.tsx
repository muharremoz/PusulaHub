import { useEffect, useRef, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cikisYap } from "./ortak";

type WebView = {
  addEventListener: (t: "message", f: (e: { data: unknown }) => void) => void;
  removeEventListener: (t: "message", f: (e: { data: unknown }) => void) => void;
  postMessage: (m: unknown) => void;
};
const webview = (): WebView | undefined => (window as unknown as { chrome?: { webview?: WebView } }).chrome?.webview;

/**
 * Pencerenin ✕'i: süren iş (VPN kurulumu, güncelleme) yoksa sormadan kapanır —
 * bağlantı uygulamasını kapatmak sıradan bir iş. Süren iş varsa onay sorulur.
 */
export function KapatmaOnayi({ mesgul }: { mesgul: boolean }) {
  const [acik, setAcik] = useState(false);
  const mesgulRef = useRef(mesgul);
  mesgulRef.current = mesgul;

  useEffect(() => {
    const wv = webview();
    const mesaj = (e: { data: unknown }) => {
      if (e.data !== "kapatmayi-sor") return;
      wv?.postMessage("soruldu");
      if (mesgulRef.current) setAcik(true);
      else void cikisYap();
    };
    wv?.addEventListener("message", mesaj);
    return () => wv?.removeEventListener("message", mesaj);
  }, []);

  return (
    <AlertDialog open={acik} onOpenChange={setAcik}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Pusula Connect kapatılsın mı?</AlertDialogTitle>
          <AlertDialogDescription>VPN kurulumu sürüyor. Kurulum arka planda tamamlanır; sonucu görmek için uygulamayı yeniden açın.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel autoFocus>Vazgeç</AlertDialogCancel>
          <AlertDialogAction onClick={() => void cikisYap()}>Kapat</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
