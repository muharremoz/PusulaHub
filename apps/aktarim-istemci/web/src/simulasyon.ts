/**
 * Aktarım ekranı simülasyonu — YALNIZ geliştirmede (npm run dev). Gerçek aktarım başlatmadan
 * aktarım ekranını baştan sona izlemek için: adres çubuğuna ?simule=aktarim ekleyin.
 *
 *   ?simule=aktarim         normal akış: yedek → yükleme → bildirim → sunuculara yerleştirme → bitti
 *   ?simule=aktarim-hata    bir öğe yüklemede hata verir, sunucuda resim yerleştirme hata verir
 *   ?simule=aktarim-ayir    sonda veritabanları ayrılır (detach) + doğrulama
 *   &hiz=3                  3 kat hızlı
 *
 * Duraklat / Devam / Yeni kod düğmeleri exe'ye GİTMEZ; simülasyonu yönetir (bkz. api.ts simulasyonApi).
 * Derlenmiş exe'ye girmez: import.meta.env.DEV dışında hiç etkin olmaz.
 */
import type { Durum, IsOgesi } from "./api";

type Kip = "aktarim" | "aktarim-hata" | "aktarim-ayir";

const parametre = () => new URLSearchParams(location.search);

export function simulasyonKipi(): Kip | null {
  if (!import.meta.env.DEV) return null;
  const k = parametre().get("simule");
  return k === "aktarim" || k === "aktarim-hata" || k === "aktarim-ayir" ? k : null;
}

type Tanim = Pick<IsOgesi, "tip" | "tur" | "ad" | "veriMb"> & { hedef: string };
const OGELER: Tanim[] = [
  { tip: "vt", tur: "veritabani", hedef: "veritabani", ad: "IPEKGUMUS", veriMb: 46 },
  { tip: "vt", tur: "veritabani", hedef: "veritabani", ad: "PUSULAXTPT", veriMb: 200 },
  { tip: "dosya", tur: "eski", hedef: "eski", ad: "IPEKGUMUS_2024.bak", veriMb: 120 },
  { tip: "paket", tur: "resim", hedef: "resim", ad: "Resimler · C:\\Pusula\\Resim", veriMb: 80 },
  { tip: "paket", tur: "program", hedef: "program", ad: "Pusula X · C:\\PusulaX", veriMb: 15 },
];

// Süreler (sn): hazırlık (yedek / paket / doğrulama) ve yükleme; öğeler sırayla.
const hazirlikSn = (o: Tanim) => (o.tip === "vt" ? 3 : o.tip === "paket" ? 2.5 : 1);
const yuklemeSn = (o: Tanim) => 2 + o.veriMb / 50;
const SUNUCU_ADIM_SN = 3;
const AYIRMA_SN = 3;

let baslangic = performance.now();
let duraklamaBasi: number | null = null;
let duraklamaToplam = 0;

function gecenSn(): number {
  const hiz = Number(parametre().get("hiz")) || 1;
  const simdi = duraklamaBasi ?? performance.now();
  return ((simdi - baslangic - duraklamaToplam) / 1000) * hiz;
}

/** Arayüzün çağırdığı aktarım uçlarını yakalar; undefined dönerse istek gerçekten gider. */
export function simulasyonIstegi(yol: string, gercek: Durum | null): Durum | undefined {
  if (!yol.startsWith("/aktarim")) return undefined;
  if (yol === "/aktarim/duraklat" && duraklamaBasi === null) duraklamaBasi = performance.now();
  if (yol === "/aktarim/devam" && duraklamaBasi !== null) {
    duraklamaToplam += performance.now() - duraklamaBasi;
    duraklamaBasi = null;
  }
  if (yol === "/aktarim/yeni") {
    baslangic = performance.now();
    duraklamaBasi = null;
    duraklamaToplam = 0;
  }
  return simulasyonDurumu(gercek);
}

