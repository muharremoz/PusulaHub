"use client";

/**
 * Firma kullanım analizi + müşteriye gönderilebilir rapor.
 *
 * Ekrandaki görünüm bizim için; "Rapor İndir" ise MÜŞTERİYE gider.
 * İkisi aynı veriden beslenir ama rapor kendi kendine yeten tek bir
 * HTML dosyasıdır: e-postaya eklenebilir, tarayıcıda açılır, oradan
 * PDF'e basılabilir. Hub'a ya da internete bağımlı değildir.
 *
 * Rapor dilinde iç değerlendirme yok — "atıl hesap", "israf" gibi
 * ifadeler müşteriye gönderilecek belgede yeri olmayan yorumlardır.
 * Orada yalnız olgular var: kim, ne kadar, ne zaman.
 */

import { useCallback, useEffect, useState } from "react";
import { Download, Clock, Users, CalendarDays, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import type { FirmaAnalizYanit, FirmaAnalizGun } from "@/app/api/companies/[firkod]/analiz/route";

const DONEMLER = [30, 90, 180] as const;

const trTarih = (t: string) => {
  const [y, a, g] = t.split("-");
  return `${g}.${a}.${y}`;
};

const AY_ADI = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const trAy = (ay: string) => {
  const [y, a] = ay.split("-");
  return `${AY_ADI[Number(a) - 1]} ${y}`;
};

const sy = (n: number) => n.toLocaleString("tr-TR");
/** Ondalıklı sayı — Türkçe virgülle. Müşteriye giden metinde "9.1" değil "9,1". */
const sd = (n: number, basamak = 1) =>
  n.toLocaleString("tr-TR", { minimumFractionDigits: basamak, maximumFractionDigits: basamak });

/* ══════════════════════════════════════════════════════════
   Pusula analizi — veriden üretilen değerlendirme
   ══════════════════════════════════════════════════════════
   Rakamlar tek başına bir şey söylemiyor: 2.249 saat çok mu az mı,
   müşteri bilmiyor. Bu bölüm sayıyı cümleye çeviriyor.

   İki kural: (1) her cümle veriden türer, süsleme yok. (2) dili
   ölçülüdür — "mükemmel kullanım" gibi pazarlama ifadeleri yerine
   ne görüldüğü söylenir. Abartılı bir değerlendirme, müşteri kendi
   gerçeğini bildiği için güveni azaltır.
   ══════════════════════════════════════════════════════════ */
export function pusulaYorumu(d: FirmaAnalizYanit): string[] {
  const p: string[] = [];
  const o = d.ozet;
  const isGunleri = d.gunler.filter((g) => !g.haftaSonu);
  const haftaSonu = d.gunler.filter((g) => g.haftaSonu);

  /* 1) Genel yoğunluk */
  const yogunluk =
    o.kisiBasiGunlukSaat >= 8 ? "tam iş günü boyunca"
    : o.kisiBasiGunlukSaat >= 6 ? "mesai saatleri boyunca"
    : o.kisiBasiGunlukSaat >= 3.5 ? "günün önemli bir bölümünde"
    : "gün içinde belirli aralıklarla";
  p.push(
    `Bu dönemde ${d.donem.gun} günlük süre içinde ${o.kullanici} kullanıcınız ` +
    `toplam ${sy(o.toplamSaat)} saat çalıştı. Kullanıcılarınız bağlandıkları günlerde ` +
    `ortalama ${sd(o.kisiBasiGunlukSaat)} saat sistemde kaldı; bu, sistemin ${yogunluk} ` +
    `kullanıldığı anlamına geliyor.`,
  );

  /* 2) Düzenlilik — çalışılan gün / dönemdeki iş günü */
  if (isGunleri.length > 0) {
    const beklenenIsGunu = Math.round((d.donem.gun / 7) * 5);
    const oran = Math.min(100, Math.round((isGunleri.length / Math.max(1, beklenenIsGunu)) * 100));
    const nitelik =
      oran >= 90 ? "neredeyse her iş günü"
      : oran >= 70 ? "iş günlerinin büyük bölümünde"
      : oran >= 40 ? "iş günlerinin yaklaşık yarısında"
      : "belirli günlerde";
    p.push(
      `Sistem ${nitelik} kullanıldı: dönemdeki ${beklenenIsGunu} iş gününün ` +
      `${isGunleri.length} tanesinde kayıt oluştu. Günlük ortalama ${sd(o.gunlukOrtKisi)} ` +
      `kullanıcınız bağlandı.`,
    );
  }

  /* 3) Eğilim — dönemin ilk yarısı ile son yarısı */
  if (isGunleri.length >= 8) {
    const orta = Math.floor(isGunleri.length / 2);
    const ilk = isGunleri.slice(0, orta);
    const son = isGunleri.slice(orta);
    const ortSaat = (a: FirmaAnalizGun[]) => a.reduce((x, g) => x + g.saat, 0) / a.length;
    const a1 = ortSaat(ilk), a2 = ortSaat(son);
    const fark = a1 > 0 ? ((a2 - a1) / a1) * 100 : 0;
    if (Math.abs(fark) >= 15) {
      p.push(
        fark > 0
          ? `Kullanım dönem boyunca arttı: tüm kullanıcıların günlük toplamı ilk yarıda ` +
            `ortalama ${sd(a1)} saat iken son yarıda ${sd(a2)} saate çıktı ` +
            `(%${Math.round(fark)} artış).`
          : `Kullanım dönem boyunca azaldı: tüm kullanıcıların günlük toplamı ilk yarıda ` +
            `ortalama ${sd(a1)} saat iken son yarıda ${sd(a2)} saate indi ` +
            `(%${Math.round(Math.abs(fark))} azalış).`,
      );
    } else {
      p.push(
        `Kullanım dönem boyunca dengeli seyretti; tüm kullanıcıların günlük toplamı ` +
        `${sd(a2)} saat civarında kaldı, belirgin bir artış ya da düşüş görülmedi.`,
      );
    }
  }

  /* 4) Kullanıcı dağılımı — yük tek kişide mi toplanıyor */
  if (d.kullanicilar.length >= 2) {
    const enUst = d.kullanicilar[0];
    const pay = o.toplamSaat > 0 ? Math.round((enUst.toplamSaat / o.toplamSaat) * 100) : 0;
    const ad = enUst.adSoyad ? `${enUst.adSoyad} (${enUst.kullanici})` : enUst.kullanici;
    if (pay >= 55) {
      p.push(
        `Çalışma süresinin %${pay}'i tek bir kullanıcıda toplanıyor: ${ad}. ` +
        `Diğer ${d.kullanicilar.length - 1} kullanıcı daha sınırlı sürelerle bağlandı.`,
      );
    } else {
      p.push(
        `Çalışma süresi kullanıcılar arasında dengeli dağılmış durumda; ` +
        `en yoğun kullanıcı ${ad} toplamın %${pay}'ini oluşturuyor.`,
      );
    }
  }

  /* 5) Hafta sonu — yalnız anlamlı bir pay varsa söylenir */
  if (haftaSonu.length > 0) {
    const hsSaat = haftaSonu.reduce((a, g) => a + g.saat, 0);
    const pay = o.toplamSaat > 0 ? Math.round((hsSaat / o.toplamSaat) * 100) : 0;
    if (pay >= 8)
      p.push(
        `Çalışmanın %${pay}'i hafta sonlarında gerçekleşti (${haftaSonu.length} gün, ` +
        `${Math.round(hsSaat)} saat) — sistem hafta içiyle sınırlı kalmıyor.`,
      );
  }

  /* 6) Zirve gün */
  if (o.enYogunGun)
    p.push(
      `En yoğun gün ${trTarih(o.enYogunGun.tarih)} oldu: ${o.enYogunGun.kisi} kullanıcı, ` +
      `${sd(o.enYogunGun.saat)} saat.`,
    );

  return p;
}

/* ══════════════════════════════════════════════════════════
   Müşteriye giden rapor — kendi kendine yeten tek HTML
   ══════════════════════════════════════════════════════════ */
export function raporHtml(d: FirmaAnalizYanit, ekNot?: string): string {
  const esc = (t: string) =>
    t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const baslik = d.firmaAdi ? `${esc(d.firmaAdi)} (${d.firkod})` : `Firma ${d.firkod}`;
  const enCok = Math.max(...d.gunler.map((g) => g.saat), 1);

  const gunSut = d.gunler.map((g) =>
    `<div class="s" title="${trTarih(g.tarih)} — ${g.kisi} kişi, ${g.saat} saat">
       <i class="${g.haftaSonu ? "hs" : ""}" style="height:${Math.max(2, (g.saat / enCok) * 100)}%"></i>
     </div>`).join("");

  const aySat = d.aylar.map((a) =>
    `<tr><td>${trAy(a.ay)}</td><td class="n">${a.kisi}</td>
     <td class="n">${a.gun}</td><td class="n b">${sy(a.saat)}</td></tr>`).join("");

  const kulSat = d.kullanicilar.map((k) =>
    `<tr><td class="m">${esc(k.kullanici)}</td><td>${esc(k.adSoyad ?? "—")}</td>
     <td class="n">${k.ilkGun ? trTarih(k.ilkGun) : "—"}</td>
     <td class="n">${k.sonGun ? trTarih(k.sonGun) : "—"}</td>
     <td class="n">${k.gun}</td><td class="n">${k.ortSaat}</td>
     <td class="n b">${sy(k.toplamSaat)}</td></tr>`).join("");

  const yorumlar = pusulaYorumu(d);
  /*  İlk paragraf "giriş": tam genişlik ve biraz iri. Kalanı iki
   *  kolona akıyor — tek kolonda satırlar kartın solunda kalıp sağ
   *  tarafı boş bırakıyordu, kolonu genişletmek ise satırı okunmaz
   *  derecede uzatırdı.                                            */
  const yorumGiris = yorumlar.length ? `<p class="lead">${esc(yorumlar[0])}</p>` : "";
  const yorumP = yorumlar.slice(1).map((t) => `<p>${esc(t)}</p>`).join("");
  const notBlok = ekNot && ekNot.trim()
    ? `<div class="notk"><div class="notb">Pusula ekibinden not</div>` +
      esc(ekNot.trim()).split(/\n+/).map((t) => `<p>${t}</p>`).join("") + `</div>`
    : "";

  const sunSat = d.sunucular.map((s) =>
    `<tr><td>${esc(s.ad)}</td><td class="n">${s.kisi}</td><td class="n b">${sy(s.saat)}</td></tr>`).join("");

  return `<!doctype html>
<html lang="tr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${baslik} — Kullanım Raporu</title>
<style>
*{box-sizing:border-box}
body{margin:0;background:#F7F8F7;color:#111A16;
 font:15px/1.5 "Segoe UI",system-ui,-apple-system,sans-serif;-webkit-font-smoothing:antialiased}
.k{max-width:960px;margin:0 auto;padding:36px 24px 64px}
.ust{border-bottom:2px solid #047857;padding-bottom:18px;margin-bottom:24px}
.goz{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#047857;font-weight:700}
h1{font-size:27px;font-weight:600;letter-spacing:-.02em;margin:6px 0 4px}
.alt{color:#5F6B66;font-size:13.5px;margin:0}
.kpi{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin:24px 0 32px}
.kart{background:#fff;border:1px solid #E1E6E3;border-radius:8px;padding:13px 15px}
.kart .s{font-size:25px;font-weight:700;line-height:1.1;font-variant-numeric:tabular-nums;letter-spacing:-.02em}
.kart .e{font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;color:#5F6B66;margin-top:4px;font-weight:600}
.kart.v .s{color:#047857}
h2{font-size:17px;font-weight:600;margin:32px 0 10px}
.not{color:#5F6B66;font-size:13px;margin:0 0 14px;max-width:70ch}
.krt{background:#fff;border:1px solid #E1E6E3;border-radius:8px;overflow:hidden}
table{width:100%;border-collapse:collapse}
th{font-size:10px;letter-spacing:.07em;text-transform:uppercase;color:#98A39E;font-weight:700;
 text-align:left;padding:9px 14px;border-bottom:1px solid #EDF1EF;white-space:nowrap}
td{padding:8px 14px;border-bottom:1px solid #EDF1EF;font-size:13.5px}
tr:last-child td{border-bottom:none}
th.n,td.n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
td.b{font-weight:600}
td.m{font-family:"Cascadia Code",Consolas,monospace;font-size:12.5px}
.graf{background:#fff;border:1px solid #E1E6E3;border-radius:8px;padding:14px}
.cub{display:flex;align-items:stretch;height:110px;gap:2px}
.cub .s{flex:1;display:flex;flex-direction:column;justify-content:flex-end;min-width:0}
.cub i{display:block;width:100%;background:#047857;border-radius:1px 1px 0 0}
.cub i.hs{background:#C6D3CD}
.eks{display:flex;justify-content:space-between;color:#98A39E;font-size:10.5px;margin-top:6px;
 font-variant-numeric:tabular-nums}
.analiz{background:linear-gradient(180deg,#F4FAF7 0%,#FFFFFF 55%);
 border:1px solid #CFE3DA;border-radius:10px;padding:20px 22px 22px;margin:0 0 10px}
.abas{display:flex;align-items:center;gap:11px;padding-bottom:12px;margin-bottom:14px;
 border-bottom:1px solid #DCEAE3}
.arozet{width:30px;height:30px;flex:none;border-radius:7px;background:#047857;color:#fff;
 display:flex;align-items:center;justify-content:center;font-weight:700;font-size:15px;
 letter-spacing:-.02em}
.aust{font-size:15.5px;font-weight:700;color:#064E3B;line-height:1.25}
.aalt{font-size:11.5px;color:#5F8C7B;margin-top:1px}
.analiz p{margin:0 0 10px;font-size:13.5px;line-height:1.7;color:#22322C}
.analiz p.lead{font-size:15px;line-height:1.6;color:#111A16;margin-bottom:14px}
.akol{column-count:2;column-gap:30px;column-rule:1px solid #E4EFE9}
.akol p{break-inside:avoid;margin:0 0 11px}
.akol p:last-child{margin-bottom:0}
@media (max-width:720px){.akol{column-count:1}}
.notk{background:#F0F7F4;border:1px solid #CFE3DA;border-radius:8px;padding:14px 18px;margin:0 0 8px}
.notb{font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:#047857;font-weight:700;margin-bottom:6px}
.notk p{margin:0 0 7px;font-size:13.5px;line-height:1.6;max-width:76ch}
.notk p:last-child{margin-bottom:0}
.dip{margin-top:36px;padding-top:16px;border-top:1px solid #E1E6E3;color:#5F6B66;font-size:12px;max-width:74ch}
.dip p{margin:0 0 7px}
@media print{
  body{background:#fff}
  .k{max-width:none;padding:0}
  .krt,.kart,.graf,.analiz,.notk{break-inside:avoid}
  .analiz{background:#fff}
  h2{break-after:avoid}
}
</style></head><body><div class="k">

<header class="ust">
  <div class="goz">Pusula · Kullanım Raporu</div>
  <h1>${baslik}</h1>
  <p class="alt">Dönem: ${trTarih(d.donem.basla)} – ${trTarih(d.donem.bitir)} (${d.donem.gun} gün)</p>
</header>

<div class="kpi">
  <div class="kart v"><div class="s">${sy(d.ozet.toplamSaat)}</div><div class="e">Toplam çalışma saati</div></div>
  <div class="kart"><div class="s">${d.ozet.kullanici}</div><div class="e">Kullanıcı</div></div>
  <div class="kart"><div class="s">${d.ozet.gunlukOrtKisi}</div><div class="e">Günlük ort. kullanıcı</div></div>
  <div class="kart"><div class="s">${d.ozet.kisiBasiGunlukSaat}</div><div class="e">Kişi başı saat / gün</div></div>
  <div class="kart"><div class="s">${d.ozet.calisilanGun}</div><div class="e">Çalışılan gün</div></div>
</div>

<section class="analiz">
  <div class="abas">
    <span class="arozet">P</span>
    <div>
      <div class="aust">Pusula Analizi</div>
      <div class="aalt">Dönem verilerinden çıkarılan değerlendirme</div>
    </div>
  </div>
  ${yorumGiris}
  ${yorumP ? `<div class="akol">${yorumP}</div>` : ""}
</section>
${notBlok}

<h2>Günlük çalışma süresi</h2>
<p class="not">Her sütun bir günü gösterir; yükseklik o gün kayıtlara geçen toplam çalışma saatidir. Açık renkli sütunlar hafta sonlarıdır.</p>
<div class="graf">
  <div class="cub">${gunSut}</div>
  <div class="eks"><span>${d.gunler.length ? trTarih(d.gunler[0].tarih) : ""}</span><span>${d.gunler.length ? trTarih(d.gunler[d.gunler.length - 1].tarih) : ""}</span></div>
</div>

${d.aylar.length > 1 ? `<h2>Aylık özet</h2>
<div class="krt"><table>
<thead><tr><th>Ay</th><th class="n">Kullanıcı</th><th class="n">Çalışılan gün</th><th class="n">Toplam saat</th></tr></thead>
<tbody>${aySat}</tbody></table></div>` : ""}

<h2>Kullanıcı bazında</h2>
<p class="not">Süreler, kullanıcının oturumunun açık olduğu zamandır.</p>
<div class="krt"><table>
<thead><tr><th>Kullanıcı</th><th>Ad</th><th class="n">İlk</th><th class="n">Son</th>
<th class="n">Gün</th><th class="n">Ort. sa</th><th class="n">Toplam sa</th></tr></thead>
<tbody>${kulSat}</tbody></table></div>

${d.sunucular.length > 1 ? `<h2>Sunucu dağılımı</h2>
<div class="krt"><table>
<thead><tr><th>Sunucu</th><th class="n">Kullanıcı</th><th class="n">Toplam saat</th></tr></thead>
<tbody>${sunSat}</tbody></table></div>` : ""}

<div class="dip">
  <p><strong>Süre nasıl ölçülüyor:</strong> Sunucu 10 saniyede bir örnekleniyor ve kullanıcının oturumu açıksa süre işleniyor. Bu nedenle rakamlar “oturumun açık kaldığı süre”dir; kullanıcı bilgisayarının başından ayrılsa da oturumunu kapatmadıysa süre işlemeye devam eder.</p>
  <p><strong>Dönem:</strong> ${trTarih(d.donem.basla)} – ${trTarih(d.donem.bitir)}. Bu tarihten önceki kayıtlar rapora dahil değildir.</p>
  <p>Rapor ${trTarih(new Date().toISOString().slice(0, 10))} tarihinde Pusula Hub tarafından üretilmiştir.</p>
</div>
</div></body></html>`;
}

/* ══════════════════════════════════════════════════════════ */
export function FirmaAnaliz({ firkod }: { firkod: string }) {
  const [gun, setGun] = useState<number>(90);
  const [veri, setVeri] = useState<FirmaAnalizYanit | null>(null);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [ekNot, setEkNot] = useState("");

  useEffect(() => {
    let iptal = false;
    setYukleniyor(true);
    (async () => {
      try {
        const r = await fetch(`/api/companies/${firkod}/analiz?gun=${gun}`, { cache: "no-store" });
        const d = await r.json();
        if (!iptal) setVeri(r.ok ? d : null);
      } catch {
        if (!iptal) setVeri(null);
      } finally {
        if (!iptal) setYukleniyor(false);
      }
    })();
    return () => { iptal = true; };
  }, [firkod, gun]);

  const raporIndir = useCallback(() => {
    if (!veri) return;
    const blob = new Blob([raporHtml(veri, ekNot)], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Kullanim-Raporu-${veri.firkod}-${veri.donem.bitir}.html`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast.success("Rapor indirildi", {
      description: "Dosyayı müşteriye gönderebilir, tarayıcıda açıp PDF'e basabilirsiniz.",
    });
  }, [veri, ekNot]);

  if (yukleniyor)
    return (
      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-[70px] rounded-[5px]" />)}
        </div>
        <Skeleton className="h-36 rounded-[5px]" />
        <Skeleton className="h-56 rounded-[5px]" />
      </div>
    );

  if (!veri || !veri.veriVar)
    return (
      <div className="flex flex-col items-center gap-2 py-12 text-center">
        <TrendingUp className="text-muted-foreground/40 size-8" />
        <p className="text-[13px] font-medium">Bu dönemde kullanım kaydı yok</p>
        <p className="text-muted-foreground max-w-sm text-[12px]">
          Firmanın kullanıcıları seçilen dönemde terminal sunucusuna bağlanmamış.
          Daha uzun bir dönem seçmeyi deneyin.
        </p>
        <div className="mt-2 flex gap-1">{donemDugmeleri(gun, setGun)}</div>
      </div>
    );

  const o = veri.ozet;
  const enCok = Math.max(...veri.gunler.map((g) => g.saat), 1);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1">{donemDugmeleri(gun, setGun)}</div>
        <button
          onClick={raporIndir}
          className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-7 items-center gap-1.5 rounded-[5px] px-3 text-[11px] font-semibold transition-colors"
        >
          <Download className="size-3.5" />
          Müşteri Raporu İndir
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
        <Kart ikon={Clock} deger={sy(o.toplamSaat)} etiket="Toplam saat" vurgu />
        <Kart ikon={Users} deger={o.kullanici} etiket="Kullanıcı" />
        <Kart ikon={TrendingUp} deger={o.gunlukOrtKisi} etiket="Günlük ort. kişi" />
        <Kart ikon={Clock} deger={`${o.kisiBasiGunlukSaat} sa`} etiket="Kişi başı / gün" />
        <Kart ikon={CalendarDays} deger={o.calisilanGun} etiket="Çalışılan gün" />
      </div>

      {/* Rapora giren değerlendirme — burada da görünüyor ki gönderen
          kişi müşterinin ne okuyacağını önceden bilsin. */}
      <div className="bg-card rounded-[8px] border p-4" style={{ boxShadow: "var(--card-shadow)" }}>
        <div className="mb-3 flex items-center gap-2.5 border-b pb-2.5">
          <span className="bg-primary text-primary-foreground flex size-7 shrink-0 items-center justify-center rounded-[6px] text-[14px] font-bold">
            P
          </span>
          <div>
            <div className="text-[14px] leading-tight font-semibold">Pusula Analizi</div>
            <div className="text-muted-foreground text-[11px]">Rapora bu metin girer</div>
          </div>
        </div>
        {/* İlk paragraf giriş, kalanı iki kolon — kart genişliğini
            doldursun, satır da okunmaz derecede uzamasın. */}
        {(() => {
          const y = pusulaYorumu(veri);
          return (
            <>
              {y[0] && <p className="mb-3 text-[14px] leading-relaxed">{y[0]}</p>}
              {y.length > 1 && (
                <div className="gap-x-8 text-[13px] leading-relaxed [column-count:1] lg:[column-count:2]">
                  {y.slice(1).map((t, i) => (
                    <p key={i} className="mb-2.5 [break-inside:avoid]">{t}</p>
                  ))}
                </div>
              )}
            </>
          );
        })()}
        <div className="mt-3 border-t pt-2.5">
          <label className="text-muted-foreground mb-1 block text-[10px] font-medium tracking-wider uppercase">
            Ekibinizden not (isteğe bağlı — rapora eklenir)
          </label>
          <textarea
            value={ekNot}
            onChange={(e) => setEkNot(e.target.value)}
            rows={2}
            placeholder="Müşteriye iletmek istediğiniz not…"
            className="border-border focus:border-primary/50 focus:ring-primary/20 w-full resize-none rounded-[5px] border bg-transparent px-2.5 py-1.5 text-[13px] outline-none focus:ring-2"
          />
        </div>
      </div>

      {/* Günlük süre — items-stretch şart, items-end olsaydı yüzde
          yükseklik 0'a düşer ve çubuklar görünmezdi. */}
      <div className="bg-card rounded-[5px] border p-3" style={{ boxShadow: "var(--card-shadow)" }}>
        <div className="mb-2 flex items-baseline justify-between">
          <span className="text-muted-foreground text-[10px] font-medium tracking-wider uppercase">
            Günlük çalışma süresi
          </span>
          {o.enYogunGun && (
            <span className="text-muted-foreground text-[11px] tabular-nums">
              en yoğun {trTarih(o.enYogunGun.tarih)} · {o.enYogunGun.kisi} kişi · {o.enYogunGun.saat} sa
            </span>
          )}
        </div>
        <div className="flex h-24 items-stretch gap-[2px]">
          {veri.gunler.map((g) => (
            <div key={g.tarih} className="group relative flex min-w-0 flex-1 flex-col justify-end">
              <div
                className={cn("w-full rounded-t-[1px]",
                  g.haftaSonu ? "bg-muted-foreground/25" : "bg-primary/75 group-hover:bg-primary")}
                style={{ height: `${Math.max(2, (g.saat / enCok) * 100)}%` }}
              />
              <div className="bg-popover pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 hidden -translate-x-1/2 rounded-[5px] border px-2 py-1 whitespace-nowrap shadow-md group-hover:block">
                <div className="text-[11px] font-medium">{trTarih(g.tarih)}</div>
                <div className="text-muted-foreground text-[10px] tabular-nums">{g.kisi} kişi · {g.saat} saat</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {veri.aylar.length > 1 && (
        <Tablo baslik="Aylık özet" sag={`${veri.aylar.length} ay`}
          basliklar={["Ay", "Kullanıcı", "Çalışılan gün", "Toplam saat"]}>
          {veri.aylar.map((a) => (
            <tr key={a.ay} className="hover:bg-muted/20 transition-colors">
              <td className="px-3 py-1.5">{trAy(a.ay)}</td>
              <td className="px-3 py-1.5 text-right tabular-nums">{a.kisi}</td>
              <td className="text-muted-foreground px-3 py-1.5 text-right tabular-nums">{a.gun}</td>
              <td className="px-3 py-1.5 text-right font-medium tabular-nums">{sy(a.saat)}</td>
            </tr>
          ))}
        </Tablo>
      )}

      <Tablo baslik="Kullanıcı bazında" sag={`${veri.kullanicilar.length} kullanıcı`}
        basliklar={["Kullanıcı", "Ad", "İlk", "Son", "Gün", "Ort. sa", "Toplam sa"]}>
        {veri.kullanicilar.map((k) => (
          <tr key={k.kullanici} className="hover:bg-muted/20 transition-colors">
            <td className="px-3 py-1.5 font-mono text-[12px]">{k.kullanici}</td>
            <td className="px-3 py-1.5">{k.adSoyad ?? "—"}</td>
            <td className="text-muted-foreground px-3 py-1.5 text-right tabular-nums whitespace-nowrap">
              {k.ilkGun ? trTarih(k.ilkGun) : "—"}
            </td>
            <td className="text-muted-foreground px-3 py-1.5 text-right tabular-nums whitespace-nowrap">
              {k.sonGun ? trTarih(k.sonGun) : "—"}
            </td>
            <td className="px-3 py-1.5 text-right tabular-nums">{k.gun}</td>
            <td className="text-muted-foreground px-3 py-1.5 text-right tabular-nums">{k.ortSaat}</td>
            <td className="px-3 py-1.5 text-right font-medium tabular-nums">{sy(k.toplamSaat)}</td>
          </tr>
        ))}
      </Tablo>
    </div>
  );
}

function donemDugmeleri(secili: number, ayarla: (g: number) => void) {
  return DONEMLER.map((g) => (
    <button
      key={g}
      onClick={() => ayarla(g)}
      className={cn(
        "h-7 rounded-[5px] border px-2.5 text-[11px] font-medium transition-colors",
        secili === g
          ? "bg-primary text-primary-foreground border-primary"
          : "hover:bg-muted/60 text-muted-foreground",
      )}
    >
      {g} gün
    </button>
  ));
}

function Kart({
  ikon: Ikon, deger, etiket, vurgu,
}: { ikon: React.ElementType; deger: string | number; etiket: string; vurgu?: boolean }) {
  return (
    <div className="bg-card rounded-[5px] border p-3" style={{ boxShadow: "var(--card-shadow)" }}>
      <div className="text-muted-foreground flex items-center gap-1.5">
        <Ikon className="size-3.5" />
        <span className="text-[10px] font-medium tracking-wider uppercase">{etiket}</span>
      </div>
      <div className={cn("mt-1 text-xl font-bold tabular-nums", vurgu && "text-primary")}>{deger}</div>
    </div>
  );
}

function Tablo({
  baslik, sag, basliklar, children,
}: {
  baslik: string; sag: string; basliklar: string[]; children: React.ReactNode;
}) {
  return (
    <div className="bg-card overflow-hidden rounded-[5px] border" style={{ boxShadow: "var(--card-shadow)" }}>
      <div className="bg-muted/30 flex items-baseline justify-between border-b px-3 py-2">
        <span className="text-muted-foreground text-[10px] font-medium tracking-wider uppercase">{baslik}</span>
        <span className="text-muted-foreground text-[11px] tabular-nums">{sag}</span>
      </div>
      <div className="max-h-80 overflow-auto">
        <table className="w-full text-[13px]">
          <thead className="bg-card sticky top-0">
            <tr className="border-b">
              {basliklar.map((b, i) => (
                <th
                  key={b}
                  className={cn(
                    "text-muted-foreground px-3 py-1.5 text-[10px] font-medium tracking-wider uppercase whitespace-nowrap",
                    i <= 1 ? "text-left" : "text-right",
                  )}
                >
                  {b}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">{children}</tbody>
        </table>
      </div>
    </div>
  );
}
