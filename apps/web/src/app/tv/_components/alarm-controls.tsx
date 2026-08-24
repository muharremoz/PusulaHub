"use client"

/**
 * Sağ alt köşedeki iki küçük düğme: ses ve alarm testi.
 *
 * ── Neden bu kadar sönük? ──────────────────────────────────────────────
 * Bu bir izleme duvarı; düğmeler ekranın konusu değil. Normalde neredeyse
 * görünmezler, imleç yaklaşınca belirirler. Ses açıkken ise sürekli
 * görünür kalıyor — "bu ekran ses çıkarabilir" bilgisi saklanmamalı.
 *
 * ── Neden alarm testi? ─────────────────────────────────────────────────
 * Arıza hâli yılda birkaç kez görülüyor. Bandın, sesin ve otomatik
 * odaklanmanın çalıştığını bozulmayı bekleyerek öğrenemeyiz. Test, Active
 * Directory'yi 8 saniye yapay DOWN göstererek bütün zinciri çalıştırır.
 */

import { Bell, BellOff, Siren } from "lucide-react"

const TXT_DIM = "#71717A"
const DOWN    = "#EF4444"
const UP      = "#34D399"

interface Props {
  soundOn:       boolean
  onToggleSound: () => void
  testDown:      boolean
  onTest:        () => void
}

export function AlarmControls({ soundOn, onToggleSound, testDown, onTest }: Props) {
  return (
    <div className="group absolute bottom-7 right-8 z-30 flex items-center gap-2">
      <button
        type="button"
        onClick={onTest}
        disabled={testDown}
        title="Alarm testi — 8 sn yapay arıza"
        className="flex size-8 items-center justify-center rounded-[5px] border transition-opacity duration-200 opacity-0 group-hover:opacity-100 disabled:cursor-default"
        style={{
          borderColor: testDown ? DOWN : "rgba(255,255,255,0.10)",
          background: "rgba(20,20,23,0.72)",
          opacity: testDown ? 1 : undefined,
        }}
      >
        <Siren className="size-3.5" style={{ color: testDown ? DOWN : TXT_DIM }} />
      </button>

      <button
        type="button"
        onClick={onToggleSound}
        title={soundOn ? "Sesi kapat" : "Sesi aç"}
        className="flex size-8 items-center justify-center rounded-[5px] border transition-opacity duration-200 group-hover:opacity-100"
        style={{
          borderColor: soundOn ? "rgba(52,211,153,0.34)" : "rgba(255,255,255,0.10)",
          background: "rgba(20,20,23,0.72)",
          // Ses açıkken hep görünür: sessiz sanılan bir ekran tehlikeli
          opacity: soundOn ? 1 : 0,
        }}
      >
        {soundOn ? (
          <Bell className="size-3.5" style={{ color: UP }} />
        ) : (
          <BellOff className="size-3.5" style={{ color: TXT_DIM }} />
        )}
      </button>
    </div>
  )
}
