"use client"

/**
 * Pusula Connect 2 — kullanıcının kayıtlı bilgisayarları (firma sayfasındaki kullanıcı menüsünden).
 * Telefon kaybolursa "2FA sıfırla", bilgisayar kaybolursa "Cihazı iptal et".
 */

import { useCallback, useEffect, useState } from "react"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@muharremoz/pusula-ui"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "sonner"
import { Laptop, ShieldCheck, ShieldOff } from "lucide-react"
import type { ConnectCihaz } from "@/lib/connect-kodu"

/** Servis zamanları SQLite datetime('now') = UTC "YYYY-MM-DD HH:MM:SS". */
function tarih(s: string | null) {
  if (!s) return "—"
  const d = new Date(s.replace(" ", "T") + "Z")
  return isNaN(d.getTime()) ? s : d.toLocaleString("sv-SE", { timeZone: "Europe/Istanbul" }).slice(0, 16)
}

export function ConnectCihazlarDialog({ firkod, kullanici, onClose }: { firkod: string; kullanici: string | null; onClose: () => void }) {
  const [cihazlar, setCihazlar] = useState<ConnectCihaz[] | null>(null)
  const [hata, setHata] = useState<string | null>(null)
  const [onay, setOnay] = useState<{ cihaz: ConnectCihaz; islem: "2fa-sifirla" | "iptal" } | null>(null)
  const [bekle, setBekle] = useState(false)

  const yukle = useCallback(async () => {
    if (!kullanici) return
    setHata(null)
    try {
      const r = await fetch(`/api/companies/${firkod}/connect-cihazlar?kullanici=${encodeURIComponent(kullanici)}`, { cache: "no-store" })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d?.error ?? `HTTP ${r.status}`)
      setCihazlar(d.cihazlar ?? [])
    } catch (e) {
      setHata(e instanceof Error ? e.message : "Cihazlar alınamadı")
    }
  }, [firkod, kullanici])

  useEffect(() => {
    setCihazlar(null)
    void yukle()
  }, [yukle])

  const uygula = async () => {
    if (!onay) return
    setBekle(true)
    try {
      const r = await fetch(`/api/companies/${firkod}/connect-cihazlar/${onay.cihaz.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ islem: onay.islem }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d?.error ?? `HTTP ${r.status}`)
      toast.success(onay.islem === "2fa-sifirla" ? "İki adımlı doğrulama sıfırlandı" : "Cihaz iptal edildi", {
        description: onay.islem === "2fa-sifirla" ? "Kullanıcı bir sonraki açılışta oturum şifresini yeniden girer." : "Bu bilgisayar artık bağlanamaz.",
      })
      setOnay(null)
      await yukle()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "İşlem yapılamadı")
    } finally {
      setBekle(false)
    }
  }

  return (
    <>
      <Dialog open={!!kullanici} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="sm:max-w-[720px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Laptop className="size-4" />Connect 2 cihazları</DialogTitle>
            <DialogDescription>
              <span className="font-mono">{kullanici}</span> kullanıcısının Pusula Connect kurulu bilgisayarları.
            </DialogDescription>
          </DialogHeader>

          {hata ? (
            <p className="text-[13px] text-red-600 dark:text-red-400">{hata}</p>
          ) : !cihazlar ? (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-8 w-full rounded-[5px]" />
              <Skeleton className="h-8 w-full rounded-[5px]" />
            </div>
          ) : cihazlar.length === 0 ? (
            <p className="text-muted-foreground py-6 text-center text-[13px]">
              Bu kullanıcı henüz Connect 2 kurmadı. Kullanıcı menüsünden <b>Connect 2 Kurulum Kodu</b> üretip gönderin.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-[5px] border">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="text-muted-foreground border-b bg-[var(--section-bg)] text-[10px] font-medium tracking-wider uppercase">
                    <th className="px-3 py-1.5 text-left font-medium">Bilgisayar</th>
                    <th className="px-3 py-1.5 text-left font-medium">Sürüm</th>
                    <th className="px-3 py-1.5 text-left font-medium">Son görülme</th>
                    <th className="px-3 py-1.5 text-left font-medium">2FA</th>
                    <th className="px-3 py-1.5 text-right font-medium">İşlem</th>
                  </tr>
                </thead>
                <tbody>
                  {cihazlar.map((c) => (
                    <tr key={c.id} className="border-b last:border-0 hover:bg-muted/20">
                      <td className="px-3 py-1.5 whitespace-nowrap">
                        <div className="font-medium">{c.makine || "—"}</div>
                        <div className="text-muted-foreground text-[11px]">İlk giriş {tarih(c.ilkGiris)}</div>
                      </td>
                      <td className="px-3 py-1.5 font-mono whitespace-nowrap">{c.surum || "—"}</td>
                      <td className="px-3 py-1.5 whitespace-nowrap tabular-nums">{tarih(c.sonGorulme)}</td>
                      <td className="px-3 py-1.5 whitespace-nowrap">
                        {c.iptal ? (
                          <span className="inline-flex rounded-[5px] bg-red-500/15 px-2 py-0.5 text-[11px] font-medium text-red-700 dark:text-red-400">İptal</span>
                        ) : c.ikiAdim ? (
                          <span className="inline-flex items-center gap-1 rounded-[5px] bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                            <ShieldCheck className="size-3" />Açık
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-[12px]">Kapalı</span>
                        )}
                      </td>
                      <td className="px-3 py-1.5 text-right whitespace-nowrap">
                        {!c.iptal && (
                          <div className="flex justify-end gap-1.5">
                            {c.ikiAdim && (
                              <Button size="sm" variant="outline" className="h-7 text-[12px]" onClick={() => setOnay({ cihaz: c, islem: "2fa-sifirla" })}>
                                <ShieldOff className="size-3.5" />2FA sıfırla
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-[12px] text-rose-600 hover:text-rose-600"
                              onClick={() => setOnay({ cihaz: c, islem: "iptal" })}
                            >
                              İptal et
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!onay} onOpenChange={(o) => !o && !bekle && setOnay(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {onay?.islem === "2fa-sifirla" ? "İki adımlı doğrulama sıfırlansın mı?" : "Cihaz iptal edilsin mi?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {onay?.islem === "2fa-sifirla"
                ? `${onay.cihaz.makine ?? "Bu bilgisayar"} için doğrulama kodu artık sorulmaz. Kullanıcı oturum şifresini yeniden girer ve isterse 2FA'yı yeni telefonla tekrar açar.`
                : `${onay?.cihaz.makine ?? "Bu bilgisayar"} Pusula'ya bir daha bağlanamaz. Kullanıcıya yeni bir kurulum kodu gerekir.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bekle}>Vazgeç</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-white" disabled={bekle} onClick={(e) => { e.preventDefault(); void uygula() }}>
              {onay?.islem === "2fa-sifirla" ? "2FA sıfırla" : "İptal et"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
