// KOPYA: PusulaCRM/src/lib/data/il-koordinatlari.ts (03.10.2026). CRM'deki firma şehri (customers.city,
// PARS'tan dağınık gelir) → il/ülke + koordinat. Connect, firmanın ilini dünyada işaretlemek için kullanır.
// CRM'de düzeltme yapılırsa buraya da taşınmalı.
//
// Türkiye 81 il merkez koordinatları (yaklaşık) + dağınık "city" değerlerini
// kanonik ile normalize etme. customers.city PARS'tan geldiği için yazımı
// tutarsız (İstanbul/Istanbul/Stanbul, Izmır/İzmir, Urfa/Şanlıurfa, ilçe→il...).
// Firmalar Haritası bu tabloyla il başına konumlandırır.

export type IlKoord = { il: string; lat: number; lng: number };

// Anahtar = "fold"lanmış kanonik ad (aşağıdaki foldIl ile üretilir).
export const IL_KOORDINAT: Record<string, IlKoord> = {
  adana: { il: "Adana", lat: 37.0, lng: 35.321 },
  adiyaman: { il: "Adıyaman", lat: 37.764, lng: 38.276 },
  afyonkarahisar: { il: "Afyonkarahisar", lat: 38.757, lng: 30.539 },
  agri: { il: "Ağrı", lat: 39.719, lng: 43.051 },
  amasya: { il: "Amasya", lat: 40.653, lng: 35.833 },
  ankara: { il: "Ankara", lat: 39.92, lng: 32.854 },
  antalya: { il: "Antalya", lat: 36.897, lng: 30.713 },
  artvin: { il: "Artvin", lat: 41.183, lng: 41.819 },
  aydin: { il: "Aydın", lat: 37.848, lng: 27.845 },
  balikesir: { il: "Balıkesir", lat: 39.649, lng: 27.886 },
  bilecik: { il: "Bilecik", lat: 40.142, lng: 29.979 },
  bingol: { il: "Bingöl", lat: 38.885, lng: 40.498 },
  bitlis: { il: "Bitlis", lat: 38.401, lng: 42.108 },
  bolu: { il: "Bolu", lat: 40.739, lng: 31.611 },
  burdur: { il: "Burdur", lat: 37.72, lng: 30.291 },
  bursa: { il: "Bursa", lat: 40.188, lng: 29.06 },
  canakkale: { il: "Çanakkale", lat: 40.155, lng: 26.414 },
  cankiri: { il: "Çankırı", lat: 40.601, lng: 33.616 },
  corum: { il: "Çorum", lat: 40.55, lng: 34.955 },
  denizli: { il: "Denizli", lat: 37.784, lng: 29.094 },
  diyarbakir: { il: "Diyarbakır", lat: 37.914, lng: 40.234 },
  edirne: { il: "Edirne", lat: 41.677, lng: 26.556 },
  elazig: { il: "Elazığ", lat: 38.681, lng: 39.226 },
  erzincan: { il: "Erzincan", lat: 39.75, lng: 39.5 },
  erzurum: { il: "Erzurum", lat: 39.905, lng: 41.266 },
  eskisehir: { il: "Eskişehir", lat: 39.776, lng: 30.521 },
  gaziantep: { il: "Gaziantep", lat: 37.066, lng: 37.383 },
  giresun: { il: "Giresun", lat: 40.913, lng: 38.39 },
  gumushane: { il: "Gümüşhane", lat: 40.46, lng: 39.481 },
  hakkari: { il: "Hakkari", lat: 37.575, lng: 43.74 },
  hatay: { il: "Hatay", lat: 36.202, lng: 36.16 },
  isparta: { il: "Isparta", lat: 37.764, lng: 30.554 },
  mersin: { il: "Mersin", lat: 36.812, lng: 34.641 },
  istanbul: { il: "İstanbul", lat: 41.008, lng: 28.978 },
  izmir: { il: "İzmir", lat: 38.423, lng: 27.143 },
  kars: { il: "Kars", lat: 40.598, lng: 43.097 },
  kastamonu: { il: "Kastamonu", lat: 41.388, lng: 33.782 },
  kayseri: { il: "Kayseri", lat: 38.731, lng: 35.485 },
  kirklareli: { il: "Kırklareli", lat: 41.735, lng: 27.226 },
  kirsehir: { il: "Kırşehir", lat: 39.146, lng: 34.161 },
  kocaeli: { il: "Kocaeli", lat: 40.766, lng: 29.916 },
  konya: { il: "Konya", lat: 37.872, lng: 32.492 },
  kutahya: { il: "Kütahya", lat: 39.424, lng: 29.983 },
  malatya: { il: "Malatya", lat: 38.355, lng: 38.309 },
  manisa: { il: "Manisa", lat: 38.619, lng: 27.429 },
  kahramanmaras: { il: "Kahramanmaraş", lat: 37.575, lng: 36.937 },
  mardin: { il: "Mardin", lat: 37.312, lng: 40.735 },
  mugla: { il: "Muğla", lat: 37.215, lng: 28.363 },
  mus: { il: "Muş", lat: 38.734, lng: 41.491 },
  nevsehir: { il: "Nevşehir", lat: 38.625, lng: 34.714 },
  nigde: { il: "Niğde", lat: 37.966, lng: 34.679 },
  ordu: { il: "Ordu", lat: 40.984, lng: 37.878 },
  rize: { il: "Rize", lat: 41.021, lng: 40.523 },
  sakarya: { il: "Sakarya", lat: 40.774, lng: 30.396 },
  samsun: { il: "Samsun", lat: 41.292, lng: 36.331 },
  siirt: { il: "Siirt", lat: 37.933, lng: 41.94 },
  sinop: { il: "Sinop", lat: 42.026, lng: 35.153 },
  sivas: { il: "Sivas", lat: 39.748, lng: 37.018 },
  tekirdag: { il: "Tekirdağ", lat: 40.978, lng: 27.511 },
  tokat: { il: "Tokat", lat: 40.314, lng: 36.554 },
  trabzon: { il: "Trabzon", lat: 41.005, lng: 39.723 },
  tunceli: { il: "Tunceli", lat: 39.107, lng: 39.548 },
  sanliurfa: { il: "Şanlıurfa", lat: 37.168, lng: 38.793 },
  usak: { il: "Uşak", lat: 38.682, lng: 29.408 },
  van: { il: "Van", lat: 38.494, lng: 43.409 },
  yozgat: { il: "Yozgat", lat: 39.82, lng: 34.808 },
  zonguldak: { il: "Zonguldak", lat: 41.456, lng: 31.798 },
  aksaray: { il: "Aksaray", lat: 38.369, lng: 34.029 },
  bayburt: { il: "Bayburt", lat: 40.259, lng: 40.222 },
  karaman: { il: "Karaman", lat: 37.181, lng: 33.215 },
  kirikkale: { il: "Kırıkkale", lat: 39.846, lng: 33.515 },
  batman: { il: "Batman", lat: 37.881, lng: 41.132 },
  sirnak: { il: "Şırnak", lat: 37.518, lng: 42.459 },
  bartin: { il: "Bartın", lat: 41.635, lng: 32.337 },
  ardahan: { il: "Ardahan", lat: 41.11, lng: 42.702 },
  igdir: { il: "Iğdır", lat: 39.92, lng: 44.043 },
  yalova: { il: "Yalova", lat: 40.655, lng: 29.277 },
  karabuk: { il: "Karabük", lat: 41.204, lng: 32.627 },
  kilis: { il: "Kilis", lat: 36.718, lng: 37.121 },
  osmaniye: { il: "Osmaniye", lat: 37.075, lng: 36.247 },
  duzce: { il: "Düzce", lat: 40.844, lng: 31.163 },
  // KKTC — Türkiye'ye yakın konumla haritada gösterilir.
  kibris: { il: "Kıbrıs (KKTC)", lat: 35.185, lng: 33.383 },
};

