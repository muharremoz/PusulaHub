import { useState } from "react";
import { AlertCircle, Database, Loader2, ScanSearch } from "lucide-react";
import { api, type Durum } from "@/api";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Kabuk } from "./ortak";

type P = { durum: Durum; setDurum: (d: Durum) => void };

/** SQL bağlandı (ya da atlandı); tarama kullanıcı isteyince başlar. */
export function TaramaEkrani({ durum, setDurum }: P) {
  const [bekle, setBekle] = useState(false);
  const [hata, setHata] = useState<string | null>(null);

  const cagir = async (yol: string) => {
    setBekle(true);
    setHata(null);
    try {
      setDurum(await api<Durum>(yol, {}));
    } catch (e) {
      setHata((e as Error).message);
    } finally {
      setBekle(false);
    }
  };

  return (
    <Kabuk genis>
      <div className="flex flex-col gap-5">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="mb-1 flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <ScanSearch className="size-6" />
          </div>
          <div className="text-xs text-muted-foreground">Aktarım · {durum.oturum?.firmaId}</div>
          <h1 className="text-xl font-semibold tracking-tight">{durum.oturum?.firmaAdi}</h1>
        </div>

        <div className="flex items-center gap-3 rounded-lg border bg-muted/40 px-4 py-3">
          <Database className="size-5 shrink-0 text-muted-foreground" />
          <div className="min-w-0 text-sm">
            {durum.sql ? (
              <>
                <div className="font-medium">SQL Server bağlı</div>
                <div className="truncate font-mono text-xs text-muted-foreground">{durum.sql.sunucu}</div>
              </>
            ) : (
              <>
                <div className="font-medium">SQL olmadan</div>
                <div className="text-xs text-muted-foreground">Yalnız resim, program ve dosyalar taranır.</div>
              </>
            )}
          </div>
        </div>

        <p className="text-sm text-muted-foreground">
          Tarama bu bilgisayardaki veritabanlarını, resim ve program klasörlerini bulur. Birkaç dakika sürebilir; Pusula
          programını kullanmanız engellenmez.
        </p>

        {(hata || durum.mesaj) && (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertDescription>{hata ?? durum.mesaj}</AlertDescription>
          </Alert>
        )}

        <div className="flex flex-col gap-2">
          <Button size="lg" disabled={bekle} onClick={() => void cagir("/kesif/yenile")}>
            {bekle ? <Loader2 className="animate-spin" /> : <ScanSearch />} Taramayı başlat
          </Button>
          <Button variant="outline" disabled={bekle} onClick={() => void cagir("/sql/giris")}>
            {durum.sql ? "SQL sunucusunu değiştir" : "SQL Server'a bağlan"}
          </Button>
        </div>
      </div>
    </Kabuk>
  );
}
