/**
 * PusulaNotify.exe ↔ sayfa köprüsü (WebView2 postMessage).
 *
 * Akış:
 *   sayfa yüklendi        → exe'ye { tur: "hazir" }
 *   exe                   → sayfaya { tur: "mesaj", mesaj, kullanici, koyu }
 *   kart boyutu değişti   → exe'ye { tur: "boyut", genislik, yukseklik }  (pencere karta oturur)
 *   "Okudum, anladım"     → exe'ye { tur: "okudum" }      exe agent'a ACK gönderir, kapanır
 *   anket "Gönder"        → exe'ye { tur: "okudum", cevaplar } exe cevabı ACK msgId'sine ekler (bkz. anket.ts)
 *   "10 dk sonra hatırlat"→ exe'ye { tur: "ertele", dakika } exe gizlenir, süre sonunda yeniden gösterir
 *   X ya da süre doldu    → exe'ye { tur: "kapat" }        ACK yok (bugünkü otomatik kapanma gibi)
 *
 * Mesaj alanları agent'ın PusulaNotify'a verdiği JSON'la aynı (docs/messaging-system.md).
 */

import type { Anket, AnketCevaplari } from "@/anket";

export type MesajTuru = "info" | "warning" | "urgent";

export interface Mesaj {
  msgId: string;
  title: string;
  body: string;
  type: MesajTuru;
  from: string;
  sentAt: string;
  /** Anketse sorular — Hub'dan agent'a dokunmadan gelir */
  survey?: Anket | null;
}

export interface ExeVerisi {
  tur: "mesaj";
  mesaj: Mesaj;
  kullanici: string;
  koyu: boolean;
  /** Ertelemeden sonra yeniden gösterim mi (başlıkta "hatırlatma" yazar). */
  hatirlatma?: boolean;
}

export type SayfaMesaji =
  | { tur: "hazir" }
  | { tur: "boyut"; genislik: number; yukseklik: number }
  | { tur: "okudum"; cevaplar?: AnketCevaplari }
  | { tur: "ertele"; dakika: number }
  | { tur: "kapat" };

interface WebView {
  postMessage(m: unknown): void;
  addEventListener(t: "message", f: (e: { data: unknown }) => void): void;
}

const webview = (): WebView | undefined =>
  (window as unknown as { chrome?: { webview?: WebView } }).chrome?.webview;

/** Exe içinde mi çalışıyoruz (değilse tarayıcı önizlemesi). */
export const exeIcinde = () => !!webview();

export function exeyeGonder(m: SayfaMesaji) {
  const w = webview();
  if (w) w.postMessage(m);
  else console.debug("[kopru → exe]", m);
}

export function exedenDinle(f: (v: ExeVerisi) => void) {
  webview()?.addEventListener("message", (e) => {
    const v = e.data as ExeVerisi;
    if (v?.tur === "mesaj") f(v);
  });
}
