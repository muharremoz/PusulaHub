"use client"

/**
 * Sihirbaz — API hizmetleri adımı (SQL'den sonra).
 * Data gerektiren IIS siteleri (Pusula MOBIL, RFID, Kivi…) burada seçilir; her biri için
 * bağlanacak data (Users.xml <DB>, varsayılan güncel data) ve uygulama kullanıcıları elle girilir.
 * Kullanıcılar RDP kullanıcıları DEĞİLDİR (ali, veli… gibi isimler) — varsayılan liste boş.
 */

import type { ComponentProps } from "react"
import { Database, KeyRound, Plus, Trash2, UserRound, AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ComboboxMulti } from "@/components/ui/combobox"
import { Field } from "@/components/shared/form"
import { cn } from "@/lib/utils"
import { apiKimlikAlanHatalari, apiSifreUret } from "@/lib/setup-iisops"
import { StepServices, kapsamdaMi } from "./step-services"

export interface ApiKullanici { id: number; username: string; password: string }
export interface ApiHizmetAyari { dbler: string[]; kullanicilar: ApiKullanici[] }
/** SQL adımında seçilen data — hedef DB adı + güncel mi (yılsız / bu yıl) */
export interface VeriSecenegi { ad: string; guncel: boolean }

let _apiUid = 1
export const yeniApiKullanici = (): ApiKullanici => ({ id: _apiUid++, username: "", password: apiSifreUret() })

/** Varsayılan data: güncel olanlar; hiçbiri güncel değilse ilk data. */
export const varsayilanDbler = (veriler: VeriSecenegi[]) => {
  const g = veriler.filter((v) => v.guncel).map((v) => v.ad)
  return g.length ? g : veriler.slice(0, 1).map((v) => v.ad)
}

/** Ayar geçerli mi: kullanıcı satırları geçerli + benzersiz, data varsa en az biri seçili. */
export function apiAyarHatasi(a: ApiHizmetAyari | undefined, veriVar: boolean): string | null {
  if (!a) return null
  if (veriVar && a.dbler.length === 0) return "En az bir data seçin"
  for (const k of a.kullanicilar) {
    const h = apiKimlikAlanHatalari(k.username, k.password)
    if (!k.username.trim() || h.kullanici) return "Kullanıcı adı boş ya da geçersiz (boşluk, \" ve ^ olmaz)"
    if (h.sifre) return "Şifre 6 rakam olmalı"
  }
  const adlar = a.kullanicilar.map((k) => k.username.trim().toLocaleLowerCase("tr-TR"))
  if (new Set(adlar).size !== adlar.length) return "Aynı kullanıcı adı iki kez girilmiş"
  return null
}

type ServicesProps = Omit<ComponentProps<typeof StepServices>, "kapsam" | "pars" | "depoServers" | "selectedDepoServerId" | "onSelectDepoServer">

