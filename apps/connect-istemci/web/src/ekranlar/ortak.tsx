import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { api } from "@/api";
import pusulaLogo from "@/assets/pusula-logo.png";

/** Ortalanmış giriş kartı — giriş, bağlantı ve bekleme ekranları. */
/** Destek formu (PusulaWeb-v2 /destek-talebi). ?firmaid=<firkod> ile firma adı, yetkili ve telefon CRM'den dolar. */
export const TALEP_ADRESI = "https://talep.pusulanet.net";
export const talepAdresi = (firmaId?: string) => (firmaId ? `${TALEP_ADRESI}/?firmaid=${encodeURIComponent(firmaId)}` : TALEP_ADRESI);

export function OrtaBaslik({ sol, baslik, sag }: { sol?: ReactNode; baslik: string; sag?: ReactNode }) {
  return (
    <header className="grid h-16 shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-3 border-b bg-card px-6">
      <div className="flex justify-start">{sol}</div>
      <h1 className="text-base font-semibold">{baslik}</h1>
      <div className="flex justify-end">{sag}</div>
    </header>
  );
}

export function Kabuk({ children, genis }: { children: ReactNode; genis?: boolean }) {
  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/40 p-6">
      <div className={`w-full ${genis ? "max-w-lg" : "max-w-sm"} rounded-xl border bg-card p-8 shadow-sm`}>
        <div className="mb-6">
          <ParlayanLogo />
        </div>
        {children}
      </div>
    </div>
  );
}

export function Bekleme({ baslik, alt }: { baslik: string; alt?: string | null }) {
  return (
    <Kabuk>
      <div className="flex flex-col items-center gap-3 text-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
        <h1 className="text-lg font-semibold">{baslik}</h1>
        {alt && <p className="text-sm text-muted-foreground">{alt}</p>}
      </div>
    </Kabuk>
  );
}

export function AnahtarYok() {
  return (
    <Kabuk>
      <p className="text-center text-sm text-muted-foreground">
        Bu sayfa Pusula Connect uygulamasından açılmalı. Uygulamayı kapatıp yeniden başlatın.
      </p>
    </Kabuk>
  );
}

export const cikisYap = () => api("/cikis", {}).catch(() => {});

export const mb = (x: number) =>
  x >= 1024 ? `${(x / 1024).toLocaleString("tr", { maximumFractionDigits: 1 })} GB` : `${x.toLocaleString("tr", { maximumFractionDigits: 0 })} MB`;

/** Pusula logosu: ortada, büyük; arkada yumuşak ışıma, üzerinden aralıklı ışık geçer (logo şekline maskeli). */
export function ParlayanLogo() {
  const maske = {
    WebkitMaskImage: `url(${pusulaLogo})`, maskImage: `url(${pusulaLogo})`,
    WebkitMaskSize: "contain", maskSize: "contain",
    WebkitMaskRepeat: "no-repeat", maskRepeat: "no-repeat",
    WebkitMaskPosition: "center", maskPosition: "center",
  } as React.CSSProperties;
  return (
    <div className="flex justify-center">
      <div className="relative">
        <div className="absolute inset-0 -z-0 scale-125 rounded-full bg-primary/10 blur-xl" aria-hidden />
        <img
          src={pusulaLogo}
          alt="Pusula Yazılım"
          className="relative h-14 w-auto drop-shadow-[0_0_10px_rgba(255,255,255,0.35)] select-none"
          draggable={false}
        />
        <div className="pointer-events-none absolute inset-0 overflow-hidden" style={maske} aria-hidden>
          <div className="logo-parlama absolute inset-y-0 -left-1/2 w-1/2 bg-gradient-to-r from-transparent via-white/80 to-transparent" />
        </div>
      </div>
    </div>
  );
}
