"use client"

/**
 * /tv — DevOps İzleme Merkezi.
 *
 * Bu sayfa /tv/agac olarak gelistirildi ve tamamlaninca /tv nin yerini
 * aldi. Onceki acik temali pano /tv/klasik adresinde duruyor; silinmedi
 * cunku ayni veriden bambaska bir okuma sunuyor (butun monitorler tek
 * ekranda, tablo halinde) ve karsilastirma icin ise yariyor.
 *
 * Eski adres /tv/agac calismaya devam ediyor: TV tarayicisinda yer imi
 * olarak duruyor olabilir, /tv ye yonlendiriyor.
 *
 * Sayfada BAŞKA HİÇBİR ŞEY yok: yalnız küre ve dalları. Başlık şeridi, uptime
 * göstergesi, saat, alarm düğmeleri, detay ve özet panelleri bilerek
 * kaldırıldı — ekran tek bir şeye baksın.
 *
 * Solda canlı küre, sağında üç gövde: Sunucular · Uygulamalar · Dış Dünya.
 * Bir gövdeye tıklanınca kamera oraya kayar ve yaprakları tek tek açılır.
 * Yaprağa tıklanınca vurgulanır. Boşluğa tıkla → geri.
 *
 * TV ayrı bir bağlam değil: ekran bir PC ekranından yansıtılıyor, yani tıklama
 * her yerde var. Tek etkileşim modeli.
 */

import { useEffect, useMemo, useRef, useState } from "react"
import { Activity, AlertTriangle } from "lucide-react"
import { type TreeKey, groupIntoTrees, treeOf } from "./_shared/monitor-groups"
import { useAlarmSound, useClock, useTvData } from "./_shared/use-tv-data"
import { Nexus } from "./_components/nexus"
import { BrandMark } from "./_components/brand-mark"
import { StatusLine } from "./_components/status-line"
import { Clock } from "./_components/clock"
import { RightRail } from "./_components/right-rail"
import { AlarmBanner } from "./_components/alarm-banner"
import { AlarmControls } from "./_components/alarm-controls"
import { useMockBandwidth, useMockOfflineFirms, useMockServerMetrics } from "./_components/mock-data"
import { useServerMetrics } from "./_components/use-server-metrics"

const PAGE   = "#0B0B0D"
const PANEL  = "#141417"
const BORDER = "rgba(255,255,255,0.07)"

export default function TvAgacPage() {
  const {
    data, error, bandwidth, offlineFirms, domains,
    downMonitors, uptimePct, tracker,
    lastDownAt, testDown, triggerTestDown,
  } = useTvData()

  const now = useClock()

  /*
   * Ses varsayilan olarak KAPALI ve tercihi localStorage'da tutuluyor.
   * Tarayicilar kullanici etkilesimi olmadan ses calmayi engelliyor;
   * acmak bilincli bir tikla oluyor.
   */
  const { soundOn, setSoundOn } = useAlarmSound(lastDownAt, downMonitors.length > 0)

  /*
   * Tasarim gorunumu: ?mock=1 varken bant genisligi sahte veriyle beslenir.
   * Lokalde BANDWIDTH_API_URL tanimli olmadigi icin gercek veri null geliyor
   * ve kart "Servise ulasilamadi" gosteriyor. URL isareti olmadan asla
   * devreye girmez -- sahte sayilar gercek sanilmasin.
   */
  const [mock, setMock] = useState(false)
  useEffect(() => {
    setMock(new URLSearchParams(window.location.search).get("mock") === "1")
  }, [])
  const mockBandwidth = useMockBandwidth(mock)
  const mockFirms     = useMockOfflineFirms(mock)

  /* Sunucu metrikleri: mock modda sahte, aksi halde /api/servers */
  const realMetrics = useServerMetrics(!mock)
  const mockMetrics = useMockServerMetrics(mock)
  const metrics     = mock ? mockMetrics : realMetrics

  const monitors = useMemo(() => data?.monitors ?? [], [data])
  const groups   = useMemo(() => groupIntoTrees(monitors), [monitors])

  /* Hangi gövde odakta — null ise genel görünüm (küre + 3 dal) */
  const [focusKey, setFocusKey] = useState<TreeKey | null>(null)
  /* Seçili yaprak — yalnızca vurgu için; detay paneli kaldırıldı */
  const [selected, setSelected] = useState<string | null>(null)

  /*
   * ── Arizada otomatik odaklanma ──────────────────────────────────────
   * Ekran bir izleme duvarinda; basinda kimse olmayabilir. Yeni bir
   * monitor dustugunde kamera kendiliginden o govdeye gidip yapragi
   * seciyor, yani ariza detayi kimse tiklamadan aciliyor.
   *
   * YALNIZ YENI arizada tetikleniyor. Her veri turunda calissaydi,
   * ariza devam ederken kullanicinin baska bir govdeye bakmasi imkansiz
   * olurdu — saniyede bir geri sicratirdi.
   *
   * Ilk yuklemede zaten dusuk olan bir monitor de "yeni" sayiliyor:
   * ekran acildiginda dogrudan soruna bakmasi istenen davranis.
   */
  const seenDownRef = useRef<Set<string> | null>(null)
  useEffect(() => {
    const names = downMonitors.map((m) => m.name)
    const seen  = seenDownRef.current
    seenDownRef.current = new Set(names)
    if (seen === null && names.length === 0) return

    const fresh = names.find((n) => !seen || !seen.has(n))
    if (!fresh) return

    const m = downMonitors.find((x) => x.name === fresh)
    if (!m) return
    setFocusKey(treeOf(m))
    setSelected(m.name)
  }, [downMonitors])

  if (error && !data) {
    return (
      <div className="flex h-screen items-center justify-center p-16" style={{ background: PAGE }}>
        <div
          className="max-w-2xl rounded-[8px] px-10 py-12 text-center"
          style={{ background: PANEL, border: `1px solid ${BORDER}` }}
        >
          <AlertTriangle className="mx-auto mb-6 size-16 text-amber-400" />
          <p className="mb-2 text-[24px] font-bold text-zinc-100">
            Uptime Kuma&#39;ya ulaşılamadı
          </p>
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
          <span className="text-[24px]">Uptime Kuma&#39;ya bağlanılıyor…</span>
        </div>
      </div>
    )
  }

  return (
    <div
      className="h-screen w-full overflow-hidden"
      style={{ background: PAGE, colorScheme: "dark" }}
    >
      <Nexus
        groups={groups}
        focusKey={focusKey}
        onFocus={setFocusKey}
        selectedName={selected}
        onSelect={setSelected}
        selectedSince={selected ? tracker.get(selected)?.since : undefined}
        metrics={metrics}
        exchangeHealth={data?.exchangeHealth}
      />
      <BrandMark />
      <StatusLine
        total={monitors.length}
        down={downMonitors.length}
        uptimePct={uptimePct}
      />
      <Clock />
      <AlarmBanner
        monitors={downMonitors}
        since={downMonitors[0] ? tracker.get(downMonitors[0].name)?.since : undefined}
        now={now}
      />
      <AlarmControls
        soundOn={soundOn}
        onToggleSound={() => setSoundOn((v) => !v)}
        testDown={testDown}
        onTest={triggerTestDown}
      />
      <RightRail
        bandwidth={mockBandwidth ?? bandwidth}
        offlineFirms={mockFirms ?? offlineFirms}
        domains={domains}
      />
    </div>
  )
}
