"use client"

/**
 * Arıza bandı — ekranın üst ortasında.
 *
 * ── Neden var? ─────────────────────────────────────────────────────────
 * Bu ekranın var olma sebebi bir şeyin bozulduğunu haber vermek. Ama arıza
 * hâlinde değişen tek şey uzaktaki bir yaprağın kırmızıya dönmesiydi —
 * odadan bakan biri fark etmezdi. Bant, ekranın en çok bakılan yerinde
 * (üst orta) ve hareketiyle kendini gösteriyor.
 *
 * ── Neden nabız? ───────────────────────────────────────────────────────
 * Sayfanın geri kalanı sakin ve aralıklı hareket ediyor. Bandın sürekli
 * ve düzenli atması bilinçli bir aykırılık: göz düzensizliğe alışır,
 * düzenli tekrar dikkat çeker. Yani arıza yokken sayfa "canlı", arıza
 * varken "ısrarcı" oluyor.
 *
 * ── Birden fazla arıza ─────────────────────────────────────────────────
 * İlk arıza adıyla yazılıyor, kalanı "+N" olarak sayılıyor. Hepsini
 * listelemek bandı uzatır ve TV'de okunmaz hâle getirir; asıl iş
 * "bir şey bozuldu, hemen bak" demek — dökümü ağacın kendisi veriyor.
 */

import type { KumaMonitor } from "../_shared/types"
import { formatDuration } from "../_shared/types"

const DOWN     = "#EF4444"
const DOWN_DIM = "rgba(239,68,68,0.16)"

interface Props {
  monitors: KumaMonitor[]
  /** Arızanın başladığı an (epoch ms) — süre bundan hesaplanıyor */
  since?: number
  now:    Date | null
}

export function AlarmBanner({ monitors, since, now }: Props) {
  if (monitors.length === 0) return null

  const first = monitors[0]
  const rest  = monitors.length - 1
  const dur   = since && now ? formatDuration(now.getTime() - since) : null

  return (
    <div className="pointer-events-none absolute left-1/2 top-7 z-30 -translate-x-1/2 select-none">
      <div
        className="tv-alarm flex items-center gap-4 rounded-[6px] px-5 py-3"
        style={{
          background: "rgba(24,10,12,0.86)",
          border: `1px solid ${DOWN}`,
          boxShadow: `0 0 34px ${DOWN_DIM}`,
        }}
      >
        {/* Nabız atan nokta — bandın kendisi de nefes alıyor */}
        <span className="relative flex size-[9px] shrink-0">
          <span
            className="tv-alarm-ring absolute inline-flex size-full rounded-full"
            style={{ background: DOWN }}
          />
          <span
            className="relative inline-flex size-full rounded-full"
            style={{ background: DOWN, boxShadow: `0 0 12px ${DOWN}` }}
          />
        </span>

        <span
          className="text-[10px] font-bold uppercase"
          style={{ color: DOWN, letterSpacing: "0.28em" }}
        >
          Müdahale gerekiyor
        </span>

        <span className="h-4 w-px" style={{ background: "rgba(239,68,68,0.34)" }} />

        <span className="text-[14px] font-semibold text-zinc-100">
          {first.name}
          {rest > 0 && (
            <span className="ml-2 font-mono text-[12px]" style={{ color: DOWN }}>
              +{rest}
            </span>
          )}
        </span>

        <span className="text-[11px]" style={{ color: "#FCA5A5" }}>
          çevrimdışı
        </span>

        {dur && (
          <span className="font-mono text-[13px] font-bold tabular-nums" style={{ color: DOWN }}>
            {dur}
          </span>
        )}
      </div>

      <style jsx>{`
        .tv-alarm {
          animation: tv-alarm-breathe 1.6s ease-in-out infinite;
        }
        .tv-alarm-ring {
          animation: tv-alarm-ping 1.6s cubic-bezier(0, 0, 0.2, 1) infinite;
        }
        @keyframes tv-alarm-breathe {
          0%,
          100% {
            box-shadow: 0 0 24px rgba(239, 68, 68, 0.12);
          }
          50% {
            box-shadow: 0 0 44px rgba(239, 68, 68, 0.34);
          }
        }
        @keyframes tv-alarm-ping {
          0% {
            transform: scale(1);
            opacity: 0.75;
          }
          75%,
          100% {
            transform: scale(2.6);
            opacity: 0;
          }
        }
        /* Hareketi azalt tercihine saygı — bant yine görünür, yalnız atmaz */
        @media (prefers-reduced-motion: reduce) {
          .tv-alarm,
          .tv-alarm-ring {
            animation: none;
          }
        }
      `}</style>
    </div>
  )
}