// Türkçe karakterleri ASCII'ye indir, küçült, harf/rakam dışını at → eşleştirme anahtarı.
export function foldIl(s: string | null | undefined): string {
  return (s ?? "")
    .replace(/İ/g, "i")
    .replace(/I/g, "i")
    .replace(/ı/g, "i")
    .replace(/Ş/g, "s")
    .replace(/ş/g, "s")
    .replace(/Ç/g, "c")
    .replace(/ç/g, "c")
    .replace(/Ğ/g, "g")
    .replace(/ğ/g, "g")
    .replace(/Ö/g, "o")
    .replace(/ö/g, "o")
    .replace(/Ü/g, "u")
    .replace(/ü/g, "u")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

// Yaygın varyant/ilçe/eski-ad → kanonik (fold'lanmış) eşlemesi.
const ALIAS: Record<string, string> = {
  stanbul: "istanbul",
  urfa: "sanliurfa",
  surfa: "sanliurfa", // "Ş.urfa"
  afyon: "afyonkarahisar",
  adapazari: "sakarya",
  izmit: "kocaeli",
  gebze: "kocaeli",
  corlu: "tekirdag",
  kesan: "edirne",
  iskenderun: "hatay",
  antakya: "hatay",
  tarsus: "mersin",
  icel: "mersin",
  alanya: "antalya",
  manavgat: "antalya",
  merzifon: "amasya",
  fatsa: "ordu",
  tatvan: "bitlis",
  beypazari: "ankara",
  yenikent: "ankara",
  bandirma: "balikesir",
  lefkose: "kibris",
  lefkosa: "kibris",
  girne: "kibris",
  magusa: "kibris",
};

/** Ham "city" değerini kanonik il anahtarına çevir; harita dışıysa (yurtdışı vb.) null. */
export function normalizeIl(raw: string | null | undefined): string | null {
  const folded = foldIl(raw);
  if (!folded) return null;
  const key = ALIAS[folded] ?? folded;
  return IL_KOORDINAT[key] ? key : null;
}

// ---- Yurtdışı (ülke bazında) ----

export type YurtdisiKoord = { label: string; lat: number; lng: number };

// Ülke merkez koordinatları. Yabancı şehirler alias ile ülkeye toplanır.
export const YURTDISI_KOORDINAT: Record<string, YurtdisiKoord> = {
  almanya: { label: "Almanya", lat: 51.16, lng: 10.45 },
  belcika: { label: "Belçika", lat: 50.5, lng: 4.47 },
  hollanda: { label: "Hollanda", lat: 52.13, lng: 5.29 },
  fransa: { label: "Fransa", lat: 46.6, lng: 1.89 },
  bulgaristan: { label: "Bulgaristan", lat: 42.73, lng: 25.49 },
  romanya: { label: "Romanya", lat: 45.94, lng: 24.97 },
  kazakistan: { label: "Kazakistan", lat: 48.02, lng: 66.92 },
  azerbeycan: { label: "Azerbaycan", lat: 40.14, lng: 47.58 },
  fas: { label: "Fas", lat: 31.79, lng: -7.09 },
  afganistan: { label: "Afganistan", lat: 33.94, lng: 67.71 },
  iran: { label: "İran", lat: 32.43, lng: 53.69 },
  irak: { label: "Irak", lat: 33.22, lng: 43.68 },
  kosova: { label: "Kosova", lat: 42.6, lng: 20.9 },
  isvicre: { label: "İsviçre", lat: 46.82, lng: 8.23 },
  amerika: { label: "ABD", lat: 39.83, lng: -98.58 },
  kanada: { label: "Kanada", lat: 56.13, lng: -106.35 },
  rusya: { label: "Rusya", lat: 55.75, lng: 37.62 },
  turkmenistan: { label: "Türkmenistan", lat: 38.97, lng: 59.56 },
  lubnan: { label: "Lübnan", lat: 33.85, lng: 35.86 },
  ozbekistan: { label: "Özbekistan", lat: 41.38, lng: 64.59 },
  cekya: { label: "Çekya", lat: 49.82, lng: 15.47 },
  macedonia: { label: "Kuzey Makedonya", lat: 41.61, lng: 21.75 },
  urdun: { label: "Ürdün", lat: 30.59, lng: 36.24 },
  meksika: { label: "Meksika", lat: 23.63, lng: -102.55 },
  suriye: { label: "Suriye", lat: 34.8, lng: 38.99 },
  polonya: { label: "Polonya", lat: 51.92, lng: 19.15 },
  bosnahersek: { label: "Bosna Hersek", lat: 43.92, lng: 17.68 },
  libya: { label: "Libya", lat: 26.34, lng: 17.23 },
  arabistan: { label: "Suudi Arabistan", lat: 23.89, lng: 45.08 },
  ermenistan: { label: "Ermenistan", lat: 40.07, lng: 45.04 },
  gurcistan: { label: "Gürcistan", lat: 42.32, lng: 43.36 },
  irlanda: { label: "İrlanda", lat: 53.41, lng: -8.24 },
  avustralya: { label: "Avustralya", lat: -25.27, lng: 133.77 },
  cezayir: { label: "Cezayir", lat: 28.03, lng: 1.66 },
  avusturya: { label: "Avusturya", lat: 47.52, lng: 14.55 },
  norvec: { label: "Norveç", lat: 60.47, lng: 8.47 },
  panama: { label: "Panama", lat: 8.54, lng: -80.78 },
  bae: { label: "BAE", lat: 23.42, lng: 53.85 },
  misir: { label: "Mısır", lat: 26.82, lng: 30.8 },
  tayland: { label: "Tayland", lat: 15.87, lng: 100.99 },
  gafrika: { label: "Güney Afrika", lat: -30.56, lng: 22.94 },
};

// Yabancı şehir/varyant → ülke anahtarı.
const YURTDISI_ALIAS: Record<string, string> = {
  koln: "almanya", frankfurt: "almanya", stuttgart: "almanya", duisburg: "almanya",
  hamburg: "almanya", bonn: "almanya", hagen: "almanya", darmstadt: "almanya",
  bruhl: "almanya", bottrop: "almanya", berlin: "almanya", menheim: "almanya",
  bruksel: "belcika", antwerp: "belcika",
  amsterdam: "hollanda", utrecht: "hollanda", rotterdam: "hollanda", beverwyk: "hollanda",
  paris: "fransa", nantes: "fransa",
  sofya: "bulgaristan", burgaz: "bulgaristan",
  bukres: "romanya",
  baku: "azerbeycan",
  astana: "kazakistan",
  losangeles: "amerika", oregon: "amerika",
  viyana: "avusturya",
  cekoslavakya: "cekya", cekcumhuriyeti: "cekya", czechrepublic: "cekya",
  hercegoviua: "bosnahersek",
  marocaine: "fas",
  erbil: "irak",
  poznan: "polonya",
  dubai: "bae",
  algeria: "cezayir",
};

export type KonumSonuc = { key: string; label: string; lat: number; lng: number; yurtdisi: boolean };

/** Ham "city" → { il/ülke, koordinat, yurtdisi }. Türkiye ili değilse yurtdışı ülke
 *  olarak çözülür; hiçbiri değilse (bilinmeyen/boş) null. */
export function cozumleKonum(raw: string | null | undefined): KonumSonuc | null {
  const folded = foldIl(raw);
  if (!folded) return null;
  // Önce Türkiye ili
  const trKey = ALIAS[folded] ?? folded;
  const tr = IL_KOORDINAT[trKey];
  if (tr) return { key: trKey, label: tr.il, lat: tr.lat, lng: tr.lng, yurtdisi: false };
  // Sonra yurtdışı ülke
  const ydKey = YURTDISI_ALIAS[folded] ?? folded;
  const yd = YURTDISI_KOORDINAT[ydKey];
  if (yd) return { key: "yd:" + ydKey, label: yd.label, lat: yd.lat, lng: yd.lng, yurtdisi: true };
  return null;
}
