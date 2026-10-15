"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Bookmark, Building2, ClipboardList, Mail, Plus, UserCheck, Users } from "lucide-react"
import { PageContainer } from "@/components/layout/page-container"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ListeAksiyonButonu, ListeKarti, ListeThead } from "@/components/shared/liste-karti"
import { MetinFiltre, SecimFiltre, TarihFiltre, type TarihFiltreDeger } from "@/components/shared/liste-filtreleri"
import { YeniMesajDialog } from "@/components/messages/yeni-mesaj-dialog"
import { MesajDetayDialog } from "@/components/messages/mesaj-detay-dialog"
import { SablonlarSheet } from "@/components/messages/sablonlar-sheet"
import {
  OncelikRozeti, tarihYaz,
  type Company, type DirectoryRecipient, type MessageItem, type MessageTemplate,
} from "@/components/messages/mesaj-ortak"

/**
 * Mesajlar — gönderilen mesajların listesi (proje liste standardı, tam genişlik).
 * Yeni mesaj, şablonlar ve mesaj ayrıntısı pencere/panelde açılır:
 *   - Yeni Mesaj   → YeniMesajDialog (üste sabit Dialog)
 *   - Şablonlar    → SablonlarSheet (sağdan panel; "Kullan" Yeni Mesaj'ı doldurur)
 *   - Satıra tıkla → MesajDetayDialog (okudu/okumadı/hata filtreli alıcılar)
 */
