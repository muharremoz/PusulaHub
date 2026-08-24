"use client"

/**
 * Sol üst kimlik bloğu.
 *
 * Kürenin altındaki "PUSULA" yazısını kaldırmıştık; kimlik oraya sıkışmak
 * yerine ekranın alt ortasına, kendi alanına taşındı.
 *
 * ── Parlama ────────────────────────────────────────────────────────────
 * Başlıktaki ışık, metnin ÜSTÜNDE bir katman değil: gradyan doğrudan yazının
 * içine kırpılıyor (`background-clip: text`) ve gradyanın konumu yavaşça
 * kayıyor. Böylece harflerin üstünden ışık geçiyormuş gibi duruyor, ayrı bir
 * parlama katmanı çizilmiyor.
 *
 * Döngü 9 saniye ve tamamen CSS — kare başına JavaScript maliyeti yok.
 * Yavaş tutuldu: 7/24 açık kalan ekranda hızlı bir parlama yorucu olurdu.
 *
 * Genel durum göstergesi burada değil: kendi ağırlığı olsun diye sol alta,
 * `status-line` bileşenine ayrıldı.
 */

const FLOW    = "#7DD3FC"
const TXT_DIM = "#8B8B93"

export function BrandMark() {
  return (
    <div className="pointer-events-none absolute bottom-8 left-1/2 -translate-x-1/2 select-none text-center">
      <style>{`
        @keyframes brand-sheen {
          from { background-position: 220% 0; }
          to   { background-position: -120% 0; }
        }
        .brand-title {
          background-image: linear-gradient(
            100deg,
            #C7CBD2 0%,
            #C7CBD2 38%,
            #FFFFFF 46%,
            #7DD3FC 54%,
            #C7CBD2 62%,
            #C7CBD2 100%
          );
          background-size: 300% 100%;
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
          animation: brand-sheen 9s linear infinite;
        }
      `}</style>

      <div
        className="brand-title text-[30px] font-bold leading-none"
        style={{ letterSpacing: "0.42em" }}
      >
        PUSULA
      </div>

      {/* Sağa doğru sönen ince çizgi — bloğu kapatmadan sınır çiziyor */}
      {/* Ortalanmış blokta çizgi iki uca doğru sönmeli — tek yöne sönseydi
          blok sola/sağa kaymış gibi görünürdü. */}
      <div
        className="mx-auto mt-3 h-px w-[260px]"
        style={{
          background: `linear-gradient(90deg, rgba(255,255,255,0) 0%, ${FLOW}70 50%, rgba(255,255,255,0) 100%)`,
        }}
      />

      {/*
        Son satır, sol alttaki durum bloğunun etiketleriyle AYNI ölçüde
        (8px / 0.22em). İkisi de `bottom-8` hizasında olduğu için alt
        kenarları çakışıyor; yazı boyutu da eşit olunca göz iki bloğu tek
        satır üstünde görüyor.
      */}
      <div
        className="mt-3 text-[8px] font-medium uppercase"
        style={{ color: TXT_DIM, letterSpacing: "0.22em" }}
      >
        DevOps İzleme Merkezi
      </div>

    </div>
  )
}
