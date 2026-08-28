"use client";

/**
 * Analiz sekmesi — "bu sunucu gerçekten kullanılıyor mu, yoğunluğu ne?"
 *
 * Üç soruya sırayla cevap veriyor:
 *   1. Şu an ne durumda?          → özet kartları
 *   2. Zaman içinde nasıl?        → günlük kişi sayısı sütunları
 *   3. Yük kimden geliyor?        → firma tablosu + atıl hesaplar
 *
 * Süre birimi SAAT; yüzde değil. Bu yüzden çubuklu "doluluk" göstergesi
 * kullanılmıyor — çubuk "100 üzerinden" izlenimi verirdi.
 */

import { useEffect, useState } from "react";
import { Users, Clock, Activity, UserX, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import type { AnalizYanit } from "@/app/api/servers/[id]/analiz/route";

const trTarih = (t: string) => {
  const [y, a, g] = t.split("-");
  return `${g}.${a}.${y}`;
};

const GUN_KISA = ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"];
const gunKisa = (t: string) => GUN_KISA[new Date(t + "T12:00:00Z").getUTCDay()];

/** Iki tablonun da baslik hucresi — bicim tek yerden gelsin diye. */
function Th({ children, sag = false }: { children: React.ReactNode; sag?: boolean }) {
  return (
    <th
      className={cn(
        "text-muted-foreground px-3 py-1.5 text-[10px] font-medium tracking-wider uppercase whitespace-nowrap",
        sag ? "text-right" : "text-left",
      )}
    >
      {children}
    </th>
  );
}

function OzetKart({
  ikon: Ikon, deger, etiket, alt, ton = "notr",
}: {
  ikon: React.ElementType; deger: string | number; etiket: string;
  alt?: string; ton?: "notr" | "iyi" | "uyari";
}) {
  return (
    <div
      className="bg-card rounded-[5px] border p-3"
      style={{ boxShadow: "var(--card-shadow)" }}
    >
      <div className="text-muted-foreground flex items-center gap-1.5">
        <Ikon className="size-3.5" />
        <span className="text-[10px] font-medium tracking-wider uppercase">{etiket}</span>
      </div>
      <div
        className={cn(
          "mt-1.5 text-2xl font-bold tabular-nums",
          ton === "iyi" && "text-emerald-600 dark:text-emerald-400",
          ton === "uyari" && "text-amber-600 dark:text-amber-400",
        )}
      >
        {deger}
      </div>
      {alt && <div className="text-muted-foreground mt-0.5 text-[11px]">{alt}</div>}
    </div>
  );
}

/** Günlük kişi sayısı — sütun grafiği. Hafta sonları soluk. */
function GunlukSeri({ gunler }: { gunler: AnalizYanit["gunler"] }) {
  if (gunler.length === 0) return null;
  const enCok = Math.max(...gunler.map((g) => g.kisi), 1);

  return (
    <div className="bg-card rounded-[5px] border p-3" style={{ boxShadow: "var(--card-shadow)" }}>
      <div className="mb-3 flex items-baseline justify-between">
        <span className="text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
          Günlük kullanıcı sayısı
        </span>
        <span className="text-muted-foreground text-[11px] tabular-nums">
          son {gunler.length} gün · en yüksek {enCok}
        </span>
      </div>

      {/*  items-end KULLANILMIYOR: hizalama sutunu icerige gore
           boyutlandiriyordu, icerideki cubuk ise yuzde yukseklik
           istiyor — belirsiz yukseklige gore yuzde 0 cikiyor ve
           grafik bombos goruniyordu. Sutunlar h-28'i doldurmali,
           cubuk zaten justify-end ile alta yasliyor.                */}
      <div className="flex h-28 items-stretch gap-[3px]">
        {gunler.map((g) => (
          <div key={g.tarih} className="group relative flex min-w-0 flex-1 flex-col justify-end">
            <div
              className={cn(
                "w-full rounded-t-[2px] transition-colors",
                g.haftaSonu ? "bg-muted-foreground/25" : "bg-primary/75 group-hover:bg-primary",
              )}
              style={{ height: `${Math.max(2, (g.kisi / enCok) * 100)}%` }}
            />
            {/* Tooltip — grafiği kalabalıklaştırmamak için yalnız hover'da */}
            <div className="bg-popover pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 hidden -translate-x-1/2 rounded-[5px] border px-2 py-1 whitespace-nowrap shadow-md group-hover:block">
              <div className="text-[11px] font-medium">{trTarih(g.tarih)} · {gunKisa(g.tarih)}</div>
              <div className="text-muted-foreground text-[10px] tabular-nums">
                {g.kisi} kişi · {g.saat} saat
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="text-muted-foreground mt-1.5 flex justify-between text-[10px] tabular-nums">
        <span>{trTarih(gunler[0].tarih)}</span>
        <span>{trTarih(gunler[gunler.length - 1].tarih)}</span>
      </div>
    </div>
  );
}

export function TabAnaliz({ serverId }: { serverId: string }) {
  const [veri, setVeri] = useState<AnalizYanit | null>(null);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [hata, setHata] = useState<string | null>(null);

  useEffect(() => {
    let iptal = false;
    (async () => {
      try {
        const r = await fetch(`/api/servers/${serverId}/analiz`, { cache: "no-store" });
        const d = await r.json();
        if (iptal) return;
        if (!r.ok) setHata(d?.error ?? "Analiz verisi alınamadı");
        else setVeri(d);
      } catch {
        if (!iptal) setHata("Bağlantı hatası");
      } finally {
        if (!iptal) setYukleniyor(false);
      }
    })();
    return () => { iptal = true; };
  }, [serverId]);

  if (yukleniyor)
    return (
      <div className="space-y-3 p-4">
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-[76px] rounded-[5px]" />
          ))}
        </div>
        <Skeleton className="h-40 rounded-[5px]" />
        <Skeleton className="h-64 rounded-[5px]" />
      </div>
    );

  if (hata)
    return <div className="text-muted-foreground p-8 text-center text-[13px]">{hata}</div>;

  if (!veri || !veri.veriVar)
    return (
      <div className="flex flex-col items-center justify-center gap-2 p-12 text-center">
        <Activity className="text-muted-foreground/40 size-8" />
        <p className="text-[13px] font-medium">Bu sunucu için kullanım geçmişi yok</p>
        <p className="text-muted-foreground max-w-sm text-[12px]">
          Analiz, kullanıcı oturumlarından üretiliyor. Terminal (RDP) sunucularında
          dolu gelir; başka rollerdeki sunucularda oturum kaydı oluşmaz.
        </p>
      </div>
    );

  const o = veri.ozet;
  const kullanan = veri.firmalar.filter((f) => f.kullanan > 0);

  return (
    <div className="space-y-3 p-4">
      {/* ── 1) Şu an ne durumda ── */}
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
        <OzetKart
          ikon={Activity} etiket="Şu an bağlı" deger={o.suAnBagli} ton="iyi"
          alt={`${o.suAnAktifOturum} etkin oturum`}
        />
        <OzetKart
          ikon={TrendingUp} etiket="Günlük ortalama" deger={o.gunlukOrtKisi}
          alt="hafta içi, kişi"
        />
        <OzetKart
          ikon={Clock} etiket="Kişi başı" deger={`${o.kisiBasiSaat} sa`}
          alt="bağlandığı günlerde"
        />
        <OzetKart
          ikon={Users} etiket="Aktif kullanıcı" deger={`${o.aktif}/${o.kullanici}`}
          alt="son 30 günde bağlanan"
        />
        <OzetKart
          ikon={UserX} etiket="Atıl hesap" deger={o.atil} ton={o.atil > 0 ? "uyari" : "notr"}
          alt="30 gündür bağlanmayan"
        />
      </div>

      {/* ── 2) Zaman içinde ── */}
      <GunlukSeri gunler={veri.gunler} />

      {o.zirveTarih && (
        <p className="text-muted-foreground px-1 text-[11px]">
          En yoğun gün <span className="text-foreground font-medium">{trTarih(o.zirveTarih)}</span> —{" "}
          <span className="tabular-nums">{o.zirveKisi} kişi</span>. Bu sayı gün boyunca bağlanan
          farklı kişi sayısıdır; aynı anda bağlı olan sayı daha düşüktür.
        </p>
      )}

      {/* ── 3) Yük kimden geliyor ── */}
      <div className="bg-card overflow-hidden rounded-[5px] border" style={{ boxShadow: "var(--card-shadow)" }}>
        <div className="bg-muted/30 flex items-baseline justify-between border-b px-3 py-2">
          <span className="text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
            Firma bazında kullanım
          </span>
          <span className="text-muted-foreground text-[11px] tabular-nums">
            {kullanan.length} firma kullanıyor
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b">
                <Th>Firma No</Th>
                <Th>Firma</Th>
                <Th sag>Kullanıcı</Th>
                <Th sag>Günlük ort.</Th>
                <Th sag>Kişi başı</Th>
                <Th sag>Toplam</Th>
                <Th sag>Bağlı</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {kullanan.map((f) => (
                <tr key={f.firma} className="hover:bg-muted/20 transition-colors">
                  <td className="text-primary px-3 py-1.5 font-mono text-[12px] font-semibold whitespace-nowrap">{f.firma}</td>
                  <td className="px-3 py-1.5">{f.ad ?? "—"}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {f.kullanan}
                    {f.kullanan !== f.kullanici && (
                      <span className="text-muted-foreground">/{f.kullanici}</span>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-right font-medium tabular-nums">{f.gunlukOrt}</td>
                  <td className="text-muted-foreground px-3 py-1.5 text-right tabular-nums">{f.kisiBasiSaat} sa</td>
                  <td className="text-muted-foreground px-3 py-1.5 text-right tabular-nums">{f.toplamSaat} sa</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {f.suAnBagli > 0
                      ? <span className="font-semibold text-emerald-600 dark:text-emerald-400">{f.suAnBagli}</span>
                      : <span className="text-muted-foreground">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Atıl hesaplar — kaynak tüketmiyorlar, ama taşımada ve lisansta yer kaplıyorlar */}
      {veri.atillar.length > 0 && (
        <div className="bg-card overflow-hidden rounded-[5px] border" style={{ boxShadow: "var(--card-shadow)" }}>
          <div className="bg-muted/30 flex items-baseline justify-between border-b px-3 py-2">
            <span className="text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
              30 gündür bağlanmayanlar
            </span>
            <span className="text-muted-foreground text-[11px] tabular-nums">
              {veri.atillar.length} hesap
            </span>
          </div>
          <div className="max-h-72 overflow-auto">
            <table className="w-full text-[13px]">
              {/* Iki liste de ayni kolon duzeninde: once firma no, sonra
                  firma adi. Once firma no ile ad tek hucrede birlikteydi,
                  iki tablo farkli okunuyordu. */}
              <thead className="bg-card sticky top-0">
                <tr className="border-b">
                  <Th>Firma No</Th>
                  <Th>Firma</Th>
                  <Th>Kullanıcı</Th>
                  <Th sag>Son bağlantı</Th>
                  <Th sag>Durum</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {veri.atillar.map((a) => (
                  <tr key={a.kullanici} className="hover:bg-muted/20 transition-colors">
                    <td className="text-primary px-3 py-1.5 font-mono text-[12px] font-semibold whitespace-nowrap">{a.firma}</td>
                    <td className="px-3 py-1.5">{a.ad ?? "—"}</td>
                    <td className="px-3 py-1.5 font-mono text-[12px]">{a.kullanici}</td>
                    <td className="text-muted-foreground px-3 py-1.5 text-right tabular-nums whitespace-nowrap">
                      {a.sonBaglanti ? trTarih(a.sonBaglanti) : "—"}
                    </td>
                    <td className="px-3 py-1.5 text-right whitespace-nowrap">
                      {a.gecenGun != null ? (
                        <span className="inline-flex rounded-[5px] bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400">
                          {a.gecenGun} gündür yok
                        </span>
                      ) : (
                        <span className="inline-flex rounded-[5px] bg-rose-500/15 px-2 py-0.5 text-[11px] font-medium text-rose-700 dark:text-rose-400">
                          Hiç bağlanmadı
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="text-muted-foreground px-1 text-[11px] leading-relaxed">
        Süre, poller&apos;ın 10 saniyelik örneklemesinden hesaplanıyor. &quot;Bağlı&quot; sayısı
        oturumu açık olanları gösterir — bağlantısı kopmuş ama oturumunu kapatmamış
        kullanıcı da dahildir; kaynak tüketimi açısından ikisi aynıdır.
      </p>
    </div>
  );
}
