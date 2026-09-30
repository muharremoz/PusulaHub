import { useEffect, useState } from "react";
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

/** Pencerenin ✕'ine basılınca exe "kapatmayi-sor" gönderir; "soruldu" yanıtı Windows kutusunu engeller. */
export function KapatmaOnayi() {
  const [acik, setAcik] = useState(false);

  useEffect(() => {
    const wv = webview();
    const mesaj = (e: { data: unknown }) => {
      if (e.data !== "kapatmayi-sor") return;
      wv?.postMessage("soruldu");
      setAcik(true);
    };
    wv?.addEventListener("message", mesaj);
    return () => wv?.removeEventListener("message", mesaj);
  }, []);

  return (
    <AlertDialog open={acik} onOpenChange={setAcik}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Uygulama kapatılsın mı?</AlertDialogTitle>
          <AlertDialogDescription>Süren iş duraklatılır; uygulamayı yeniden açınca kaldığı yerden devam eder.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel autoFocus>Vazgeç</AlertDialogCancel>
          <AlertDialogAction onClick={() => void cikisYap()}>Kapat</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
