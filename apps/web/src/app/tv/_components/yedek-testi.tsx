"use client"

/**
 * Yedek doğrulama testi — düğme + adım adım açılan tam ekran panel.
 *
 * ── Neden ekranda bir düğme? ──────────────────────────────────────────
 * /tv yalnız bir izleme duvarı değil; ofise gelen müşteriye de açık.
 * "Verileriniz yedekleniyor" cümlesi bir slayt, bu test ise kanıt:
 * düğmeye basılıyor, sunucuya o an bağlanılıyor, yedeklerin varlığı
 * yedi adımda tek tek doğrulanıyor ve sonuç ekranda beliriyor.
 *
 * ── Tasarım ───────────────────────────────────────────────────────────
 * Ekranın geri kalanıyla aynı dil: koyu panel, ince çerçeve, 0.26em
 * aralıklı küçük başlıklar, mono/tabular sayılar. Renk hiyerarşisi de
 * aynı — yeşil "doğrulandı", kehribar "dikkat", kırmızı "sorun".
 * Adımlar en baştan solgun olarak listeleniyor, sırayla aydınlanıyor:
 * izleyen kişi neyin kontrol edileceğini baştan görüyor.
 *
 * ── Akış ──────────────────────────────────────────────────────────────
 * `/api/tv/yedek-testi` SSE akıtıyor; olaylar geldikçe satırlar
 * güncelleniyor. `EventSource` yerine `fetch` + okuyucu kullanılıyor:
 * "test zaten sürüyor" (409) gibi yanıtların gövdesi ancak böyle
 * okunabiliyor. Panel kapanınca istek iptal ediliyor, sunucu da kilidi
 * bırakıyor.
 *
 * Test SALT OKUMA: yedek almıyor, hiçbir ayara dokunmuyor.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import { AlertTriangle, Check, Loader2, ShieldCheck, X } from "lucide-react"

const TXT     = "#D4D4D8"
const TXT_DIM = "#8B8B93"
const GREEN   = "#34D399"
const AMBER   = "#FBBF24"
const RED     = "#F87171"
const PANEL   = "#141417"
const BORDER  = "rgba(255,255,255,0.09)"

/** Sonuç ekranda bu kadar durduktan sonra panel kendiliğinden kapanır */
const OTO_KAPAT_SN = 120

type Durum = "calisiyor" | "ok" | "uyari" | "hata"

interface PlanAdimi { id: string; baslik: string; aciklama: string }
interface Adim extends PlanAdimi { durum: Durum; deger?: string; detay?: string[]; sureMs?: number }
interface Sonuc { durum: Durum; ozet: string; sureMs: number; bitisAt: string }

function renk(d: Durum): string {
  return d === "ok" ? GREEN : d === "uyari" ? AMBER : d === "hata" ? RED : TXT
}

