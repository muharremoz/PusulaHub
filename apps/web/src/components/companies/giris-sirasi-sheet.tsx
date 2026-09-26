"use client"

/**
 * Pusula giriş ekranı data sırası — sürükle-bırak.
 *
 * Program datalar listesini guvenlik.srkkod'a göre büyükten küçüğe diziyor;
 * burada üstteki satır programda da en üstte görünür. Kaydet firmanın
 * srkkod numaralarını satırlar arasında yer değiştirir (bkz. lib/giris-sirasi.ts).
 */

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core"
import {
  SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { CalendarArrowDown, GripVertical, Undo2 } from "lucide-react"
import { toast } from "sonner"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@muharremoz/pusula-ui"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Icon } from "@/components/shared/icon"
import { cn } from "@/lib/utils"
import { dataYili, type GirisSatiri } from "@/lib/giris-sirasi"

interface SonDegisiklik { id: number; kullanici: string | null; geri_alindi: boolean; created_at: string }

function Satir({ s, sira }: { s: GirisSatiri; sira: number }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: s.srkkod })
  const yil = dataYili(s.dataYolu || s.srkadi)
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "flex items-center gap-2 border-b border-border/40 bg-card px-3 py-1.5 last:border-b-0",
        isDragging && "relative z-10 rounded-[5px] shadow-md ring-1 ring-primary/20",
      )}
    >
      <button
        {...attributes}
        {...listeners}
        className="text-muted-foreground hover:text-foreground cursor-grab touch-none active:cursor-grabbing"
        aria-label="Sürükle"
      >
        <GripVertical className="size-4" />
      </button>
      <span className="w-5 text-right text-[11px] tabular-nums text-muted-foreground">{sira}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium leading-tight">{s.srkadi || "—"}</p>
        <p className="truncate font-mono text-[11px] text-muted-foreground">{s.dataYolu || "—"}</p>
      </div>
      {s.kod !== null && (
        <span className="inline-flex rounded-[5px] bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">{s.kod}</span>
      )}
      <span className="w-10 text-right text-[12px] tabular-nums text-muted-foreground">{yil ?? "—"}</span>
    </div>
  )
}

