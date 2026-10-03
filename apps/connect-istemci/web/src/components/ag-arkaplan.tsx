import { useEffect, useRef } from "react";

/**
 * Orta panelin arka planı: yavaşça süzülen düğümler, yakın olanlar arasında ince bağlar ve
 * bağlar boyunca akan "paketler". Renk temadan (currentColor) gelir; bağlıyken yeşile döner.
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

    type Dugum = { x: number; y: number; vx: number; vy: number; r: number; faz: number };
    type Paket = { a: number; b: number; t: number; hiz: number };
    let w = 0, h = 0, dpr = 1;
    let dugumler: Dugum[] = [];
    let paketler: Paket[] = [];
    const MESAFE = 150;

    const kur = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      const r = cv.getBoundingClientRect();
      w = r.width; h = r.height;
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const adet = Math.max(28, Math.min(110, Math.round((w * h) / 9000)));
      // Mevcut düğümler korunur (boyut değişince sıçramasın), eksik/fazla tamamlanır
      dugumler = dugumler.filter((d) => d.x <= w && d.y <= h).slice(0, adet);
      while (dugumler.length < adet) {
        const aci = Math.random() * Math.PI * 2, hiz = 0.08 + Math.random() * 0.18;
        dugumler.push({ x: Math.random() * w, y: Math.random() * h, vx: Math.cos(aci) * hiz, vy: Math.sin(aci) * hiz, r: 1.4 + Math.random() * 1.8, faz: Math.random() * Math.PI * 2 });
      }
      paketler = [];
    };

    let renk = "", sonRenk = 0;
    const renkOku = (z: number) => {
      if (z - sonRenk < 500 && renk) return renk;
      sonRenk = z;
      renk = getComputedStyle(cv).color;
      return renk;
    };

    let kare = 0, onceki = 0, calisiyor = true;
    const ciz = (z: number) => {
      const dt = onceki ? Math.min(50, z - onceki) / 16.67 : 1;
      onceki = z;
      ctx.clearRect(0, 0, w, h);
      ctx.strokeStyle = ctx.fillStyle = renkOku(z);
      const bagli = bagliRef.current;

      for (const d of dugumler) {
        d.x += d.vx * dt; d.y += d.vy * dt;
        if (d.x < -20) d.x = w + 20; else if (d.x > w + 20) d.x = -20;
        if (d.y < -20) d.y = h + 20; else if (d.y > h + 20) d.y = -20;
      }

      // bağlar
      const kenarlar: [number, number][] = [];
      ctx.lineWidth = 1;
      for (let i = 0; i < dugumler.length; i++) {
        const a = dugumler[i];
        for (let j = i + 1; j < dugumler.length; j++) {
          const b = dugumler[j];
          const dx = a.x - b.x, dy = a.y - b.y, m = Math.hypot(dx, dy);
          if (m > MESAFE) continue;
          kenarlar.push([i, j]);
          ctx.globalAlpha = (1 - m / MESAFE) * 0.4;
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        }
      }

      // düğümler (hafif nabız)
      for (const d of dugumler) {
        ctx.globalAlpha = 0.55 + 0.25 * Math.sin(z / 900 + d.faz);
        ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2); ctx.fill();
      }

      // paketler: bağlıyken daha sık akar
      if (!azHareket && kenarlar.length && paketler.length < (bagli ? 14 : 6) && Math.random() < (bagli ? 0.12 : 0.04) * dt) {
        const [a, b] = kenarlar[(Math.random() * kenarlar.length) | 0];
        paketler.push(Math.random() < 0.5 ? { a, b, t: 0, hiz: 0.008 + Math.random() * 0.01 } : { a: b, b: a, t: 0, hiz: 0.008 + Math.random() * 0.01 });
      }
      paketler = paketler.filter((p) => {
        p.t += p.hiz * dt;
        const a = dugumler[p.a], b = dugumler[p.b];
        if (!a || !b || p.t >= 1 || Math.hypot(a.x - b.x, a.y - b.y) > MESAFE * 1.2) return false;
        const x = a.x + (b.x - a.x) * p.t, y = a.y + (b.y - a.y) * p.t;
        const iz = 0.12; // kuyruk
        const x0 = a.x + (b.x - a.x) * Math.max(0, p.t - iz), y0 = a.y + (b.y - a.y) * Math.max(0, p.t - iz);
        const g = ctx.createLinearGradient(x0, y0, x, y);
        g.addColorStop(0, "transparent"); g.addColorStop(1, renk);
        ctx.globalAlpha = 0.95 * Math.sin(Math.PI * p.t);
        ctx.strokeStyle = g; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x, y); ctx.stroke();
        ctx.beginPath(); ctx.arc(x, y, 1.8, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = renk; ctx.lineWidth = 1;
        return true;
      });
      ctx.globalAlpha = 1;

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
      className={`pointer-events-none absolute inset-0 size-full transition-colors duration-1000 [mask-image:radial-gradient(ellipse_at_center,black_55%,transparent_100%)] ${bagli ? "text-emerald-500" : "text-muted-foreground"}`}
    />
  );
}
