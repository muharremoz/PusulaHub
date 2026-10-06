import { CheckCircle2, CircleAlert, DatabaseBackup, Loader2, RefreshCw } from "lucide-react";
import { api, type Durum, type YedekDurumu } from "@/api";
import { Button } from "@/components/ui/button";

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

/** "5 dk önce", "3 saat önce", "2 gün önce" */
function gecen(dk: number | null): string {
  if (dk == null) return "hiç alınmamış";
  if (dk < 1) return "az önce";
  if (dk < 60) return `${dk} dk önce`;
  if (dk < 48 * 60) return `${Math.round(dk / 60)} saat önce`;
  return `${Math.round(dk / 1440)} gün önce`;
}

const tamRenk = (dk: number | null): Renk => (dk == null ? "hata" : dk <= TAM_IYI_SAAT * 60 ? "iyi" : dk <= TAM_UYARI_SAAT * 60 ? "uyari" : "hata");
/** fDk: son fark, tDk: son tam yedek (dk önce). Esas: ikisinden yeni olanı. Gece: bekleniyor (gri). */
function farkRenk(fDk: number | null, tDk: number | null, simdi: number): Renk {
  const esas = Math.min(fDk ?? Infinity, tDk ?? Infinity);
  if (!farkAraligiMi(simdi)) return esas <= 14 * 60 ? "bekliyor" : "uyari";
  return esas <= FARK_IYI_DK ? "iyi" : esas <= FARK_UYARI_DK ? "uyari" : "hata";
}
const enKotu = (a: Renk, b: Renk): Renk => (["hata", "uyari", "iyi", "bekliyor"] as Renk[]).find((r) => r === a || r === b) ?? "bekliyor";

const saat = (iso: string | null) => (iso ? new Date(iso).toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—");

export function YedekKarti({ durum, setDurum }: { durum: Durum; setDurum: (d: Durum) => void }) {
  const y: YedekDurumu | undefined = durum.yedekler ?? undefined;
  const simdi = y?.simdi ? Date.parse(y.simdi) : Date.now();
  const liste = y?.liste ?? [];

  // Kartın genel rengi: en kötü veritabanı
  let genel: Renk = y ? (y.hata ? "uyari" : liste.length === 0 ? "uyari" : "iyi") : "bekliyor";
  for (const v of liste) {
    genel = enKotu(genel, tamRenk(dakika(v.sonTam, simdi)));
    if (v.farkVar) genel = enKotu(genel, farkRenk(dakika(v.sonFark, simdi), dakika(v.sonTam, simdi), simdi));
  }

  const yenile = () => api<Durum>("/yedekler/yenile", {}).then(setDurum).catch(() => {});

  const baslikDeger = !y
    ? "Kontrol ediliyor…"
    : y.hata
      ? "Bilgi alınamadı"
      : liste.length === 0
        ? "Veritabanı bulunamadı"
        : genel === "iyi"
          ? "Yedekler güncel"
          : genel === "uyari"
            ? "Yedek gecikmiş"
            : "Yedek alınmıyor";

  return (
    <div className="relative col-span-2 flex items-start gap-3 overflow-hidden rounded-xl border bg-card p-4 shadow-xs">
      <span className={`flex size-10 shrink-0 items-center justify-center rounded-lg ring-1 [&_svg]:size-5 ${KUTU[genel]}`}><DatabaseBackup /></span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">Veritabanı yedekleri</span>
          <span className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="size-6 [&_svg]:size-3.5" onClick={() => void yenile()} disabled={!!y?.yenileniyor} aria-label="Yenile">
              {y?.yenileniyor ? <Loader2 className="animate-spin" /> : <RefreshCw />}
            </Button>
            <span className={`[&_svg]:size-4 ${RENK[genel]}`}>
              {genel === "iyi" ? <CheckCircle2 /> : genel === "bekliyor" ? <Loader2 className="animate-spin" /> : <CircleAlert />}
            </span>
          </span>
        </div>
        <div className="truncate text-[15px] leading-tight font-semibold">{baslikDeger}</div>
        {y?.hata ? (
          <div className="mt-0.5 text-xs text-muted-foreground">{y.hata}</div>
        ) : liste.length > 0 ? (
          <ul className="mt-2 divide-y text-xs">
            {liste.map((v) => {
              const tDk = dakika(v.sonTam, simdi);
              const fDk = dakika(v.sonFark, simdi);
              return (
                <li key={v.ad} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-1.5 first:pt-0 last:pb-0">
                  <span className="min-w-0 flex-1 truncate font-medium" title={v.ad}>{v.ad}</span>
                  <span className={RENK[tamRenk(tDk)]} title={`Son tam yedek: ${saat(v.sonTam)}`}>
                    Tam yedek {gecen(tDk)}
                  </span>
                  {v.farkVar && (
                    <span
                      className={RENK[farkRenk(fDk, tDk, simdi)]}
                      title={`Son fark yedeği: ${saat(v.sonFark)}. Fark yedekleri gündüz yaklaşık yarım saatte bir alınır, gece alınmaz.`}
                    >
                      {!farkAraligiMi(simdi) && tDk != null && (fDk == null || tDk < fDk) ? "Fark yedekleri gündüz başlar" : `Fark ${gecen(fDk)}`}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        ) : y ? (
          <div className="mt-0.5 text-xs text-muted-foreground">Bu firmaya kayıtlı veritabanı görünmüyor; Pusula'ya bildirin.</div>
        ) : (
          <div className="mt-0.5 text-xs text-muted-foreground">Bir saniye…</div>
        )}
        {y?.zaman && !y.hata && (
          <div className="mt-1.5 text-[11px] text-muted-foreground">
            Yedekler Pusula sunucusunda otomatik alınır. Bilgi {new Date(y.zaman).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })} itibarıyla.
          </div>
        )}
      </div>
    </div>
  );
}
