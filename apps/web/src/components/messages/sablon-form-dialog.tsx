"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Bookmark, Check } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/combobox-select"
import { Field } from "@/components/shared/form"
import { ONCELIK, type MessageTemplate, type MsgPriority, type MsgType } from "@/components/messages/mesaj-ortak"

/** Şablon ekle / düzenle. `initial` null → yeni (POST), dolu → düzenle (PATCH). */
export function SablonFormDialog({
  open, initial, onClose, onSaved,
}: {
  open:    boolean
  initial: MessageTemplate | null
  onClose: () => void
  onSaved: () => void
}) {
  const duzenle = initial !== null
  const [baslik,   setBaslik]   = useState("")
  const [aciklama, setAciklama] = useState("")
  const [konu,     setKonu]     = useState("")
  const [metin,    setMetin]    = useState("")
  const [tip,      setTip]      = useState<MsgType>("info")
  const [oncelik,  setOncelik]  = useState<MsgPriority>("normal")
  const [kaydediliyor, setKaydediliyor] = useState(false)

  useEffect(() => {
    if (!open) return
    setBaslik(initial?.title ?? ""); setAciklama(initial?.description ?? "")
    setKonu(initial?.subject ?? ""); setMetin(initial?.body ?? "")
    setTip(initial?.type ?? "info"); setOncelik(initial?.priority ?? "normal")
  }, [open, initial])

  async function kaydet() {
    if (!baslik.trim()) { toast.error("Başlık zorunlu"); return }
    if (!konu.trim())   { toast.error("Konu zorunlu"); return }
    if (!metin.trim())  { toast.error("Mesaj metni zorunlu"); return }
    setKaydediliyor(true)
    try {
      const r = await fetch(duzenle ? `/api/messages/templates/${initial!.id}` : "/api/messages/templates", {
        method:  duzenle ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ title: baslik.trim(), description: aciklama.trim(), subject: konu.trim(), body: metin.trim(), type: tip, priority: oncelik }),
      })
      if (!r.ok) {
        const d = await r.json().catch(() => ({}))
        toast.error(d.error ?? (duzenle ? "Güncellenemedi" : "Eklenemedi")); return
      }
      toast.success(duzenle ? "Şablon güncellendi" : "Şablon eklendi")
      onSaved()
    } catch {
      toast.error("Sunucu hatası")
    } finally {
      setKaydediliyor(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !kaydediliyor) onClose() }}>
      <DialogContent className="top-[8vh] translate-y-0 grid-cols-1 gap-0 p-0 sm:max-w-[560px]">
        <DialogHeader className="flex-row items-center gap-3 space-y-0 border-b bg-[var(--section-bg)] px-5 py-4">
          <span className="bg-primary/10 text-primary ring-primary/20 flex size-9 shrink-0 items-center justify-center rounded-[5px] ring-1">
            <Bookmark className="size-[18px]" />
          </span>
          <div className="min-w-0">
            <DialogTitle className="text-[15px] font-semibold">{duzenle ? "Şablonu düzenle" : "Yeni şablon"}</DialogTitle>
            <DialogDescription className="text-[12px]">Yeni Mesaj penceresindeki "Hazır mesaj" listesinde görünür.</DialogDescription>
          </div>
        </DialogHeader>

        <div className="max-h-[68vh] min-w-0 space-y-3 overflow-y-auto px-5 py-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Başlık" required>
              <Input value={baslik} onChange={(e) => setBaslik(e.target.value)} placeholder="Örn. Planlı bakım" className="h-8 rounded-[5px] text-[13px]" />
            </Field>
            <Field label="Açıklama">
              <Input value={aciklama} onChange={(e) => setAciklama(e.target.value)} placeholder="Listede ikinci satır" className="h-8 rounded-[5px] text-[13px]" />
            </Field>
            <Field label="Mesaj tipi">
              <Select value={tip} onValueChange={(v) => setTip(v as MsgType)}>
                <SelectTrigger className="h-8 w-full rounded-[5px] text-[13px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="info">Bilgi</SelectItem>
                  <SelectItem value="warning">Uyarı</SelectItem>
                  <SelectItem value="urgent">Acil</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Öncelik">
              <Select value={oncelik} onValueChange={(v) => setOncelik(v as MsgPriority)}>
                <SelectTrigger className="h-8 w-full rounded-[5px] text-[13px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(ONCELIK) as MsgPriority[]).map((p) => <SelectItem key={p} value={p}>{ONCELIK[p].label}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field label="Konu" required>
            <Input value={konu} onChange={(e) => setKonu(e.target.value)} placeholder="Mesaj konusu" className="h-8 rounded-[5px] text-[13px]" />
          </Field>
          <Field label="Mesaj" required hint="[SAAT], [SÜRE] gibi yer tutucular kullanabilirsiniz.">
            <Textarea value={metin} onChange={(e) => setMetin(e.target.value)} rows={5} placeholder="Mesaj metni" className="min-h-28 resize-none" />
          </Field>
        </div>

        <div className="flex items-center justify-end gap-2 border-t px-5 py-3">
          <Button variant="outline" size="sm" onClick={onClose} disabled={kaydediliyor} className="h-8 rounded-[5px] text-[12px]">Vazgeç</Button>
          <Button size="sm" onClick={kaydet} disabled={kaydediliyor} className="h-8 gap-1.5 rounded-[5px] text-[12px]">
            <Check className="size-3.5" /> {kaydediliyor ? "Kaydediliyor…" : duzenle ? "Güncelle" : "Ekle"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
