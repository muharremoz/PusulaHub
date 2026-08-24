"use client"

/**
 * /tv/agac — Monitör ağacı (koyu tema).
 *
 * Üç gövde: Sunucular · Uygulamalar · Dış Dünya. Gövde eşlemesi
 * `_shared/monitor-groups` içinde; ağaç gruplamanın nereden geldiğini
 * bilmiyor, ileride kaynak değişirse burası değişmez.
 *
 * ── Aynı sayfa iki ekranda ─────────────────────────────────────────────
 * Masaüstünde dala tıklanır, detay sağda açılır — keşif aracı.
 * Duvardaki TV'ye kimse dokunmaz; orada bir şey düştüğünde detay
 * KENDİLİĞİNDEN açılır, birden fazla arıza varsa 8 saniyede bir sıradakine
 * geçer. Elle seçim yapılırsa otomatik seçim devreye girmez; seçim
 * kaldırılınca yeniden devralır.
 *
 * Animasyon yok. Değişen tek şey renk.
 */

import { useEffect, useMemo, useState } from "react"
import { Activity, AlertTriangle, Volume2, VolumeX } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  type KumaMonitor,
  type UiStatus,
  formatDuration,
  formatTarget,
  mapStatus,
} from "../_shared/types"
import { groupIntoTrees, treeOf, TREES } from "../_shared/monitor-groups"
import { useAlarmSound, useClock, useTvData } from "../_shared/use-tv-data"
import { Tree } from "./_components/tree"

/* ── Koyu tema ── */
const PAGE   = "#0B0B0D"
const PANEL  = "#141417"
const BORDER = "rgba(255,255,255,0.07)"

const TONE: Record<UiStatus, { label: string; text: string; dot: string; bg: string; border: string }> = {
  online:  { label: "Çevrimiçi",  text: "text-emerald-400", dot: "bg-emerald-400", bg: "rgba(52,211,153,0.08)",  border: "rgba(52,211,153,0.25)" },
  warning: { label: "Uyarı",      text: "text-amber-400",   dot: "bg-amber-400",   bg: "rgba(251,191,36,0.08)",  border: "rgba(251,191,36,0.25)" },
  offline: { label: "Çevrimdışı", text: "text-red-400",     dot: "bg-red-500",     bg: "rgba(239,68,68,0.10)",   border: "rgba(239,68,68,0.35)" },
}

function Panel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn("flex min-h-0 flex-col overflow-hidden rounded-[8px]", className)}
      style={{ background: PANEL, border: `1px solid ${BORDER}` }}
    >
      {children}
    </div>
  )
}

