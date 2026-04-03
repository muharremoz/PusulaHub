"use client"

import { useState, useEffect, useRef } from "react"
import { cn } from "@/lib/utils"
import { X, Bell, Settings, Monitor } from "lucide-react"

/* ══════════════════════════════════════════════════════════
   Mock bildirimler
══════════════════════════════════════════════════════════ */
const MOCK_NOTIFICATIONS = [
  {
    id:     "n1",
    title:  "Disk Kullanımı Uyarısı",
    body:   "WEB-IIS-01 sunucusunda C: diski %87 doluluk oranına ulaştı. Lütfen gereksiz dosyaları temizleyin veya disk kapasitesini artırın.",
    type:   "warning" as const,
    from:   "Ahmet Yılmaz",
    sentAt: "2026-04-03T09:14:00Z",
  },
  {
    id:     "n2",
    title:  "Planlanmış Bakım",
    body:   "Bu gece 02:00–04:00 arasında SQL-PROD sunucusunda planlı bakım çalışması yapılacaktır. Bu süre zarfında veritabanı erişiminiz kısıtlanabilir.",
    type:   "info" as const,
    from:   "PusulaHub",
    sentAt: "2026-04-03T08:30:00Z",
  },
  {
    id:     "n3",
    title:  "ACİL: Sunucu Yanıt Vermiyor",
    body:   "DC-PRIMARY sunucusu 5 dakikadır yanıt vermiyor! Active Directory ve DNS hizmetleri etkilenmiş olabilir. Lütfen derhal müdahale edin.",
    type:   "urgent" as const,
    from:   "Sistem İzleme",
    sentAt: "2026-04-03T09:45:00Z",
  },
  {
    id:     "n4",
    title:  "Yedekleme Tamamlandı",
    body:   "ERP_Production veritabanının günlük yedeği başarıyla alındı. Boyut: 15.4 GB · Süre: 4 dk 12 sn · Konum: BACKUP-SRV\\daily\\",
    type:   "info" as const,
    from:   "Backup Agent",
    sentAt: "2026-04-03T02:04:00Z",
  },
]

/* ══════════════════════════════════════════════════════════
   Tip sabitler
══════════════════════════════════════════════════════════ */
type NotifType = "info" | "warning" | "urgent"

const TYPE_CONFIG: Record<NotifType, {
  accent:   string
  iconBg:   string
  iconFg:   string
  icon:     string
  label:    string
  autoSec:  number
}> = {
  info: {
    accent:  "bg-blue-500",
    iconBg:  "bg-blue-50",
    iconFg:  "text-blue-700",
    icon:    "ℹ",
    label:   "Bilgi",
    autoSec: 30,
  },
  warning: {
    accent:  "bg-amber-400",
    iconBg:  "bg-amber-50",
    iconFg:  "text-amber-700",
    icon:    "⚡",
    label:   "Uyarı",
    autoSec: 30,
  },
  urgent: {
    accent:  "bg-red-500",
    iconBg:  "bg-red-50",
    iconFg:  "text-red-700",
    icon:    "⚠",
    label:   "Acil",
    autoSec: 60,
  },
}

