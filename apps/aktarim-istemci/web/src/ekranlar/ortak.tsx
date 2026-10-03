import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { api } from "@/api";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import pusulaLogo from "@/assets/pusula-logo.png";

/** Ortalanmış giriş kartı — giriş, bağlantı ve bekleme ekranları. altLogo: üstte ParlayanLogo varsa alttaki küçük logo gizlenir. */
export function Kabuk({ children, genis, altLogo = true }: { children: ReactNode; genis?: boolean; altLogo?: boolean }) {
  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/40 p-6">
      <div className={`w-full ${genis ? "max-w-lg" : "max-w-sm"} rounded-xl border bg-card p-8 shadow-sm`}>
        {children}
        {altLogo && <img src={pusulaLogo} alt="Pusula Yazılım" className="mx-auto mt-8 h-7 w-auto select-none opacity-80" draggable={false} />}
      </div>
    </div>
  );
}

/** Pusula logosu + üzerinden geçen ışık (Connect ile aynı). Işık logonun şekliyle maskelenir, dışına taşmaz. */
export function ParlayanLogo({ yukseklik = "h-14" }: { yukseklik?: string }) {
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
          className={`relative ${yukseklik} w-auto drop-shadow-[0_0_10px_rgba(255,255,255,0.35)] select-none`}
          draggable={false}
        />
        <div className="pointer-events-none absolute inset-0 overflow-hidden" style={maske} aria-hidden>
          <div className="logo-parlama absolute inset-y-0 -left-1/2 w-1/2 bg-gradient-to-r from-transparent via-white/80 to-transparent" />
        </div>
      </div>
    </div>
  );
}

export function Bekleme({ baslik, alt, aksiyon }: { baslik: string; alt?: string | null; aksiyon?: React.ReactNode }) {
  return (
    <Kabuk>
      <div className="flex flex-col items-center gap-3 text-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
        <h1 className="text-lg font-semibold">{baslik}</h1>
        {alt && <p className="text-sm text-muted-foreground">{alt}</p>}
        {aksiyon && <div className="mt-3">{aksiyon}</div>}
      </div>
    </Kabuk>
  );
}

export function AnahtarYok() {
  return (
    <Kabuk>
      <p className="text-center text-sm text-muted-foreground">
        Bu sayfa Pusula Aktarım uygulamasından açılmalı. Uygulamayı kapatıp yeniden başlatın.
      </p>
    </Kabuk>
  );
}

export const cikisYap = () => api("/cikis", {}).catch(() => {});

export const mb = (x: number) =>
  x >= 1024 ? `${(x / 1024).toLocaleString("tr", { maximumFractionDigits: 1 })} GB` : `${x.toLocaleString("tr", { maximumFractionDigits: 0 })} MB`;

/**
 * shadcn ipucu — native `title` yerine. Çocuk tek bir eleman olmalı (asChild).
 * `metin` boşsa ipucu hiç kurulmaz.
 */
export function Ipucu({ metin, children }: { metin?: ReactNode; children: ReactNode }) {
  if (!metin) return <>{children}</>;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent className="max-w-md break-all">{metin}</TooltipContent>
    </Tooltip>
  );
}
