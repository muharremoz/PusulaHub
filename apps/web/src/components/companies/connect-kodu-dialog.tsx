"use client"

/**
 * Pusula Connect 2 kurulum kodu penceresi — firma sayfasındaki kullanıcı menüsünden.
 * Kod yalnız şimdi görünür; müşteri mesajı (indirme adresi + kod) tek tıkla kopyalanır.
 */

import { useEffect, useState } from "react"
import {
  AlertDialog, AlertDialogAction, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@muharremoz/pusula-ui"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { copyToClipboard } from "@/lib/clipboard"
import { toast } from "sonner"
import { Copy, KeyRound } from "lucide-react"

export function ConnectKoduDialog({ firkod, kullanici, onClose }: { firkod: string; kullanici: string | null; onClose: () => void }) {
  const [sonuc, setSonuc] = useState<{ kod: string; indir: string } | null>(null)
  const [hata, setHata] = useState<string | null>(null)

  useEffect(() => {
    if (!kullanici) return
    setSonuc(null)
    setHata(null)
    fetch(`/api/companies/${firkod}/connect-kodu`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kullanici }),
    })
      .then(async (r) => {
        const d = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(d?.error ?? `Kod üretilemedi (HTTP ${r.status})`)
        setSonuc(d)
      })
      .catch((e) => setHata(e instanceof Error ? e.message : "Kod üretilemedi"))
  }, [firkod, kullanici])

  const mesaj = sonuc
    ? `Pusula'ya bağlanmak için:\n1) Pusula Connect'i indirin: ${sonuc.indir}\n2) Çalıştırın ve kurulum kodunu girin: ${sonuc.kod}\n` +
      `(Kod 7 gün geçerli, tek kullanımlık.)`
    : ""

  return (
    <AlertDialog open={!!kullanici} onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2"><KeyRound className="size-4" />Pusula Connect kurulum kodu</AlertDialogTitle>
          <AlertDialogDescription>
            <span className="font-mono">{kullanici}</span> için. Kod 7 gün geçerli ve tek kullanımlık; yalnız şimdi görünür.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {hata ? (
          <p className="text-[13px] text-red-600 dark:text-red-400">{hata}</p>
        ) : !sonuc ? (
          <Skeleton className="mx-auto h-12 w-56 rounded-[5px]" />
        ) : (
          <>
            <div className="flex items-center justify-center gap-2 py-1">
              <span className="rounded-[5px] border bg-muted/40 px-4 py-2 font-mono text-2xl font-semibold tracking-[0.2em]">{sonuc.kod}</span>
              <Button variant="outline" size="icon" aria-label="Kopyala" onClick={async () => { if (await copyToClipboard(sonuc.kod)) toast.success("Kod kopyalandı") }}>
                <Copy className="size-4" />
              </Button>
            </div>
            <div className="rounded-[5px] border bg-[var(--section-bg)] px-3 py-2 text-[12px]">
              <div className="text-muted-foreground mb-1">Uygulama indirme adresi</div>
              <a href={sonuc.indir} className="font-mono underline underline-offset-2" target="_blank" rel="noreferrer">{sonuc.indir}</a>
            </div>
          </>
        )}
        <AlertDialogFooter>
          {sonuc && (
            <Button variant="outline" onClick={async () => { if (await copyToClipboard(mesaj)) toast.success("Müşteri mesajı kopyalandı", { description: "İndirme adresi + kod" }) }}>
              <Copy className="size-4" />Müşteri mesajını kopyala
            </Button>
          )}
          <AlertDialogAction onClick={onClose}>Tamam</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
