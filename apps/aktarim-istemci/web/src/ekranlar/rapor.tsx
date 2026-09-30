import { useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, CheckCircle2, Database, FolderOpen, Image, Loader2, RefreshCw, Server, XCircle } from "lucide-react";
import { api, type Durum, type Veritabani } from "@/api";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { mb } from "./ortak";

type P = { durum: Durum; setDurum: (d: Durum) => void };

const TUR_ETIKET: Record<Veritabani["tur"], string> = {
  firma: "Firma datası",
  transfer: "Transfer datası",
  diger: "Tanımsız",
  sirket: "Şirket tanımları",
};

/** Keşif sonucu + aktarılacak veritabanlarının seçimi. Varsayılan: firma ve transfer dataları. */
export function RaporEkrani({ durum, setDurum }: P) {
  const r = durum.kesif;
  const [bekle, setBekle] = useState(false);
  const [secili, setSecili] = useState<Set<string>>(
    () => new Set((r?.veritabanlari ?? []).filter((v) => (v.tur === "firma" || v.tur === "transfer") && v.durum === "ONLINE").map((v) => v.ad)),
  );
  const [basliyor, setBasliyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const toplamMb = useMemo(
    () => (r?.veritabanlari ?? []).filter((v) => secili.has(v.ad)).reduce((t, v) => t + v.veriMb, 0),
    [r, secili],
  );
  const degistir = (ad: string, acik: boolean) =>
    setSecili((s) => {
      const y = new Set(s);
      if (acik) y.add(ad);
      else y.delete(ad);
      return y;
    });
  const baslat = async () => {
    setBasliyor(true);
    setHata(null);
    try {
      setDurum(await api<Durum>("/aktarim/baslat", { veritabanlari: [...secili] }));
    } catch (e) {
      setHata((e as Error).message);
    } finally {
      setBasliyor(false);
    }
  };

  const yenile = async () => {
    setBekle(true);
    try {
      setDurum(await api<Durum>("/kesif/yenile", {}));
    } finally {
      setBekle(false);
    }
  };

  const gruplar: Veritabani["tur"][] = ["firma", "transfer", "diger", "sirket"];

  return (
    <div className="min-h-svh bg-muted/40 pb-20">
      <header className="flex items-center gap-3 border-b bg-card px-6 py-3">
        <div className="min-w-0 flex-1">
          <div className="text-xs text-muted-foreground">Aktarım · {durum.oturum?.firmaId}</div>
          <h1 className="truncate text-base font-semibold">{durum.oturum?.firmaAdi}</h1>
        </div>
        {durum.kesifGonderildi ? (
          <span className="flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="size-4" /> Rapor Pusula'ya iletildi
          </span>
        ) : null}
        <Button variant="outline" size="sm" disabled={bekle} onClick={() => void yenile()}>
          {bekle ? <Loader2 className="animate-spin" /> : <RefreshCw />} Yeniden tara
        </Button>
      </header>

      <main className="mx-auto flex max-w-5xl flex-col gap-4 p-6">
        {durum.kesifHatasi && (
          <Alert variant="destructive">
            <XCircle />
            <AlertDescription>{durum.kesifHatasi}</AlertDescription>
          </Alert>
        )}
        {r?.uyarilar.map((u, i) => (
          <Alert key={i}>
            <AlertTriangle />
            <AlertDescription>{u}</AlertDescription>
          </Alert>
        ))}

        {r && (
          <>
            <Bolum ikon={<Server className="size-4" />} baslik="SQL Server">
              <div className="grid grid-cols-2 gap-x-6 gap-y-1 px-4 py-3 text-sm sm:grid-cols-4">
                <Bilgi l="Sunucu" v={r.sql.sunucu} mono />
                <Bilgi l="Bilgisayar" v={r.sql.makineAdi + (r.sql.yerel ? "" : " (uzak)")} />
                <Bilgi l="Sürüm" v={r.sql.surumu} />
                <Bilgi l="Bağlantı" v={r.sql.kaynak === "windows" ? "Windows oturumu" : r.sql.kaynak} />
              </div>
            </Bolum>

            <Bolum ikon={<Database className="size-4" />} baslik="Veritabanları" sag={`${r.veritabanlari.length} veritabanı · ${mb(r.veritabanlari.reduce((t, v) => t + v.veriMb, 0))}`}>
              <Table>
                <TableHeader>
                  <TableRow className="text-[10px] uppercase tracking-wider">
                    <TableHead className="w-10 pl-4" />
                    <TableHead className="px-4">Veritabanı</TableHead>
                    <TableHead className="px-4">Şirket</TableHead>
                    <TableHead className="px-4">Program</TableHead>
                    <TableHead className="px-4 text-right">Veri</TableHead>
                    <TableHead className="px-4 text-right">Log</TableHead>
                    <TableHead className="px-4">Son yedek</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {gruplar.flatMap((g) => {
                    const satirlar = r.veritabanlari.filter((v) => v.tur === g);
                    if (!satirlar.length) return [];
                    return [
                      <TableRow key={g} className="bg-muted/40 hover:bg-muted/40">
                        <TableCell colSpan={7} className="px-4 py-1 text-xs font-medium text-muted-foreground">
                          {TUR_ETIKET[g]} · {satirlar.length}
                        </TableCell>
                      </TableRow>,
                      ...satirlar.map((v) => (
                        <TableRow key={v.ad} data-state={secili.has(v.ad) ? "selected" : undefined}>
                          <TableCell className="pl-4">
                            <Checkbox
                              checked={secili.has(v.ad)}
                              disabled={v.durum !== "ONLINE"}
                              onCheckedChange={(c) => degistir(v.ad, c === true)}
                              aria-label={v.ad + " aktarılsın"}
                            />
                          </TableCell>
                          <TableCell className="px-4 font-mono">
                            {v.ad}
                            {v.durum !== "ONLINE" && <Badge variant="outline" className="ml-2">{v.durum}</Badge>}
                          </TableCell>
                          <TableCell className="px-4">{v.sirketAdlari.join(", ") || "—"}</TableCell>
                          <TableCell className="px-4 text-muted-foreground">{v.prgTur === "909" ? "Perakende" : v.prgTur === "011" ? "Toptan" : v.prgTur ?? "—"}</TableCell>
                          <TableCell className="px-4 text-right tabular-nums">{mb(v.veriMb)}</TableCell>
                          <TableCell className="px-4 text-right tabular-nums text-muted-foreground">{mb(v.logMb)}</TableCell>
                          <TableCell className="px-4 text-muted-foreground">{v.sonYedek ? new Date(v.sonYedek).toLocaleDateString("tr") : "—"}</TableCell>
                        </TableRow>
                      )),
                    ];
                  })}
                </TableBody>
              </Table>
            </Bolum>

            <div className="grid gap-4 md:grid-cols-2">
              <Bolum ikon={<Image className="size-4" />} baslik="Resim klasörleri">
                {r.resimKlasorleri.length === 0 && <Bos>guvenlik tablosunda resim yolu yok.</Bos>}
                {r.resimKlasorleri.map((k) => (
                  <div key={k.yol} className="border-b px-4 py-2 text-sm last:border-b-0">
                    <div className="truncate font-mono text-xs" title={k.yol}>{k.yol}</div>
                    <div className="text-xs text-muted-foreground">
                      {k.var ? `${k.dosyaSayisi.toLocaleString("tr")}${k.eksik ? "+" : ""} dosya · ${mb(k.boyutMb)}` : "Klasör bulunamadı"}
                      {k.kullananlar.length > 0 && ` · ${k.kullananlar.length} şirket`}
                    </div>
                  </div>
                ))}
              </Bolum>
              <Bolum ikon={<FolderOpen className="size-4" />} baslik="Program klasörleri">
                {r.programKlasorleri.length === 0 && <Bos>Pusula program klasörü bulunamadı.</Bos>}
                {r.programKlasorleri.map((p) => (
                  <div key={p.yol} className="border-b px-4 py-2 text-sm last:border-b-0">
                    <div className="truncate font-mono text-xs" title={p.yol}>{p.yol}</div>
                    <div className="text-xs text-muted-foreground">
                      {p.exeler.length} exe · {p.parametreler.map((x) => `${x.ad}${x.dataKodu ? ` (data kodu ${x.dataKodu})` : ""}`).join(", ")}
                    </div>
                  </div>
                ))}
              </Bolum>
            </div>
          </>
        )}
      </main>

      {r && (
        <footer className="fixed inset-x-0 bottom-0 border-t bg-card/95 backdrop-blur">
          <div className="mx-auto flex max-w-5xl items-center gap-3 px-6 py-3">
            <div className="min-w-0 flex-1 text-sm">
              {hata ? (
                <span className="text-destructive">{hata}</span>
              ) : (
                <>
                  <span className="font-medium">{secili.size} veritabanı</span>
                  <span className="text-muted-foreground"> · {mb(toplamMb)} veri{r.sql.sikistirmaVar ? " · sıkıştırılarak yedeklenir" : ""}</span>
                </>
              )}
            </div>
            <Button disabled={basliyor || secili.size === 0} onClick={() => void baslat()}>
              {basliyor ? <Loader2 className="animate-spin" /> : null} Aktarımı başlat <ArrowRight />
            </Button>
          </div>
        </footer>
      )}
    </div>
  );
}

function Bolum({ ikon, baslik, sag, children }: { ikon: React.ReactNode; baslik: string; sag?: string; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-lg border bg-card">
      <div className="flex items-center gap-2 border-b px-4 py-2">
        <span className="text-muted-foreground">{ikon}</span>
        <h2 className="text-sm font-semibold">{baslik}</h2>
        {sag && <span className="ml-auto text-xs text-muted-foreground">{sag}</span>}
      </div>
      {children}
    </section>
  );
}

function Bilgi({ l, v, mono }: { l: string; v: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] text-muted-foreground">{l}</div>
      <div className={`truncate ${mono ? "font-mono" : ""}`} title={v}>{v || "—"}</div>
    </div>
  );
}

const Bos = ({ children }: { children: React.ReactNode }) => <p className="px-4 py-3 text-sm text-muted-foreground">{children}</p>;