function PanelHead({ title, right }: { title: string; right?: React.ReactNode }) {
  return (
    <div
      className="flex shrink-0 items-center justify-between gap-2 px-3 py-2"
      style={{ borderBottom: `1px solid ${BORDER}` }}
    >
      <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-zinc-500">{title}</span>
      {right}
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-zinc-500">{label}</span>
      <span className="min-w-0 truncate text-right">{children}</span>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════
   Detay paneli
══════════════════════════════════════════════════════════ */

function Detail({
  monitor,
  since,
  auto,
}: {
  monitor: KumaMonitor
  since?: number
  auto: boolean
}) {
  const now = useClock()
  const ui  = mapStatus(monitor.status)
  const t   = TONE[ui]
  const treeLabel = TREES.find((x) => x.key === treeOf(monitor))?.label ?? "—"

  return (
    <Panel className="shrink-0">
      <PanelHead
        title="Detay"
        right={
          auto ? (
            <span className="font-mono text-[9px] uppercase tracking-wide text-zinc-600">otomatik</span>
          ) : undefined
        }
      />
      <div className="px-3 py-3">
        <div className="flex items-center gap-2">
          <span className={cn("size-2 shrink-0 rounded-full", t.dot)} />
          <span className={cn("text-[10px] font-bold uppercase tracking-[0.2em]", t.text)}>{t.label}</span>
        </div>
        <div className="mt-2 truncate text-[22px] font-bold leading-tight text-zinc-100">
          {monitor.name}
        </div>
        <div className="mt-1 truncate font-mono text-[11px] text-zinc-500">{formatTarget(monitor)}</div>

        <div className="mt-3 divide-y" style={{ borderColor: BORDER }}>
          <Row label="Gövde">
            <span className="text-[12px] text-zinc-300">{treeLabel}</span>
          </Row>
          <Row label="Tür">
            <span className="font-mono text-[12px] uppercase text-zinc-300">{monitor.type}</span>
          </Row>
          {monitor.port && (
            <Row label="Port">
              <span className="font-mono text-[12px] text-zinc-300">{monitor.port}</span>
            </Row>
          )}
          <Row label="Yanıt">
            <span className={cn("font-mono text-[12px]", ui === "offline" ? "text-red-400" : "text-zinc-300")}>
              {monitor.responseMs === null ? "—" : `${monitor.responseMs} ms`}
            </span>
          </Row>
          {since && now && (
            <Row label={ui === "offline" ? "Düştü" : "Bu durumda"}>
              <span className={cn("font-mono text-[12px]", ui === "offline" ? "text-red-400" : "text-zinc-400")}>
                {formatDuration(now.getTime() - since)} önce
              </span>
            </Row>
          )}
        </div>
      </div>
    </Panel>
  )
}

/* ══════════════════════════════════════════════════════════
   Sayfa
══════════════════════════════════════════════════════════ */

export default function TvAgacPage() {
  const {
    data, error,
    tracker, lastDownAt,
    downMonitors,
    uptimePct,
    testDown, triggerTestDown,
  } = useTvData()

  const { soundOn, setSoundOn } = useAlarmSound(lastDownAt, downMonitors.length > 0)
  const now = useClock()

  const monitors = useMemo(() => data?.monitors ?? [], [data])
  const groups   = useMemo(() => groupIntoTrees(monitors), [monitors])

  /* ── Seçim: elle > otomatik ── */
  const [manual, setManual] = useState<string | null>(null)
  const [autoIdx, setAutoIdx] = useState(0)

  // Birden fazla arıza varsa 8 saniyede bir sıradakine geç (TV için)
  useEffect(() => {
    if (downMonitors.length <= 1) return
    const t = setInterval(() => setAutoIdx((i) => i + 1), 8000)
    return () => clearInterval(t)
  }, [downMonitors.length])

  const autoName =
    downMonitors.length > 0
      ? downMonitors[autoIdx % downMonitors.length].name
      : null

  const selectedName = manual ?? autoName
  const selected     = monitors.find((m) => m.name === selectedName) ?? null
  const isAuto       = manual === null && autoName !== null

  const counts  = data?.counts ?? { total: 0, online: 0, warning: 0, offline: 0 }
  const anyDown = downMonitors.length > 0

  if (error && !data) {
    return (
      <div className="flex h-screen items-center justify-center p-16" style={{ background: PAGE }}>
        <div className="max-w-2xl rounded-[8px] px-10 py-12 text-center" style={{ background: PANEL, border: `1px solid ${BORDER}` }}>
          <AlertTriangle className="mx-auto mb-6 size-16 text-amber-400" />
          <p className="mb-2 text-[24px] font-bold text-zinc-100">Uptime Kuma&apos;ya ulaşılamadı</p>
          <p className="text-[14px] text-zinc-400">{error}</p>
        </div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="flex h-screen items-center justify-center" style={{ background: PAGE }}>
        <div className="flex items-center gap-4 text-zinc-500">
          <Activity className="size-10" />
          <span className="text-[24px]">Uptime Kuma&apos;ya bağlanılıyor…</span>
        </div>
      </div>
    )
  }

  return (
    <div
      className="flex h-screen flex-col gap-2 p-3 text-zinc-100"
      style={{ background: PAGE, colorScheme: "dark" }}
    >
      {/* ── Başlık ── */}
      <div className="flex shrink-0 items-center justify-between gap-3 px-1">
        <div className="flex min-w-0 items-center gap-3">
          <div className="leading-tight">
            <h1 className="text-[13px] font-bold tracking-tight text-zinc-100">
              ALTYAPI AĞACI
            </h1>
            <div className="text-[9px] font-medium uppercase tracking-[0.2em] text-zinc-500">
              Pusula Yazılım
            </div>
          </div>

          {anyDown && (
            <div
              className="flex items-center gap-2 rounded-[5px] px-2.5 py-1"
              style={{ background: TONE.offline.bg, border: `1px solid ${TONE.offline.border}` }}
            >
              <AlertTriangle className="size-3.5 text-red-400" />
              <span className="text-[11px] font-bold uppercase tracking-wide text-red-300">
                {downMonitors.length} çevrimdışı
              </span>
              <span className="max-w-[420px] truncate font-mono text-[10px] text-red-400/70">
                {downMonitors.map((m) => m.name).join(" · ")}
              </span>
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-4">
          <div className="flex items-baseline gap-1.5">
            <span className={cn("text-[20px] font-bold tabular-nums", anyDown ? "text-red-400" : "text-emerald-400")}>
              %{uptimePct.toFixed(1)}
            </span>
            <span className="font-mono text-[10px] text-zinc-500">
              {counts.online}/{counts.total}
            </span>
          </div>

          <button
            type="button"
            onClick={triggerTestDown}
            disabled={testDown}
            className={cn(
              "h-7 rounded-[5px] border px-2 text-[10px] font-bold uppercase tracking-widest transition-colors",
              testDown
                ? "cursor-wait border-red-500/40 bg-red-500/15 text-red-300"
                : "border-white/10 bg-white/[0.04] text-zinc-400 hover:border-red-500/40 hover:text-red-300",
            )}
            title="Test: Active Directory'yi 8 sn boyunca DOWN göster"
          >
            {testDown ? "Test aktif…" : "Alarm Testi"}
          </button>
          <button
            type="button"
            onClick={() => setSoundOn((v) => !v)}
            className={cn(
              "flex size-7 items-center justify-center rounded-[5px] border transition-colors",
              soundOn
                ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                : "border-white/10 bg-white/[0.04] text-zinc-500 hover:text-zinc-300",
            )}
            title={soundOn ? "Ses açık" : "Ses kapalı"}
          >
            {soundOn ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
          </button>
          <div className="rounded-[5px] border border-white/10 bg-white/[0.04] px-2 py-1 font-mono text-[13px] tabular-nums text-zinc-300">
            {now ? now.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "--:--:--"}
          </div>
        </div>
      </div>

      {/* ── Ağaç + detay ── */}
      <div className="flex min-h-0 flex-1 gap-2">
        <Panel className="min-w-0 flex-1">
          <div className="min-h-0 flex-1 px-2">
            <Tree groups={groups} selectedName={selectedName} onSelect={setManual} />
          </div>
        </Panel>

        <aside className="flex w-[300px] shrink-0 flex-col gap-2">
          {selected ? (
            <Detail monitor={selected} since={tracker.get(selected.name)?.since} auto={isAuto} />
          ) : (
            <Panel className="shrink-0">
              <PanelHead title="Detay" />
              <div className="px-3 py-6 text-center">
                <div className="text-[12px] text-zinc-500">Bir dala tıkla</div>
                <div className="mt-1 text-[11px] text-zinc-600">
                  Bir sistem düştüğünde burası kendiliğinden açılır.
                </div>
              </div>
            </Panel>
          )}

          <Panel className="shrink-0">
            <PanelHead title="Özet" />
            <div className="px-3 py-2">
              {groups.map((g) => {
                const down = g.monitors.filter((m) => m.status === "down").length
                return (
                  <div key={g.def.key} className="flex items-center gap-2 py-1">
                    <span
                      className={cn("size-1.5 shrink-0 rounded-full", down > 0 ? TONE.offline.dot : TONE.online.dot)}
                    />
                    <span className="min-w-0 flex-1 truncate text-[11px] text-zinc-300">{g.def.label}</span>
                    <span className={cn("shrink-0 font-mono text-[10px]", down > 0 ? "text-red-400" : "text-zinc-500")}>
                      {down > 0 ? `${down}/${g.monitors.length}` : g.monitors.length}
                    </span>
                  </div>
                )
              })}
            </div>
          </Panel>
        </aside>
      </div>
    </div>
  )
}
