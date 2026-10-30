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

const DOWN     = "#EF4444"
const DOWN_DIM = "rgba(239,68,68,0.16)"

interface Props {
  monitors: KumaMonitor[]
  /** Arızanın başladığı an (epoch ms) — süre bundan hesaplanıyor */
  since?: number
  now:    Date | null
}

/** Sağdaki kart ızgarasının kapladığı genişlik — bant onun solundaki alanda ortalanır */
const KART_IZGARASI_W = 860
/** Saat + durum bloğunun bittiği yer (clock.tsx + status-line.tsx) */
const BANT_SOL = 560

export function AlarmBanner({ monitors }: Props) {
  if (monitors.length === 0) return null

  const first = monitors[0]
  const rest  = monitors.length - 1

  return (
    <>
      {/*  Ekran kenarında atan kırmızı ışıma — arıza, ekranın neresine
           bakılırsa bakılsın göz ucuyla fark edilsin.                  */}
      <div
        className="tv-alarm-kenar pointer-events-none absolute inset-0 z-30"
        style={{ boxShadow: "inset 0 0 160px rgba(239,68,68,0.32)" }}
      />

      {/*  Bant: saat satırında, uptime'ın sağı ile kart ızgarasının solu
           arasında. Önce saatin altındaydı; dar ekranda ağacın başlığına ve
           detay kutusuna biniyordu. Bu satırda ağaç da kutu da yok.       */}
      <div
        className="pointer-events-none absolute top-6 z-30 select-none"
        style={{ left: BANT_SOL, maxWidth: `calc(100% - ${KART_IZGARASI_W}px - ${BANT_SOL}px)` }}
      >
        <div
          className="tv-alarm flex min-w-0 items-center gap-6 rounded-[10px] py-3.5 pr-6 pl-5"
          style={{
            background: "rgba(24,10,12,0.88)",
            border: `1px solid ${DOWN}`,
            boxShadow: `0 0 34px ${DOWN_DIM}`,
          }}
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2.5">
              {/* Nabız atan nokta */}
              <span className="relative flex size-[8px] shrink-0">
                <span className="tv-alarm-ring absolute inline-flex size-full rounded-full" style={{ background: DOWN }} />
                <span className="relative inline-flex size-full rounded-full" style={{ background: DOWN, boxShadow: `0 0 12px ${DOWN}` }} />
              </span>
              <span className="text-[10px] font-bold uppercase" style={{ color: DOWN, letterSpacing: "0.28em" }}>
                Müdahale gerekiyor
              </span>
            </div>

            {/* Arızalı monitör — saatle aynı ince büyük yazı */}
            <div className="mt-2 flex items-baseline gap-3">
              <span className="min-w-0 truncate text-[34px] font-extralight leading-none tracking-[-0.02em] text-zinc-50">
                {first.name}
              </span>
              {rest > 0 && (
                <span className="shrink-0 text-[20px] font-light" style={{ color: DOWN }}>+{rest}</span>
              )}
            </div>
            <div className="mt-1.5 text-[11px] uppercase" style={{ color: "#FCA5A5", letterSpacing: "0.18em" }}>
              Çevrimdışı{rest > 0 ? ` · ${rest} arıza daha` : ""}
            </div>
          </div>

        </div>
      </div>

      <style jsx>{`
        .tv-alarm {
          animation: tv-alarm-breathe 1.6s ease-in-out infinite;
        }
        .tv-alarm-ring {
          animation: tv-alarm-ping 1.6s cubic-bezier(0, 0, 0.2, 1) infinite;
        }
        .tv-alarm-kenar {
          animation: tv-alarm-kenar 1.6s ease-in-out infinite;
        }
        @keyframes tv-alarm-breathe {
          0%,
          100% {
            box-shadow: 0 0 24px rgba(239, 68, 68, 0.12);
          }
          50% {
            box-shadow: 0 0 52px rgba(239, 68, 68, 0.4);
          }
        }
        @keyframes tv-alarm-kenar {
          0%,
          100% {
            opacity: 0.35;
          }
          50% {
            opacity: 1;
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
          .tv-alarm-ring,
          .tv-alarm-kenar {
            animation: none;
          }
        }
      `}</style>
    </>
  )
}