function sure(ms?: number): string {
  if (ms === undefined) return ""
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} sn`
}

/* ══════════════════════════════════════════════════════════
   Düğme
══════════════════════════════════════════════════════════ */

export function YedekTestiDugmesi({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="absolute left-9 top-[116px] z-30 flex items-center gap-2.5 rounded-[10px] border px-4 py-2.5 transition-colors duration-200 hover:bg-white/[0.07]"
      style={{ background: "rgba(255,255,255,0.03)", borderColor: BORDER }}
    >
      <ShieldCheck className="size-4" style={{ color: GREEN }} />
      <span className="text-[11px] font-medium uppercase" style={{ color: TXT, letterSpacing: "0.22em" }}>
        Yedek Testi
      </span>
    </button>
  )
}

/* ══════════════════════════════════════════════════════════
   Panel
══════════════════════════════════════════════════════════ */

export function YedekTestiPaneli({ onClose }: { onClose: () => void }) {
  const [plan,   setPlan]   = useState<PlanAdimi[]>([])
  const [adimlar, setAdimlar] = useState<Record<string, Adim>>({})
  const [sonuc,  setSonuc]  = useState<Sonuc | null>(null)
  const [hata,   setHata]   = useState<string | null>(null)
  const [gecen,  setGecen]  = useState(0)
  const [kalan,  setKalan]  = useState(OTO_KAPAT_SN)

  const basladiRef = useRef(Date.now())

  /* Geçen süre sayacı — test sürerken üst köşede işliyor */
  useEffect(() => {
    if (sonuc || hata) return
    const t = setInterval(() => setGecen(Math.floor((Date.now() - basladiRef.current) / 1000)), 1000)
    return () => clearInterval(t)
  }, [sonuc, hata])

  /* Bittikten sonra geri sayım: duvarda kimse yoksa ekran kendine dönsün */
  useEffect(() => {
    if (!sonuc && !hata) return
    const t = setInterval(() => setKalan((k) => (k <= 1 ? (onClose(), 0) : k - 1)), 1000)
    return () => clearInterval(t)
  }, [sonuc, hata, onClose])

  /* Esc ile kapat — duvarın başındaki klavye alışkanlığı */
  useEffect(() => {
    const f = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", f)
    return () => window.removeEventListener("keydown", f)
  }, [onClose])

  const calistir = useCallback(async (iptal: AbortSignal) => {
    setPlan([]); setAdimlar({}); setSonuc(null); setHata(null)
    setGecen(0); setKalan(OTO_KAPAT_SN)
    basladiRef.current = Date.now()

    let resp: Response
    try {
      resp = await fetch("/api/tv/yedek-testi", { signal: iptal, cache: "no-store" })
    } catch (e) {
      if (!iptal.aborted) setHata(e instanceof Error ? e.message : String(e))
      return
    }
    if (!resp.ok || !resp.body) {
      const g = await resp.json().catch(() => null)
      setHata(g?.error ?? `Test başlatılamadı (HTTP ${resp.status})`)
      return
    }

    /* SSE ayrıştırma: olaylar boş satırla ayrılıyor */
    const okuyucu = resp.body.pipeThrough(new TextDecoderStream()).getReader()
    let tampon = ""
    try {
      for (;;) {
        const { value, done } = await okuyucu.read()
        if (done) break
        tampon += value
        let i: number
        while ((i = tampon.indexOf("\n\n")) >= 0) {
          const blok = tampon.slice(0, i); tampon = tampon.slice(i + 2)
          const tip  = blok.match(/^event: (.+)$/m)?.[1]
          const veri = blok.match(/^data: (.+)$/m)?.[1]
          if (!tip || !veri) continue
          const d = JSON.parse(veri)
          if      (tip === "plan")  setPlan(d as PlanAdimi[])
          else if (tip === "adim")  setAdimlar((o) => ({ ...o, [(d as Adim).id]: d as Adim }))
          else if (tip === "bitti") setSonuc(d as Sonuc)
          else if (tip === "hata")  setHata(d.mesaj)
        }
      }
    } catch (e) {
      if (!iptal.aborted) setHata(e instanceof Error ? e.message : String(e))
    }
  }, [])

  useEffect(() => {
    const c = new AbortController()
    void calistir(c.signal)
    return () => c.abort()
  }, [calistir])

  /* Test bitince son adımın ayrıntıları da görünsün */
  const listeRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (sonuc) listeRef.current?.scrollTo({ top: listeRef.current.scrollHeight, behavior: "smooth" })
  }, [sonuc])

  const biten   = Object.values(adimlar).filter((a) => a.durum !== "calisiyor").length
  const toplam  = plan.length || 7
  const ilerleme = Math.round((biten / toplam) * 100)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-10"
      style={{ background: "rgba(8,8,10,0.88)", backdropFilter: "blur(6px)" }}
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-[1080px] flex-col overflow-hidden rounded-[16px]"
        style={{ background: PANEL, border: `1px solid ${BORDER}`, boxShadow: "0 40px 120px rgba(0,0,0,0.6)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Başlık ── */}
        <div className="flex items-center gap-4 px-8 pb-5 pt-6">
          <span
            className="flex size-11 shrink-0 items-center justify-center rounded-[10px]"
            style={{ background: "rgba(52,211,153,0.10)", border: "1px solid rgba(52,211,153,0.22)" }}
          >
            <ShieldCheck className="size-5" style={{ color: GREEN }} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[22px] font-semibold tracking-tight" style={{ color: "#F4F4F5" }}>
              Yedek Doğrulama Testi
            </div>
            <div className="text-[13px]" style={{ color: TXT_DIM }}>
              Verilerin gerçekten yedeklendiği, sunucuya o an bağlanılarak yedi adımda doğrulanıyor
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div className="font-mono text-[18px] font-semibold tabular-nums" style={{ color: sonuc ? renk(sonuc.durum) : TXT }}>
              {sonuc ? sure(sonuc.sureMs) : `${gecen} sn`}
            </div>
            <div className="text-[10px] uppercase" style={{ color: TXT_DIM, letterSpacing: "0.22em" }}>
              {sonuc ? "toplam süre" : "sürüyor"}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex size-8 shrink-0 items-center justify-center rounded-[8px] border transition-colors hover:bg-white/[0.07]"
            style={{ borderColor: BORDER }}
          >
            <X className="size-4" style={{ color: TXT_DIM }} />
          </button>
        </div>

        {/* ── İlerleme çizgisi ── */}
        <div className="h-[2px] w-full" style={{ background: "rgba(255,255,255,0.07)" }}>
          <div
            className="h-full transition-[width] duration-500 ease-out"
            style={{ width: `${ilerleme}%`, background: sonuc ? renk(sonuc.durum) : GREEN }}
          />
        </div>

        {/* ── Adımlar ── */}
        <div ref={listeRef} className="min-h-0 flex-1 overflow-y-auto px-8 py-4">
          {plan.length === 0 && !hata && (
            <div className="flex items-center gap-3 py-10" style={{ color: TXT_DIM }}>
              <Loader2 className="size-4 animate-spin" />
              <span className="text-[13px]">Sunucuya bağlanılıyor…</span>
            </div>
          )}

          {plan.map((p, i) => (
            <AdimSatiri key={p.id} sira={i + 1} plan={p} adim={adimlar[p.id]} />
          ))}

          {hata && (
            <div
              className="mt-4 flex items-start gap-3 rounded-[10px] px-4 py-3"
              style={{ background: "rgba(248,113,113,0.10)", border: "1px solid rgba(248,113,113,0.25)" }}
            >
              <AlertTriangle className="mt-[2px] size-4 shrink-0" style={{ color: RED }} />
              <div>
                <div className="text-[13px] font-medium" style={{ color: RED }}>Test tamamlanamadı</div>
                <div className="text-[12px]" style={{ color: TXT_DIM }}>{hata}</div>
              </div>
            </div>
          )}
        </div>

        {/* ── Sonuç ── */}
        <div
          className="flex items-center gap-4 px-8 py-5"
          style={{
            borderTop: `1px solid ${BORDER}`,
            background: sonuc
              ? sonuc.durum === "ok"    ? "rgba(52,211,153,0.07)"
              : sonuc.durum === "uyari" ? "rgba(251,191,36,0.07)"
              :                           "rgba(248,113,113,0.07)"
              : "transparent",
          }}
        >
          {sonuc ? (
            <>
              <span
                className="flex size-9 shrink-0 items-center justify-center rounded-full"
                style={{ background: `${renk(sonuc.durum)}22`, border: `1px solid ${renk(sonuc.durum)}55` }}
              >
                {sonuc.durum === "ok"
                  ? <Check className="size-5" style={{ color: GREEN }} />
                  : <AlertTriangle className="size-[18px]" style={{ color: renk(sonuc.durum) }} />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[17px] font-semibold" style={{ color: renk(sonuc.durum) }}>
                  {sonuc.durum === "ok" ? "Yedekler doğrulandı" : sonuc.durum === "uyari" ? "Doğrulandı — dikkat edilecek nokta var" : "Sorun bulundu"}
                </div>
                <div className="text-[13px]" style={{ color: TXT_DIM }}>{sonuc.ozet}</div>
              </div>
              <div className="shrink-0 text-right text-[10px] uppercase" style={{ color: TXT_DIM, letterSpacing: "0.2em" }}>
                {kalan} sn sonra kapanır
              </div>
            </>
          ) : (
            <div className="text-[12px]" style={{ color: TXT_DIM }}>
              Bu test hiçbir veriyi değiştirmez — yalnızca okur ve karşılaştırır.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════
   Tek adım satırı
══════════════════════════════════════════════════════════ */

function AdimSatiri({ sira, plan, adim }: { sira: number; plan: PlanAdimi; adim?: Adim }) {
  const durum    = adim?.durum
  const bekliyor = !adim
  const c = durum ? renk(durum) : TXT_DIM

  /*  Sıradaki adım her zaman görünür olsun: liste panelden uzunsa (ayrıntı
   *  satırlarıyla birlikte oluyor) kendiliğinden kayıyor, izleyen kişi
   *  ekranda elle kaydırma beklemiyor.                                   */
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (durum === "calisiyor") ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" })
  }, [durum])

  return (
    <div
      ref={ref}
      className="flex items-start gap-4 rounded-[10px] px-3 py-3.5 transition-all duration-300"
      style={{
        opacity:    bekliyor ? 0.32 : 1,
        background: durum === "calisiyor" ? "rgba(255,255,255,0.035)" : "transparent",
      }}
    >
      {/* Durum göstergesi: sıra no → dönen halka → sonuç işareti */}
      <span
        className="mt-[2px] flex size-8 shrink-0 items-center justify-center rounded-full border"
        style={{
          borderColor: durum && durum !== "calisiyor" ? `${c}66` : "rgba(255,255,255,0.14)",
          background:  durum && durum !== "calisiyor" ? `${c}1A` : "transparent",
        }}
      >
        {durum === "calisiyor" ? (
          <Loader2 className="size-3.5 animate-spin" style={{ color: TXT }} />
        ) : durum === "ok" ? (
          <Check className="size-4" style={{ color: GREEN }} />
        ) : durum ? (
          <AlertTriangle className="size-3" style={{ color: c }} />
        ) : (
          <span className="font-mono text-[11px] tabular-nums" style={{ color: TXT_DIM }}>{sira}</span>
        )}
      </span>

      {/* Ad + açıklama + detay */}
      <div className="min-w-0 flex-1">
        <div className="text-[16px] font-medium" style={{ color: bekliyor ? TXT_DIM : "#E4E4E7" }}>
          {plan.baslik}
        </div>
        <div className="text-[12.5px]" style={{ color: TXT_DIM }}>{plan.aciklama}</div>

        {adim?.detay && adim.durum !== "calisiyor" && (
          <div className="mt-1.5 flex flex-col gap-[2px]">
            {adim.detay.filter(Boolean).map((d, i) => (
              <div key={i} className="text-[12px]" style={{ color: "#8B8B93" }}>{d}</div>
            ))}
          </div>
        )}
      </div>

      {/* Sonuç değeri */}
      <div className="shrink-0 pt-[2px] text-right">
        <div className="font-mono text-[15px] font-semibold tabular-nums" style={{ color: c }}>
          {adim?.durum === "calisiyor" ? "kontrol ediliyor…" : (adim?.deger ?? "")}
        </div>
        {adim?.sureMs !== undefined && (
          <div className="font-mono text-[11px] tabular-nums" style={{ color: "#5A5A62" }}>{sure(adim.sureMs)}</div>
        )}
      </div>
    </div>
  )
}