/* ══════════════════════════════════════════════════════════
   Bildirim Penceresi (WPF'in birebir browser versiyonu)
══════════════════════════════════════════════════════════ */
function NotificationWindow({
  notif,
  onClose,
  autoPlay = false,
}: {
  notif: typeof MOCK_NOTIFICATIONS[0]
  onClose?: () => void
  autoPlay?: boolean
}) {
  const cfg = TYPE_CONFIG[notif.type]
  const [remaining, setRemaining] = useState(cfg.autoSec)
  const [snoozed, setSnoozed] = useState(false)
  const [visible, setVisible] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Slide-in
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 50)
    return () => clearTimeout(t)
  }, [])

  // Geri sayım
  useEffect(() => {
    if (!autoPlay || snoozed) return
    intervalRef.current = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          clearInterval(intervalRef.current!)
          return 0
        }
        return r - 1
      })
    }, 1000)
    return () => clearInterval(intervalRef.current!)
  }, [autoPlay, snoozed])

  const pct = (remaining / cfg.autoSec) * 100
  const barColor =
    pct > 50 ? "bg-emerald-400" :
    pct > 20 ? "bg-amber-400"   :
               "bg-red-400"

  const fmtTime = (iso: string) => {
    try {
      return new Date(iso).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })
    } catch { return "" }
  }

  return (
    <div
      className={cn(
        "w-[360px] transition-all duration-300",
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
      )}
    >
      {/* Gölge + dış border */}
      <div
        className="rounded-[10px] bg-white border border-[#E5E7EB] overflow-hidden relative"
        style={{ boxShadow: "0 8px 24px rgba(0,0,0,0.12), 0 2px 6px rgba(0,0,0,0.06)" }}
      >
        {/* Sol aksanı şeridi */}
        <div className={cn("absolute left-0 top-0 bottom-0 w-1 rounded-l-[10px]", cfg.accent)} />

        {/* İçerik */}
        <div className="pl-4">

          {/* Header */}
          <div className="flex items-start gap-3 pt-4 pr-4 pb-3">
            <div className={cn("w-7 h-7 rounded-[6px] flex items-center justify-center shrink-0 mt-0.5", cfg.iconBg)}>
              <span className={cn("text-sm leading-none", cfg.iconFg)}>{cfg.icon}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-semibold text-[#111] leading-tight">{notif.title}</p>
              <p className="text-[10px] text-[#9CA3AF] mt-0.5">Gönderen: {notif.from}</p>
            </div>
            <button
              onClick={onClose}
              className="w-6 h-6 flex items-center justify-center rounded-[4px] text-[#9CA3AF] hover:bg-[#F3F4F6] hover:text-[#6B7280] transition-colors shrink-0"
            >
              <X className="size-3" />
            </button>
          </div>

          {/* Mesaj gövdesi */}
          <div className="mr-4 mb-3 rounded-[6px] bg-[#F9FAFB] px-3 py-2">
            <p className="text-[11px] text-[#374151] leading-[17px]">{notif.body}</p>
          </div>

          {/* Progress bar */}
          {autoPlay && (
            <div className="mr-4 mb-3">
              <div className="flex items-center gap-2">
                <div className="flex-1 h-[3px] bg-[#F3F4F6] rounded-full overflow-hidden">
                  <div
                    className={cn("h-full rounded-full transition-all duration-1000", barColor)}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="text-[10px] text-[#9CA3AF] shrink-0 tabular-nums w-6 text-right">
                  {remaining}s
                </span>
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center gap-2 pr-4 pb-4">
            <span className="text-[10px] text-[#9CA3AF] flex-1">{fmtTime(notif.sentAt)}</span>
            {notif.type !== "urgent" && (
              <button
                onClick={() => { setSnoozed(true); setRemaining(cfg.autoSec) }}
                className="text-[11px] font-medium px-3 h-8 rounded-[5px] border border-[#D1D5DB] text-[#374151] hover:bg-[#F9FAFB] transition-colors"
              >
                Ertele (10 dk)
              </button>
            )}
            <button
              onClick={onClose}
              className="text-[11px] font-semibold px-4 h-8 rounded-[5px] bg-[#111] text-white hover:bg-[#333] transition-colors"
            >
              Tamam
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════
   Ayarlar Penceresi
══════════════════════════════════════════════════════════ */
function SettingsWindow({ onClose }: { onClose: () => void }) {
  return (
    <div className="w-[400px] bg-[#F4F2F0] rounded-[10px] overflow-hidden border border-[#E5E7EB]"
         style={{ boxShadow: "0 8px 24px rgba(0,0,0,0.12)" }}>

      {/* Başlık çubuğu */}
      <div className="bg-white border-b border-[#E5E7EB] px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Settings className="size-3.5 text-[#6B7280]" />
          <span className="text-[12px] font-semibold text-[#111]">PusulaNotifier — Ayarlar</span>
        </div>
        <button onClick={onClose} className="text-[#9CA3AF] hover:text-[#374151] transition-colors">
          <X className="size-4" />
        </button>
      </div>

      <div className="p-4 space-y-3">
        {/* Bağlantı */}
        <div className="bg-white rounded-[8px] p-4" style={{ boxShadow: "0 1px 4px rgba(0,0,0,.06)" }}>
          <p className="text-[10px] font-semibold text-[#9CA3AF] tracking-widest uppercase mb-3">Bağlantı</p>
          <div className="space-y-3">
            <div>
              <label className="text-[11px] font-semibold text-[#374151] block mb-1">Hub Adresi</label>
              <input
                className="w-full h-8 border border-[#D1D5DB] rounded-[5px] px-2.5 text-[11px] bg-white focus:outline-none focus:border-[#6366F1]"
                defaultValue="http://192.168.1.100:3000"
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-[#374151] block mb-1">Agent ID</label>
              <input
                className="w-full h-8 border border-[#D1D5DB] rounded-[5px] px-2.5 text-[10px] bg-[#F9FAFB] font-mono text-[#6B7280] focus:outline-none"
                defaultValue="a3f2b1c4-8d9e-4f7a-b2c3-d4e5f6a7b8c9"
                readOnly
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-[#374151] block mb-1">Token</label>
              <input
                className="w-full h-8 border border-[#D1D5DB] rounded-[5px] px-2.5 text-[10px] bg-[#F9FAFB] font-mono text-[#6B7280] focus:outline-none"
                defaultValue="••••••••••••••••••••••••••••••••••••"
                readOnly
              />
            </div>
          </div>
        </div>

        {/* Zamanlama */}
        <div className="bg-white rounded-[8px] p-4" style={{ boxShadow: "0 1px 4px rgba(0,0,0,.06)" }}>
          <p className="text-[10px] font-semibold text-[#9CA3AF] tracking-widest uppercase mb-3">Zamanlama</p>
          <div>
            <label className="text-[11px] font-semibold text-[#374151] block mb-1">Kontrol Aralığı (saniye)</label>
            <input
              className="w-20 h-8 border border-[#D1D5DB] rounded-[5px] px-2.5 text-[11px] bg-white focus:outline-none focus:border-[#6366F1]"
              defaultValue="30"
              type="number"
            />
          </div>
        </div>

        {/* Test */}
        <div className="bg-white rounded-[8px] p-4" style={{ boxShadow: "0 1px 4px rgba(0,0,0,.06)" }}>
          <p className="text-[10px] font-semibold text-[#9CA3AF] tracking-widest uppercase mb-3">Test</p>
          <button className="text-[11px] font-medium px-3 h-8 rounded-[5px] border border-[#D1D5DB] text-[#374151] hover:bg-[#F9FAFB] transition-colors">
            Test Bildirimi Göster
          </button>
        </div>

        {/* Butonlar */}
        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            onClick={onClose}
            className="text-[11px] font-medium px-3 h-8 rounded-[5px] border border-[#D1D5DB] text-[#374151] hover:bg-[#F9FAFB] transition-colors"
          >
            İptal
          </button>
          <button className="text-[11px] font-semibold px-4 h-8 rounded-[5px] bg-[#111] text-white hover:bg-[#333] transition-colors">
            Kaydet
          </button>
        </div>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════
   Tray İkonu simülasyonu
══════════════════════════════════════════════════════════ */
function TraySimulator({ onSend }: { onSend: (id: string) => void }) {
  return (
    <div className="bg-[#2D2D2D] rounded-[8px] px-3 py-2 flex items-center gap-2">
      <span className="text-[10px] text-[#9CA3AF]">Görev Çubuğu Önizlemesi</span>
      <div className="flex items-center gap-1.5 ml-2">
        <div className="relative group">
          <div className="w-8 h-8 rounded-[4px] bg-[#3A3A3A] flex items-center justify-center cursor-pointer hover:bg-[#444] transition-colors">
            <Monitor className="size-4 text-white" />
          </div>
          {/* Yeşil bağlantı noktası */}
          <div className="absolute bottom-0.5 right-0.5 size-2 rounded-full bg-emerald-400 border border-[#2D2D2D]" />
          {/* Tooltip */}
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover:block">
            <div className="bg-[#111] text-white text-[10px] px-2 py-1 rounded-[4px] whitespace-nowrap">
              PusulaNotifier — Çalışıyor
            </div>
          </div>
        </div>
        <Bell className="size-4 text-[#9CA3AF]" />
        <Settings className="size-4 text-[#9CA3AF]" />
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════
   Ana Sayfa
══════════════════════════════════════════════════════════ */
export default function PreviewPage() {
  const [activeDemo, setActiveDemo] = useState<string | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())

  const dismiss = (id: string) => setDismissed((s) => new Set([...s, id]))

  return (
    <div className="min-h-screen bg-[#F4F2F0]">

      {/* Sayfa başlığı */}
      <div className="bg-white border-b border-[#E5E7EB] px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-sm font-semibold">PusulaNotifier — Önizleme</h1>
            <p className="text-[11px] text-[#6B7280] mt-0.5">
              WPF bildirim penceresinin tarayıcı önizlemesi
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-[#9CA3AF] font-mono">apps/agent/windows/notifier/</span>
            <span className="text-[9px] bg-[#EFF6FF] text-[#1D4ED8] border border-[#BFDBFE] px-2 py-0.5 rounded-[4px] font-semibold">
              WPF · .NET 4.7.2
            </span>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-10">

        {/* ── Bölüm 1: Bildirim Tipleri ── */}
        <section>
          <div className="mb-4">
            <h2 className="text-[11px] font-semibold text-[#374151] uppercase tracking-widest mb-1">
              Bildirim Penceresi Tipleri
            </h2>
            <p className="text-[11px] text-[#6B7280]">
              Sağ alt köşede açılır, slide-in/out animasyonuyla gelir.
              Otomatik kapanma geri sayımı, Ertele ve Tamam butonları içerir.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-6">
            {MOCK_NOTIFICATIONS.slice(0, 3).map((n) => (
              <div key={n.id} className="space-y-2">
                <div className="flex items-center gap-2 mb-3">
                  <span className={cn(
                    "text-[9px] font-semibold px-2 py-0.5 rounded-[4px] border",
                    n.type === "info"    && "bg-blue-50 text-blue-700 border-blue-200",
                    n.type === "warning" && "bg-amber-50 text-amber-700 border-amber-200",
                    n.type === "urgent"  && "bg-red-50 text-red-700 border-red-200",
                  )}>
                    {TYPE_CONFIG[n.type].label}
                  </span>
                  <span className="text-[10px] text-[#9CA3AF]">{TYPE_CONFIG[n.type].autoSec}s otomatik</span>
                </div>
                <NotificationWindow
                  notif={n}
                  onClose={() => {}}
                  autoPlay={false}
                />
              </div>
            ))}
          </div>
        </section>

        {/* ── Bölüm 2: Canlı Demo ── */}
        <section>
          <div className="mb-4">
            <h2 className="text-[11px] font-semibold text-[#374151] uppercase tracking-widest mb-1">
              Canlı Demo
            </h2>
            <p className="text-[11px] text-[#6B7280]">
              Geri sayım aktif, kapatma ve ertele çalışıyor.
            </p>
          </div>

          <div className="flex items-start gap-4 flex-wrap">
            {MOCK_NOTIFICATIONS.map((n) => (
              <button
                key={n.id}
                onClick={() => { setActiveDemo(n.id); setDismissed(new Set()) }}
                className={cn(
                  "text-[11px] font-medium px-3 h-8 rounded-[6px] border transition-colors",
                  n.type === "info"    && "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100",
                  n.type === "warning" && "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100",
                  n.type === "urgent"  && "border-red-200 bg-red-50 text-red-700 hover:bg-red-100",
                )}
              >
                {TYPE_CONFIG[n.type].icon} {n.title.split(" ")[0]}…
              </button>
            ))}
          </div>

          {activeDemo && !dismissed.has(activeDemo) && (
            <div className="mt-6 flex justify-end">
              <NotificationWindow
                notif={MOCK_NOTIFICATIONS.find((n) => n.id === activeDemo)!}
                onClose={() => dismiss(activeDemo)}
                autoPlay
              />
            </div>
          )}
        </section>

        {/* ── Bölüm 3: Yığılmış Bildirimler ── */}
        <section>
          <div className="mb-4">
            <h2 className="text-[11px] font-semibold text-[#374151] uppercase tracking-widest mb-1">
              Yığılmış Bildirimler
            </h2>
            <p className="text-[11px] text-[#6B7280]">
              Birden fazla mesaj geldiğinde alt alta sıralanır.
            </p>
          </div>

          <div className="flex justify-end">
            <div className="flex flex-col gap-2">
              {MOCK_NOTIFICATIONS.map((n) => (
                <NotificationWindow
                  key={n.id}
                  notif={n}
                  onClose={() => {}}
                  autoPlay={false}
                />
              ))}
            </div>
          </div>
        </section>

        {/* ── Bölüm 4: Ayarlar Penceresi ── */}
        <section>
          <div className="mb-4">
            <h2 className="text-[11px] font-semibold text-[#374151] uppercase tracking-widest mb-1">
              Ayarlar Penceresi
            </h2>
            <p className="text-[11px] text-[#6B7280]">
              Tray ikonuna çift tıklayınca açılır. Hub URL, token görüntüleme, aralık ve test.
            </p>
          </div>

          <div className="flex items-start gap-8">
            <div className="flex flex-col items-start gap-4">
              {/* Tray simülatörü */}
              <TraySimulator onSend={() => {}} />
              <p className="text-[10px] text-[#9CA3AF]">Sağ tık → Ayarlar veya çift tıklama</p>
              <button
                onClick={() => setShowSettings((v) => !v)}
                className="text-[11px] font-medium px-3 h-8 rounded-[5px] border border-[#D1D5DB] text-[#374151] hover:bg-[#F9FAFB] transition-colors"
              >
                {showSettings ? "Ayarları Gizle" : "Ayarları Göster"}
              </button>
            </div>

            {showSettings && (
              <SettingsWindow onClose={() => setShowSettings(false)} />
            )}
          </div>
        </section>

        {/* ── Bölüm 5: Hub Mesaj Gönderme ── */}
        <section>
          <div className="mb-4">
            <h2 className="text-[11px] font-semibold text-[#374151] uppercase tracking-widest mb-1">
              Hub'dan Gönderim (API)
            </h2>
            <p className="text-[11px] text-[#6B7280]">
              PusulaHub UI'dan gönderilecek, agent'ın poll'u ile kullanıcıya iletilecek payload.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-4">
            {(["info","warning","urgent"] as NotifType[]).map((type) => (
              <div key={type} className="rounded-[8px] p-2 pb-0" style={{ backgroundColor: "#F4F2F0" }}>
                <div className="rounded-[4px] overflow-hidden bg-white"
                     style={{ boxShadow: "0 2px 4px rgba(0,0,0,.06)" }}>
                  <div className={cn(
                    "px-3 py-2 border-b border-[#F0F0F0]",
                    type === "info"    && "bg-blue-50",
                    type === "warning" && "bg-amber-50",
                    type === "urgent"  && "bg-red-50",
                  )}>
                    <p className="text-[10px] font-semibold uppercase tracking-widest" style={{
                      color: type === "info" ? "#1D4ED8" : type === "warning" ? "#92400E" : "#991B1B"
                    }}>
                      {TYPE_CONFIG[type].label}
                    </p>
                  </div>
                  <pre className="text-[10px] font-mono text-[#374151] p-3 leading-[16px] overflow-x-auto">{
`POST /api/messages/send
{
  "agentId": "a3f2b1c4…",
  "title": "${
    type === "info"    ? "Yedekleme Tamamlandı" :
    type === "warning" ? "Disk Kullanımı Yüksek" :
                         "Sunucu Yanıt Vermiyor"
  }",
  "body": "${
    type === "info"    ? "ERP_Production yedeği alındı." :
    type === "warning" ? "C: diski %87 dolu." :
                         "DC-PRIMARY erişilemiyor!"
  }",
  "type": "${type}",
  "from": "Ahmet Yılmaz"
}`
                  }</pre>
                </div>
                <div className="h-2" />
              </div>
            ))}
          </div>
        </section>

      </div>
    </div>
  )
}