export function GirisSirasiSheet({
  open, onOpenChange, firkod, firma,
}: { open: boolean; onOpenChange: (o: boolean) => void; firkod: string; firma: string }) {
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [orijinal, setOrijinal] = useState<GirisSatiri[]>([])
  const [liste, setListe]       = useState<GirisSatiri[]>([])
  const [son, setSon]           = useState<SonDegisiklik | null>(null)
  const [onay, setOnay]         = useState<"kaydet" | "geriAl" | null>(null)
  const [saving, setSaving]     = useState(false)

  const yukle = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const r = await fetch(`/api/companies/${firkod}/giris-sirasi`, { cache: "no-store" })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error ?? "Liste alınamadı")
      setOrijinal(d.satirlar); setListe(d.satirlar); setSon(d.sonDegisiklik)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [firkod])

  useEffect(() => { if (open) void yukle() }, [open, yukle])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e
    if (!over || active.id === over.id) return
    setListe((l) => {
      const from = l.findIndex((x) => x.srkkod === active.id)
      const to   = l.findIndex((x) => x.srkkod === over.id)
      return arrayMove(l, from, to)
    })
  }

  /*  En yeni yıl en üstte; aynı yılda mevcut sıra korunur, yılı
   *  okunamayanlar sona.                                              */
  const yilaGoreSirala = () => {
    setListe((l) => [...l].sort((a, b) => {
      const ya = dataYili(a.dataYolu || a.srkadi), yb = dataYili(b.dataYolu || b.srkadi)
      if (ya === yb) return 0
      if (ya === null) return 1
      if (yb === null) return -1
      return yb - ya
    }))
  }

  const degisen = useMemo(
    () => liste.filter((s, i) => orijinal[i]?.srkkod !== s.srkkod).length,
    [liste, orijinal],
  )

  const kaydet = async (geriAl: boolean) => {
    setSaving(true)
    try {
      const body = geriAl ? { geriAl: son!.id } : { sira: liste.map((s) => s.srkkod) }
      const r = await fetch(`/api/companies/${firkod}/giris-sirasi`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error ?? "Kaydedilemedi")
      toast.success(geriAl ? "Önceki sıra geri yüklendi" : "Giriş sırası kaydedildi", {
        description: `${d.degisen} data yer değiştirdi. Program açıkken değişiklik bir sonraki girişte görünür.`,
      })
      setOnay(null)
      await yukle()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="!w-[520px] !max-w-[520px]">
          <SheetHeader>
            <span className="bg-primary/10 text-primary ring-primary/20 flex size-9 shrink-0 items-center justify-center rounded-[5px] ring-1">
              <Icon name="layers" size={18} />
            </span>
            <SheetTitle>Giriş Ekranı Sırası</SheetTitle>
            <SheetDescription>{firma} — Pusula giriş ekranında dataların görüneceği sıra.</SheetDescription>
          </SheetHeader>

          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="h-7 gap-1.5 text-[11px]" onClick={yilaGoreSirala} disabled={loading || !liste.length}>
                <CalendarArrowDown className="size-3.5" /> Yıla göre sırala
              </Button>
              {son && !son.geri_alindi && (
                <Button variant="outline" size="sm" className="h-7 gap-1.5 text-[11px]" onClick={() => setOnay("geriAl")} disabled={loading || saving}>
                  <Undo2 className="size-3.5" /> Son değişikliği geri al
                </Button>
              )}
              <span className="ml-auto text-[11px] text-muted-foreground">Üstteki programda da en üstte</span>
            </div>

            {loading ? (
              <div className="space-y-1.5">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full rounded-[5px]" />)}</div>
            ) : error ? (
              <div className="rounded-[5px] border border-red-500/25 bg-red-500/15 px-3 py-2.5 text-[12px] text-red-700 dark:text-red-400">
                {error}
                <Button variant="outline" size="sm" className="ml-2 h-6 text-[11px]" onClick={() => void yukle()}>Tekrar dene</Button>
              </div>
            ) : !liste.length ? (
              <div className="rounded-[5px] border border-border/50 px-4 py-8 text-center text-[12px] text-muted-foreground">
                Bu firmanın şirket tablosunda (guvenlik) kaydı yok. Önce kurulum sihirbazından ya da
                &quot;Yeni Veritabanı Ekle&quot; ile data ekleyin.
              </div>
            ) : (
              <div className="overflow-hidden rounded-[5px] border border-border/50">
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                  <SortableContext items={liste.map((s) => s.srkkod)} strategy={verticalListSortingStrategy}>
                    {liste.map((s, i) => <Satir key={s.srkkod} s={s} sira={i + 1} />)}
                  </SortableContext>
                </DndContext>
              </div>
            )}

            {son && (
              <p className="text-[11px] text-muted-foreground">
                Son değişiklik: {new Date(son.created_at).toLocaleString("tr-TR")}{son.kullanici ? ` · ${son.kullanici}` : ""}
                {son.geri_alindi ? " · geri alındı" : ""}
              </p>
            )}
          </div>

          <SheetFooter className="flex-row">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>Kapat</Button>
            <Button className="flex-1" disabled={!degisen || saving || loading} onClick={() => setOnay("kaydet")}>
              {degisen ? `Kaydet (${degisen} değişiklik)` : "Kaydet"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <AlertDialog open={onay !== null} onOpenChange={(o) => { if (!o && !saving) setOnay(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{onay === "geriAl" ? "Son değişiklik geri alınsın mı?" : "Giriş sırası kaydedilsin mi?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {onay === "geriAl"
                ? "Datalar son değişiklikten önceki numaralarına döner."
                : `${degisen} datanın şirket tablosundaki numarası (srkkod) yer değiştirecek. Eski numaralar kaydedilir, istenirse geri alınabilir.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>İptal</AlertDialogCancel>
            <AlertDialogAction
              disabled={saving}
              onClick={(e) => { e.preventDefault(); void kaydet(onay === "geriAl") }}
            >
              {saving ? "Kaydediliyor…" : onay === "geriAl" ? "Geri al" : "Kaydet"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
