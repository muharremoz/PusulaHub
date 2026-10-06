import { useCallback, useEffect, useState } from "react";
import { Bildirim } from "@/Bildirim";
import { exedenDinle, exeIcinde, exeyeGonder, type ExeVerisi, type MesajTuru, type SayfaMesaji } from "@/kopru";
import { cn } from "@/lib/utils";
import type { Anket } from "@/anket";

export function App() {
  return exeIcinde() ? <ExeModu /> : <Onizleme />;
}

/** Exe içinde: veriyi bekle, gelince kartı göster. */
function ExeModu() {
  const [veri, setVeri] = useState<ExeVerisi | null>(null);
  const [anahtar, setAnahtar] = useState(0);

  useEffect(() => {
    exedenDinle((v) => {
      document.documentElement.classList.toggle("dark", v.koyu);
      setVeri(v);
      setAnahtar((a) => a + 1); // ertelemeden dönüşte animasyon yeniden oynasın
    });
    exeyeGonder({ tur: "hazir" });
  }, []);

  return veri ? <Bildirim key={anahtar} veri={veri} gonder={exeyeGonder} /> : null;
}

/* ── Tarayıcı önizlemesi (npm run dev) ─────────────────────────────── */

const ORNEK_UZUN = `Değerli Müşterimiz,

Sizlere daha iyi hizmet verebilmek adına, bugün 06.10.2026 Salı'yı 07.10.2026 Çarşamba'ya bağlayan gece, saat 23:00 – 01:00 arasında sunucularımızda planlı bakım çalışması gerçekleştirilecektir. Bu süre boyunca sunuculara bağlantı sağlanamayacaktır.

Veri kaybı yaşamamanız için lütfen saat 23:00'ten önce açık dosya ve kayıtlarınızı kaydedip oturumunuzu kapatınız. Bakım sonrasında sisteme her zamanki gibi giriş yapabilirsiniz.

Yaşanacak kesinti nedeniyle özür diler, anlayışınız için teşekkür ederiz.

Saygılarımızla,
Pusula Yazılım`;

const ORNEK_ANKET: Anket = {
  sorular: [
    { id: "s1", tip: "puan", soru: "Sunucu hizmetimizi genel olarak nasıl puanlarsınız?", zorunlu: true },
    { id: "s2", tip: "tek", soru: "Bağlantı hızından memnun musunuz?", secenekler: ["Memnunum", "Kararsızım", "Memnun değilim"], zorunlu: true },
    { id: "s3", tip: "coklu", soru: "En çok hangi konularda sorun yaşıyorsunuz?", secenekler: ["Yavaşlık", "Bağlantı kopması", "Yazıcı", "Oturum açma"], zorunlu: false },
    { id: "s4", tip: "metin", soru: "Eklemek istedikleriniz", zorunlu: false },
  ],
};

const ORNEK_KISA = "Pusula programında yeni sürüm yayınlandı. Programı kapatıp yeniden açtığınızda güncelleme otomatik yüklenecektir.";

function Onizleme() {
  const [tur, setTur] = useState<MesajTuru>("warning");
  const [uzun, setUzun] = useState(true);
  const [koyu, setKoyu] = useState(false);
  const [anket, setAnket] = useState(false);
  const [tekrar, setTekrar] = useState(0);
  const [son, setSon] = useState<string>("—");

  useEffect(() => {
    document.documentElement.classList.toggle("dark", koyu);
  }, [koyu]);

  const gonder = useCallback((m: SayfaMesaji) => {
    if (m.tur === "boyut" || m.tur === "hazir") return;
    setSon(JSON.stringify(m));
    setTimeout(() => setTekrar((x) => x + 1), 900); // kapandıktan sonra yeniden göster
  }, []);

  const veri: ExeVerisi = {
    tur: "mesaj",
    kullanici: "6865.anka1",
    koyu,
    mesaj: {
      msgId: "onizleme",
      title: anket ? "Memnuniyet anketi" : tur === "urgent" ? "Sunucu 5 dakika içinde yeniden başlatılacak" : uzun ? "Planlı Bakım Çalışması" : "Yazılım güncellemesi",
      body: anket ? "Hizmetimizi geliştirebilmek için birkaç sorumuzu yanıtlar mısınız? Yaklaşık 1 dakika sürer." : tur === "urgent" ? "Lütfen açık kayıtlarınızı hemen kaydedip programdan çıkınız." : uzun ? ORNEK_UZUN : ORNEK_KISA,
      survey: anket ? ORNEK_ANKET : null,
      type: tur,
      from: "Pusula Yazılım",
      sentAt: new Date().toISOString(),
    },
  };

  const secenek = (aktif: boolean) =>
    cn("rounded-md px-2.5 py-1 text-[12px] font-medium transition", aktif ? "bg-white text-black" : "text-white/70 hover:text-white");

  return (
    // Sahte masaüstü: popup'ın gerçek ekranda nasıl duracağını görmek için
    <div className="relative h-screen w-screen overflow-hidden bg-[linear-gradient(135deg,#1e3a5f_0%,#2d5f8a_45%,#7aa7c7_100%)]">
      <div className="absolute top-4 left-4 flex flex-wrap items-center gap-3 rounded-xl bg-black/45 p-2 text-white backdrop-blur">
        <div className="flex gap-1 rounded-lg bg-white/10 p-0.5">
          {(["info", "warning", "urgent"] as const).map((x) => (
            <button key={x} className={secenek(tur === x)} onClick={() => { setTur(x); setTekrar((k) => k + 1); }}>
              {x === "info" ? "Bilgi" : x === "warning" ? "Uyarı" : "Acil"}
            </button>
          ))}
        </div>
        <div className="flex gap-1 rounded-lg bg-white/10 p-0.5">
          <button className={secenek(uzun)} onClick={() => { setUzun(true); setTekrar((k) => k + 1); }}>Uzun metin</button>
          <button className={secenek(!uzun)} onClick={() => { setUzun(false); setTekrar((k) => k + 1); }}>Kısa metin</button>
        </div>
        <div className="flex gap-1 rounded-lg bg-white/10 p-0.5">
          <button className={secenek(!anket)} onClick={() => { setAnket(false); setTekrar((k) => k + 1); }}>Mesaj</button>
          <button className={secenek(anket)} onClick={() => { setAnket(true); setTur("info"); setTekrar((k) => k + 1); }}>Anket</button>
        </div>
        <div className="flex gap-1 rounded-lg bg-white/10 p-0.5">
          <button className={secenek(!koyu)} onClick={() => setKoyu(false)}>Açık</button>
          <button className={secenek(koyu)} onClick={() => setKoyu(true)}>Koyu</button>
        </div>
        <button className="rounded-md bg-white/15 px-2.5 py-1 text-[12px] hover:bg-white/25" onClick={() => setTekrar((k) => k + 1)}>
          Yeniden oynat
        </button>
        <span className="text-[11px] text-white/60">exe'ye giden: {son}</span>
      </div>

      {/* Görev çubuğu */}
      <div className="absolute inset-x-0 bottom-0 h-12 bg-black/55 backdrop-blur" />

      <div className={cn("absolute", tur === "urgent" ? "inset-0 flex items-center justify-center" : "right-2 bottom-14")}>
        <Bildirim key={`${tur}-${uzun}-${anket}-${tekrar}`} veri={veri} gonder={gonder} />
      </div>
    </div>
  );
}