export function simulasyonDurumu(gercek: Durum | null): Durum {
  const kip = simulasyonKipi() ?? "aktarim";
  const hata = kip === "aktarim-hata";
  const ayir = kip === "aktarim-ayir";
  let t = gecenSn();

  // 1) Öğeler: sırayla hazırlık → yükleme → tamam
  const ogeler: IsOgesi[] = OGELER.map((o) => ({
    tip: o.tip, tur: o.tur, ad: o.ad, hedef: o.hedef, veriMb: o.veriMb,
    durum: "bekliyor", yuzde: 0, boyut: Math.round(o.veriMb * 1048576 * 0.4), gonderilen: 0, hata: null,
  }));
  for (let i = 0; i < OGELER.length; i++) {
    const o = OGELER[i], g = ogeler[i];
    const h = hazirlikSn(o), y = yuklemeSn(o);
    if (t <= 0) break;
    if (t < h) {
      g.durum = o.tip === "vt" ? "yedekleniyor" : o.tip === "paket" ? "paketleniyor" : "hazirlaniyor";
      g.yuzde = Math.round((t / h) * 100);
      t = 0;
      break;
    }
    t -= h;
    // Hata kipinde 2. öğe yüklemenin yarısında düşer; sıradakine geçilir
    if (hata && i === 1 && t >= y / 2) {
      g.durum = "hata";
      g.yuzde = 50;
      g.gonderilen = Math.round(g.boyut / 2);
      g.hata = "Bağlantı koptu (simülasyon). Yeniden denenecek.";
      t -= y / 2;
      continue;
    }
    if (t < y) {
      g.durum = "yukleniyor";
      g.yuzde = Math.round((t / y) * 100);
      g.gonderilen = Math.round((g.boyut * g.yuzde) / 100);
      t = 0;
      break;
    }
    t -= y;
    g.durum = "tamam";
    g.yuzde = 100;
    g.gonderilen = g.boyut;
  }
  const yuklemeBitti = ogeler.every((o) => o.durum === "tamam" || o.durum === "hata");

  // 2) Pusula tarafı: yüklendi → tür tür yerleştirme → tamamlandı (hata kipinde resimde hata)
  let sunucu: NonNullable<Durum["aktarim"]>["sunucu"] = null;
  const turler = [...new Set(OGELER.map((o) => o.hedef))];
  if (yuklemeBitti && t > 0) {
    if (t < 1) sunucu = { durum: "yuklendi", asama: null, ilerleme: 0, hata: null };
    else {
      t -= 1;
      const i = Math.floor(t / SUNUCU_ADIM_SN);
      if (hata && i >= turler.indexOf("resim")) {
        sunucu = { durum: "hata", asama: "resim", ilerleme: 40, hata: "Depo sunucusuna yazılamadı (simülasyon)." };
      } else if (i < turler.length) {
        sunucu = { durum: "aktariliyor", asama: turler[i], ilerleme: Math.round(((t % SUNUCU_ADIM_SN) / SUNUCU_ADIM_SN) * 100), hata: null };
      } else {
        sunucu = { durum: "tamamlandi", asama: null, ilerleme: 100, hata: null };
        t -= turler.length * SUNUCU_ADIM_SN;
      }
    }
  }
  const sunucuBitti = sunucu?.durum === "tamamlandi";

  // 3) Ayırma (detach) — yalnız ayır kipinde, sunucu bitince
  let ayirma: Durum["ayirma"] = undefined;
  const vtler = OGELER.filter((o) => o.tip === "vt").map((o) => o.ad);
  if (ayir && sunucuBitti) {
    const bitti = t >= AYIRMA_SN;
    ayirma = {
      durum: bitti ? "bitti" : "suruyor",
      ayrilanlar: bitti ? vtler : vtler.slice(0, t >= AYIRMA_SN / 2 ? 1 : 0),
      hatalar: [],
      dogrulama: bitti
        ? vtler.map((ad) => ({ ad, listedenCikti: true, dosyalarKontrolEdildi: true, dosyalarYerinde: true, dosyalar: [ad + ".mdf", ad + "_log.ldf"] }))
        : [],
    } as Durum["ayirma"];
  }
  const herSeyBitti = sunucuBitti && (!ayir || ayirma?.durum === "bitti");

  const temel: Durum = gercek ?? ({ asama: "aktarim", makine: "SIMULASYON", surum: "0.0.0", oturum: null } as unknown as Durum);
  return {
    ...temel,
    asama: "aktarim",
    oturum: temel.oturum ?? ({ id: "sim", firmaId: "9999", firmaAdi: "DEMO — simülasyon", durum: "aktariliyor", notlar: null, bitis: "", programlar: [], hedefler: { sql: true, depo: true, rdp: true } }),
    ayirma,
    aktarim: {
      ogeler,
      sikistir: false,
      suruyor: duraklamaBasi === null && !yuklemeBitti,
      bitti: yuklemeBitti,
      bilgi: hata && ogeler[1].durum === "hata" ? "Bir öğe yüklenemedi (simülasyon). Diğerleri devam ediyor." : null,
      bildirildi: yuklemeBitti && !!sunucu,
      yeniAktarimOlur: herSeyBitti,
      veritabanlariAyir: ayir,
      yedekKlasoru: "C:\\ProgramData\\PusulaAktarim\\yedek",
      sunucu,
    },
  };
}
