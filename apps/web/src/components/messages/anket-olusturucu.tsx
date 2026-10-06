"use client"

/**
 * Mesaja anket ekleme — soru listesi düzenleyici (Mesajlar sayfası, mesaj yazma paneli).
 * Değer lib/anket.ts biçiminde; gönderimde API anketDogrula ile doğrular.
 */

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/combobox-select"
import { Checkbox } from "@/components/shared/form"
import { Plus, Trash2, X } from "lucide-react"
import { SECENEK_SINIRI, SORU_SINIRI, type AnketSorusu, type SoruTipi } from "@/lib/anket"

const TIP_ETIKET: Record<SoruTipi, string> = {
  tek: "Tek seçim",
  coklu: "Çoklu seçim",
  puan: "1–5 puan",
  metin: "Serbest metin",
}

export function yeniSoru(sira: number): AnketSorusu {
  return { id: `s${sira}`, tip: "tek", soru: "", secenekler: ["", ""], zorunlu: true }
}

export function AnketOlusturucu({ sorular, onChange }: { sorular: AnketSorusu[]; onChange: (s: AnketSorusu[]) => void }) {
  const guncelle = (i: number, p: Partial<AnketSorusu>) => onChange(sorular.map((s, j) => (j === i ? { ...s, ...p } : s)))
  const sil = (i: number) => onChange(sorular.filter((_, j) => j !== i))

  return (
    <div className="space-y-2">
      {sorular.map((s, i) => (
        <div key={i} className="bg-card space-y-2 rounded-[5px] border p-2.5">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground w-5 text-[11px] font-medium tabular-nums">{i + 1}.</span>
            <Input
              placeholder="Soru metni"
              className="h-8 flex-1 rounded-[5px] text-[13px]"
              value={s.soru}
              onChange={(e) => guncelle(i, { soru: e.target.value })}
            />
            <Button variant="ghost" size="icon" className="text-muted-foreground size-8 shrink-0" title="Soruyu sil" onClick={() => sil(i)}>
              <Trash2 className="size-3.5" />
            </Button>
          </div>

          <div className="flex items-center gap-3 pl-7">
            <Select
              value={s.tip}
              onValueChange={(v) => {
                const tip = v as SoruTipi
                guncelle(i, { tip, secenekler: tip === "tek" || tip === "coklu" ? (s.secenekler?.length ? s.secenekler : ["", ""]) : undefined })
              }}
            >
              <SelectTrigger className="h-7 w-40 rounded-[5px] text-[12px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(TIP_ETIKET) as SoruTipi[]).map((t) => (
                  <SelectItem key={t} value={t}>{TIP_ETIKET[t]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <label className="text-muted-foreground flex cursor-pointer items-center gap-1.5 text-[12px]">
              <Checkbox checked={s.zorunlu} onCheckedChange={(v) => guncelle(i, { zorunlu: v })} />
              Zorunlu
            </label>
          </div>

          {(s.tip === "tek" || s.tip === "coklu") && (
            <div className="space-y-1.5 pl-7">
              {(s.secenekler ?? []).map((o, k) => (
                <div key={k} className="flex items-center gap-1.5">
                  <span className={`border-muted-foreground/40 size-3 shrink-0 border ${s.tip === "tek" ? "rounded-full" : "rounded-[3px]"}`} />
                  <Input
                    placeholder={`Seçenek ${k + 1}`}
                    className="h-7 flex-1 rounded-[5px] text-[12px]"
                    value={o}
                    onChange={(e) => guncelle(i, { secenekler: (s.secenekler ?? []).map((x, m) => (m === k ? e.target.value : x)) })}
                  />
                  <Button
                    variant="ghost" size="icon" className="text-muted-foreground size-7 shrink-0" title="Seçeneği sil"
                    disabled={(s.secenekler?.length ?? 0) <= 2}
                    onClick={() => guncelle(i, { secenekler: (s.secenekler ?? []).filter((_, m) => m !== k) })}
                  >
                    <X className="size-3" />
                  </Button>
                </div>
              ))}
              {(s.secenekler?.length ?? 0) < SECENEK_SINIRI && (
                <button
                  className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-[12px]"
                  onClick={() => guncelle(i, { secenekler: [...(s.secenekler ?? []), ""] })}
                >
                  <Plus className="size-3" /> Seçenek ekle
                </button>
              )}
            </div>
          )}
          {s.tip === "puan" && <p className="text-muted-foreground pl-7 text-[11px]">Kullanıcı 1 ile 5 arasında puan verir.</p>}
          {s.tip === "metin" && <p className="text-muted-foreground pl-7 text-[11px]">Kullanıcı en fazla 500 karakter yazar.</p>}
        </div>
      ))}

      {sorular.length < SORU_SINIRI && (
        <Button variant="outline" size="sm" className="h-7 w-full gap-1 rounded-[5px] text-[12px]" onClick={() => onChange([...sorular, yeniSoru(sorular.length + 1)])}>
          <Plus className="size-3" /> Soru ekle
        </Button>
      )}
    </div>
  )
}
