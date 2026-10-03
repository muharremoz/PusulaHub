import { useEffect, useRef } from "react";

/**
 * Orta panelin arka planı: fiber optik gibi soldan sağa akıp kıvrılan ışık çizgileri.
 * Çizgiler bir demet halinde dalgalanır (demet ortada daralır, uçlarda açılır); her çizginin
 * üzerinde parlak ışık izleri akar. Bağlıyken yeşil–camgöbeği ve hızlı, değilken gri ve sakin.
 * Pencere gizliyken durur; "hareketi azalt" açıksa tek kare çizer.
 */
export function AgArkaplan({ bagli }: { bagli: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const bagliRef = useRef(bagli);
  bagliRef.current = bagli;

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const azHareket = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const BAGLI = ["#10b981", "#14b8a6", "#06b6d4", "#22d3ee", "#34d399"];
    const BEKLE = ["#94a3b8", "#64748b", "#a1a1aa", "#7c8aa5"];

    type Isik = { x: number; hiz: number; boy: number };
    type Cizgi = { o: number; f1: number; f2: number; k1: number; k2: number; a1: number; a2: number; renk: number; kalin: number; isiklar: Isik[] };
    let w = 0, h = 0;
    let cizgiler: Cizgi[] = [];

    const isikYap = (bas = false): Isik => ({ x: bas ? Math.random() * w : -Math.random() * w * 0.6, hiz: 1.4 + Math.random() * 2.2, boy: 90 + Math.random() * 160 });

    const kur = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const r = cv.getBoundingClientRect();
      w = r.width; h = r.height;
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const adet = Math.max(14, Math.min(28, Math.round(h / 32)));
      cizgiler = Array.from({ length: adet }, (_, i) => ({
        o: (i / (adet - 1)) * 2 - 1 + (Math.random() - 0.5) * 0.08,
        f1: Math.random() * Math.PI * 2,
        f2: Math.random() * Math.PI * 2,
        k1: ((1.2 + Math.random() * 0.8) * Math.PI * 2) / w,
        k2: ((2.5 + Math.random() * 1.5) * Math.PI * 2) / w,
        a1: 14 + Math.random() * 26,
        a2: 4 + Math.random() * 10,
        renk: i,
        kalin: 0.8 + Math.random() * 0.9,
        isiklar: Array.from({ length: 1 + (Math.random() < 0.5 ? 1 : 0) }, () => isikYap(true)),
      }));
    };

    /** Çizginin x'teki yüksekliği: demet + iki dalga, zamanla akar. */
    const y = (c: Cizgi, x: number, t: number) => {
      const demet = 0.4 + 0.6 * Math.pow(Math.abs(Math.cos((x / w - 0.5) * Math.PI * 0.95 + Math.sin(t * 0.00015) * 0.4)), 1.4);
      return h / 2 + c.o * h * 0.3 * demet + c.a1 * Math.sin(x * c.k1 - t * 0.0006 + c.f1) + c.a2 * Math.sin(x * c.k2 + t * 0.0011 + c.f2);
    };

    let kare = 0, onceki = 0, calisiyor = true, hizCarpan = 1;
    const ADIM = 10;
    const ciz = (t: number) => {
      const dt = onceki ? Math.min(50, t - onceki) / 16.67 : 1;
      onceki = t;
      const bagli = bagliRef.current;
      const palet = bagli ? BAGLI : BEKLE;
      hizCarpan += ((bagli ? 1.6 : 0.7) - hizCarpan) * 0.03 * dt; // durum değişince yumuşak geçiş
      const koyu = document.documentElement.classList.contains("dark") || window.matchMedia("(prefers-color-scheme: dark)").matches;

      ctx.clearRect(0, 0, w, h);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      // 1) taban çizgileri: ince, soluk
      ctx.globalCompositeOperation = "source-over";
      for (const c of cizgiler) {
        ctx.strokeStyle = palet[c.renk % palet.length];
        ctx.globalAlpha = koyu ? 0.16 : 0.2;
        ctx.lineWidth = c.kalin;
        ctx.beginPath();
        for (let x = -ADIM; x <= w + ADIM; x += ADIM) {
          if (x === -ADIM) ctx.moveTo(x, y(c, x, t));
          else ctx.lineTo(x, y(c, x, t));
        }
        ctx.stroke();
      }

      // 2) ışık izleri: çizgi boyunca akan parlak parçalar (koyu temada toplamalı parlama)
      ctx.globalCompositeOperation = koyu ? "lighter" : "source-over";
      for (const c of cizgiler) {
        const renk = palet[c.renk % palet.length];
        for (const s of c.isiklar) {
          if (!azHareket) s.x += s.hiz * hizCarpan * dt;
          if (s.x - s.boy > w) Object.assign(s, isikYap());
          const bas = s.x, son = s.x - s.boy;
          if (bas < 0) continue;
          const g = ctx.createLinearGradient(son, 0, bas, 0);
          g.addColorStop(0, renk + "00");
          g.addColorStop(0.8, renk + "cc");
          g.addColorStop(1, renk);
          ctx.strokeStyle = g;
          ctx.shadowColor = renk;
          ctx.shadowBlur = koyu ? 12 : 6;
          ctx.globalAlpha = bagli ? 0.95 : 0.6;
          ctx.lineWidth = c.kalin + 1.2;
          ctx.beginPath();
          const x0 = Math.max(-ADIM, son);
          ctx.moveTo(x0, y(c, x0, t));
          for (let x = x0 + 4; x < bas; x += 4) ctx.lineTo(x, y(c, x, t));
          ctx.lineTo(bas, y(c, bas, t));
          ctx.stroke();
          // ucunda parlak nokta
          ctx.shadowBlur = koyu ? 16 : 8;
          ctx.fillStyle = renk;
          ctx.beginPath();
          ctx.arc(bas, y(c, bas, t), c.kalin + 1, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";

      if (calisiyor && !azHareket) kare = requestAnimationFrame(ciz);
    };

    const ro = new ResizeObserver(() => { kur(); if (azHareket) ciz(performance.now()); });
    ro.observe(cv);
    kur();
    kare = requestAnimationFrame(ciz);

    const gorunurluk = () => {
      if (document.hidden) { calisiyor = false; cancelAnimationFrame(kare); }
      else if (!calisiyor) { calisiyor = true; onceki = 0; kare = requestAnimationFrame(ciz); }
    };
    document.addEventListener("visibilitychange", gorunurluk);
    return () => { calisiyor = false; cancelAnimationFrame(kare); ro.disconnect(); document.removeEventListener("visibilitychange", gorunurluk); };
  }, []);

  return (
    <canvas
      ref={ref}
      aria-hidden
      className="pointer-events-none absolute inset-0 size-full [mask-image:linear-gradient(to_right,transparent,black_12%,black_88%,transparent)]"
    />
  );
}
