// Yerel sunucu (PusulaAktarim.exe) ile konuşma — SQL Konsol'daki düzen.
// Exe arayüzü `#anahtar=...` ile açar; parça sunucuya gitmez, burada okunup
// sekmenin deposuna yazılır ve adres çubuğundan silinir.

const ANAHTAR_DEPO = "pusula-aktarim-anahtar";
let bellekAnahtar: string | null = null;

function anahtarAl(): string | null {
  const m = /[#&]anahtar=([^&]+)/.exec(location.hash);
  if (m) {
    try {
      sessionStorage.setItem(ANAHTAR_DEPO, m[1]);
    } catch {
      /* depo kapalı → bellekte */
    }
    history.replaceState(null, "", location.pathname + location.search);
    bellekAnahtar = m[1];
    return m[1];
  }
  if (bellekAnahtar) return bellekAnahtar;
  try {
    return sessionStorage.getItem(ANAHTAR_DEPO);
  } catch {
    return null;
  }
}
const anahtar = import.meta.env.DEV ? "gelistirme" : anahtarAl();
export const anahtarVar = () => !!anahtar;

export class ApiHatasi extends Error {
  constructor(message: string, public kod: number) {
    super(message);
  }
}

export async function api<T = unknown>(yol: string, govde?: unknown): Promise<T> {
  let yanit: Response;
  try {
    yanit = await fetch("/api" + yol, {
      method: govde === undefined ? "GET" : "POST",
      headers: {
        "X-Aktarim-Anahtar": anahtar ?? "",
        ...(govde === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: govde === undefined ? undefined : JSON.stringify(govde),
      cache: "no-store",
    });
  } catch {
    throw new ApiHatasi("Aktarım uygulamasına ulaşılamadı. Kapanmış olabilir; yeniden başlatın.", 0);
  }
  const metin = await yanit.text();
  let json: unknown = null;
  try {
    json = metin ? JSON.parse(metin) : null;
  } catch {
    /* JSON değil */
  }
  if (!yanit.ok) throw new ApiHatasi((json as { hata?: string } | null)?.hata ?? `Hata (${yanit.status})`, yanit.status);
  return json as T;
}

/** Pencere yoksa (tarayıcıda açıldıysa) exe sayfanın açık olduğunu nabızdan anlar. */
export function nabziBaslat(): () => void {
  const at = () => void api("/nabiz", {}).catch(() => {});
  at();
  const id = window.setInterval(at, 5000);
  return () => window.clearInterval(id);
}

// ---------------------------------------------------------------- tipler

export type Asama = "giris" | "sqlAraniyor" | "sqlGiris" | "kesif" | "hazir";

export type Oturum = {
  id: string;
  firmaId: string;
  firmaAdi: string;
  durum: string;
  notlar: string | null;
  bitis: string;
};

export type SqlDenemesi = { sunucu: string; kaynak: string; hata: string | null };

export type Veritabani = {
  ad: string;
  durum: string;
  kurtarmaModeli: string;
  veriMb: number;
  logMb: number;
  sonYedek: string | null;
  tur: "firma" | "transfer" | "diger" | "sirket";
  guvenlikteVar: boolean;
  sirketAdlari: string[];
  prgTur: string | null;
  kod: string | null;
};

export type KesifRaporu = {
  zaman: string;
  makine: string;
  sql: {
    sunucu: string;
    kaynak: string;
    makineAdi: string;
    yerel: boolean;
    surum: string;
    surumu: string;
    sikistirmaVar: boolean;
    yedekKlasoru: string | null;
  };
  veritabanlari: Veritabani[];
  resimKlasorleri: { yol: string; var: boolean; dosyaSayisi: number; boyutMb: number; eksik: boolean; kullananlar: string[] }[];
  programKlasorleri: { yol: string; exeler: string[]; parametreler: { ad: string; dataKodu: string | null }[] }[];
  uyarilar: string[];
};

export type Durum = {
  asama: Asama;
  makine: string;
  surum: string;
  oturum: Oturum | null;
  sql: { sunucu: string; kaynak: string; kullanici: string | null } | null;
  sqlDenemeleri: SqlDenemesi[];
  yerelSunucular: string[];
  ilerleme: string | null;
  kesif: KesifRaporu | null;
  kesifHatasi: string | null;
  kesifGonderildi: boolean;
  mesaj: string | null;
};
