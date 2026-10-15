"use client"

import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { Building2, ClipboardList, RefreshCw, Search, Send, UserCheck, Users, X } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/combobox-select"
import { Combobox, ComboboxMulti } from "@/components/ui/combobox"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Checkbox, Field } from "@/components/shared/form"
import { firmaAra } from "@/lib/firma-arama"
import { cn } from "@/lib/utils"
import { AnketOlusturucu, yeniSoru } from "@/components/messages/anket-olusturucu"
import type { AnketSorusu } from "@/lib/anket"
import {
  ONCELIK, OncelikRozeti,
  type Company, type DirectoryRecipient, type MessageTemplate, type MsgPriority, type MsgType, type RecipientKind,
} from "@/components/messages/mesaj-ortak"

/**
 * Yeni Mesaj — Yeni Hizmet penceresiyle aynı dil: üste sabit Dialog, ikon rozetli
 * başlık şeridi. Alıcılar (herkes / firma / seçili kullanıcı), içerik, isteğe
 * bağlı anket. Hazır mesaj (şablon) içerik başlığındaki kutudan seçilir.
 * Firma modunda API tek companyId aldığı için her firmaya ayrı POST atılır.
 */
export function YeniMesajDialog({
  open, onOpenChange, templates, recipients, companies, onRefreshRecipients, baslangic, onSent,
}: {
  open:                boolean
  onOpenChange:        (o: boolean) => void
  templates:           MessageTemplate[]
  recipients:          DirectoryRecipient[]
  companies:           Company[]
  onRefreshRecipients: () => void
  /** Şablonlar panelinden "Kullan" ile açılınca form bununla dolar */
  baslangic?:          MessageTemplate | null
  onSent:              () => void
}) {
  const [recipientType, setRecipientType] = useState<RecipientKind>("all")
  const [firmalar,      setFirmalar]      = useState<Set<string>>(new Set())
  const [firmaArama,    setFirmaArama]    = useState("")
  const [secili,        setSecili]        = useState<Set<string>>(new Set())
  const [kullaniciAra,  setKullaniciAra]  = useState("")
  const [firmaFiltre,   setFirmaFiltre]   = useState("all")
  const [konu,          setKonu]          = useState("")
  const [metin,         setMetin]         = useState("")
  const [oncelik,       setOncelik]       = useState<MsgPriority>("normal")
  const [tip,           setTip]           = useState<MsgType>("info")
  const [anketAcik,     setAnketAcik]     = useState(false)
  const [sorular,       setSorular]       = useState<AnketSorusu[]>([])
  const [gonderiliyor,  setGonderiliyor]  = useState(false)

  const sifirla = () => {
    setRecipientType("all"); setFirmalar(new Set()); setFirmaArama("")
    setSecili(new Set()); setKullaniciAra(""); setFirmaFiltre("all")
    setKonu(""); setMetin(""); setOncelik("normal"); setTip("info")
    setAnketAcik(false); setSorular([])
  }
  const sablonUygula = (t: MessageTemplate) => {
    setKonu(t.subject); setMetin(t.body); setTip(t.type); setOncelik(t.priority)
  }

  // Her açılışta temiz form; şablonla açıldıysa içerik dolu gelir
  useEffect(() => {
    if (!open) return
    sifirla()
    if (baslangic) sablonUygula(baslangic)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const dizin = useMemo(() => {
    const q = kullaniciAra.trim().toLocaleLowerCase("tr-TR")
    return recipients.filter((r) => {
      if (firmaFiltre !== "all" && r.company !== firmaFiltre) return false
      if (q && !`${r.username} ${r.company} ${r.serverName}`.toLocaleLowerCase("tr-TR").includes(q)) return false
      return true
    })
  }, [recipients, firmaFiltre, kullaniciAra])

  const anahtar = (r: DirectoryRecipient) => `${r.agentId}::${r.username}`
  const aliciSayisi =
    recipientType === "all" ? recipients.length
    : recipientType === "company" ? companies.filter((c) => firmalar.has(c.id)).reduce((t, c) => t + c.userCount, 0)
    : secili.size

  async function gonder() {
    if (!konu.trim() || !metin.trim()) { toast.error("Konu ve mesaj zorunlu"); return }
    if (recipientType === "company" && firmalar.size === 0) { toast.error("En az bir firma seçmelisiniz"); return }
    if (recipientType === "selected" && secili.size === 0) { toast.error("En az bir alıcı seçilmeli"); return }

    const base: Record<string, unknown> = { subject: konu.trim(), body: metin.trim(), type: tip, priority: oncelik }
    if (anketAcik) {
      if (sorular.length === 0) { toast.error("Ankete en az bir soru ekleyin"); return }
      base.survey = { sorular }
    }

    setGonderiliyor(true)
    try {
      const istekler: Record<string, unknown>[] =
        recipientType === "company" ? [...firmalar].map((id) => ({ ...base, recipientType: "company", companyId: id }))
        : recipientType === "selected" ? [{
            ...base, recipientType: "selected",
            targets: [...secili].map((k) => { const [agentId, username] = k.split("::"); return { agentId, username } }),
          }]
        : [{ ...base, recipientType: "all" }]

      let toplamAlici = 0, sunucuOk = 0, sunucuHedef = 0, basarisiz = 0, sonHata = ""
      for (const payload of istekler) {
        const r = await fetch("/api/messages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
        const d = await r.json()
        if (!r.ok || d.ok === false) { basarisiz++; sonHata = d.error ?? ""; continue }
        toplamAlici += d.totalRecipients ?? 0
        sunucuOk    += d.serversOk ?? 0
        sunucuHedef += d.serversTargeted ?? 0
      }
      if (basarisiz === istekler.length) {
        toast.error("Gönderim başarısız", sonHata ? { description: sonHata } : undefined)
      } else {
        toast.success(istekler.length > 1 ? `${istekler.length} firmaya mesaj gönderildi` : "Mesaj gönderildi", {
          description: `${toplamAlici} alıcıya iletildi (${sunucuOk}/${sunucuHedef} sunucu)`,
        })
        onSent()
        onOpenChange(false)
      }
    } catch {
      toast.error("Sunucu hatası")
    } finally {
      setGonderiliyor(false)
    }
  }

  const bolumBasligi = (baslik: string, sag?: React.ReactNode) => (
    <div className="text-muted-foreground mb-1.5 flex min-h-7 items-center justify-between gap-2">
      <span className="text-[10px] font-medium tracking-wider uppercase">{baslik}</span>
      {sag}
    </div>
  )

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!gonderiliyor) onOpenChange(o) }}>
      {/* Üste sabit: alıcı tipi değişince yükseklik değişiyor, pencere zıplamasın */}
      <DialogContent className="top-[8vh] translate-y-0 grid-cols-1 gap-0 p-0 sm:max-w-[760px]">
        <DialogHeader className="flex-row items-center gap-3 space-y-0 border-b bg-[var(--section-bg)] px-5 py-4">
          <span className="bg-primary/10 text-primary ring-primary/20 flex size-9 shrink-0 items-center justify-center rounded-[5px] ring-1">
            <Send className="size-[18px]" />
          </span>
          <div className="min-w-0">
            <DialogTitle className="text-[15px] font-semibold">Yeni Mesaj</DialogTitle>
            <DialogDescription className="text-[12px]">Sunucu kullanıcılarının ekranında açılır pencere olarak görünür.</DialogDescription>
          </div>
        </DialogHeader>

        <div className="max-h-[68vh] min-w-0 space-y-4 overflow-y-auto px-5 py-4">
          {/* ── Alıcılar ── */}
          <div>
            {bolumBasligi("Alıcılar",
              <Button variant="ghost" size="sm" onClick={onRefreshRecipients} className="h-7 gap-1.5 rounded-[5px] px-2 text-[12px]">
                <RefreshCw className="size-3.5" /> Yenile
              </Button>,
            )}
            <ToggleGroup
              type="single"
              value={recipientType}
              onValueChange={(v) => { if (!v) return; setRecipientType(v as RecipientKind); setSecili(new Set()); setFirmalar(new Set()) }}
              variant="outline"
              size="sm"
              className="w-full"
            >
              <ToggleGroupItem value="all" className="h-8 flex-1 gap-1.5 text-[12px]"><Users className="size-3.5" />Herkes</ToggleGroupItem>
              <ToggleGroupItem value="company" className="h-8 flex-1 gap-1.5 text-[12px]"><Building2 className="size-3.5" />Firma</ToggleGroupItem>
              <ToggleGroupItem value="selected" className="h-8 flex-1 gap-1.5 text-[12px]"><UserCheck className="size-3.5" />Seçili kullanıcılar</ToggleGroupItem>
            </ToggleGroup>

            {recipientType === "all" && (
              <p className="text-muted-foreground mt-2 text-[12px]">Oturumu açık <span className="text-foreground font-medium tabular-nums">{recipients.length}</span> kullanıcının hepsine gider.</p>
            )}

            {recipientType === "company" && (
              <div className="animate-in fade-in slide-in-from-top-1 mt-2 space-y-2 duration-200">
                {companies.length === 0 ? (
                  <p className="text-muted-foreground text-[12px]">Aktif sunucusu olan firma yok.</p>
                ) : (
                  <ComboboxMulti
                    items={firmaArama.trim() ? firmaAra(companies, firmaArama, (c) => c.id, (c) => c.name) : companies.slice(0, 50)}
                    getKey={(c) => c.id}
                    getLabel={(c) => c.name}
                    values={[...firmalar]}
                    onValuesChange={(v) => setFirmalar(new Set(v))}
                    search={firmaArama}
                    onSearchChange={setFirmaArama}
                    placeholder="Firma seçin…"
                    searchPlaceholder="Firma ara…"
                    emptyText="Sonuç bulunamadı"
                    renderSummary={(v) => `${v.length} firma seçildi`}
                    columns={[
                      { baslik: "No", hucre: (c) => <span className="text-muted-foreground tabular-nums">{c.id}</span>, className: "w-14 shrink-0" },
                      { baslik: "Firma", hucre: (c) => c.name },
                      { baslik: "Kullanıcı", hucre: (c) => <span className="text-muted-foreground tabular-nums">{c.userCount}</span>, className: "w-16 shrink-0 text-right" },
                    ]}
                  />
                )}
                {firmalar.size > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {[...firmalar].map((id) => {
                      const c = companies.find((x) => x.id === id)
                      if (!c) return null
                      return (
                        <span key={id} className="bg-card inline-flex items-center gap-1.5 rounded-[5px] border py-0.5 pr-0.5 pl-2 text-[12px] font-medium">
                          {c.name}
                          <span className="text-muted-foreground text-[11px] tabular-nums">{c.userCount}</span>
                          <Button
                            variant="ghost" size="icon" aria-label={`${c.name} kaldır`}
                            onClick={() => setFirmalar((p) => { const n = new Set(p); n.delete(id); return n })}
                            className="text-muted-foreground size-6 rounded-[5px]"
                          >
                            <X className="size-3.5" />
                          </Button>
                        </span>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {recipientType === "selected" && (
              <div className="animate-in fade-in slide-in-from-top-1 mt-2 space-y-2 duration-200">
                <div className="flex items-center gap-2">
                  <div className="relative min-w-0 flex-1">
                    <Search className="text-muted-foreground absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
                    <Input
                      placeholder="Kullanıcı, firma veya sunucu ara…"
                      value={kullaniciAra}
                      onChange={(e) => setKullaniciAra(e.target.value)}
                      className="h-8 rounded-[5px] pl-8 text-[13px]"
                    />
                  </div>
                  <Select value={firmaFiltre} onValueChange={setFirmaFiltre}>
                    <SelectTrigger className="h-8 w-48 rounded-[5px] text-[13px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tüm firmalar</SelectItem>
                      {companies.map((c) => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="bg-card overflow-hidden rounded-[5px] border">
                  {dizin.length === 0 ? (
                    <p className="text-muted-foreground px-3 py-6 text-center text-[12px]">
                      {kullaniciAra || firmaFiltre !== "all" ? "Eşleşen kullanıcı yok." : "Oturumu açık kullanıcı bulunamadı."}
                    </p>
                  ) : (
                    <div className="max-h-60 divide-y overflow-y-auto">
                      {dizin.map((r) => {
                        const k = anahtar(r)
                        const sec = secili.has(k)
                        const degistir = () => setSecili((p) => { const n = new Set(p); if (n.has(k)) n.delete(k); else n.add(k); return n })
                        return (
                          <div key={k} className={cn("flex items-center gap-3 px-3 py-1.5 transition-colors", sec ? "bg-primary/[0.04]" : "hover:bg-muted/20")}>
                            <Checkbox checked={sec} onCheckedChange={degistir} />
                            <button type="button" onClick={degistir} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                              <span className={cn("size-1.5 shrink-0 rounded-full", r.online ? "bg-emerald-500" : "bg-muted-foreground/40")} />
                              <span className="min-w-0 flex-1 truncate font-mono text-[13px] font-medium">{r.username}</span>
                              <span className="text-muted-foreground w-44 shrink-0 truncate text-[12px]">{r.company}</span>
                              <span className="text-muted-foreground w-28 shrink-0 truncate text-[12px]">{r.serverName}</span>
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  )}
                  <div className="text-muted-foreground flex items-center justify-between gap-2 border-t bg-[var(--section-bg)] px-3 py-1.5 text-[12px]">
                    <span className="tabular-nums">{secili.size} / {dizin.length} seçili</span>
                    <span className="flex items-center gap-1">
                      <Button variant="ghost" size="sm" className="h-6 rounded-[5px] px-2 text-[12px]" onClick={() => setSecili(new Set(dizin.map(anahtar)))}>Görünenleri seç</Button>
                      {secili.size > 0 && <Button variant="ghost" size="sm" className="h-6 rounded-[5px] px-2 text-[12px]" onClick={() => setSecili(new Set())}>Temizle</Button>}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ── İçerik ── */}
          <div>
            {bolumBasligi("İçerik",
              <Combobox
                className="h-7 w-64 text-[12px]"
                items={templates}
                getKey={(t) => t.id}
                getLabel={(t) => `${t.title} ${t.description}`}
                value=""
                onChange={(id) => { const t = templates.find((x) => x.id === id); if (t) sablonUygula(t) }}
                placeholder="Hazır mesajdan doldur…"
                searchPlaceholder="Hazır mesaj ara…"
                emptyText="Hazır mesaj yok"
                align="end"
                contentClassName="w-80"
                renderItem={(t) => (
                  <span className="flex min-w-0 flex-1 items-center gap-2">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{t.title}</span>
                      {t.description && <span className="text-muted-foreground block truncate text-[11px]">{t.description}</span>}
                    </span>
                    <OncelikRozeti p={t.priority} />
                  </span>
                )}
              />,
            )}
            <div className="space-y-3">
              <Field label="Konu" required>
                <Input value={konu} onChange={(e) => setKonu(e.target.value)} placeholder="Mesaj konusu" className="h-8 rounded-[5px] text-[13px]" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
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
              <Field label="Mesaj" required>
                <Textarea value={metin} onChange={(e) => setMetin(e.target.value)} rows={5} placeholder="Mesajınızı yazın…" className="min-h-28 resize-none" />
              </Field>
            </div>
          </div>

          {/* ── Anket ── sorular mesajla birlikte açılır pencerede sorulur */}
          <div>
            {bolumBasligi("Anket",
              <Button
                variant={anketAcik ? "outline" : "ghost"} size="sm"
                className="h-7 gap-1.5 rounded-[5px] px-2 text-[12px]"
                onClick={() => { if (anketAcik) { setAnketAcik(false); setSorular([]) } else { setAnketAcik(true); setSorular([yeniSoru(1)]) } }}
              >
                <ClipboardList className="size-3.5" /> {anketAcik ? "Anketi kaldır" : "Anket ekle"}
              </Button>,
            )}
            {anketAcik
              ? <div className="animate-in fade-in slide-in-from-top-1 duration-200"><AnketOlusturucu sorular={sorular} onChange={setSorular} /></div>
              : <p className="text-muted-foreground text-[12px]">İsterseniz mesaja soru ekleyip cevapları toplayabilirsiniz.</p>}
          </div>
        </div>

        <div className="flex items-center gap-2 border-t px-5 py-3">
          <span className="text-muted-foreground mr-auto text-[12px] tabular-nums">
            {aliciSayisi > 0 ? `${aliciSayisi} alıcı` : "Alıcı seçilmedi"}
          </span>
          <Button variant="ghost" size="sm" onClick={sifirla} disabled={gonderiliyor} className="h-8 rounded-[5px] text-[12px]">Sıfırla</Button>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={gonderiliyor} className="h-8 rounded-[5px] text-[12px]">Vazgeç</Button>
          <Button size="sm" onClick={gonder} disabled={gonderiliyor} className="h-8 gap-1.5 rounded-[5px] text-[12px]">
            <Send className="size-3.5" /> {gonderiliyor ? "Gönderiliyor…" : "Gönder"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
