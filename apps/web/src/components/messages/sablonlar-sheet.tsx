"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Bookmark, MoreVertical, Pencil, Plus, Send, Trash2 } from "lucide-react"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@muharremoz/pusula-ui"
import { SablonFormDialog } from "@/components/messages/sablon-form-dialog"
import { OncelikRozeti, type MessageTemplate } from "@/components/messages/mesaj-ortak"

/**
 * Hazır mesaj şablonları — sağdan panel. "Kullan" Yeni Mesaj penceresini o
 * şablonla açar; kullanıcı şablonları düzenlenir/silinir, sistem şablonları
 * (`builtIn`) yalnız kullanılır.
 */
export function SablonlarSheet({
  open, onOpenChange, templates, onChanged, onKullan,
}: {
  open:         boolean
  onOpenChange: (o: boolean) => void
  templates:    MessageTemplate[]
  onChanged:    () => void
  onKullan:     (t: MessageTemplate) => void
}) {
  const [form,  setForm]  = useState<MessageTemplate | "yeni" | null>(null)
  const [silinecek, setSilinecek] = useState<MessageTemplate | null>(null)
  const [siliniyor, setSiliniyor] = useState(false)

  async function sil() {
    if (!silinecek) return
    setSiliniyor(true)
    try {
      const r = await fetch(`/api/messages/templates/${silinecek.id}`, { method: "DELETE" })
      if (!r.ok) { const d = await r.json().catch(() => ({})); toast.error(d.error ?? "Silinemedi"); return }
      toast.success("Şablon silindi", { description: silinecek.title })
      setSilinecek(null)
      onChanged()
    } catch {
      toast.error("Sunucu hatası")
    } finally {
      setSiliniyor(false)
    }
  }

  const kullanici = templates.filter((t) => !t.builtIn)
  const sistem    = templates.filter((t) => t.builtIn)

  const satir = (t: MessageTemplate) => (
    <div key={t.id} className="group flex items-center gap-3 px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[13px] font-medium">{t.title}</span>
          <OncelikRozeti p={t.priority} />
        </div>
        <p className="text-muted-foreground truncate text-[12px]">{t.description || t.subject}</p>
      </div>
      <Button variant="outline" size="sm" onClick={() => onKullan(t)} className="h-7 shrink-0 gap-1.5 rounded-[5px] text-[12px]">
        <Send className="size-3.5" /> Kullan
      </Button>
      {!t.builtIn && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label={`${t.title} işlemleri`} className="text-muted-foreground size-7 shrink-0 rounded-[5px]">
              <MoreVertical className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuItem className="gap-2 text-[12px]" onSelect={() => setForm(t)}>
              <Pencil className="size-3.5" /> Düzenle
            </DropdownMenuItem>
            <DropdownMenuItem className="gap-2 text-[12px] text-rose-600 focus:text-rose-600" onSelect={() => setSilinecek(t)}>
              <Trash2 className="size-3.5" /> Sil
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  )

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="!w-[520px] !max-w-[520px]">
          <SheetHeader>
            <span className="bg-primary/10 text-primary ring-primary/20 flex size-9 shrink-0 items-center justify-center rounded-[5px] ring-1">
              <Bookmark className="size-[18px]" />
            </span>
            <SheetTitle>Hazır mesajlar</SheetTitle>
            <SheetDescription>Bir şablonu kullanın ya da kendi şablonunuzu ekleyin.</SheetDescription>
          </SheetHeader>

          <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
            <div>
              <div className="text-muted-foreground mb-1.5 flex items-center justify-between">
                <span className="text-[10px] font-medium tracking-wider uppercase">Şablonlarım · {kullanici.length}</span>
                <Button variant="ghost" size="sm" onClick={() => setForm("yeni")} className="h-7 gap-1.5 rounded-[5px] px-2 text-[12px]">
                  <Plus className="size-3.5" /> Yeni şablon
                </Button>
              </div>
              {kullanici.length === 0 ? (
                <button
                  type="button"
                  onClick={() => setForm("yeni")}
                  className="text-muted-foreground hover:text-foreground hover:border-foreground/25 flex w-full flex-col items-center gap-1 rounded-[5px] border border-dashed py-6 text-center transition-colors"
                >
                  <Plus className="size-4" />
                  <span className="text-[12px]">Sık gönderdiğiniz mesajı şablon olarak kaydedin.</span>
                </button>
              ) : (
                <div className="bg-card divide-y rounded-[5px] border">{kullanici.map(satir)}</div>
              )}
            </div>

            {sistem.length > 0 && (
              <div>
                <div className="text-muted-foreground mb-1.5 text-[10px] font-medium tracking-wider uppercase">Sistem şablonları · {sistem.length}</div>
                <div className="bg-card divide-y rounded-[5px] border">{sistem.map(satir)}</div>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <SablonFormDialog
        open={form !== null}
        initial={form === "yeni" ? null : form}
        onClose={() => setForm(null)}
        onSaved={() => { setForm(null); onChanged() }}
      />

      <AlertDialog open={!!silinecek} onOpenChange={(o) => { if (!o && !siliniyor) setSilinecek(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Şablon silinsin mi?</AlertDialogTitle>
            <AlertDialogDescription>
              &quot;{silinecek?.title}&quot; şablonu kalıcı olarak silinecek. Daha önce gönderilen mesajlar etkilenmez.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={siliniyor}>Vazgeç</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); void sil() }} disabled={siliniyor} className="bg-destructive text-white hover:bg-destructive/90">
              {siliniyor ? "Siliniyor…" : "Sil"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
