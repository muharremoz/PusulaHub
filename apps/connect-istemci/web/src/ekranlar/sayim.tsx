import { useEffect, useState } from "react";
import { CheckCircle2, CircleAlert, Database, FolderOpen, Loader2, RefreshCw, ScanBarcode, Trash2, Zap } from "lucide-react";
import { api, type Durum, type SayimDurum, type SayimTest } from "@/api";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Bolum } from "./ayarlar";

/**
 * Pusula X sayım modu — Ayarlar > Sayım.
 * Anahtar açılınca Pusula X'in sayım kopyası (RFID.xml'li) C:\Pusula\PusulaXSayım'a kurulur, server.xml
 * firmanın SQL bilgisiyle (Hub) yazılır, masaüstüne "Pusula Sayım" kısayolu konur. "Bağlantıyı test et"
 * SQL'e bağlanıp Pusula X'in giriş ekranında göreceği veritabanlarını listeler.
 * Kurulum arka planda sürer; ilerleme durum nabzından (Durum.sayim) gelir.
 */
export function SayimBolumu({ durum, setDurum }: { durum: Durum; setDurum: (d: Durum) => void }) {
  const s: SayimDurum | undefined = durum.sayim;
  const ikiAktif = !!durum.ikiAdim?.aktif;
  const [kod, setKod] = useState("");
  const [kodIcin, setKodIcin] = useState<null | "kur" | "guncelle">(null);
  const [bekle, setBekle] = useState<null | "kur" | "guncelle" | "test" | "kaldir">(null);
  const [hata, setHata] = useState<string | null>(null);
  const [kaldirOnay, setKaldirOnay] = useState(false);
  const [test, setTest] = useState<SayimTest | null>(s?.test ?? null);

  useEffect(() => {
    if (s?.test) setTest(s.test);
  }, [s?.test]);

  // Kurulum sürerken durum sık yenilensin (ana nabız 5 sn; ilerleme çubuğu akıcı olsun)
  useEffect(() => {
    if (!s?.kuruluyor) return;
    const t = window.setInterval(() => {
      api<Durum>("/durum").then(setDurum).catch(() => {});
    }, 1000);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s?.kuruluyor]);

  const calistir = async (ne: "kur" | "guncelle", k?: string) => {
    if (ikiAktif && !k) {
      setKodIcin(ne);
      return;
    }
    setBekle(ne);
    setHata(null);
    try {
      setDurum(await api<Durum>(ne === "kur" ? "/sayim/kur" : "/sayim/guncelle", { kod: k ?? null }));
      setKodIcin(null);
      setKod("");
    } catch (e) {
      setHata((e as Error).message);
    } finally {
      setBekle(null);
    }
  };

  const testEt = async () => {
    setBekle("test");
    setHata(null);
    try {
      setTest(await api<SayimTest>("/sayim/test", {}));
    } catch (e) {
      setHata((e as Error).message);
    } finally {
      setBekle(null);
    }
  };

  const kaldir = async (klasor: boolean) => {
    setBekle("kaldir");
    setHata(null);
    try {
      await api("/sayim/kaldir", { klasor });
      setTest(null);
      setDurum(await api<Durum>("/durum"));
    } catch (e) {
      setHata((e as Error).message);
    } finally {
      setBekle(null);
      setKaldirOnay(false);
    }
  };

  const acik = !!s && (s.kurulu || s.kuruluyor);
  const il = s?.ilerleme;
  const sonHata = il?.bitti && il.hata ? il.hata : null;

  return (
    <>
      <Bolum baslik="Pusula X sayım modu" aciklama="Bu bilgisayarda, terminale bağlanmadan">
        <div className="flex items-center gap-3 px-4 py-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground [&_svg]:size-4"><ScanBarcode /></span>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium">Sayım kullanılacak</div>
            <div className="text-xs text-muted-foreground">
              Pusula X'in sayım kopyası bu bilgisayara kurulur; masaüstüne <span className="font-medium">Pusula Sayım</span> kısayolu konur.
            </div>
          </div>
          <Switch
            checked={acik}
            disabled={!s || bekle !== null || s.kuruluyor}
            onCheckedChange={(v) => (v ? void calistir("kur") : setKaldirOnay(true))}
          />
        </div>

        {(hata || sonHata) && (
          <div className="px-4 py-3">
            <Alert variant="destructive">
              <CircleAlert />
              <AlertDescription>{hata ?? sonHata}</AlertDescription>
            </Alert>
          </div>
        )}

        {kodIcin && (
          <div className="flex flex-wrap items-end gap-2 px-4 py-3">
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Doğrulama kodu</Label>
              <Input value={kod} onChange={(e) => setKod(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" placeholder="000000" className="w-32 font-mono tracking-widest" autoFocus />
            </div>
            <Button size="sm" disabled={kod.length !== 6 || bekle !== null} onClick={() => void calistir(kodIcin, kod)}>
              {bekle ? <Loader2 className="animate-spin" /> : null} Devam
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setKodIcin(null); setKod(""); }}>Vazgeç</Button>
            <div className="basis-full text-xs text-muted-foreground">SQL bağlantı bilgisi Pusula'dan alınacak; iki adımlı doğrulama açık olduğu için kod gerekli.</div>
          </div>
        )}

        {s?.kuruluyor && il && (
          <div className="flex flex-col gap-2 px-4 py-3">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5"><Loader2 className="size-3.5 animate-spin" /> {il.mesaj ?? "Kuruluyor…"}</span>
              <span className="tabular-nums text-muted-foreground">
                {il.hiz > 0 && `${(il.hiz / 1048576).toFixed(1)} MB/sn · `}%{il.yuzde}
              </span>
            </div>
            <Progress value={il.yuzde} />
          </div>
        )}

        {s?.kurulu && !s.kuruluyor && (
          <>
            <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 px-4 py-3 text-xs">
              <span className="text-muted-foreground">Klasör</span>
              <span className="truncate font-mono" title={s.klasor}>{s.klasor}</span>
              <span className="text-muted-foreground">Pusula X</span>
              <span className="font-mono">{s.surum ?? "—"}{s.paketSurum && s.surum && !s.surum.startsWith(s.paketSurum) ? ` (paket ${s.paketSurum})` : ""}</span>
              <span className="text-muted-foreground">SQL sunucusu</span>
              <span className="font-mono">{s.sunucu ?? "—"}</span>
              <span className="text-muted-foreground">SQL kullanıcısı</span>
              <span className="font-mono">{s.kullanici ?? "—"}</span>
              <span className="text-muted-foreground">Resim adresi</span>
              <span className="truncate font-mono" title={s.resimYolu ?? ""}>{s.resimYolu ?? "— (veritabanındaki yol)"}</span>
              <span className="text-muted-foreground">Kısayol</span>
              <span>{s.kisayol ? "Masaüstünde" : <span className="text-amber-600 dark:text-amber-400">Yok</span>}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2 px-4 py-3">
              <Button size="sm" onClick={() => void testEt()} disabled={bekle !== null}>
                {bekle === "test" ? <Loader2 className="animate-spin" /> : <Zap />} Bağlantıyı test et
              </Button>
              <Button size="sm" variant="outline" onClick={() => void calistir("guncelle")} disabled={bekle !== null} title="SQL bilgisini Pusula'dan yeniden al, server.xml'i yenile">
                {bekle === "guncelle" ? <Loader2 className="animate-spin" /> : <RefreshCw />} Bilgiyi yenile
              </Button>
              <Button size="sm" variant="ghost" onClick={() => void api("/sayim/klasor", {}).catch((e) => setHata((e as Error).message))} title="Klasörü aç">
                <FolderOpen /> Klasör
              </Button>
            </div>
          </>
        )}
      </Bolum>

      {s?.kurulu && test && (
        <Bolum baslik="SQL bağlantı testi" aciklama={new Date(test.zaman).toLocaleString("tr-TR")}>
          <div className="flex items-start gap-3 px-4 py-3">
            <span className={`flex size-8 shrink-0 items-center justify-center rounded-lg [&_svg]:size-4 ${test.ok ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" : "bg-destructive/15 text-destructive"}`}>
              {test.ok ? <CheckCircle2 /> : <CircleAlert />}
            </span>
            <div className="min-w-0 flex-1 text-sm">
              {test.ok ? (
                <>
                  <div className="font-medium">Bağlandı <span className="text-xs font-normal text-muted-foreground">· {test.sureMs} ms{test.sqlSurum ? ` · SQL ${test.sqlSurum}` : ""}</span></div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    <span className="font-mono">{test.kullanici}</span> @ <span className="font-mono">{test.sunucu}</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="font-medium">Bağlanamadı</div>
                  <div className="mt-1 text-xs break-words text-destructive">{test.hata}</div>
                </>
              )}
            </div>
          </div>
          {test.ok && (
            <div className="px-4 py-3">
              <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
                <Database className="size-3.5" />
                {test.veritabanlari?.length ?? 0} veritabanı
                {test.kaynak === "sys.databases" && (
                  <Badge variant="outline" className="text-[10px]" title={test.guvenlikHatasi ?? ""}>Sirket/guvenlik görülemedi — login'in gördükleri</Badge>
                )}
              </div>
              {test.veritabanlari && test.veritabanlari.length > 0 ? (
                <ul className="divide-y rounded-lg border text-sm">
                  {test.veritabanlari.map((v, i) => (
                    <li key={i} className="flex items-center justify-between gap-3 px-3 py-1.5">
                      <span className="truncate">{v.ad ?? v.veritabani}</span>
                      {v.ad && v.veritabani && v.ad !== v.veritabani && <span className="shrink-0 font-mono text-xs text-muted-foreground">{v.veritabani}</span>}
                    </li>
                  ))}
                </ul>
              ) : (
                <Alert>
                  <CircleAlert />
                  <AlertDescription>
                    Bağlantı kuruldu ama bu firma için veritabanı görünmüyor. Pusula X giriş ekranı da boş gelir — Pusula'ya bildirin.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}
        </Bolum>
      )}

      <AlertDialog open={kaldirOnay} onOpenChange={(o) => !o && setKaldirOnay(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sayım kapatılsın mı?</AlertDialogTitle>
            <AlertDialogDescription>
              Masaüstündeki <span className="font-medium">Pusula Sayım</span> kısayolu kaldırılır ve bağlantı bilgisi (server.xml) silinir.
              Pusula X kopyası ({s?.klasor}) diskte kalabilir — yeniden açınca indirme gerekmez — ya da tamamen silinebilir.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Vazgeç</AlertDialogCancel>
            <Button variant="outline" disabled={bekle !== null} onClick={() => void kaldir(false)}>Kapat, dosyalar kalsın</Button>
            <AlertDialogAction className="bg-destructive text-white hover:bg-destructive/90" disabled={bekle !== null} onClick={(e) => { e.preventDefault(); void kaldir(true); }}>
              {bekle === "kaldir" ? <Loader2 className="animate-spin" /> : <Trash2 />} Kapat ve sil
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
