"use client"

/**
 * Anket sonuçları — Mesaj detayı. Soru başına özet (seçenek dağılımı / ortalama puan / yorumlar)
 * ve kullanıcı bazlı cevap tablosu (cevaplar isimli tutulur).
 */

import type { Anket, AnketCevaplari, AnketSorusu } from "@/lib/anket"
import { Star } from "lucide-react"

export interface AnketAlicisi {
  username: string
  serverName: string | null
  readAt: string | null
  answers: AnketCevaplari | null
}

function Cubuk({ etiket, sayi, toplam }: { etiket: string; sayi: number; toplam: number }) {
  const yuzde = toplam ? Math.round((sayi / toplam) * 100) : 0
  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between text-[12px]">
        <span className="truncate">{etiket}</span>
        <span className="text-muted-foreground tabular-nums">{sayi} · %{yuzde}</span>
      </div>
      <div className="bg-muted h-1.5 overflow-hidden rounded-[5px]">
        <div className="bg-primary h-full rounded-[5px]" style={{ width: `${yuzde}%` }} />
      </div>
    </div>
  )
}

function SoruOzeti({ s, cevaplar }: { s: AnketSorusu; cevaplar: AnketCevaplari[] }) {
  const verilen = cevaplar.map((c) => c[s.id]).filter((v) => v !== undefined)
  const n = verilen.length

  let icerik: React.ReactNode
  if (s.tip === "tek" || s.tip === "coklu") {
    const say = new Map<string, number>()
    for (const v of verilen) for (const x of Array.isArray(v) ? v : [v]) say.set(String(x), (say.get(String(x)) ?? 0) + 1)
    icerik = (
      <div className="space-y-1.5">
        {(s.secenekler ?? []).map((o) => <Cubuk key={o} etiket={o} sayi={say.get(o) ?? 0} toplam={n} />)}
      </div>
    )
  } else if (s.tip === "puan") {
    const sayilar = verilen.map(Number)
    const ort = n ? sayilar.reduce((a, b) => a + b, 0) / n : 0
    icerik = (
      <div className="space-y-1.5">
        <p className="flex items-center gap-1.5 text-[13px]">
          <Star className="size-3.5 fill-amber-400 text-amber-400" />
          <span className="text-2xl font-bold tabular-nums">{n ? ort.toFixed(1) : "—"}</span>
          <span className="text-muted-foreground text-[12px]">/ 5 ortalama</span>
        </p>
        {[5, 4, 3, 2, 1].map((p) => <Cubuk key={p} etiket={`${p} puan`} sayi={sayilar.filter((x) => x === p).length} toplam={n} />)}
      </div>
    )
  } else {
    icerik = verilen.length ? (
      <ul className="space-y-1">
        {verilen.map((v, i) => <li key={i} className="bg-muted/40 rounded-[5px] px-2 py-1 text-[12px] whitespace-pre-wrap">{String(v)}</li>)}
      </ul>
    ) : <p className="text-muted-foreground text-[12px]">Yorum yok.</p>
  }

  return (
    <div className="space-y-2 rounded-[5px] border p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[13px] font-medium">{s.soru}</p>
        <span className="text-muted-foreground shrink-0 text-[11px] tabular-nums">{n} cevap</span>
      </div>
      {icerik}
    </div>
  )
}

function cevapMetni(s: AnketSorusu, v: AnketCevaplari[string] | undefined) {
  if (v === undefined) return "—"
  if (Array.isArray(v)) return v.join(", ")
  if (s.tip === "puan") return `${v} / 5`
  return String(v)
}

export function AnketSonuclari({ anket, alicilar }: { anket: Anket; alicilar: AnketAlicisi[] }) {
  const cevaplayan = alicilar.filter((a) => a.answers && Object.keys(a.answers).length)
  const cevaplar = cevaplayan.map((a) => a.answers!)

  return (
    <div className="space-y-3">
      <p className="text-muted-foreground text-[12px]">
        <span className="text-foreground font-medium tabular-nums">{cevaplayan.length}</span> / {alicilar.length} kişi cevapladı
      </p>
      {anket.sorular.map((s) => <SoruOzeti key={s.id} s={s} cevaplar={cevaplar} />)}

      {cevaplayan.length > 0 && (
        <div className="overflow-x-auto rounded-[5px] border">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-muted-foreground border-b text-[10px] font-medium tracking-wider uppercase">
                <th className="px-3 py-1.5 text-left font-medium">Kullanıcı</th>
                {anket.sorular.map((s, i) => <th key={s.id} className="px-3 py-1.5 text-left font-medium" title={s.soru}>{i + 1}. soru</th>)}
              </tr>
            </thead>
            <tbody>
              {cevaplayan.map((a) => (
                <tr key={`${a.serverName}-${a.username}`} className="hover:bg-muted/20 border-b last:border-0">
                  <td className="px-3 py-1.5 font-medium whitespace-nowrap">{a.username}</td>
                  {anket.sorular.map((s) => <td key={s.id} className="max-w-56 truncate px-3 py-1.5" title={cevapMetni(s, a.answers![s.id])}>{cevapMetni(s, a.answers![s.id])}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
