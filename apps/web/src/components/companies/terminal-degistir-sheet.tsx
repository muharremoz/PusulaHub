"use client"

/**
 * Firmanın terminal (RDP) sunucusunu değiştir — Firmalar › Erişim Bilgileri › Sunucular.
 * Hedef seçilince ön kontrol (/api/companies/<firkod>/terminal-degistir?hedef=) çalışır; engel yoksa
 * taşıma başlatılır ve adımlar SSE ile izlenir. Atama en son değişir; eski klasör silinmez.
 */
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { AlertTriangle, ArrowRight, CheckCircle2, Loader2, Server, XCircle } from "lucide-react"
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@muharremoz/pusula-ui"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Combobox } from "@/components/ui/combobox"
import { Checkbox, Field } from "@/components/shared/form"

interface Secenek { id: string; name: string; ip: string }
interface Kontrol {
  eski: { id: string; ad: string; ip: string }
  hedef: { id: string; ad: string; ip: string }
  kaynak: { dosya: number; bayt: number; alt: string[]; firmanoBak: string[]; masaustu: string | null }
  hedefDurum: { var: boolean; oge: number; isaret: boolean; bosBayt: number }
  oturumlar: { kullanici: string; durum: string }[]
  engeller: string[]
  uyarilar: string[]
}
interface Adim { stepId: string; label: string; status: "running" | "done" | "error"; output?: string; error?: string }

const mb = (b: number) => (b >= 1073741824 ? `${(b / 1073741824).toFixed(1)} GB` : `${Math.round(b / 1048576)} MB`)

