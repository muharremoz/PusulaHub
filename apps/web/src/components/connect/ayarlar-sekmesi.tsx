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
import { Settings } from "lucide-react"

type Ayar = { vpnSunucu: string; vpnPort: string; varsayilan: boolean; sayimSqlAdres: string; sayimSqlVarsayilan: string }

export function AyarlarSekmesi() {
  const [ayar, setAyar] = useState<Ayar | null>(null)
  const [sunucu, setSunucu] = useState("")
  const [port, setPort] = useState("")
  const [sayimSql, setSayimSql] = useState("")
  const [kaydediliyor, setKaydediliyor] = useState(false)

  useEffect(() => {
    fetch("/api/connect/ayarlar", { cache: "no-store" })
      .then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d?.error ?? "Ayarlar alınamadı"); return d as Ayar })
      .then((d) => { setAyar(d); setSunucu(d.vpnSunucu); setPort(d.vpnPort); setSayimSql(d.sayimSqlAdres ?? "") })
      .catch((e) => toast.error(e instanceof Error ? e.message : "Ayarlar alınamadı"))
  }, [])

  const degisti = !!ayar && (sunucu !== ayar.vpnSunucu || port !== ayar.vpnPort || sayimSql !== (ayar.sayimSqlAdres ?? ""))
  const gecerli = !!sunucu && /^\d{1,5}$/.test(port) && (!sayimSql || /^[a-zA-Z0-9.-]+(,\d{1,5})?$/.test(sayimSql))

  const kaydet = async () => {
    setKaydediliyor(true)
    try {
      const r = await fetch("/api/connect/ayarlar", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vpnSunucu: sunucu, vpnPort: port, sayimSqlAdres: sayimSql }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d?.error ?? `HTTP ${r.status}`)
      setAyar((a) => ({ vpnSunucu: d.vpnSunucu, vpnPort: d.vpnPort, varsayilan: false, sayimSqlAdres: d.sayimSqlAdres ?? "", sayimSqlVarsayilan: a?.sayimSqlVarsayilan ?? "" }))
      setSunucu(d.vpnSunucu); setPort(d.vpnPort); setSayimSql(d.sayimSqlAdres ?? "")
      toast.success("Connect ayarları kaydedildi", { description: "VPN değiştiyse uygulamalar birkaç dakika içinde fark edip FortiClient ayarını güncellemeyi ister." })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Kaydedilemedi")
    } finally {
      setKaydediliyor(false)
    }
  }

  return (
    <div className="bg-[var(--section-bg)] w-full rounded-[8px] p-2" style={{ maxWidth: 520 }}>
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
            <Field label="Sayım SQL adresi">
              <Input value={sayimSql} onChange={(e) => setSayimSql(e.target.value.trim())} placeholder={ayar.sayimSqlVarsayilan} className="font-mono" />
              <p className="text-muted-foreground mt-1 text-[12px]">
                Pusula X sayım kopyasının (müşteri PC'si) bağlandığı SQL dış adresi, <span className="font-mono">sunucu,port</span>.
                Boşsa CRM SQL Konsolu ile aynı dış adres + firmanın portu kullanılır.
              </p>
            </Field>
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
