"use client"

/**
 * Pusula Connect — Ayarlar sekmesi (Hub /connect).
 * Müşteri uygulamalarının bağlandığı VPN sunucusu + portu (hub.settings). Kaydedilince uygulamalar
 * nabızla (~1–3 dk) fark eder ve "VPN ayarını güncelleyin" der; FortiClient ayarı yeniden yazılır.
 */

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Field } from "@/components/shared/form"
import { toast } from "sonner"
import { Info, Settings } from "lucide-react"

type Ayar = { vpnSunucu: string; vpnPort: string; varsayilan: boolean }

export function AyarlarSekmesi() {
  const [ayar, setAyar] = useState<Ayar | null>(null)
  const [sunucu, setSunucu] = useState("")
  const [port, setPort] = useState("")
  const [kaydediliyor, setKaydediliyor] = useState(false)

  useEffect(() => {
    fetch("/api/connect/ayarlar", { cache: "no-store" })
      .then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d?.error ?? "Ayarlar alınamadı"); return d as Ayar })
      .then((d) => { setAyar(d); setSunucu(d.vpnSunucu); setPort(d.vpnPort) })
      .catch((e) => toast.error(e instanceof Error ? e.message : "Ayarlar alınamadı"))
  }, [])

  const degisti = !!ayar && (sunucu !== ayar.vpnSunucu || port !== ayar.vpnPort)
  const gecerli = !!sunucu && /^\d{1,5}$/.test(port)

  const kaydet = async () => {
    setKaydediliyor(true)
    try {
      const r = await fetch("/api/connect/ayarlar", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vpnSunucu: sunucu, vpnPort: port }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d?.error ?? `HTTP ${r.status}`)
      setAyar({ vpnSunucu: d.vpnSunucu, vpnPort: d.vpnPort, varsayilan: false })
      setSunucu(d.vpnSunucu); setPort(d.vpnPort)
      toast.success("VPN ayarı kaydedildi", { description: "Uygulamalar birkaç dakika içinde fark edip FortiClient ayarını güncellemeyi ister." })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Kaydedilemedi")
    } finally {
      setKaydediliyor(false)
    }
  }

  return (
    <div className="bg-[var(--section-bg)] max-w-[560px] rounded-[8px] p-2">
      <div className="text-muted-foreground flex items-center gap-1.5 px-2 pt-1 pb-2 text-[10px] font-medium tracking-wider uppercase">
        <Settings className="size-3.5" /> VPN sunucusu
      </div>
      <div className="bg-card flex flex-col gap-3 rounded-[8px] p-4" style={{ boxShadow: "var(--card-shadow)" }}>
        {!ayar ? (
          <>
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-28" />
          </>
        ) : (
          <>
            <Field label="Sunucu adresi" required>
              <Input value={sunucu} onChange={(e) => setSunucu(e.target.value.trim())} placeholder="vpn.pusulanet.net" className="font-mono" />
            </Field>
            <Field label="Port" required>
              <Input value={port} onChange={(e) => setPort(e.target.value.replace(/\D/g, ""))} placeholder="17443" className="w-28 font-mono" inputMode="numeric" />
            </Field>
            <div className="text-muted-foreground flex items-start gap-2 rounded-[5px] bg-sky-500/10 px-3 py-2 text-[12px] text-sky-800 dark:text-sky-300">
              <Info className="mt-0.5 size-3.5 shrink-0" />
              <span>
                Müşteri bilgisayarlarındaki Connect bu adrese bağlanır. Değiştirince uygulamalar birkaç dakika içinde fark eder ve
                kullanıcıdan FortiClient ayarını güncellemesini ister (yönetici izni). Yeni kurulum kodları da bu adresle üretilir.
                {ayar.varsayilan && " Henüz kaydedilmedi; varsayılan değer kullanılıyor."}
              </span>
            </div>
            <div className="flex justify-end">
              <Button size="sm" disabled={!degisti || !gecerli || kaydediliyor} onClick={() => void kaydet()}>
                {kaydediliyor ? "Kaydediliyor…" : "Kaydet"}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