export function TerminalDegistirSheet({
  open, onOpenChange, firkod, firmaAdi, onBitti,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  firkod: string
  firmaAdi: string
  onBitti?: () => void
}) {
  const [secenekler, setSecenekler] = useState<Secenek[] | null>(null)
  const [mevcut, setMevcut] = useState<string | null>(null)
  const [hedef, setHedef] = useState<string | undefined>()
  const [kontrol, setKontrol] = useState<Kontrol | null>(null)
  const [kontrolHata, setKontrolHata] = useState<string | null>(null)
  const [kontrolYukleniyor, setKontrolYukleniyor] = useState(false)
  const [oturumRagmen, setOturumRagmen] = useState(false)
  const [onay, setOnay] = useState(false)
  const [adimlar, setAdimlar] = useState<Adim[]>([])
  const [calisiyor, setCalisiyor] = useState(false)
  const [sonuc, setSonuc] = useState<"tamam" | "hata" | null>(null)
  const [hata, setHata] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setHedef(undefined); setKontrol(null); setKontrolHata(null); setAdimlar([]); setSonuc(null); setHata(null); setOturumRagmen(false)
    fetch(`/api/companies/${firkod}/server-options`).then((r) => r.json()).then((d: { windowsServerId?: string | null; rdpServers?: Secenek[] }) => {
      setMevcut(d.windowsServerId ?? null)
      setSecenekler(d.rdpServers ?? [])
    }).catch(() => setSecenekler([]))
  }, [open, firkod])

  useEffect(() => {
    if (!hedef) return
    let iptal = false
    setKontrol(null); setKontrolHata(null); setKontrolYukleniyor(true)
    fetch(`/api/companies/${firkod}/terminal-degistir?hedef=${encodeURIComponent(hedef)}`)
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`); return j as Kontrol })
      .then((k) => { if (!iptal) setKontrol(k) })
      .catch((e) => { if (!iptal) setKontrolHata(e instanceof Error ? e.message : String(e)) })
      .finally(() => { if (!iptal) setKontrolYukleniyor(false) })
    return () => { iptal = true }
  }, [hedef, firkod])

  const mevcutAd = secenekler?.find((s) => s.id === mevcut)?.name ?? "—"
  const hedefler = (secenekler ?? []).filter((s) => s.id !== mevcut)
  const baslatilabilir = !!kontrol && kontrol.engeller.length === 0 && (kontrol.oturumlar.length === 0 || oturumRagmen) && !calisiyor && sonuc !== "tamam"

  async function baslat() {
    setOnay(false); setCalisiyor(true); setAdimlar([]); setSonuc(null); setHata(null)
    try {
      const r = await fetch(`/api/companies/${firkod}/terminal-degistir`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hedefId: hedef, oturumlarRagmen: oturumRagmen }),
      })
      if (!r.ok || !r.body) { const j = await r.json().catch(() => ({})); throw new Error(j.error ?? `HTTP ${r.status}`) }
      const okuyucu = r.body.getReader()
      const dec = new TextDecoder()
      let tampon = ""
      let bitti: "tamam" | "hata" | null = null
      for (;;) {
        const { value, done } = await okuyucu.read()
        if (done) break
        tampon += dec.decode(value, { stream: true })
        const parcalar = tampon.split("\n\n"); tampon = parcalar.pop() ?? ""
        for (const p of parcalar) {
          const ev = /^event: (.+)$/m.exec(p)?.[1]
          const veri = /^data: (.+)$/m.exec(p)?.[1]
          if (!ev || !veri) continue
          const d = JSON.parse(veri)
          if (ev === "step") setAdimlar((l) => { const i = l.findIndex((a) => a.stepId === d.stepId); if (i < 0) return [...l, d]; const k = [...l]; k[i] = d; return k })
          else if (ev === "done") bitti = "tamam"
          else if (ev === "error") { bitti = "hata"; setHata(d.error) }
        }
      }
      setSonuc(bitti ?? "hata")
      if (bitti === "tamam") { toast.success("Terminal sunucusu değiştirildi", { description: `${firmaAdi} → ${kontrol?.hedef.ad}` }); onBitti?.() }
      else if (!bitti) setHata("Bağlantı koptu — sunucudaki işlem sürüyor olabilir; birkaç dakika sonra Erişim Bilgileri'ni yenileyin")
    } catch (e) {
      setSonuc("hata"); setHata(e instanceof Error ? e.message : String(e))
    } finally {
      setCalisiyor(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!calisiyor) onOpenChange(v) }}>
      <SheetContent className="!w-[560px] !max-w-[560px]">
        <SheetHeader>
          <span className="bg-primary/10 text-primary ring-primary/20 flex size-9 shrink-0 items-center justify-center rounded-[5px] ring-1">
            <Server className="size-[18px]" />
          </span>
          <SheetTitle>Terminal sunucusunu değiştir</SheetTitle>
          <SheetDescription>{firkod} · {firmaAdi}</SheetDescription>
        </SheetHeader>

        <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
          <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
            <Field label="Şu anki sunucu">
              <div className="bg-muted/40 flex h-8 items-center rounded-[5px] border px-2.5 text-[13px]">{secenekler ? mevcutAd : <Skeleton className="h-4 w-24" />}</div>
            </Field>
            <ArrowRight className="text-muted-foreground mb-2 size-4" />
            <Field label="Yeni sunucu" required>
              <Combobox
                items={hedefler}
                getKey={(s) => s.id}
                getLabel={(s) => `${s.name} · ${s.ip}`}
                value={hedef}
                onChange={(v) => setHedef(v ?? undefined)}
                placeholder="Sunucu seç…"
                disabled={!secenekler || calisiyor || sonuc === "tamam"}
                loading={!secenekler}
              />
            </Field>
          </div>

          {kontrolYukleniyor && (
            <div className="flex flex-col gap-2 rounded-[5px] border p-3">
              <Skeleton className="h-4 w-1/2" /><Skeleton className="h-4 w-3/4" /><Skeleton className="h-4 w-2/3" />
              <p className="text-muted-foreground text-[11px]">İki sunucuda kontrol yapılıyor (klasör boyutu, erişim, oturumlar)…</p>
            </div>
          )}
          {kontrolHata && <div className="rounded-[5px] bg-red-500/10 px-3 py-2 text-[12px] text-red-700 dark:text-red-400">{kontrolHata}</div>}

          {kontrol && (
            <div className="flex flex-col gap-2">
              <div className="grid grid-cols-3 gap-2 text-center">
                <Ozet ad="Dosya" deger={kontrol.kaynak.dosya.toLocaleString("tr-TR")} />
                <Ozet ad="Boyut" deger={mb(kontrol.kaynak.bayt)} />
                <Ozet ad="Hedefte boş" deger={mb(kontrol.hedefDurum.bosBayt)} />
              </div>
              <div className="rounded-[5px] border px-3 py-2 text-[12px]">
                <div className="text-muted-foreground text-[10px] font-medium tracking-wider uppercase">Taşınacak</div>
                <ul className="mt-1 flex flex-col gap-0.5">
                  <li><span className="font-mono">C:\MUSTERI\{firkod}</span> — {kontrol.kaynak.alt.join(", ") || "alt klasör yok"}</li>
                  {kontrol.kaynak.firmanoBak.length > 0 && <li>firmano.bak yeni sunucuda yeniden üretilir: {kontrol.kaynak.firmanoBak.join(", ")}</li>}
                  {kontrol.kaynak.masaustu && <li>Yönetici masaüstündeki kısayol klasörü</li>}
                  <li>NTFS yetkileri ({firkod}_users), sonra firmanın sunucu ataması</li>
                  <li className="text-muted-foreground">Eski klasör silinmez: <span className="font-mono">{firkod}.tasindi-…</span> olarak yeniden adlandırılır</li>
                </ul>
              </div>
              {kontrol.engeller.map((e) => (
                <div key={e} className="flex items-start gap-2 rounded-[5px] bg-red-500/10 px-3 py-2 text-[12px] text-red-700 dark:text-red-400"><XCircle className="mt-px size-3.5 shrink-0" />{e}</div>
              ))}
              {kontrol.uyarilar.map((u) => (
                <div key={u} className="flex items-start gap-2 rounded-[5px] bg-amber-500/10 px-3 py-2 text-[12px] text-amber-800 dark:text-amber-300"><AlertTriangle className="mt-px size-3.5 shrink-0" />{u}</div>
              ))}
              {kontrol.oturumlar.length > 0 && (
                <div className="rounded-[5px] border px-3 py-2 text-[12px]">
                  <div className="text-muted-foreground text-[10px] font-medium tracking-wider uppercase">Açık oturumlar ({kontrol.eski.ad})</div>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {kontrol.oturumlar.map((o) => <span key={o.kullanici} className="bg-muted rounded-[5px] px-2 py-0.5 text-[11px]">{o.kullanici} · {o.durum === "Active" ? "etkin" : "bağlantısız"}</span>)}
                  </div>
                  <label className="mt-2 flex items-center gap-2"><Checkbox checked={oturumRagmen} onCheckedChange={setOturumRagmen} /> Oturumlara rağmen taşı</label>
                </div>
              )}
              <p className="text-muted-foreground text-[11px]">
                Taşınmaz: kullanıcıların eski sunucudaki profil dosyaları (masaüstü, belgeler). VPN'de firmaya sunucu bazlı izin
                tanımlıysa yeni sunucu için de açılmalı. Connect uygulamaları yeni sunucuyu birkaç dakika içinde kendiliğinden alır.
              </p>
            </div>
          )}

          {adimlar.length > 0 && (
            <ul className="flex flex-col gap-1.5 rounded-[5px] border p-3 text-[12px]">
              {adimlar.map((a) => (
                <li key={a.stepId} className="flex items-start gap-2">
                  {a.status === "running" ? <Loader2 className="text-muted-foreground mt-px size-3.5 shrink-0 animate-spin" />
                    : a.status === "done" ? <CheckCircle2 className="mt-px size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    : <XCircle className="mt-px size-3.5 shrink-0 text-red-600 dark:text-red-400" />}
                  <div className="min-w-0">
                    <div>{a.label}</div>
                    {a.output && <div className="text-muted-foreground text-[11px]">{a.output}</div>}
                    {a.error && <div className="text-[11px] break-words text-red-700 dark:text-red-400">{a.error}</div>}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {hata && sonuc === "hata" && <div className="rounded-[5px] bg-red-500/10 px-3 py-2 text-[12px] text-red-700 dark:text-red-400">{hata}</div>}
          {sonuc === "tamam" && <div className="rounded-[5px] bg-emerald-500/15 px-3 py-2 text-[12px] text-emerald-700 dark:text-emerald-400">Taşıma tamamlandı. Firma artık {kontrol?.hedef.ad} üzerinde.</div>}
        </div>

        <SheetFooter className="flex-row">
          <Button variant="outline" className="flex-1" disabled={calisiyor} onClick={() => onOpenChange(false)}>{sonuc === "tamam" ? "Kapat" : "İptal"}</Button>
          {sonuc !== "tamam" && (
            <Button className="flex-1" disabled={!baslatilabilir} onClick={() => setOnay(true)}>
              {calisiyor ? <><Loader2 className="size-3.5 animate-spin" /> Taşınıyor…</> : sonuc === "hata" ? "Yeniden dene" : "Taşımayı başlat"}
            </Button>
          )}
        </SheetFooter>
      </SheetContent>

      <AlertDialog open={onay} onOpenChange={setOnay}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Terminal sunucusu değişsin mi?</AlertDialogTitle>
            <AlertDialogDescription>
              {firmaAdi} ({firkod}): {kontrol?.eski.ad} → {kontrol?.hedef.ad}. Dosyalar kopyalanır, kopya doğrulanınca firma yeni
              sunucuya atanır ve eski klasör yeniden adlandırılır. Taşıma bitene kadar firma kullanıcıları programı kullanmamalı.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Vazgeç</AlertDialogCancel>
            <AlertDialogAction onClick={() => void baslat()}>Taşımayı başlat</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sheet>
  )
}

function Ozet({ ad, deger }: { ad: string; deger: string }) {
  return (
    <div className="rounded-[5px] border px-2 py-1.5">
      <div className="text-[15px] font-semibold tabular-nums">{deger}</div>
      <div className="text-muted-foreground text-[10px] tracking-wider uppercase">{ad}</div>
    </div>
  )
}
