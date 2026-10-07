import { DatabaseBackup, Loader2 } from "lucide-react";
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

export type Renk = "iyi" | "uyari" | "hata" | "bekliyor";

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


export type YedekOzeti = { renk: Renk; baslik: string; aciklama: string };

/**
 * Müşteriye ayrıntı (saat, veritabanı) gösterilmez — yalnız sağlıklı mı. Kısa gecikme (uyarı) sağlıklı sayılır:
 * yedekler bizim tarafta belirli saat aralığında alınır, saatleri göstermek "gece alınmamış" izlenimi veriyordu.
 */
export function yedekOzeti(durum: Durum): YedekOzeti {
  // Bilgi hiç gelmedi ve Pusula'ya ulaşılamıyor: "Kontrol ediliyor…"da dönüp durmasın, alınamadı desin (07.10.2026)
  const y: YedekDurumu | undefined =
    durum.yedekler ?? (durum.servisErisim ? undefined : ({ liste: [], hata: "Pusula'ya ulaşılamadı" } as YedekDurumu));
  const simdi = y?.simdi ? Date.parse(y.simdi) : Date.now();
  const liste = y?.liste ?? [];

  // Genel renk: en kötü veritabanı
  let genel: Renk = y ? (y.hata ? "uyari" : liste.length === 0 ? "uyari" : "iyi") : "bekliyor";
  for (const v of liste) {
    genel = enKotu(genel, tamRenk(dakika(v.sonTam, simdi)));
    if (v.farkVar) genel = enKotu(genel, farkRenk(dakika(v.sonFark, simdi), dakika(v.sonTam, simdi), simdi));
  }
  const sorunlu = genel === "hata";
  const renk: Renk = !y ? "bekliyor" : y.hata || liste.length === 0 ? "uyari" : sorunlu ? "hata" : "iyi";
  const baslik = !y
    ? "Kontrol ediliyor…"
    : y.hata
      ? "Bilgi alınamadı"
      : liste.length === 0
        ? "Veritabanı bulunamadı"
        : sorunlu
          ? "Sorun var"
          : "Sağlıklı";
  const aciklama = !y
    ? "Bir saniye…"
    : y.hata
      ? "Durum şu an alınamadı; biraz sonra yeniden denenecek."
      : liste.length === 0
        ? "Bu firmaya kayıtlı veritabanı görünmüyor; Pusula'ya bildirin."
        : sorunlu
          ? "Yedekleme beklendiği gibi çalışmıyor; Pusula'ya bildirin."
          : liste.length === 1
            ? "Yedekler Pusula sunucusunda otomatik alınıyor."
            : `${liste.length} veritabanının yedekleri otomatik alınıyor.`;
  return { renk, baslik, aciklama };
}

/** Sol panel — veritabanı yedekleri. Satırlardan ayrışsın diye renkli zemin + canlı durum noktası. */
export function YedekYanKarti({ durum }: { durum: Durum }) {
  const o = yedekOzeti(durum);
  return (
    // Sağlıklıyken yalnız başlık (sol panel kısa kalsın, açıklama ipucunda); sorun varsa açıklama görünür
    <YanKart renk={o.renk} ikon={<DatabaseBackup />} etiket="Veritabanı yedekleri" baslik={o.baslik} ipucu={o.aciklama}>
      {o.renk !== "iyi" && o.renk !== "bekliyor" && <p className="text-xs leading-snug text-muted-foreground">{o.aciklama}</p>}
    </YanKart>
  );
}

const ZEMIN: Record<Renk, string> = {
  iyi: "from-emerald-500/12 border-emerald-500/25",
  uyari: "from-amber-500/12 border-amber-500/25",
  hata: "from-red-500/12 border-red-500/30",
  bekliyor: "from-muted border-border",
};
const NOKTA: Record<Renk, string> = { iyi: "bg-emerald-500", uyari: "bg-amber-500", hata: "bg-red-500", bekliyor: "bg-muted-foreground/50" };

/**
 * Sol panelin "Hizmetler" kartı (sayım, yedek): durum rengine göre hafif degrade zemin,
 * başlığın yanında nabız atan durum noktası. Diğer sol satırlar (firma no, kullanıcı…) düz kalır.
 */
export function YanKart({ renk, ikon, etiket, baslik, ek, ipucu, children }: {
  renk: Renk; ikon: React.ReactNode; etiket: string; baslik: React.ReactNode; ek?: React.ReactNode; ipucu?: string; children?: React.ReactNode;
}) {
  return (
    <div title={ipucu} className={`relative overflow-hidden rounded-xl border bg-gradient-to-br via-card to-card p-3 shadow-xs ${ZEMIN[renk]}`}>
      <div className="relative flex items-center gap-2.5">
        <span className={`flex size-8 shrink-0 items-center justify-center rounded-lg ring-1 [&_svg]:size-4 ${KUTU[renk]}`}>
          {renk === "bekliyor" ? <Loader2 className="animate-spin" /> : ikon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">{etiket}</div>
          <div className="flex items-center gap-1.5 text-sm leading-tight font-semibold">
            <span className="relative flex size-2 shrink-0">
              {renk === "iyi" && <span className={`absolute inline-flex size-full animate-ping rounded-full opacity-60 ${NOKTA[renk]}`} />}
              <span className={`relative inline-flex size-2 rounded-full ${NOKTA[renk]}`} />
            </span>
            <span className="min-w-0 truncate">{baslik}</span>
          </div>
        </div>
        {ek}
      </div>
      {children ? <div className="relative mt-2">{children}</div> : null}
    </div>
  );
}
