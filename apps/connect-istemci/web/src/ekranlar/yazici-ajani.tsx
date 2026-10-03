import { useEffect, useRef, useState } from "react";
import { Check, CircleAlert, Copy, Loader2, Printer, RefreshCw, Trash2, Wrench, X, Zap } from "lucide-react";
import { api } from "@/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Bolum } from "./ayarlar";

type AjanDurum = {
  kurulu: boolean;
  yazici: string | null;
  port: number;
  calisiyor: boolean;
  calisanYol: string | null;
  bizimki: boolean;
  baslangic: boolean;
  eskiKurulum: string[];
  yazicilar: string[];
  vpnIp: string | null;
};
type PortSonuc = { port: number; bos: boolean; ajan: boolean; oneri: number | null };
type Ping = { ok: boolean; ms: number; hata: string | null };
type TestSonuc = {
  port: number;
  yazici: string | null;
  vpnIp: string | null;
  calisiyor: boolean;
  yerel: Ping;
  vpn: Ping | null;
  yaziciBulundu: boolean;
  eslesenYazici: string | null;
  urlacl: boolean;
  guvenlikDuvari: boolean;
  baslangic: boolean;
};

const VARSAYILAN_PORT = 5556;

/**
 * Pusula X yazdırma yardımcısı (PusulaXPrintAgent) — terminaldeki Pusula X, VPN üzerinden bu bilgisayarın
 * yazıcısına (RFID etiket) yazdırır. Eskiden elle kopyalanıp Başlangıç'a eklenirdi; artık buradan kurulur:
 * yazıcı + port seçilir → Kur (port izni ve güvenlik duvarı için bir kez yönetici izni) → Windows açılışında başlar.
 */