export function StepApi({ veriler, ayarlar, onAyar, ...svc }: ServicesProps & {
  veriler: VeriSecenegi[]
  ayarlar: Record<number, ApiHizmetAyari>
  onAyar: (serviceId: number, ayar: ApiHizmetAyari) => void
}) {
  const seciliApi = svc.services.filter((s) => kapsamdaMi(s.type, "api") && svc.selectedIds.includes(s.id))
  return (
    <div className="space-y-4">
      <StepServices {...svc} kapsam="api" depoServers={[]} selectedDepoServerId={null} onSelectDepoServer={() => {}} />

      {seciliApi.length > 0 && veriler.length === 0 && (
        <div className="flex items-start gap-2 rounded-[5px] bg-amber-500/15 px-3 py-2.5 text-[12px] text-amber-800 dark:text-amber-400">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          SQL adımında data seçilmedi. API hizmetleri kurulur ama bağlanacakları data olmadığı için Users.xml ve
          Web.config şablon değerinde kalır; firma detayından veritabanı ekledikten sonra yazılmalı.
        </div>
      )}

      {seciliApi.map((s) => {
        const a = ayarlar[s.id] ?? { dbler: varsayilanDbler(veriler), kullanicilar: [] }
        const set = (p: Partial<ApiHizmetAyari>) => onAyar(s.id, { ...a, ...p })
        const hata = apiAyarHatasi(a, veriler.length > 0)
        return (
          <section key={s.id} className="overflow-hidden rounded-[8px] border">
            <div className="flex items-center gap-2 border-b bg-[var(--section-bg)] px-3 py-2">
              <span className="text-[13px] font-semibold">{s.name}</span>
              <span className="text-muted-foreground text-[12px]">· {a.kullanicilar.length} kullanıcı · {a.dbler.length} data</span>
              {hata && <span className="ml-auto text-[12px] font-medium text-amber-700 dark:text-amber-400">{hata}</span>}
            </div>
            <div className="grid gap-4 p-3 md:grid-cols-[minmax(0,260px)_minmax(0,1fr)]">
              <Field label="Data" hint="Users.xml'e yazılır. Yalnız güncel data önerilir.">
                <ComboboxMulti
                  items={veriler}
                  getKey={(v) => v.ad}
                  getLabel={(v) => v.ad}
                  values={a.dbler}
                  onValuesChange={(dbler) => set({ dbler })}
                  renderItem={(v) => (
                    <span className="flex w-full items-center gap-2">
                      <Database className="text-muted-foreground size-3.5" />
                      <span className="truncate">{v.ad}</span>
                      {v.guncel && <span className="text-muted-foreground ml-auto text-[11px]">güncel</span>}
                    </span>
                  )}
                  placeholder={veriler.length ? "Data seçin" : "Data yok"}
                  emptyText="SQL adımında data seçilmedi"
                  disabled={veriler.length === 0}
                />
              </Field>

              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-foreground/80 text-[12px] font-medium">Uygulama kullanıcıları</span>
                  <Button type="button" variant="outline" size="sm" className="h-7 gap-1.5 rounded-[5px] px-2 text-[12px]"
                    onClick={() => set({ kullanicilar: [...a.kullanicilar, yeniApiKullanici()] })}>
                    <Plus className="size-3.5" />Kullanıcı ekle
                  </Button>
                </div>
                {a.kullanicilar.length === 0 ? (
                  <p className="text-muted-foreground rounded-[5px] border border-dashed px-3 py-2.5 text-[12px]">
                    Kullanıcı yok. Uygulamada giriş yapacak kişileri (ali, veli…) ekleyin; RDP kullanıcıları buraya gelmez.
                  </p>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    {a.kullanicilar.map((k) => {
                      const h = apiKimlikAlanHatalari(k.username, k.password)
                      const guncelle = (p: Partial<ApiKullanici>) =>
                        set({ kullanicilar: a.kullanicilar.map((x) => (x.id === k.id ? { ...x, ...p } : x)) })
                      return (
                        <div key={k.id} className="flex items-center gap-2">
                          <div className="relative flex-1">
                            <UserRound className="text-muted-foreground pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2" />
                            <Input value={k.username} placeholder="Kullanıcı adı" onChange={(e) => guncelle({ username: e.target.value })}
                              className={cn("pl-7", k.username.trim() && h.kullanici && "border-amber-500/70")} />
                          </div>
                          <div className="relative w-[140px]">
                            <KeyRound className="text-muted-foreground pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2" />
                            <Input value={k.password} inputMode="numeric" placeholder="6 rakam"
                              onChange={(e) => guncelle({ password: e.target.value.replace(/\D/g, "").slice(0, 6) })}
                              className={cn("pl-7 tabular-nums", h.sifre && "border-amber-500/70")} />
                          </div>
                          <Button type="button" variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-rose-600" aria-label="Kullanıcıyı sil"
                            onClick={() => set({ kullanicilar: a.kullanicilar.filter((x) => x.id !== k.id) })}>
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          </section>
        )
      })}
    </div>
  )
}
