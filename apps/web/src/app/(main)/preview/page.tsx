"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"
import { Monitor, Settings, X } from "lucide-react"

/* ══════════════════════════════════════════════════════════
   Mock mesajlar — messages sayfasından gönderilen yapıyla aynı
══════════════════════════════════════════════════════════ */
const MOCK_MESSAGES = [
  {
    id:        "m1",
    title:     "Planlanmış Bakım — Bu Gece",
    body:      "Bu gece 02:00–04:00 arasında SQL-PROD sunucusunda planlı bakım çalışması yapılacaktır. Bu süre zarfında veritabanı bağlantıları kesintili olabilir.\n\nLütfen çalışmalarınızı buna göre planlayın.",
    type:      "info"    as const,
    toName:    "Ahmet Yılmaz",
    toCompany: "ABC Teknoloji A.Ş.",
    sentAt:    "2026-04-03T08:30:00Z",
  },
  {
    id:        "m2",
    title:     "Disk Doluluk Uyarısı — Acil Müdahale",
    body:      "WEB-IIS-01 sunucusundaki C: sürücüsü %91 doluluk seviyesine ulaşmıştır.\n\nGereksiz log ve geçici dosyaları temizlemeniz ya da disk kapasitesini artırmanız gerekmektedir. Müdahale yapılmazsa servisler duracaktır.",
    type:      "warning" as const,
    toName:    "Mehmet Demir",
    toCompany: "XYZ Holding",
    sentAt:    "2026-04-03T09:14:00Z",
  },
  {
    id:        "m3",
    title:     "ACİL: DC-PRIMARY Yanıt Vermiyor",
    body:      "DC-PRIMARY sunucusu 5 dakikadır yanıt vermiyor!\n\nActive Directory ve DNS hizmetleri etkilenmiş olabilir. Tüm kullanıcı oturumları ve ağ erişimi kesintiye uğrayabilir.\n\nLütfen DERHAL fiziksel olarak sunucuya erişim sağlayın veya sistem yöneticisini arayın.",
    type:      "urgent"  as const,
    toName:    "Ayşe Kaya",
    toCompany: "DEF Yazılım Ltd.",
    sentAt:    "2026-04-03T09:45:00Z",
  },
]

type MsgType = "info" | "warning" | "urgent"

/* Tip yapılandırması */
const TYPE = {
  info: {
    hdrBg:   "#EFF6FF",
    iconBg:  "#DBEAFE",
    badgeBg: "#BFDBFE",
    fg:      "#1D4ED8",
    glyph:   "ℹ",
    label:   "BİLGİ",
    okBg:    "#2563EB",
    okHover: "#1D4ED8",
  },
  warning: {
    hdrBg:   "#FFFBEB",
    iconBg:  "#FEF3C7",
    badgeBg: "#FDE68A",
    fg:      "#92400E",
    glyph:   "⚡",
    label:   "UYARI",
    okBg:    "#D97706",
    okHover: "#B45309",
  },
  urgent: {
    hdrBg:   "#FEF2F2",
    iconBg:  "#FEE2E2",
    badgeBg: "#FECACA",
    fg:      "#991B1B",
    glyph:   "⚠",
    label:   "ACİL",
    okBg:    "#DC2626",
    okHover: "#B91C1C",
  },
}