export function YaziciAjaniBolumu() {
  const [d, setD] = useState<AjanDurum | null>(null);
  const [yazici, setYazici] = useState("");
  const [port, setPort] = useState(String(VARSAYILAN_PORT));
  const [portSonuc, setPortSonuc] = useState<PortSonuc | null>(null);
  const [test, setTest] = useState<TestSonuc | null>(null);
  const [bekle, setBekle] = useState<null | "yukle" | "kur" | "test" | "kaldir">("yukle");
  const [hata, setHata] = useState<string | null>(null);
  const [kopyalandi, setKopyalandi] = useState(false);
  const ilk = useRef(true);

  const yukle = async () => {
    setBekle("yukle");
    try {
      const s = await api<AjanDurum>("/yazici/durum", {});
      setD(s);
      if (ilk.current) {
        ilk.current = false;
        setYazici(s.yazici ?? "");
        setPort(String(s.port || VARSAYILAN_PORT));
      }
    } catch (e) {
      setHata((e as Error).message);
    } finally {
      setBekle(null);
    }
  };

  useEffect(() => {
    void yukle();
  }, []);

  // Port yazıldıkça (kısa gecikmeyle) boş mu diye bakılır; doluysa boş bir port önerilir.
  const portNo = Number(port);
  const portGecerli = Number.isInteger(portNo) && portNo >= 1024 && portNo <= 65535;
  useEffect(() => {
    setPortSonuc(null);
    if (!portGecerli) return;
    const id = window.setTimeout(() => {
      api<PortSonuc>("/yazici/port", { port: portNo }).then(setPortSonuc).catch(() => {});
    }, 400);
    return () => window.clearTimeout(id);
  }, [port]);

  const calistir = async (ne: "kur" | "test" | "kaldir") => {
    setBekle(ne);
    setHata(null);
    try {
      if (ne === "kaldir") {
        setD(await api<AjanDurum>("/yazici/kaldir", {}));
        setTest(null);
      } else {
        setTest(await api<TestSonuc>(ne === "kur" ? "/yazici/kur" : "/yazici/test", ne === "kur" ? { yazici, port: portNo } : {}));
        setD(await api<AjanDurum>("/yazici/durum", {}));
      }
    } catch (e) {
      setHata((e as Error).message);
    } finally {
      setBekle(null);
    }
  };

  const yazicilar = d ? (yazici && !d.yazicilar.includes(yazici) ? [yazici, ...d.yazicilar] : d.yazicilar) : [];
  const degisti = !!d?.kurulu && (yazici !== (d.yazici ?? "") || portNo !== d.port);
  const portDolu = portSonuc && !portSonuc.bos;
  const adres = d?.vpnIp ?? null;

  const durumRozeti = !d ? null : !d.kurulu ? (
    <Badge variant="outline">Kurulu değil</Badge>
  ) : d.calisiyor ? (
    <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">Çalışıyor</Badge>
  ) : (
    <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-400">Çalışmıyor</Badge>
  );

  return (
    <Bolum baslik="Pusula X yazdırma yardımcısı" aciklama="RFID / etiket yazdırma">
      <div className="flex items-center gap-3 px-4 py-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground [&_svg]:size-4">
          <Printer />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">Yazdırma yardımcısı</div>
          <div className="text-xs text-muted-foreground">
            {!d
              ? "Durum okunuyor…"
              : d.kurulu
                ? `${d.yazici ?? "—"} · port ${d.port}${d.baslangic ? " · Windows açılışında başlar" : ""}`
                : "Pusula X'in bu bilgisayardaki yazıcıya yazdırabilmesi için kurun."}
          </div>
        </div>
        <div className="shrink-0">{durumRozeti}</div>
      </div>

      <div className="flex flex-col gap-3 px-4 py-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <Label className="text-xs">Yazıcı</Label>
            <div className="flex gap-1.5">
              <Select value={yazici} onValueChange={setYazici} disabled={!d}>
                <SelectTrigger className="min-w-0 flex-1">
                  <SelectValue placeholder={d && d.yazicilar.length === 0 ? "Yüklü yazıcı yok" : "Yazıcı seçin"} />
                </SelectTrigger>
                <SelectContent>
                  {yazicilar.map((y) => (
                    <SelectItem key={y} value={y}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button size="icon" variant="outline" aria-label="Yazıcı listesini yenile" disabled={bekle === "yukle"} onClick={() => void yukle()}>
                <RefreshCw className={bekle === "yukle" ? "animate-spin" : undefined} />
              </Button>
            </div>
          </div>
          <div className="flex w-28 flex-col gap-1.5">
            <Label className="text-xs">Port</Label>
            <Input value={port} inputMode="numeric" maxLength={5} onChange={(e) => setPort(e.target.value.replace(/\D/g, ""))} className="font-mono" />
          </div>
        </div>

        {!portGecerli && port !== "" && <p className="text-xs text-destructive">Port 1024–65535 arasında olmalı.</p>}
        {portDolu && (
          <div className="flex flex-wrap items-center gap-2 rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
            <CircleAlert className="size-3.5 shrink-0" />
            <span className="flex-1">Port {portSonuc.port} başka bir uygulama tarafından kullanılıyor.</span>
            {portSonuc.oneri && (
              <Button size="sm" variant="outline" className="h-7" onClick={() => setPort(String(portSonuc.oneri))}>
                {portSonuc.oneri} kullan
              </Button>
            )}
          </div>
        )}
        {portSonuc?.ajan && !d?.bizimki && (
          <p className="text-xs text-muted-foreground">Bu portta elle kurulmuş yazdırma yardımcısı çalışıyor; kurulumda durdurulup yerine bu kurulum geçer.</p>
        )}
        {d && d.eskiKurulum.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Elle yapılmış eski kurulum bulundu ({d.eskiKurulum.join(", ")}). Kurulumda devre dışı bırakılır, dosyalar silinmez.
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={!d || !yazici || !portGecerli || !!portDolu || !!bekle || (d.kurulu && !degisti)} onClick={() => void calistir("kur")}>
            {bekle === "kur" ? <Loader2 className="animate-spin" /> : <Wrench />} {d?.kurulu ? "Ayarları uygula" : "Kur"}
          </Button>
          <Button size="sm" variant="outline" disabled={!d?.kurulu || !!bekle} onClick={() => void calistir("test")}>
            {bekle === "test" ? <Loader2 className="animate-spin" /> : <Zap />} Test et
          </Button>
          {d?.kurulu && (
            <Button
              size="sm"
              variant="outline"
              className="ml-auto text-red-600 hover:text-red-600 dark:text-red-400"
              disabled={!!bekle}
              onClick={() => void calistir("kaldir")}
            >
              {bekle === "kaldir" ? <Loader2 className="animate-spin" /> : <Trash2 />} Kaldır
            </Button>
          )}
        </div>
        {bekle === "kur" && <p className="text-xs text-muted-foreground">Kuruluyor… Port izni ve güvenlik duvarı için Windows yönetici izni isteyebilir.</p>}
        {hata && <p className="text-xs text-destructive">{hata}</p>}

        {test && (
          <ul className="flex flex-col gap-1.5 rounded-md border bg-muted/30 p-3 text-xs">
            <Sonuc ok={test.yerel.ok} metin={test.yerel.ok ? `Yardımcı yanıt veriyor (port ${test.port}, ${test.yerel.ms} ms)` : `Yardımcı yanıt vermiyor: ${test.yerel.hata ?? "bilinmiyor"}`} />
            {test.vpn && (
              <Sonuc ok={test.vpn.ok} metin={test.vpn.ok ? `VPN adresinden erişiliyor (${test.vpnIp})` : `VPN adresinden erişilemiyor (${test.vpnIp}): ${test.vpn.hata ?? ""}`} />
            )}
            {!test.vpnIp && <Sonuc ok={null} metin="VPN bağlı değil — Pusula X'in erişimi VPN bağlanınca denenebilir." />}
            <Sonuc ok={test.yaziciBulundu} metin={test.yaziciBulundu ? `Yazıcı bulundu: ${test.eslesenYazici}` : `Yazıcı bulunamadı: ${test.yazici ?? "—"}`} />
            <Sonuc ok={test.urlacl} metin={test.urlacl ? "Ağ izni (URL ACL) kayıtlı" : "Ağ izni yok — yalnız bu bilgisayardan erişilebilir"} />
            <Sonuc ok={test.guvenlikDuvari} metin={test.guvenlikDuvari ? `Güvenlik duvarında port ${test.port} açık` : `Güvenlik duvarı kuralı yok (port ${test.port})`} />
            <Sonuc ok={test.baslangic} metin={test.baslangic ? "Windows açılışında başlar" : "Başlangıçta kayıtlı değil"} />
          </ul>
        )}

        {adres && d?.kurulu && (
          <div className="flex items-center gap-2 rounded-md border px-3 py-2 text-xs">
            <span className="text-muted-foreground">Pusula X yazıcı IP adresi</span>
            <span className="flex-1 truncate font-mono font-medium">{adres}</span>
            <Button
              size="sm"
              variant="ghost"
              className="h-7"
              onClick={() => {
                void navigator.clipboard?.writeText(adres).then(() => {
                  setKopyalandi(true);
                  window.setTimeout(() => setKopyalandi(false), 1500);
                });
              }}
            >
              {kopyalandi ? <Check /> : <Copy />} {kopyalandi ? "Kopyalandı" : "Kopyala"}
            </Button>
          </div>
        )}
      </div>
    </Bolum>
  );
}

function Sonuc({ ok, metin }: { ok: boolean | null; metin: string }) {
  return (
    <li className="flex items-start gap-2">
      {ok === null ? (
        <CircleAlert className="mt-px size-3.5 shrink-0 text-muted-foreground" />
      ) : ok ? (
        <Check className="mt-px size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
      ) : (
        <X className="mt-px size-3.5 shrink-0 text-red-600 dark:text-red-400" />
      )}
      <span>{metin}</span>
    </li>
  );
}
