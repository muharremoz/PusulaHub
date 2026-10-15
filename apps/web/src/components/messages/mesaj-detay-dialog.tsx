"use client"

import { useEffect, useMemo, useState } from "react"
import { ClipboardList, Copy, Mail, Server } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { AnketSonuclari } from "@/components/messages/anket-sonuclari"
import type { Anket } from "@/lib/anket"
import { cn } from "@/lib/utils"
import {
  ALICI_TIPI, DURUM, OncelikRozeti, TIP, tarihYaz,
  type MessageItem, type RecipientItem,
} from "@/components/messages/mesaj-ortak"

type AliciFiltre = "tumu" | "okudu" | "okumadi" | "hata"

/**
 * Gönderilen mesajın ayrıntısı — üste sabit pencere (Yeni Mesaj ile aynı dil). Alıcılar
 * okudu / okumadı / hata diye süzülür; başarısız alıcının hata mesajı görünür.
 * "Benzerini gönder" aynı içerikle Yeni Mesaj penceresini açar.
 */
export function MesajDetayDialog({
  mesaj, onClose, onBenzeri,
}: {
  mesaj:     MessageItem | null
  onClose:   () => void
  onBenzeri: (m: MessageItem) => void
}) {
  const [alicilar, setAlicilar] = useState<RecipientItem[]>([])
  const [anket,    setAnket]    = useState<Anket | null>(null)
  const [yukleniyor, setYukleniyor] = useState(false)
  const [filtre,   setFiltre]   = useState<AliciFiltre>("tumu")

  useEffect(() => {
    if (!mesaj) { setAlicilar([]); setAnket(null); return }
    let iptal = false
    setYukleniyor(true); setFiltre("tumu")
    fetch(`/api/messages/${mesaj.id}`)
      .then((r) => r.json())
      .then((d) => { if (!iptal) { setAlicilar(d.recipients ?? []); setAnket(d.message?.survey ?? null) } })
      .catch(() => {})
      .finally(() => { if (!iptal) setYukleniyor(false) })
    return () => { iptal = true }
  }, [mesaj])

  const sayilar = useMemo(() => ({
    tumu:    alicilar.length,
    okudu:   alicilar.filter((a) => a.status === "read").length,
    okumadi: alicilar.filter((a) => a.status === "delivered" || a.status === "pending").length,
    hata:    alicilar.filter((a) => a.status === "failed").length,
  }), [alicilar])

  const gorunen = alicilar.filter((a) =>
    filtre === "tumu" ? true
    : filtre === "okudu" ? a.status === "read"
    : filtre === "okumadi" ? a.status === "delivered" || a.status === "pending"
    : a.status === "failed",
  )

  const bilgi = (etiket: string, deger: React.ReactNode) => (
    <div className="min-w-0">
      <div className="text-muted-foreground text-[11px]">{etiket}</div>
      <div className="truncate text-[13px] font-medium">{deger}</div>
    </div>
  )

  return (
    <Dialog open={!!mesaj} onOpenChange={(o) => { if (!o) onClose() }}>
      {/* Üste sabit: alıcı filtresi değişince yükseklik değişiyor, pencere zıplamasın */}
      <DialogContent className="top-[8vh] translate-y-0 grid-cols-1 gap-0 p-0 sm:max-w-[720px]">
        <DialogHeader className="flex-row items-center gap-3 space-y-0 border-b bg-[var(--section-bg)] px-5 py-4">
          <span className="bg-primary/10 text-primary ring-primary/20 flex size-9 shrink-0 items-center justify-center rounded-[5px] ring-1">
            <Mail className="size-[18px]" />
          </span>
          <div className="min-w-0">
            <DialogTitle className="truncate text-[15px] font-semibold">{mesaj?.subject ?? "Mesaj"}</DialogTitle>
            <DialogDescription className="text-[12px]">{mesaj ? `${tarihYaz(mesaj.sentAt)} · ${mesaj.senderName}` : ""}</DialogDescription>
          </div>
        </DialogHeader>

        {mesaj && (
          <div className="max-h-[68vh] min-w-0 space-y-4 overflow-y-auto px-5 py-4">
            {/* Mesaj */}
            <div className="bg-card rounded-[5px] border p-3">
              <div className="mb-2 flex flex-wrap items-center gap-1.5">
                <OncelikRozeti p={mesaj.priority} />
                <span className="bg-muted text-muted-foreground inline-flex rounded-[5px] px-2 py-0.5 text-[11px] font-medium">{TIP[mesaj.type]}</span>
                {mesaj.isSurvey && (
                  <span className="inline-flex items-center gap-1 rounded-[5px] bg-violet-500/15 px-2 py-0.5 text-[11px] font-medium text-violet-700 dark:text-violet-400">
                    <ClipboardList className="size-3" /> Anket
                  </span>
                )}
              </div>
              <p className="text-[13px] whitespace-pre-wrap">{mesaj.body}</p>
            </div>

            {/* Bilgiler — yan yana */}
            <div className="grid grid-cols-4 gap-3 rounded-[5px] bg-[var(--section-bg)] px-3 py-2.5">
              {bilgi("Alıcı", mesaj.recipientType === "company" ? (mesaj.companyName ?? "Firma") : ALICI_TIPI[mesaj.recipientType])}
              {bilgi("Gönderen", mesaj.senderName)}
              {bilgi("Gönderim", <span className="tabular-nums">{tarihYaz(mesaj.sentAt)}</span>)}
              {bilgi("Okunma", <span className="tabular-nums">{mesaj.readCount}<span className="text-muted-foreground font-normal">/{mesaj.totalCount}</span></span>)}
            </div>

            {/* Anket sonuçları */}
            {anket && (
              <div>
                <div className="text-muted-foreground mb-1.5 text-[10px] font-medium tracking-wider uppercase">Anket sonuçları</div>
                <AnketSonuclari
                  key={mesaj.id}
                  anket={anket}
                  alicilar={alicilar.map((r) => ({ username: r.username, serverName: r.serverName, readAt: r.readAt, answers: r.answers ?? null }))}
                />
              </div>
            )}

            {/* Alıcılar */}
            <div>
              <div className="text-muted-foreground mb-1.5 flex items-center justify-between gap-3">
                <span className="text-[10px] font-medium tracking-wider uppercase">Alıcılar</span>
                <ToggleGroup
                  type="single" value={filtre} onValueChange={(v) => v && setFiltre(v as AliciFiltre)}
                  variant="outline" size="sm"
                >
                  {([["tumu", "Tümü"], ["okudu", "Okudu"], ["okumadi", "Okumadı"], ["hata", "Hata"]] as const).map(([k, ad]) => (
                    <ToggleGroupItem key={k} value={k} className="h-7 gap-1.5 px-2.5 text-[12px]">
                      {ad} <span className="text-muted-foreground tabular-nums">{sayilar[k]}</span>
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </div>
              <div className="bg-card divide-y overflow-hidden rounded-[5px] border">
                {yukleniyor ? (
                  Array.from({ length: 5 }).map((_, i) => <div key={i} className="px-3 py-2"><Skeleton className="h-4 w-full rounded-[5px]" /></div>)
                ) : gorunen.length === 0 ? (
                  <p className="text-muted-foreground px-3 py-6 text-center text-[12px]">
                    {alicilar.length === 0 ? "Alıcı kaydı yok." : "Bu filtrede alıcı yok."}
                  </p>
                ) : gorunen.map((r) => (
                  <div key={r.id} className="px-3 py-2">
                    <div className="flex items-center gap-2.5">
                      <span title={DURUM[r.status]?.label}>{DURUM[r.status]?.ikon}</span>
                      <span className="min-w-0 flex-1 truncate font-mono text-[13px] font-medium">{r.username}</span>
                      <span className="text-muted-foreground flex w-36 shrink-0 items-center gap-1 truncate text-[12px]">
                        <Server className="size-3 shrink-0" /> {r.serverName ?? "—"}
                      </span>
                      <span className="text-muted-foreground w-28 shrink-0 text-right text-[11px] tabular-nums">
                        {tarihYaz(r.readAt ?? r.deliveredAt) || DURUM[r.status]?.label}
                      </span>
                    </div>
                    {r.status === "failed" && r.errorMessage && (
                      <p className={cn("mt-1 pl-6 text-[11px] break-words text-rose-600 dark:text-rose-400")}>{r.errorMessage}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 border-t px-5 py-3">
          <Button variant="outline" size="sm" onClick={onClose} className="h-8 rounded-[5px] text-[12px]">Kapat</Button>
          {mesaj && (
            <Button size="sm" onClick={() => onBenzeri(mesaj)} className="h-8 gap-1.5 rounded-[5px] text-[12px]">
              <Copy className="size-3.5" /> Benzerini gönder
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