/* Saat biçimi */
const fmtTime = (iso: string) => {
  try { return new Date(iso).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" }) }
  catch { return "" }
}

/* ══════════════════════════════════════════════════════════
   WPF Mesaj Penceresi (browser'da birebir önizleme)
   NotificationWindow.xaml ile birebir eşleşir.
══════════════════════════════════════════════════════════ */
function WpfMessageWindow({
  msg,
  onOk,
}: {
  msg: typeof MOCK_MESSAGES[0]
  onOk?: () => void
}) {
  const t = TYPE[msg.type]
  const avatarLetter = msg.toName?.[0]?.toUpperCase() ?? "?"

  return (
    /* Pencere kutusu — Window Width=480, SizeToContent=Height */
    <div
      className="w-[480px] rounded-[12px] overflow-hidden bg-white"
      style={{ boxShadow: "0 8px 32px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.10)" }}
    >
      {/* ── Üst başlık bandı (HeaderBand) ── */}
      <div className="px-5 py-4" style={{ background: t.hdrBg }}>
        <div className="flex items-center gap-3">
          {/* İkon kutusu (IconContainer) */}
          <div
            className="w-9 h-9 rounded-[8px] flex items-center justify-center shrink-0"
            style={{ background: t.iconBg }}
          >
            <span className="text-[18px] leading-none" style={{ color: t.fg }}>{t.glyph}</span>
          </div>

          {/* Başlık + tip badge */}
          <div className="flex-1 min-w-0">
            <div className="mb-1">
              <span
                className="text-[9px] font-bold px-[6px] py-[2px] rounded-[4px]"
                style={{ background: t.badgeBg, color: t.fg }}
              >
                {t.label}
              </span>
            </div>
            <p className="text-[14px] font-bold text-[#111111] leading-snug">{msg.title}</p>
          </div>
        </div>
      </div>

      {/* ── Alıcı bilgisi ── */}
      <div className="px-5 py-[10px] bg-[#FAFAFA] border-y border-[#F0F0F0]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            {/* Avatar dairesi */}
            <div className="w-7 h-7 rounded-full bg-[#E5E7EB] flex items-center justify-center shrink-0">
              <span className="text-[11px] font-bold text-[#374151]">{avatarLetter}</span>
            </div>
            <div>
              {/* "Sayın [Kullanıcı Adı]" */}
              <p className="text-[12px] font-semibold text-[#111111] leading-none">Sayın {msg.toName}</p>
              {/* Bağlı olduğu firma */}
              <p className="text-[10px] text-[#6B7280] mt-0.5">{msg.toCompany}</p>
            </div>
          </div>
          <span className="text-[10px] text-[#9CA3AF]">{fmtTime(msg.sentAt)}</span>
        </div>
      </div>

      {/* ── Mesaj gövdesi (BodyText) ── */}
      <div className="px-5 py-4">
        <p className="text-[12px] text-[#374151] leading-5 whitespace-pre-line">{msg.body}</p>
      </div>

      {/* ── Eylem alanı ── */}
      <div className="px-4 py-3 bg-[#FAFAFA] border-t border-[#F0F0F0] rounded-b-[12px]">
        <div className="flex items-center">
          {/* Pusula Yazılım marka etiketi */}
          <span className="text-[10px] font-semibold text-[#374151] opacity-50 flex-1">
            Pusula Yazılım
          </span>

          {/* Okudum, Anladım */}
          <button
            onClick={onOk}
            className="text-[11px] font-semibold px-5 h-8 rounded-[5px] text-white transition-colors"
            style={{ background: t.okBg }}
          >
            Okudum, Anladım
          </button>
        </div>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════
   Windows Masaüstü Simülasyonu — pencereyi ortada göster
══════════════════════════════════════════════════════════ */
function DesktopFrame({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="relative w-full rounded-[10px] overflow-hidden"
      style={{
        height: 580,
        background: "linear-gradient(135deg, #1a3a5c 0%, #2d6a8c 50%, #1e4d70 100%)",
      }}
    >
      {/* Windows görev çubuğu (alt) */}
      <div className="absolute bottom-0 left-0 right-0 h-10 bg-[rgba(0,0,0,0.7)] backdrop-blur-sm flex items-center px-3 gap-2 z-10">
        <div className="flex items-center gap-1.5 ml-auto">
          <div className="relative group">
            <div className="w-8 h-8 rounded-[4px] bg-[#3A3A3A] flex items-center justify-center cursor-pointer hover:bg-[#555] transition-colors">
              <Monitor className="size-4 text-white" />
            </div>
            {/* Yeşil bağlantı noktası */}
            <div className="absolute bottom-0.5 right-0.5 size-2 rounded-full bg-emerald-400 border border-[rgba(0,0,0,0.7)]" />
            {/* Tooltip */}
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block pointer-events-none">
              <div className="bg-[#111] text-white text-[10px] px-2 py-1 rounded-[4px] whitespace-nowrap">
                PusulaNotifier — Çalışıyor
              </div>
            </div>
          </div>
          <span className="text-[10px] text-[#9CA3AF] ml-2">09:45</span>
        </div>
      </div>

      {/* Ortadaki mesaj formu */}
      <div className="absolute inset-0 bottom-10 flex items-center justify-center">
        {children}
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════
   Ayarlar Penceresi (SettingsWindow.xaml)
══════════════════════════════════════════════════════════ */
function SettingsWindowPreview({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="w-[400px] rounded-[8px] overflow-hidden bg-[#F4F2F0] border border-[#E5E7EB]"
      style={{ boxShadow: "0 8px 24px rgba(0,0,0,0.14)" }}
    >
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
        <div className="bg-white rounded-[6px] p-4" style={{ boxShadow: "0 1px 4px rgba(0,0,0,.06)" }}>
          <p className="text-[10px] font-semibold text-[#9CA3AF] tracking-widest uppercase mb-3">Bağlantı</p>
          <div className="space-y-2.5">
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
                className="w-full h-8 border border-[#E5E7EB] rounded-[5px] px-2.5 text-[10px] bg-[#F9FAFB] font-mono text-[#6B7280] focus:outline-none"
                defaultValue="a3f2b1c4-8d9e-4f7a-b2c3-d4e5f6a7b8c9"
                readOnly
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-[#374151] block mb-1">Token</label>
              <input
                className="w-full h-8 border border-[#E5E7EB] rounded-[5px] px-2.5 text-[10px] bg-[#F9FAFB] font-mono text-[#6B7280] focus:outline-none"
                defaultValue="••••••••••••••••••••••••••••••••"
                readOnly
              />
            </div>
          </div>
        </div>

        {/* Zamanlama */}
        <div className="bg-white rounded-[6px] p-4" style={{ boxShadow: "0 1px 4px rgba(0,0,0,.06)" }}>
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
   Ana Sayfa
══════════════════════════════════════════════════════════ */
export default function PreviewPage() {
  const [activeIdx, setActiveIdx] = useState(0)
  const [read, setRead]           = useState(false)
  const [showSettings, setShowSettings] = useState(false)

  const activeMsg = MOCK_MESSAGES[activeIdx]

  const handleTypeChange = (idx: number) => {
    setActiveIdx(idx)
    setRead(false)
  }

  return (
    <div className="min-h-screen bg-[#F4F2F0]">

      {/* Sayfa başlığı */}
      <div className="bg-white border-b border-[#E5E7EB] px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-sm font-semibold text-[#111]">PusulaNotifier — Mesaj Penceresi Önizleme</h1>
            <p className="text-[11px] text-[#6B7280] mt-0.5">
              Sunuculara gönderilen mesajların oturum açık kullanıcılara gösterileceği WPF formu
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

      <div className="max-w-4xl mx-auto px-6 py-8 space-y-10">

        {/* ── Bölüm 1: Canlı Demo ── */}
        <section>
          <div className="mb-4">
            <h2 className="text-[10px] font-semibold text-[#374151] uppercase tracking-widest mb-1">
              Canlı Demo
            </h2>
            <p className="text-[11px] text-[#6B7280]">
              Hub'dan gönderilen mesaj, sunucuda oturum açık her kullanıcının ekranında
              tam ortada bu şekilde görünür. Kullanıcı "Okundu" dene kadar pencere açık kalır.
            </p>
          </div>

          {/* Tip seçici */}
          <div className="flex items-center gap-2 mb-5">
            {MOCK_MESSAGES.map((m, i) => {
              const t = TYPE[m.type]
              const active = i === activeIdx
              return (
                <button
                  key={m.id}
                  onClick={() => handleTypeChange(i)}
                  className={cn(
                    "text-[11px] font-medium px-3 h-8 rounded-[6px] border transition-colors",
                    active
                      ? "border-transparent text-white"
                      : "border-[#E5E7EB] text-[#6B7280] bg-white hover:bg-[#F9FAFB]",
                  )}
                  style={active ? { background: t.okBg } : {}}
                >
                  {t.glyph} {t.label}
                </button>
              )
            })}
          </div>

          {/* Windows masaüstü simülasyonu */}
          <DesktopFrame>
            {read ? (
              <div className="text-center text-white/60">
                <p className="text-[13px] font-medium">Mesaj okundu olarak işaretlendi.</p>
                <button
                  onClick={() => setRead(false)}
                  className="mt-3 text-[11px] underline text-white/80 hover:text-white transition-colors"
                >
                  Tekrar göster
                </button>
              </div>
            ) : (
              <WpfMessageWindow
                msg={activeMsg}
                onOk={() => setRead(true)}
              />
            )}
          </DesktopFrame>
        </section>

        {/* ── Bölüm 2: Tüm Tipler Yan Yana ── */}
        <section>
          <div className="mb-4">
            <h2 className="text-[10px] font-semibold text-[#374151] uppercase tracking-widest mb-1">
              Mesaj Tipleri
            </h2>
            <p className="text-[11px] text-[#6B7280]">
              Bilgi, Uyarı ve Acil tiplerinde başlık bandı rengi ve Okundu butonu rengi farklılaşır.
              Acil tipinde "Daha Sonra Hatırlat" butonu gizlenir.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-5">
            {MOCK_MESSAGES.map((m) => (
              <WpfMessageWindow key={m.id} msg={m} />
            ))}
          </div>
        </section>

        {/* ── Bölüm 3: API Payload ── */}
        <section>
          <div className="mb-4">
            <h2 className="text-[10px] font-semibold text-[#374151] uppercase tracking-widest mb-1">
              Hub'dan Gönderim (API)
            </h2>
            <p className="text-[11px] text-[#6B7280]">
              Mesajlar sayfasından "Gönder" tıklandığında aşağıdaki payload sıraya eklenir.
              Agent her 30 saniyede bir bu kuyruğu sorgular ve bekleyen mesajı gösterir.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-4">
            {(["info", "warning", "urgent"] as MsgType[]).map((type) => {
              const t = TYPE[type]
              return (
                <div key={type} className="rounded-[8px] p-2 pb-0" style={{ backgroundColor: "#F4F2F0" }}>
                  <div
                    className="rounded-[4px] overflow-hidden bg-white"
                    style={{ boxShadow: "0 2px 4px rgba(0,0,0,.06)" }}
                  >
                    <div className="px-3 py-2 border-b border-[#F0F0F0]" style={{ background: t.hdrBg }}>
                      <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: t.fg }}>
                        {t.glyph} {t.label}
                      </p>
                    </div>
                    <pre className="text-[10px] font-mono text-[#374151] p-3 leading-[16px] overflow-x-auto">{
`POST /api/messages/send
{
  "agentId": "a3f2b1c4…",
  "title": "${
    type === "info"    ? "Planlanmış Bakım" :
    type === "warning" ? "Disk Kullanımı Yüksek" :
                         "Sunucu Yanıt Vermiyor"
  }",
  "body":  "...",
  "type":  "${type}",
  "from":  "Pusula Yazılım"
}`
                    }</pre>
                  </div>
                  <div className="h-2" />
                </div>
              )
            })}
          </div>
        </section>

        {/* ── Bölüm 4: Ayarlar Penceresi ── */}
        <section>
          <div className="mb-4">
            <h2 className="text-[10px] font-semibold text-[#374151] uppercase tracking-widest mb-1">
              Ayarlar Penceresi
            </h2>
            <p className="text-[11px] text-[#6B7280]">
              Görev çubuğundaki PusulaNotifier ikonuna çift tıklayınca açılır.
              Hub adresi düzenlenebilir; AgentID ve Token salt okunurdur.
            </p>
          </div>

          <div className="flex items-start gap-8">
            <div className="flex flex-col items-start gap-3">
              {/* Görev çubuğu simülasyonu */}
              <div className="bg-[#2D2D2D] rounded-[8px] px-3 py-2 flex items-center gap-2">
                <span className="text-[10px] text-[#9CA3AF]">Görev Çubuğu</span>
                <div className="relative group ml-2">
                  <div className="w-8 h-8 rounded-[4px] bg-[#3A3A3A] flex items-center justify-center cursor-pointer hover:bg-[#555] transition-colors">
                    <Monitor className="size-4 text-white" />
                  </div>
                  <div className="absolute bottom-0.5 right-0.5 size-2 rounded-full bg-emerald-400 border border-[#2D2D2D]" />
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block pointer-events-none">
                    <div className="bg-[#111] text-white text-[10px] px-2 py-1 rounded-[4px] whitespace-nowrap">
                      PusulaNotifier — Çalışıyor
                    </div>
                  </div>
                </div>
              </div>
              <p className="text-[10px] text-[#9CA3AF]">Sağ tık → Ayarlar veya çift tıklama</p>
              <button
                onClick={() => setShowSettings((v) => !v)}
                className="text-[11px] font-medium px-3 h-8 rounded-[5px] border border-[#D1D5DB] text-[#374151] bg-white hover:bg-[#F9FAFB] transition-colors"
              >
                {showSettings ? "Ayarları Gizle" : "Ayarları Göster"}
              </button>
            </div>

            {showSettings && (
              <SettingsWindowPreview onClose={() => setShowSettings(false)} />
            )}
          </div>
        </section>

      </div>
    </div>
  )
}
