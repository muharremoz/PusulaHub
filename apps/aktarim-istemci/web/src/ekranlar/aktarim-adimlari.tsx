import { CheckCircle2, Circle, Loader2, PauseCircle, XCircle } from "lucide-react";
import type { Durum } from "@/api";
import { cn } from "@/lib/utils";

/**
 * Aktarım adımları — dikey liste. Müşteri işin nerede olduğunu tek bakışta görür:
 * hazırlama/yükleme → Pusula'ya bildirim → sunuculara yerleştirme (tür tür) → (isteğe bağlı) ayırma → bitti.
 * Sunucu adımları servisteki sırayla aynı (services/pusula-aktarim2 aktar()).
 */

type AdimDurumu = "bekliyor" | "suruyor" | "tamam" | "hata" | "duraklatildi";
type Adim = { ad: string; aciklama?: React.ReactNode; durum: AdimDurumu; detay?: React.ReactNode };

const SUNUCU_ADIMLARI = [
  { tur: "veritabani", ad: "Veritabanları SQL sunucusuna yerleştiriliyor" },
  { tur: "eski", ad: "Eski yıl dataları arşive (Depo) alınıyor" },
  { tur: "resim", ad: "Resimler Depo sunucusuna yerleştiriliyor" },
  { tur: "program", ad: "Program dosyaları terminal sunucusuna yerleştiriliyor" },
  { tur: "ek", ad: "Ek dosyalar terminal sunucusuna yerleştiriliyor" },
] as const;

