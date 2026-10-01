import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { api } from "@/api";
import pusulaLogo from "@/assets/pusula-logo.png";

/** Ortalanmış giriş kartı — giriş, bağlantı ve bekleme ekranları. */
export function Kabuk({ children, genis }: { children: ReactNode; genis?: boolean }) {
  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/40 p-6">
      <div className={`w-full ${genis ? "max-w-lg" : "max-w-sm"} rounded-xl border bg-card p-8 shadow-sm`}>
        {children}
        <img src={pusulaLogo} alt="Pusula Yazılım" className="mx-auto mt-8 h-7 w-auto select-none opacity-80" draggable={false} />
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
