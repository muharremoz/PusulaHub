import { CheckCircle2, CircleAlert, DatabaseBackup, Loader2 } from "lucide-react";
import type { Durum, YedekDurumu } from "@/api";

/**
 * Veritabanı yedekleri — ana ekranda kart. Salt gösterim: müşteri yedeğinin alındığını görsün.
 * Gerçek düzen (msdb, 06.10.2026): günlük tam yedek sabah (~09:45), fark yedeği gündüz ~30 dk'da bir
 * (≈10:15–23:05), gece fark yedeği ALINMAZ. Buna göre:
 *   - tam yedek 26 saate kadar iyi, 48'e kadar uyarı (Hub yedek testiyle aynı eşik)
 *   - fark: son fark ile son tam yedekten YENİ olanı esas alınır (tam yedek alınınca fark zinciri yeniden başlar);
 *     gündüz 1 saate kadar iyi, 3 saate kadar uyarı; gece (Türkiye saatiyle 23:30–10:30) beklenmez → gri.
 * Saat Türkiye saatine göre: yedek takvimi sunucuda, müşteri başka saat diliminde olabilir (Almanya).
 */
const TAM_IYI_SAAT = 26;
const TAM_UYARI_SAAT = 48;
const FARK_IYI_DK = 60;
const FARK_UYARI_DK = 180;
/** Gece fark yedeği alınmayan aralık dışında mıyız (Türkiye saati)? */
function farkAraligiMi(simdi: number): boolean {
  const p = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Istanbul", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date(simdi));
  const sa = Number(p.find((x) => x.type === "hour")?.value ?? 0) + Number(p.find((x) => x.type === "minute")?.value ?? 0) / 60;
  return sa >= 10.5 && sa < 23.5;
}

type Renk = "iyi" | "uyari" | "hata" | "bekliyor";

const RENK: Record<Renk, string> = {
  iyi: "text-emerald-600 dark:text-emerald-400",
  uyari: "text-amber-600 dark:text-amber-400",
  hata: "text-red-600 dark:text-red-400",
  bekliyor: "text-muted-foreground",
};
const KUTU: Record<Renk, string> = {
  iyi: "bg-emerald-500/10 text-emerald-600 ring-emerald-500/20 dark:text-emerald-400",
  uyari: "bg-amber-500/10 text-amber-600 ring-amber-500/20 dark:text-amber-400",
  hata: "bg-red-500/10 text-red-600 ring-red-500/20 dark:text-red-400",
  bekliyor: "bg-muted text-muted-foreground ring-border",
};

function dakika(iso: string | null, simdi: number): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : Math.max(0, Math.round((simdi - t) / 60000));
}

const tamRenk = (dk: number | null): Renk => (dk == null ? "hata" : dk <= TAM_IYI_SAAT * 60 ? "iyi" : dk <= TAM_UYARI_SAAT * 60 ? "uyari" : "hata");
/** fDk: son fark, tDk: son tam yedek (dk önce). Esas: ikisinden yeni olanı. Gece: bekleniyor (gri). */
function farkRenk(fDk: number | null, tDk: number | null, simdi: number): Renk {
  const esas = Math.min(fDk ?? Infinity, tDk ?? Infinity);
  if (!farkAraligiMi(simdi)) return esas <= 14 * 60 ? "bekliyor" : "uyari";
  return esas <= FARK_IYI_DK ? "iyi" : esas <= FARK_UYARI_DK ? "uyari" : "hata";
}
const enKotu = (a: Renk, b: Renk): Renk => (["hata", "uyari", "iyi", "bekliyor"] as Renk[]).find((r) => r === a || r === b) ?? "bekliyor";


/** genis: tek başınaysa iki sütunu kaplar; sayım kartı varsa yanına yarım genişlik. */
export function YedekKarti({ durum, genis = true }: { durum: Durum; genis?: boolean }) {
  const y: YedekDurumu | undefined = durum.yedekler ?? undefined;
  const simdi = y?.simdi ? Date.parse(y.simdi) : Date.now();
  const liste = y?.liste ?? [];

  // Kartın genel rengi: en kötü veritabanı
  let genel: Renk = y ? (y.hata ? "uyari" : liste.length === 0 ? "uyari" : "iyi") : "bekliyor";
  for (const v of liste) {
    genel = enKotu(genel, tamRenk(dakika(v.sonTam, simdi)));
    if (v.farkVar) genel = enKotu(genel, farkRenk(dakika(v.sonFark, simdi), dakika(v.sonTam, simdi), simdi));
  }


  // Müşteriye ayrıntı (saat, veritabanı) gösterilmez — yalnız sağlıklı mı. Kısa gecikme (uyarı) sağlıklı sayılır:
  // yedekler bizim tarafta belirli saat aralığında alınır, saatleri göstermek "gece alınmamış" izlenimi veriyordu.
  const sorunlu = genel === "hata";
  const gorunen: Renk = !y ? "bekliyor" : y.hata || liste.length === 0 ? "uyari" : sorunlu ? "hata" : "iyi";
  const baslikDeger = !y
    ? "Kontrol ediliyor…"
    : y.hata
      ? "Bilgi alınamadı"
      : liste.length === 0
        ? "Veritabanı bulunamadı"
        : sorunlu
          ? "Yedeklemede sorun var"
          : "Yedekleme sağlıklı";
  const aciklama = !y
    ? "Bir saniye…"
    : y.hata
      ? "Yedekleme durumu şu an alınamadı; biraz sonra yeniden denenecek."
      : liste.length === 0
        ? "Bu firmaya kayıtlı veritabanı görünmüyor; Pusula'ya bildirin."
        : sorunlu
          ? "Veritabanı yedeklemesi beklendiği gibi çalışmıyor; Pusula'ya bildirin."
          : liste.length === 1
            ? "Veritabanınızın yedekleri Pusula sunucusunda otomatik alınıyor."
            : `${liste.length} veritabanınızın yedekleri Pusula sunucusunda otomatik alınıyor.`;

  return (
    <div className={"relative flex items-start gap-3 overflow-hidden rounded-xl border bg-card p-4 shadow-xs" + (genis ? " col-span-2" : "")}>
      <span className={`flex size-10 shrink-0 items-center justify-center rounded-lg ring-1 [&_svg]:size-5 ${KUTU[gorunen]}`}><DatabaseBackup /></span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">Veritabanı yedekleri</span>
          <span className={`[&_svg]:size-4 ${RENK[gorunen]}`}>
            {gorunen === "iyi" ? <CheckCircle2 /> : gorunen === "bekliyor" ? <Loader2 className="animate-spin" /> : <CircleAlert />}
          </span>
        </div>
        <div className="truncate text-[15px] leading-tight font-semibold">{baslikDeger}</div>
        <div className="mt-0.5 text-xs text-muted-foreground">{aciklama}</div>
      </div>
    </div>
  );
}
