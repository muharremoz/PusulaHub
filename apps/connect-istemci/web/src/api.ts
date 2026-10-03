// Yerel sunucu (PusulaConnect.exe) ile konuşma — Aktarım 2 ile aynı düzen.
const ANAHTAR_DEPO = "pusula-connect-anahtar";
let bellekAnahtar: string | null = null;

function anahtarAl(): string | null {
  const m = /[#&]anahtar=([^&]+)/.exec(location.hash);
  if (m) {
    try {
      sessionStorage.setItem(ANAHTAR_DEPO, m[1]);
    } catch {
      /* bellekte */
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
      headers: { "X-Connect-Anahtar": anahtar ?? "", ...(govde === undefined ? {} : { "Content-Type": "application/json" }) },
      body: govde === undefined ? undefined : JSON.stringify(govde),
      cache: "no-store",
    });
  } catch {
    throw new ApiHatasi("Pusula Connect'e ulaşılamadı. Kapanmış olabilir; yeniden açın.", 0);
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

export function nabziBaslat(): () => void {
  const at = () => void api("/nabiz", {}).catch(() => {});
  at();
  const id = window.setInterval(at, 5000);
  return () => window.clearInterval(id);
}

export type Profil = {
  vpn: string;
  tunel: string;
  rdp: string;
  rdpPort: number | null;
  domain: string;
  msiurl: string;
  msiurlArm: string;
};

export type Duyuru = {
  id: string;
  baslik: string;
  metin: string;
  onem: "bilgi" | "uyari" | "kritik";
  olusturma: string;
  bitis: string | null;
  okundu: string | null;
};

export type Durum = {
  asama: "acilis" | "kayit" | "hazir";
  surum: string;
  makine: string;
  kayit: { firmaId: string; firmaAdi: string; kullanici: string; profil: Profil } | null;
  mesaj: string | null;
  servisErisim: boolean;
  kontroller: {
    forti: { kurulu: boolean; surum: string | null };
    /** kullaniciAdi: FortiClient bu tünel için kullanıcı adını saklıyor mu (FCConfig ile yazılır). */
    profil: { dogru: boolean; kullaniciAdi?: boolean };
    terminal: { erisim: boolean; ms: number; hata: string | null; zaman: string | null };
    rdpSifre: { kayitli: boolean; kullanici: string | null };
  };
  /** Bu cihazda iki adımlı doğrulama (TOTP) açık mı. */
  ikiAdim?: { aktif: boolean };
  /** Uygulama içi uzak masaüstü: açık mı, son oturum hatayla bittiyse mesajı. */
  oturum?: { acik: boolean; mesaj: string | null };
  /** Ayarlar sayfası (anında kaydedilir). */
  ayarlar?: {
    tamEkran: boolean; yazici: boolean; pano: boolean; ses: boolean; windowsIleBaslat: boolean;
    akilliKart: boolean; portlar: boolean; konum: boolean; kamera: boolean; aygitlar: boolean; suruculer: boolean;
  };
  /** Pusula'dan gelen duyurular (yeniden eskiye). okundu: UTC "YYYY-MM-DD HH:MM:SS" ya da null. */
  duyurular?: Duyuru[];
  vpnKurulum: {
    suruyor: boolean;
    durum: { adim: string; yuzde: number; mesaj: string | null; bitti: boolean; hata: string | null } | null;
  };
  guncelleme: {
    mevcut: boolean;
    surum: string | null;
    suruyor: boolean;
    /** İndirme ilerlemesi (0–100). */
    yuzde?: number;
    /** Yayındaki sürümün notları (satır başına bir madde). */
    notlar?: string | null;
    /** Bu sürüm servisin desteklediği en düşük sürümün altında (yalnız uyarı). */
    zorunlu?: boolean;
    hata?: string | null;
  };
  gunluk: string;
};