export function AktarimAdimlari({ d }: { d: Durum }) {
  const a = d.aktarim!;
  const s = a.sunucu;
  const tamamSayisi = a.ogeler.filter((o) => o.durum === "tamam").length;
  const hataliSayisi = a.ogeler.filter((o) => o.durum === "hata").length;
  const adimlar: Adim[] = [];

  // 1) Hazırlama + yükleme (bu bilgisayarda)
  adimlar.push({
    ad: "Hazırlama ve yükleme",
    aciklama: `${tamamSayisi} / ${a.ogeler.length} öğe Pusula'ya yüklendi${hataliSayisi ? ` · ${hataliSayisi} hatalı` : ""}`,
    durum: a.bitti ? "tamam" : hataliSayisi && !a.suruyor ? "hata" : a.suruyor ? "suruyor" : "duraklatildi",
  });

  // 2) Pusula'ya bildirim
  adimlar.push({
    ad: "Pusula'ya bildirildi",
    durum: a.bildirildi ? "tamam" : a.bitti ? "suruyor" : "bekliyor",
  });

  // 3) Sunuculara yerleştirme — yalnız bu aktarımda olan türler
  const varOlanlar = SUNUCU_ADIMLARI.filter((x) => a.ogeler.some((o) => (o.hedef ?? o.tur) === x.tur));
  const sira = s?.asama ? varOlanlar.findIndex((x) => x.tur === s.asama) : -1;
  varOlanlar.forEach((x, i) => {
    let durum: AdimDurumu = "bekliyor";
    let aciklama: React.ReactNode;
    if (a.bildirildi && s) {
      if (s.durum === "tamamlandi") durum = "tamam";
      else if (s.durum === "aktariliyor") durum = i < sira ? "tamam" : i === Math.max(sira, 0) ? "suruyor" : "bekliyor";
      else if (s.durum === "hata") {
        const h = sira >= 0 ? sira : 0;
        durum = i < h ? "tamam" : i === h ? "hata" : "bekliyor";
        if (i === h)
          aciklama = (
            <>
              Dosyalarınız bize ulaştı; yerleştirirken bir sorun çıktı ve ekibimiz ilgileniyor. Tekrar yüklemeniz gerekmiyor.
              {s.hata && <span className="mt-1 block font-mono text-[11px] opacity-70">{s.hata}</span>}
            </>
          );
      }
    }
    adimlar.push({ ad: x.ad, durum, aciklama });
  });

  // 4) Veritabanlarını ayırma (seçildiyse) + doğrulama
  if (a.veritabanlariAyir) {
    const y = d.ayirma;
    const sunucuBitti = s?.durum === "tamamlandi";
    adimlar.push({
      ad: "Veritabanları bu SQL Server'dan ayrılıyor (detach)",
      durum: !y ? (sunucuBitti ? "suruyor" : "bekliyor") : y.durum === "suruyor" ? "suruyor" : y.hatalar.length ? "hata" : "tamam",
      aciklama: !y
        ? s?.durum === "hata"
          ? "Yerleştirme tamamlanmadığı için veritabanları ayrılmadı; bu bilgisayarda çalışmaya devam ediyorlar."
          : "Aktarım tamamlanınca yapılacak. Veri dosyaları silinmez. Pencereyi kapatmayın."
        : y.durum === "suruyor"
          ? `${y.ayrilanlar.length} veritabanı ayrıldı…`
          : `${y.ayrilanlar.length} veritabanı ayrıldı ve doğrulandı.`,
      detay: y?.dogrulama?.length ? (
        <ul className="mt-1.5 flex flex-col gap-1">
          {y.dogrulama.map((v) => (
            <li key={v.ad} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
              <span className="font-mono font-medium">{v.ad}</span>
              <Isaret iyi={v.listedenCikti} metin={v.listedenCikti ? "SQL Server'dan ayrıldı" : "hâlâ bağlı"} />
              {v.dosyalarKontrolEdildi && <Isaret iyi={v.dosyalarYerinde} metin={v.dosyalarYerinde ? `${v.dosyalar.length} dosya diskte duruyor` : "dosya eksik"} />}
            </li>
          ))}
          {y.hatalar.map((h) => (
            <li key={h} className="text-xs text-destructive">{h}</li>
          ))}
        </ul>
      ) : null,
    });
  }

  // 5) Bitti
  const ayirmaTamam = !a.veritabanlariAyir || (d.ayirma?.durum === "bitti" && !d.ayirma.hatalar.length);
  const bitti = s?.durum === "tamamlandi" && ayirmaTamam;
  adimlar.push({
    ad: "Aktarım tamamlandı",
    aciklama: bitti ? "Verileriniz Pusula sunucularında; bu pencereyi kapatabilirsiniz." : undefined,
    durum: bitti ? "tamam" : "bekliyor",
  });

  return (
    <section className="rounded-lg border bg-card p-5 shadow-xs">
      <ol className="relative flex flex-col">
        {adimlar.map((x, i) => (
          <li key={i} className="relative flex gap-3 pb-5 last:pb-0">
            {/* Bağlantı çizgisi */}
            {i < adimlar.length - 1 && (
              <span
                className={cn("absolute top-6 bottom-0 left-[11px] w-0.5", x.durum === "tamam" ? "bg-emerald-500/50" : "bg-border")}
                aria-hidden
              />
            )}
            <Simge d={x.durum} />
            <div className="min-w-0 flex-1 pt-0.5">
              <div className={cn("text-sm font-medium", x.durum === "bekliyor" && "text-muted-foreground", x.durum === "hata" && "text-destructive")}>
                {x.ad}
              </div>
              {x.aciklama && <div className="mt-0.5 text-xs text-muted-foreground">{x.aciklama}</div>}
              {x.detay}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Simge({ d }: { d: AdimDurumu }) {
  const ortak = "relative z-10 size-6 shrink-0 rounded-full bg-card";
  if (d === "tamam") return <CheckCircle2 className={cn(ortak, "text-emerald-600 dark:text-emerald-400")} />;
  if (d === "hata") return <XCircle className={cn(ortak, "text-destructive")} />;
  if (d === "suruyor") return <Loader2 className={cn(ortak, "animate-spin text-primary")} />;
  if (d === "duraklatildi") return <PauseCircle className={cn(ortak, "text-amber-500")} />;
  return <Circle className={cn(ortak, "text-muted-foreground/50")} />;
}

function Isaret({ iyi, metin }: { iyi: boolean; metin: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1", iyi ? "text-emerald-700 dark:text-emerald-400" : "text-destructive")}>
      {iyi ? <CheckCircle2 className="size-3.5" /> : <XCircle className="size-3.5" />}
      {metin}
    </span>
  );
}