export default function MessagesPage() {
  const [mesajlar,   setMesajlar]   = useState<MessageItem[]>([])
  const [yukleniyor, setYukleniyor] = useState(true)
  const [alicilar,   setAlicilar]   = useState<DirectoryRecipient[]>([])
  const [firmalar,   setFirmalar]   = useState<Company[]>([])
  const [sablonlar,  setSablonlar]  = useState<MessageTemplate[]>([])

  const [yeniAcik,     setYeniAcik]     = useState(false)
  const [yeniSablon,   setYeniSablon]   = useState<MessageTemplate | null>(null)
  const [sablonlarAcik, setSablonlarAcik] = useState(false)
  const [seciliId,     setSeciliId]     = useState<string | null>(null)

  // Sütun başlığı filtreleri — sunucuda uygulanır (query string)
  const [fTarih,   setFTarih]   = useState<TarihFiltreDeger>({ mode: "tum" })
  const [fFrom,    setFFrom]    = useState("")
  const [fTo,      setFTo]      = useState("")
  const [fFirma,   setFFirma]   = useState("")
  const [fKonu,    setFKonu]    = useState("")
  const [fOncelik, setFOncelik] = useState("")

  /** TarihFiltre modunu sunucunun beklediği from/to (yyyy-MM-dd) çiftine çevirir. */
  function tarihUygula(v: TarihFiltreDeger) {
    setFTarih(v)
    const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
    const bugun = new Date()
    if (v.mode === "tum")     { setFFrom(""); setFTo(""); return }
    if (v.mode === "bugun")   { setFFrom(ymd(bugun)); setFTo(ymd(bugun)); return }
    if (v.mode === "buhafta") { const b = new Date(bugun); b.setDate(bugun.getDate() - ((bugun.getDay() + 6) % 7)); setFFrom(ymd(b)); setFTo(ymd(bugun)); return }
    if (v.mode === "buay")    { setFFrom(ymd(new Date(bugun.getFullYear(), bugun.getMonth(), 1))); setFTo(ymd(bugun)); return }
    setFFrom(v.from ?? ""); setFTo(v.to ?? "")
  }

  const listeYukle = async () => {
    setYukleniyor(true)
    try {
      const qs = new URLSearchParams({ limit: "100" })
      if (fFrom)    qs.set("from", fFrom)
      if (fTo)      qs.set("to", fTo)
      if (fFirma)   qs.set("companyId", fFirma)
      if (fKonu)    qs.set("subject", fKonu)
      if (fOncelik) qs.set("priority", fOncelik)
      const d = await (await fetch(`/api/messages?${qs}`)).json()
      setMesajlar(d.messages ?? [])
    } catch {
      toast.error("Mesajlar yüklenemedi")
    } finally {
      setYukleniyor(false)
    }
  }
  const alicilariYukle = async () => {
    try {
      const d = await (await fetch("/api/messages/recipients")).json()
      setAlicilar(d.recipients ?? []); setFirmalar(d.companies ?? [])
    } catch { /* sessiz */ }
  }
  const sablonlariYukle = async () => {
    try { setSablonlar((await (await fetch("/api/messages/templates")).json()).templates ?? []) } catch { /* sessiz */ }
  }

  useEffect(() => { alicilariYukle(); sablonlariYukle() }, [])
  // Filtre değişince (ve ilk açılışta) listeyi çek — 250 ms gecikmeli
  useEffect(() => {
    const t = setTimeout(() => listeYukle(), 250)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fFrom, fTo, fFirma, fKonu, fOncelik])

  /** Yeni Mesaj'ı aç — şablonla açılırsa içerik dolu gelir; alıcı listesi tazelenir (çevrimiçi durumu). */
  const yeniMesajAc = (sablon: MessageTemplate | null = null) => {
    setYeniSablon(sablon); setYeniAcik(true); alicilariYukle()
  }

  const secili = seciliId ? mesajlar.find((m) => m.id === seciliId) ?? null : null
  const filtreVar = !!(fFrom || fTo || fFirma || fKonu || fOncelik)

  return (
    <PageContainer title="Mesajlar" description="Sunucu kullanıcılarına mesaj gönderme">
      <ListeKarti
        baslik="Gönderilen Mesajlar"
        ikon={<Mail className="size-3.5" />}
        toplam={mesajlar.length}
        aksiyon={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setSablonlarAcik(true)} className="h-[26px] gap-1.5 rounded-[5px] px-2.5 text-[12px]">
              <Bookmark className="size-3.5" /> Şablonlar
            </Button>
            <ListeAksiyonButonu onClick={() => yeniMesajAc()}>
              <Plus className="size-3.5" /> Yeni Mesaj
            </ListeAksiyonButonu>
          </div>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full text-[14px] font-medium leading-[20px]">
            <ListeThead>
              <th className="w-px px-4 py-1.5 text-left font-medium whitespace-nowrap">
                <SecimFiltre
                  label="Öncelik"
                  options={["normal", "high", "urgent"] as const}
                  getLabel={(o) => (o === "normal" ? "Normal" : o === "high" ? "Yüksek" : "Acil")}
                  selected={fOncelik ? [fOncelik] : []}
                  onChange={(v) => setFOncelik(v[v.length - 1] ?? "")}
                />
              </th>
              <th className="w-px px-4 py-1.5 text-left font-medium whitespace-nowrap">Mesaj Tipi</th>
              <th className="px-4 py-1.5 text-left font-medium">
                <MetinFiltre label="Konu" value={fKonu} onChange={setFKonu} />
              </th>
              <th className="w-px px-4 py-1.5 text-left font-medium whitespace-nowrap">
                <SecimFiltre
                  label="Alıcı"
                  options={firmalar.map((c) => c.id)}
                  getLabel={(id) => firmalar.find((c) => c.id === id)?.name ?? id}
                  selected={fFirma ? [fFirma] : []}
                  onChange={(v) => setFFirma(v[v.length - 1] ?? "")}
                  aranabilir
                />
              </th>
              <th className="w-px px-4 py-1.5 text-left font-medium whitespace-nowrap">Okunma</th>
              <th className="w-px px-4 py-1.5 text-right font-medium whitespace-nowrap">
                <TarihFiltre label="Tarih" value={fTarih} onChange={tarihUygula} align="end" />
              </th>
            </ListeThead>
            <tbody>
              {yukleniyor ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 6 }).map((_, j) => (
                      <td key={j} className="px-4 py-2"><Skeleton className="h-4 w-full rounded-[5px]" /></td>
                    ))}
                  </tr>
                ))
              ) : mesajlar.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12">
                    <div className="text-muted-foreground flex flex-col items-center gap-2 text-center">
                      <Mail className="size-5" />
                      {filtreVar ? (
                        <p className="text-[13px]">Filtreye uyan mesaj yok.</p>
                      ) : (
                        <>
                          <p className="text-[13px]">Henüz mesaj gönderilmedi.</p>
                          <Button size="sm" onClick={() => yeniMesajAc()} className="h-8 gap-1.5 rounded-[5px] text-[12px]">
                            <Plus className="size-3.5" /> İlk mesajı gönder
                          </Button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ) : mesajlar.map((m) => (
                <tr
                  key={m.id}
                  onClick={() => setSeciliId(m.id)}
                  className={`cursor-pointer transition-colors hover:bg-muted/20 ${seciliId === m.id ? "bg-muted/30" : ""}`}
                >
                  <td className="px-4 py-1.5 whitespace-nowrap"><OncelikRozeti p={m.priority} /></td>
                  <td className="px-4 py-1.5 whitespace-nowrap">
                    {m.isSurvey ? (
                      <span className="inline-flex items-center gap-1 rounded-[5px] bg-violet-500/15 px-2 py-0.5 text-[11px] font-medium text-violet-700 dark:text-violet-400">
                        <ClipboardList className="size-3" /> Anket
                      </span>
                    ) : (
                      <span className="bg-muted text-muted-foreground inline-flex items-center gap-1 rounded-[5px] px-2 py-0.5 text-[11px] font-medium">
                        <Mail className="size-3" /> Mesaj
                      </span>
                    )}
                  </td>
                  <td className="max-w-0 px-4 py-1.5">
                    <p className="truncate">{m.subject}</p>
                    <p className="text-muted-foreground truncate text-[12px] font-normal">{m.body}</p>
                  </td>
                  <td className="px-4 py-1.5 whitespace-nowrap">
                    <span className="text-muted-foreground flex items-center gap-1.5 text-[12px]">
                      {m.recipientType === "all"      && <Users     className="size-3.5" />}
                      {m.recipientType === "company"  && <Building2 className="size-3.5" />}
                      {m.recipientType === "selected" && <UserCheck className="size-3.5" />}
                      {m.recipientType === "all" ? "Herkes" : m.recipientType === "company" ? (m.companyName ?? "Firma") : `${m.totalCount} kişi`}
                    </span>
                  </td>
                  <td className="px-4 py-1.5 text-[13px] whitespace-nowrap tabular-nums">
                    {m.readCount}<span className="text-muted-foreground">/{m.totalCount}</span>
                  </td>
                  <td className="text-muted-foreground px-4 py-1.5 text-right text-[12px] whitespace-nowrap tabular-nums">{tarihYaz(m.sentAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ListeKarti>

      <YeniMesajDialog
        open={yeniAcik}
        onOpenChange={setYeniAcik}
        templates={sablonlar}
        recipients={alicilar}
        companies={firmalar}
        onRefreshRecipients={alicilariYukle}
        baslangic={yeniSablon}
        onSent={listeYukle}
      />

      <MesajDetayDialog
        mesaj={secili}
        onClose={() => setSeciliId(null)}
        onBenzeri={(m) => {
          setSeciliId(null)
          yeniMesajAc({ id: "", title: "", description: "", subject: m.subject, body: m.body, type: m.type, priority: m.priority, builtIn: false })
        }}
      />

      <SablonlarSheet
        open={sablonlarAcik}
        onOpenChange={setSablonlarAcik}
        templates={sablonlar}
        onChanged={sablonlariYukle}
        onKullan={(t) => { setSablonlarAcik(false); yeniMesajAc(t) }}
      />
    </PageContainer>
  )
}
