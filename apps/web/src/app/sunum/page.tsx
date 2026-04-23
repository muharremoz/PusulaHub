"use client"

/**
 * /sunum — Son 45 günde yapılanları özetleyen patron sunumu.
 *
 * Üç uygulamanın (PusulaSwitch, PusulaHub, SpareFlow) yeteneklerini ve
 * 2026-03-10 → 2026-04-23 aralığında eklenen özellikleri tek sayfada
 * gösterir. Slayt-benzeri, scroll ile geçişli, karanlık tema.
 *
 * Bütün veriler sabit (commit log'undan derlendi) — canlı API çağrısı yok,
 * sunum sırasında bağlantı sorunlarından etkilenmesin.
 */

import { useEffect, useState } from "react"
import { motion } from "motion/react"
import { NumberTicker } from "@/components/magicui/number-ticker"
import { BorderBeam } from "@/components/magicui/border-beam"
import { SpotlightCard } from "@/components/magicui/spotlight"
import { ShimmerButton } from "@/components/magicui/shimmer-button"
import { Meteors } from "@/components/ui/meteors"
import { Ripple } from "@/components/ui/ripple"
import { Marquee } from "@/components/ui/marquee"
import { TypingAnimation } from "@/components/ui/typing-animation"
import {
  ArrowDown,
  Activity,
  Bell,
  Boxes,
  Building2,
  Clock,
  Cloud,
  CalendarClock,
  Mail,
  Receipt,
  Ticket,
  Command,
  Cpu,
  DatabaseBackup,
  FileCheck2,
  FileSpreadsheet,
  FileText,
  Gauge,
  GitBranch,
  Globe,
  HardDrive,
  Headset,
  KeyRound,
  LayoutDashboard,
  LineChart,
  Lock,
  MessageSquare,
  Monitor,
  Network,
  Printer,
  Radar,
  Rocket,
  Router,
  Server,
  ShieldCheck,
  Siren,
  Smartphone,
  Sparkles,
  Stethoscope,
  Terminal,
  Tv,
  UserCog,
  Users,
  Waypoints,
  Webcam,
  Wrench,
  Zap,
} from "lucide-react"

/* ──────────────────────────────────────────────────────────────────────
 * Veriler — commit log'undan derlendi (2026-03-10 → 2026-04-23).
 * ────────────────────────────────────────────────────────────────────── */

const HERO_STATS: { label: string; num: number; suffix?: string; sub: string }[] = [
  { label: "Gün",      num: 45,  sub: "10 Mart → 23 Nisan" },
  { label: "Uygulama", num: 6,   sub: "Web · Masaüstü · Servis" },
  { label: "Commit",   num: 210, suffix: "+", sub: "Altı repo toplam" },
  { label: "Özellik",  num: 70,  suffix: "+", sub: "Yeni modül ve sayfa" },
]

interface AppShowcase {
  key:      string
  name:     string
  tagline:  string
  color:    string              // tailwind from- renk key
  accent:   string              // hex — glow/border
  icon:     React.ElementType
  summary:  string
  features: { icon: React.ElementType; title: string; desc: string }[]
}

const APPS: AppShowcase[] = [
  {
    key:     "switch",
    name:    "PusulaSwitch",
    tagline: "Tek kapıdan tüm uygulamalara",
    color:   "from-sky-500/20 to-sky-500/0",
    accent:  "#38bdf8",
    icon:    Network,
    summary: "Kullanıcıların tek bir adresten (gateway) tüm Pusula uygulamalarına erişmesini sağlayan giriş noktası. Tek oturum ile Hub ve SpareFlow açılır, yetkilendirme merkezi yönetilir.",
    features: [
      { icon: KeyRound,    title: "Tek Oturum (SSO)",         desc: "Bir kez giriş yap, Hub ve Flow'a tekrar şifre sormadan geç." },
      { icon: ShieldCheck, title: "2FA Desteği",              desc: "Kimlik doğrulama uygulaması ile iki adımlı güvenlik." },
      { icon: Users,       title: "Rol Tabanlı Yetki",        desc: "Uygulama başına kullanıcı rolleri (admin, user, viewer)." },
      { icon: Sparkles,    title: "Modern Giriş Ekranı",      desc: "Animasyonlu, markaya özel tasarım." },
      { icon: Rocket,      title: "Landing Sayfası",          desc: "Uygulama seçimi ve kısayollar." },
      { icon: Lock,        title: "LAN HTTPS/HTTP Uyumu",     desc: "Hem şirket içi HTTP hem güvenli HTTPS'te sorunsuz çalışma." },
    ],
  },
  {
    key:     "hub",
    name:    "PusulaHub",
    tagline: "Altyapı yönetim merkezi",
    color:   "from-emerald-500/20 to-emerald-500/0",
    accent:  "#34d399",
    icon:    LayoutDashboard,
    summary: "Sunucuları, firmaları, kullanıcıları ve izleme sistemini tek panelden yöneten ana kontrol merkezi. Windows agent ile sunucularda doğrudan komut çalıştırma, izleme ve bildirim altyapısını içerir.",
    features: [
      { icon: Tv,               title: "TV İzleme Ekranı",          desc: "55\" 4K TV için kiosk tarzı canlı izleme — DOWN alarmı, sesli uyarı, 1 sn canlı." },
      { icon: Radar,            title: "Uptime Kuma Entegrasyonu",  desc: "11 sunucu/servis izlemesi, heartbeat geçmişi, Telegram bildirimi." },
      { icon: Siren,            title: "Alarm & Ses Uyarısı",       desc: "DOWN tespitinde ekranda flash + beep, DOWN süresi sayacı, olay log'u." },
      { icon: Building2,        title: "Firma Kurulum Sihirbazı",   desc: "Sıfırdan firma kurulumu: sunucu, kullanıcı, yedek ve yetki tek akışta." },
      { icon: Server,           title: "Sunucu Yönetimi",           desc: "Windows ve AD sunucularını liste, durum, disk, servis detayı." },
      { icon: Wrench,           title: "Windows Agent",             desc: "C# servis — uzaktan komut, Active Directory, IIS ve yedek işlemleri." },
      { icon: MessageSquare,    title: "Kullanıcı Mesajlaşma",      desc: "Oturuma popup gönderme, okundu takibi (WTS session injection)." },
      { icon: DatabaseBackup,   title: "SQL Yedek & Restore",       desc: "Firma başına yedek listeleme, tek tık geri yükleme (`D:\\SQLData\\{firmaId}`)." },
      { icon: Command,          title: "Komut Paleti (Ctrl+K)",     desc: "Hızlı arama ve sayfa geçişi — her yerden, bir kısayolla." },
      { icon: Monitor,          title: "Dashboard KPI Kartları",    desc: "Canlı izleme durumu, sunucu sayısı, aktif kullanıcı özeti." },
      { icon: LineChart,        title: "Heartbeat Bar Grafiği",     desc: "Uptime Kuma tarzı son 100 beat — hover ile tarih/durum/ping." },
      { icon: Bell,             title: "Telegram Bildirimi",        desc: "DOWN/UP durum değişiminde anlık bot mesajı." },
    ],
  },
  {
    key:     "flow",
    name:    "SpareFlow",
    tagline: "Saha ve cihaz yönetimi",
    color:   "from-amber-500/20 to-amber-500/0",
    accent:  "#fbbf24",
    icon:    Boxes,
    summary: "Saha cihazlarının, yedek parça akışının ve müşteri çağrılarının takip edildiği uygulama. Bulut depolama, SFTP disk yönetimi ve ayrıntılı audit log ile kurumsal kullanıma hazır.",
    features: [
      { icon: Smartphone,       title: "Cihaz Kısıtlaması",         desc: "Tek API key tek cihaz — yetkisiz erişim engellendi." },
      { icon: Activity,         title: "Çağrı Durum Takibi",        desc: "Açık/kapalı çağrılar, süre, atanan teknisyen, müşteri görünürlüğü." },
      { icon: Cloud,            title: "Bulut Sunucu Yönetimi",     desc: "Cloud server ekleme, disk/sftp kotalı dosya aktarımı." },
      { icon: HardDrive,        title: "SFTP Temizlik & Kota",      desc: "Disk kotası aşımında otomatik eski dosya temizleme." },
      { icon: ShieldCheck,      title: "2FA (Hub Üzerinden)",       desc: "Merkezi 2FA — kimlik Hub'da, Flow proxy'den doğrular." },
      { icon: FileCheck2,       title: "Audit Log",                 desc: "Her kritik işlemde kim/ne/ne zaman kaydı." },
      { icon: Gauge,            title: "Heartbeat Sistemi",         desc: "Cihaz canlılığı izleme, kopuk cihaz uyarısı." },
      { icon: Zap,              title: "Fastify Backend",           desc: "Yüksek performanslı Node.js API — döviz, health, upstream." },
    ],
  },
  {
    key:     "backup",
    name:    "SpareBackup",
    tagline: "Müşteri bilgisayarında otomatik yedekleme",
    color:   "from-teal-500/20 to-teal-500/0",
    accent:  "#2dd4bf",
    icon:    DatabaseBackup,
    summary: "Müşteri bilgisayarlarına kurulan, SQL ve dosya yedeklerini zamanlanmış olarak alan bir Next.js + Windows Service uygulaması. SpareFlow paneline heartbeat atar, uzaktan sürüm yükseltme + imzalı installer ile kurulum tek tık.",
    features: [
      { icon: Clock,          title: "Zamanlanmış Yedek",         desc: "Cron benzeri tetikleyiciler — günlük/saatlik SQL ve dosya yedeği." },
      { icon: DatabaseBackup, title: "SQL Server Desteği",        desc: "Full / Differential yedek, sıkıştırma, hash doğrulama." },
      { icon: HardDrive,      title: "Dosya & Klasör Yedeği",     desc: "Hedef klasörleri izle, değişenleri aktar, retention kuralı." },
      { icon: Rocket,         title: "Uzaktan Güncelleme",        desc: "SpareFlow panelinden versiyon yayınla — istemci otomatik iner." },
      { icon: ShieldCheck,    title: "İmzalı Installer",          desc: "Inno Setup ile SHA256 imzalı .exe, zorunlu güncelleme bayrağı." },
      { icon: Activity,       title: "Heartbeat",                 desc: "Her istemci durumunu, sürümü, son yedek saatini panele bildirir." },
      { icon: LayoutDashboard,title: "Yerel Yönetim UI",          desc: "Next.js web arayüzü — yedek geçmişi, hata log'u, ayarlar." },
      { icon: KeyRound,       title: "Setup Sihirbazı",           desc: "İlk kurulumda admin şifresi + QR ile mobil giriş." },
    ],
  },
  {
    key:     "import",
    name:    "PusulaImport",
    tagline: "Veri aktarım sihirbazı",
    color:   "from-violet-500/20 to-violet-500/0",
    accent:  "#a78bfa",
    icon:    FileSpreadsheet,
    summary: "Eski kuyumcu yazılımlarından (DBF, Access, Excel, SQL) Pusula veritabanına veri taşıyan .NET 8 WPF masaüstü ETL sihirbazı. Yeni müşteri alımlarında kurulum süresini saatten dakikalara indirir.",
    features: [
      { icon: FileSpreadsheet, title: "4 Kaynak Format",          desc: "Excel · Microsoft Access · SQL Server · DBF (eski kuyumcu yazılımları)." },
      { icon: Users,           title: "Hesap Kartları Aktarımı",  desc: "Müşteri/cari kartları, FirmaTipi eşleştirme, staging tabloları." },
      { icon: Boxes,           title: "Altın & Pırlanta Stokları",desc: "Grup/alt grup eşleştirme, prefix auto-generate, dinamik toplam satırları." },
      { icon: DatabaseBackup,  title: "Bakiye Transferi",         desc: "Para birimi eşleştirme, decimal fix, çok para birimli bakiye." },
      { icon: Sparkles,        title: "Sihirbaz Arayüzü",         desc: "Adım adım akış, canlı önizleme, terminal log, geri alınabilir işlemler." },
      { icon: Wrench,          title: "SQL Instance Keşfi",       desc: "Registry taraması ile otomatik SQL Server bulma, Windows/SQL auth." },
    ],
  },
  {
    key:     "fix",
    name:    "PusulaFix",
    tagline: "BT sistem teşhis aracı",
    color:   "from-rose-500/20 to-rose-500/0",
    accent:  "#fb7185",
    icon:    Stethoscope,
    summary: "Saha teknisyenlerinin Windows sunucu/istemci sorunlarını tek tıkla çözdüğü .NET WPF teşhis aracı. Hosts düzenleme, IP resetleme, RDP, SQL Editor, resource monitor — hepsi tek uygulamada.",
    features: [
      { icon: Network,         title: "IP Fix & Network Reset",   desc: "Statik/DHCP geçiş, DNS sıfırlama, winsock/netsh flush." },
      { icon: FileCheck2,      title: "Hosts Dosyası Editörü",    desc: "Elevated erişim ile hosts düzenleme — yönlendirme/block." },
      { icon: Terminal,        title: "Komut Çalıştırıcı",        desc: "Yaygın komutlar için hazır şablonlar + canlı çıktı paneli." },
      { icon: Router,          title: "RDP Sorun Giderici",       desc: "RDP bağlantı testi, firewall kural kontrolü, servis doğrulama." },
      { icon: UserCog,         title: "Kullanıcı & Credential",   desc: "Yerel kullanıcı yönetimi, Credential Manager temizlik." },
      { icon: HardDrive,       title: "SQL Editor",               desc: "SQL Server instance keşif, bağlantı testi, hızlı sorgu penceresi." },
      { icon: Wrench,          title: "Servis Yönetimi",          desc: "Windows servisleri listele/başlat/durdur — filtreli arama." },
      { icon: Gauge,           title: "Resource Monitor",         desc: "CPU/RAM/Disk/Network canlı grafikleri, process listesi." },
      { icon: Printer,         title: "Yazıcı Kuyruğu",           desc: "Sıkışan işleri temizle, sürücü sıfırlama." },
      { icon: Webcam,          title: "Donanım Testleri",         desc: "Webcam, hoparlör, internet hız testi — müşteri şikayetini hızlı teyit." },
      { icon: Activity,        title: "Sistem Bilgisi",           desc: "Donanım envanteri, uptime, disk S.M.A.R.T., paylaşım listesi." },
      { icon: ShieldCheck,     title: "Elevated Runner",          desc: "UAC bilinciyle güvenli yükseltme, audit-friendly akış." },
    ],
  },
]

interface InProgressProject {
  name:     string
  tagline:  string
  accent:   string
  icon:     React.ElementType
  progress: number
  summary:  string
  plan:     { icon: React.ElementType; title: string; desc: string }[]
}

const IN_PROGRESS: InProgressProject[] = [
  {
    name:    "Pusula Bridge",
    tagline: "PusulaX için raporlama & tray köprüsü",
    accent:  "#818cf8",
    icon:    Waypoints,
    progress: 55,
    summary: "PusulaX kuyumcu otomasyonu için yardımcı web ve tray uygulaması. SQL Server üzerinde çalışan raporları zamanlanmış olarak çalıştırır, müşteri/yönetim mail'ine gönderir, döviz ve görev panelini tek yerde toplar.",
    plan: [
      { icon: FileText,      title: "SQL Rapor Motoru",    desc: "Manuel + API raporları SQL'de çalıştır, şablona dök." },
      { icon: Mail,          title: "Mail ile Gönderim",   desc: "Rapor çıktısını PDF/Excel olarak abonelere yolla." },
      { icon: CalendarClock, title: "Zamanlı Görevler",    desc: "Cron benzeri scheduler — günlük/haftalık rapor koşumu." },
      { icon: LineChart,     title: "Döviz Kurları",       desc: "Fastify API'den canlı kur çekme ve panel gösterimi." },
      { icon: Monitor,       title: "Tray Uygulaması",     desc: "Windows tray'de durum + hızlı erişim kısayolları." },
      { icon: LayoutDashboard, title: "shadcn Dashboard",  desc: "5px radius temalı modern panel, Next.js App Router." },
    ],
  },
  {
    name:    "Pusula Connect",
    tagline: "Müşteri portalı & destek talebi",
    accent:  "#22d3ee",
    icon:    Headset,
    progress: 25,
    summary: "Müşterinin Pusula ile olan ilişkilerini (abonelik, lisans, fatura, kurulu ürünler) görüp yönettiği ve destek talebi oluşturduğu müşteri portalı. Self-servis ile çağrı yükünü düşürür, tüm dokümantasyon tek yerde.",
    plan: [
      { icon: Users,         title: "Müşteri Hesabı",      desc: "Firma bazlı self-servis giriş, çoklu kullanıcı." },
      { icon: Ticket,        title: "Destek Talebi",       desc: "Kategori + öncelik seçimli ticket açma, yanıtlaşma." },
      { icon: Receipt,       title: "Fatura & Abonelik",   desc: "Geçmiş faturalar, aktif lisans/abonelik durumu." },
      { icon: Boxes,         title: "Kurulu Ürünler",      desc: "Müşteride çalışan Pusula uygulamalarının görünümü." },
      { icon: FileText,      title: "Döküman & Eğitim",    desc: "Kullanım kılavuzları, video eğitimler, SSS." },
      { icon: Bell,          title: "Bildirimler",         desc: "Ticket yanıtı, güncelleme ve bakım duyuruları." },
    ],
  },
]

interface Milestone {
  dateLabel: string
  app:       "switch" | "hub" | "flow" | "import" | "fix" | "backup" | "all"
  title:     string
  desc:      string
}

const MILESTONES: Milestone[] = [
  { dateLabel: "10 Mart",    app: "all",    title: "Proje başlangıcı",            desc: "Switch + Hub + Flow monorepo iskeleti kuruldu." },
  { dateLabel: "14 Mart",    app: "fix",    title: "PusulaFix çekirdeği",         desc: "BT teşhis aracı — hosts, IP reset, servis yönetimi." },
  { dateLabel: "15 Mart",    app: "switch", title: "Gateway & SSO köprüsü",       desc: "Tek oturum ile tüm uygulamalara erişim açıldı." },
  { dateLabel: "19 Mart",    app: "import", title: "PusulaImport sihirbazı",      desc: "DBF/Excel/Access → Pusula SQL veri aktarımı." },
  { dateLabel: "22 Mart",    app: "hub",    title: "Firma sihirbazı",             desc: "Firma kurulum akışı — sunucu/kullanıcı/yedek tek adımda." },
  { dateLabel: "26 Mart",    app: "import", title: "Hesap Kartları aktarımı",     desc: "Staging tabloları, FirmaTipi eşleştirme, decimal fix." },
  { dateLabel: "28 Mart",    app: "hub",    title: "Windows Agent (C# servis)",   desc: "Uzaktan komut, AD, IIS, yedek yönetimi." },
  { dateLabel: "30 Mart",    app: "backup", title: "SpareBackup servisi",         desc: "Next.js UI + Windows Service — zamanlanmış SQL & dosya yedeği." },
  { dateLabel: "2 Nisan",    app: "flow",   title: "Cihaz kısıtlaması + 2FA",     desc: "Tek API key tek cihaz, merkezi 2FA." },
  { dateLabel: "5 Nisan",    app: "import", title: "Altın & Pırlanta Stok",       desc: "Grup/alt grup eşleştirme, prefix auto-generate." },
  { dateLabel: "7 Nisan",    app: "flow",   title: "Cloud & SFTP",                desc: "Bulut sunucu yönetimi, SFTP kotalı aktarım." },
  { dateLabel: "10 Nisan",   app: "backup", title: "İmzalı installer & OTA",      desc: "SHA256 imzalı .exe, SpareFlow'dan uzaktan sürüm yükseltme." },
  { dateLabel: "12 Nisan",   app: "hub",    title: "Uptime Kuma entegrasyonu",    desc: "11 monitor, Telegram bildirimi, heartbeat geçmişi." },
  { dateLabel: "16 Nisan",   app: "hub",    title: "Mesajlaşma sistemi",          desc: "WTS injection ile kullanıcıya popup + okundu takibi." },
  { dateLabel: "20 Nisan",   app: "hub",    title: "Komut paleti (Ctrl+K)",       desc: "Her yerden anında sayfa geçişi ve arama." },
  { dateLabel: "23 Nisan",   app: "hub",    title: "TV izleme ekranı",            desc: "55\" 4K TV için kiosk — DOWN alarmı, sesli uyarı, canlı." },
]

/* ──────────────────────────────────────────────────────────────────────
 * Yardımcılar
 * ────────────────────────────────────────────────────────────────────── */

function appTone(app: Milestone["app"]): { bg: string; ring: string; text: string; label: string } {
  switch (app) {
    case "switch": return { bg: "bg-sky-500/10",     ring: "ring-sky-500/40",     text: "text-sky-300",     label: "Switch" }
    case "hub":    return { bg: "bg-emerald-500/10", ring: "ring-emerald-500/40", text: "text-emerald-300", label: "Hub" }
    case "flow":   return { bg: "bg-amber-500/10",   ring: "ring-amber-500/40",   text: "text-amber-300",   label: "Flow" }
    case "import": return { bg: "bg-violet-500/10",  ring: "ring-violet-500/40",  text: "text-violet-300",  label: "Import" }
    case "fix":    return { bg: "bg-rose-500/10",    ring: "ring-rose-500/40",    text: "text-rose-300",    label: "Fix" }
    case "backup": return { bg: "bg-teal-500/10",    ring: "ring-teal-500/40",    text: "text-teal-300",    label: "Backup" }
    default:       return { bg: "bg-zinc-500/10",    ring: "ring-zinc-500/40",    text: "text-zinc-300",    label: "Hepsi" }
  }
}

/* ──────────────────────────────────────────────────────────────────────
 * Sayfa
 * ────────────────────────────────────────────────────────────────────── */

export default function SunumPage() {
  const [now, setNow] = useState<Date | null>(null)
  useEffect(() => {
    setNow(new Date())
    const t = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(t)
  }, [])

  return (
    <main className="relative overflow-x-hidden">
      {/* Arka plan dekor — büyük radial gradient'ler */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute -top-40 -left-40 h-[600px] w-[600px] rounded-full bg-sky-500/10 blur-3xl" />
        <div className="absolute top-1/3 -right-40 h-[700px] w-[700px] rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-[500px] w-[500px] rounded-full bg-amber-500/10 blur-3xl" />
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              "linear-gradient(to right, #fff 1px, transparent 1px), linear-gradient(to bottom, #fff 1px, transparent 1px)",
            backgroundSize: "56px 56px",
          }}
        />
      </div>

      {/* ── HERO ────────────────────────────────────────────────────── */}
      <section className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6 py-16">
        {/* Meteor yağmuru — hero'ya canlılık katar */}
        <Meteors number={30} className="pointer-events-none" />
        <div className="relative mx-auto w-full max-w-6xl">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs text-zinc-400 backdrop-blur"
          >
            <GitBranch className="h-3.5 w-3.5" />
            Son 45 Gün · {now ? now.toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" }) : "—"}
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 30, filter: "blur(8px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{ duration: 0.9, ease: "easeOut" }}
            className="bg-gradient-to-br from-white via-white to-zinc-500 bg-clip-text text-5xl font-bold leading-[1.05] tracking-tight text-transparent md:text-7xl lg:text-8xl"
          >
            Pusula Yazılım Ekosistemi
            <br />
            <span className="sunum-hero-gradient bg-clip-text text-transparent">
              45 günde inşa edildi.
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.3 }}
            className="mt-6 max-w-3xl text-lg text-zinc-400 md:text-xl"
          >
            Üç uygulama, tek ekosistem. Gateway'den izleme ekranına, firma sihirbazından bulut dosya yönetimine kadar —
            uçtan uca bir altyapı.
          </motion.p>

          <div className="mt-12 grid grid-cols-2 gap-4 md:grid-cols-4 md:gap-6">
            {HERO_STATS.map((s, i) => (
              <motion.div
                key={s.label}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.4 + i * 0.1 }}
                className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur transition hover:border-white/20 hover:bg-white/[0.06]"
              >
                <div className="bg-gradient-to-br from-white to-zinc-400 bg-clip-text text-4xl font-bold tabular-nums text-transparent md:text-5xl">
                  <NumberTicker value={s.num} suffix={s.suffix ?? ""} delay={0.6 + i * 0.1} />
                </div>
                <div className="mt-1 text-sm font-medium text-zinc-300">{s.label}</div>
                <div className="text-xs text-zinc-500">{s.sub}</div>
                <BorderBeam
                  size={120}
                  duration={8 + i * 2}
                  colorFrom={["#38bdf8", "#34d399", "#fbbf24", "#fb7185"][i % 4]}
                  colorTo="transparent"
                />
              </motion.div>
            ))}
          </div>

          <div className="mt-10 flex items-center gap-2 text-base text-zinc-400 md:text-lg">
            <Sparkles className="h-5 w-5 text-amber-400" />
            <span>Yeni eklenen:</span>
            <TypingAnimation
              words={[
                "Tek oturum (SSO)",
                "TV izleme ekranı",
                "Uptime Kuma entegrasyonu",
                "Windows Agent (C#)",
                "Firma kurulum sihirbazı",
                "Kullanıcı mesajlaşma",
                "Cloud & SFTP yönetimi",
                "DBF/Excel veri aktarımı",
                "BT teşhis aracı",
                "Otomatik yedekleme servisi",
                "Uzaktan sürüm yükseltme",
                "Alarm & ses uyarısı",
              ]}
              loop
              duration={55}
              className="bg-gradient-to-r from-sky-400 via-emerald-400 to-amber-400 bg-clip-text font-semibold text-transparent"
            />
          </div>

          <div className="mt-8 flex items-center gap-2 text-sm text-zinc-500">
            <ArrowDown className="h-4 w-4 animate-bounce" />
            Kaydır — detaylar aşağıda
          </div>
        </div>
      </section>

      {/* ── TECH STACK MARQUEE ───────────────────────────────────── */}
      <section className="relative py-10">
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-24 bg-gradient-to-r from-zinc-950 to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-24 bg-gradient-to-l from-zinc-950 to-transparent" />
        <Marquee pauseOnHover className="[--duration:40s] [--gap:2rem]">
          {[
            "Next.js 15",
            "TypeScript",
            "Tailwind CSS v4",
            "shadcn/ui",
            "React 19",
            "Socket.IO",
            "Fastify",
            "SQL Server",
            "SQLite",
            "Docker",
            "Uptime Kuma",
            "PM2",
            ".NET 8 WPF",
            "Turborepo",
            "pnpm",
            "Framer Motion",
            "MagicUI",
            "Telegram Bot API",
            "JWT / JOSE",
            "Recharts",
          ].map((t) => (
            <span
              key={t}
              className="rounded-full border border-white/10 bg-white/[0.03] px-5 py-2 text-sm font-semibold text-zinc-300 backdrop-blur transition hover:border-white/30 hover:bg-white/[0.08] hover:text-white"
            >
              {t}
            </span>
          ))}
        </Marquee>
      </section>

      {/* ── MİMARİ DİYAGRAMI ──────────────────────────────────────── */}
      <section className="relative px-6 py-24">
        <div className="mx-auto w-full max-w-6xl">
          <SectionTitle kicker="Mimari" title="Tek kapı, üç uygulama" />

          <div className="mt-12 rounded-3xl border border-white/10 bg-white/[0.02] p-8 backdrop-blur md:p-12">
            {/* Kullanıcı */}
            <div className="flex flex-col items-center">
              <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-6 py-4">
                <Users className="h-6 w-6 text-zinc-300" />
                <div>
                  <div className="text-sm font-semibold">Kullanıcı</div>
                  <div className="text-xs text-zinc-500">Tarayıcı · LAN / WAN</div>
                </div>
              </div>
              <ArrowLine />
              {/* Switch */}
              <div className="relative overflow-hidden rounded-2xl border border-sky-400/30 bg-gradient-to-br from-sky-500/15 to-sky-500/5 px-8 py-5 shadow-[0_0_60px_-15px_rgba(56,189,248,0.4)]">
                <div className="flex items-center gap-3">
                  <Network className="h-7 w-7 text-sky-300" />
                  <div>
                    <div className="text-base font-bold text-white">PusulaSwitch</div>
                    <div className="text-xs text-sky-200/80">Gateway · SSO · 2FA · :4000</div>
                  </div>
                </div>
                <BorderBeam size={180} duration={6} colorFrom="#38bdf8" colorTo="transparent" />
              </div>
              <ArrowLine split />
              {/* İki alt uygulama */}
              <div className="grid w-full grid-cols-1 gap-6 md:grid-cols-2">
                <MiniApp
                  name="PusulaHub"
                  port=":4242"
                  icon={LayoutDashboard}
                  color="emerald"
                  items={["Sunucu yönetimi", "İzleme (Kuma)", "TV ekranı", "Firma sihirbazı", "Windows Agent"]}
                />
                <MiniApp
                  name="SpareFlow"
                  port=":4243"
                  icon={Boxes}
                  color="amber"
                  items={["Çağrı takibi", "Cihaz yönetimi", "Cloud / SFTP", "Audit log", "Heartbeat"]}
                />
              </div>
              <ArrowLine />
              {/* Altyapı */}
              <div className="grid w-full grid-cols-2 gap-4 md:grid-cols-4">
                <InfraNode icon={Server}     label="Windows Sunucular" sub="Agent ile yönetilir" />
                <InfraNode icon={Cpu}        label="Ubuntu 10.15.2.6"  sub="Fastify + Kuma" />
                <InfraNode icon={HardDrive}  label="MSSQL + SQLite"    sub="Veritabanları" />
                <InfraNode icon={Globe}      label="Telegram / Mail"   sub="Bildirim kanalları" />
              </div>
            </div>

            {/* Masaüstü & Müşteri tarafı */}
            <div className="mt-10 border-t border-white/10 pt-8">
              <div className="mb-4 text-center text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
                Masaüstü Araçlar · Müşteri Bilgisayarı
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="relative overflow-hidden rounded-2xl border border-violet-400/30 bg-gradient-to-br from-violet-500/15 to-violet-500/5 p-5 shadow-[0_0_60px_-15px_rgba(167,139,250,0.4)]">
                  <div className="flex items-center gap-3">
                    <FileSpreadsheet className="h-6 w-6 text-violet-300" />
                    <div>
                      <div className="text-base font-bold text-white">PusulaImport</div>
                      <div className="text-xs text-violet-200/80">.NET 8 WPF · ETL</div>
                    </div>
                  </div>
                  <div className="mt-3 text-xs text-zinc-400">
                    Eski yazılım verilerini Pusula SQL'e taşır.
                  </div>
                  <BorderBeam size={150} duration={8} colorFrom="#a78bfa" colorTo="transparent" />
                </div>
                <div className="relative overflow-hidden rounded-2xl border border-rose-400/30 bg-gradient-to-br from-rose-500/15 to-rose-500/5 p-5 shadow-[0_0_60px_-15px_rgba(251,113,133,0.4)]">
                  <div className="flex items-center gap-3">
                    <Stethoscope className="h-6 w-6 text-rose-300" />
                    <div>
                      <div className="text-base font-bold text-white">PusulaFix</div>
                      <div className="text-xs text-rose-200/80">.NET WPF · BT Teşhis</div>
                    </div>
                  </div>
                  <div className="mt-3 text-xs text-zinc-400">
                    Sahada BT sorunlarını tek tıkla çözer.
                  </div>
                  <BorderBeam size={150} duration={10} colorFrom="#fb7185" colorTo="transparent" />
                </div>
                <div className="relative overflow-hidden rounded-2xl border border-teal-400/30 bg-gradient-to-br from-teal-500/15 to-teal-500/5 p-5 shadow-[0_0_60px_-15px_rgba(45,212,191,0.4)]">
                  <div className="flex items-center gap-3">
                    <DatabaseBackup className="h-6 w-6 text-teal-300" />
                    <div>
                      <div className="text-base font-bold text-white">SpareBackup</div>
                      <div className="text-xs text-teal-200/80">Next.js + Windows Service</div>
                    </div>
                  </div>
                  <div className="mt-3 text-xs text-zinc-400">
                    Müşteri PC'sinde zamanlanmış SQL & dosya yedeği.
                  </div>
                  <BorderBeam size={150} duration={9} colorFrom="#2dd4bf" colorTo="transparent" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── UYGULAMALAR ───────────────────────────────────────────── */}
      {APPS.map((app, idx) => (
        <AppSection key={app.key} app={app} idx={idx} />
      ))}

      {/* ── DEVAM EDEN PROJELER ───────────────────────────────────── */}
      <section className="relative px-6 py-24">
        <div className="mx-auto w-full max-w-6xl">
          <SectionTitle kicker="Yakında" title="Devam eden projeler" />
          <p className="mx-auto mt-4 max-w-2xl text-center text-base text-zinc-400">
            Çatıları kuruldu, geliştirme aktif. Önümüzdeki haftalarda canlıya geçecek iki yeni uygulama.
          </p>

          <div className="mt-14 grid grid-cols-1 gap-6 lg:grid-cols-2">
            {IN_PROGRESS.map((p, i) => {
              const Icon = p.icon
              const r = parseInt(p.accent.slice(1, 3), 16)
              const g = parseInt(p.accent.slice(3, 5), 16)
              const b = parseInt(p.accent.slice(5, 7), 16)
              return (
                <motion.div
                  key={p.name}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-80px" }}
                  transition={{ duration: 0.6, delay: i * 0.1 }}
                  className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] p-7 backdrop-blur"
                  style={{ boxShadow: `0 0 80px -30px ${p.accent}` }}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-4">
                      <div
                        className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10"
                        style={{ backgroundColor: `${p.accent}22`, boxShadow: `0 0 30px -8px ${p.accent}` }}
                      >
                        <Icon className="h-6 w-6" style={{ color: p.accent }} />
                      </div>
                      <div>
                        <h3 className="text-2xl font-bold text-white">{p.name}</h3>
                        <div className="text-sm text-zinc-400">{p.tagline}</div>
                      </div>
                    </div>
                    <div
                      className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em]"
                      style={{
                        borderColor: `${p.accent}66`,
                        backgroundColor: `${p.accent}1a`,
                        color: p.accent,
                      }}
                    >
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full" style={{ backgroundColor: p.accent }} />
                      devam ediyor
                    </div>
                  </div>

                  <p className="mt-5 text-sm leading-relaxed text-zinc-400">{p.summary}</p>

                  {/* Progress */}
                  <div className="mt-5">
                    <div className="mb-1.5 flex items-center justify-between text-[10px] uppercase tracking-widest text-zinc-500">
                      <span>ilerleme</span>
                      <span style={{ color: p.accent }}>{p.progress}%</span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/5">
                      <motion.div
                        initial={{ width: 0 }}
                        whileInView={{ width: `${p.progress}%` }}
                        viewport={{ once: true }}
                        transition={{ duration: 1.2, delay: 0.3 + i * 0.1, ease: "easeOut" }}
                        className="h-full rounded-full"
                        style={{
                          background: `linear-gradient(90deg, ${p.accent}, ${p.accent}aa)`,
                          boxShadow: `0 0 12px ${p.accent}`,
                        }}
                      />
                    </div>
                  </div>

                  {/* Plan list */}
                  <div className="mt-6 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {p.plan.map((pl) => {
                      const PIcon = pl.icon
                      return (
                        <div key={pl.title} className="flex items-start gap-2.5 rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2">
                          <PIcon className="mt-0.5 h-4 w-4 shrink-0" style={{ color: p.accent }} />
                          <div>
                            <div className="text-[13px] font-semibold text-white">{pl.title}</div>
                            <div className="text-[11px] text-zinc-500">{pl.desc}</div>
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  <BorderBeam size={220} duration={10 + i * 2} colorFrom={p.accent} colorTo="transparent" />
                  <div
                    className="pointer-events-none absolute -bottom-20 -right-20 h-60 w-60 rounded-full blur-3xl"
                    style={{ backgroundColor: `rgba(${r},${g},${b},0.15)` }}
                  />
                </motion.div>
              )
            })}
          </div>
        </div>
      </section>

      {/* ── ZAMAN ÇİZELGESİ ───────────────────────────────────────── */}
      <section className="relative px-6 py-24">
        <div className="mx-auto w-full max-w-5xl">
          <SectionTitle kicker="Zaman Çizelgesi" title="45 günün kilometre taşları" />

          <div className="relative mt-16">
            {/* Dikey çizgi */}
            <div
              className="absolute left-[15px] top-2 bottom-2 w-px md:left-1/2 md:-translate-x-px"
              style={{ backgroundImage: "linear-gradient(to bottom, rgba(56,189,248,0.5), rgba(52,211,153,0.5), rgba(251,191,36,0.5), rgba(167,139,250,0.5), rgba(251,113,133,0.5))" }}
            />

            <div className="space-y-8">
              {MILESTONES.map((m, i) => {
                const tone = appTone(m.app)
                const left = i % 2 === 0
                return (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: left ? -40 : 40 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true, margin: "-80px" }}
                    transition={{ duration: 0.5, delay: i * 0.05 }}
                    className={`relative flex items-start gap-4 md:gap-0 ${left ? "md:flex-row" : "md:flex-row-reverse"}`}
                  >
                    {/* Nokta */}
                    <div className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ring-4 ring-zinc-950 ${tone.bg} md:absolute md:left-1/2 md:-translate-x-1/2`}>
                      <div className={`h-2.5 w-2.5 rounded-full ${tone.text.replace("text-", "bg-")}`} />
                    </div>

                    {/* Kart */}
                    <div className={`flex-1 rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur md:max-w-[calc(50%-2rem)] ${left ? "md:mr-auto md:pr-8" : "md:ml-auto md:pl-8"}`}>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-zinc-300">{m.dateLabel}</span>
                        <span className={`rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ring-1 ${tone.bg} ${tone.ring} ${tone.text}`}>
                          {tone.label}
                        </span>
                      </div>
                      <div className="mt-1.5 text-base font-semibold text-white">{m.title}</div>
                      <div className="mt-1 text-sm text-zinc-400">{m.desc}</div>
                    </div>
                  </motion.div>
                )
              })}
            </div>
          </div>
        </div>
      </section>

      {/* ── KAPANIŞ ───────────────────────────────────────────────── */}
      <section className="relative overflow-hidden px-6 py-32">
        <Ripple
          mainCircleSize={280}
          mainCircleOpacity={0.18}
          numCircles={10}
          className="[mask-image:radial-gradient(ellipse_at_center,white,transparent_70%)]"
        />
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
          className="relative mx-auto w-full max-w-5xl text-center"
        >
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs text-zinc-400">
            <Sparkles className="h-3.5 w-3.5" />
            Ve devam ediyor…
          </div>
          <h2 className="sunum-hero-gradient bg-clip-text text-4xl font-bold leading-tight text-transparent md:text-6xl">
            45 gün sadece başlangıç.
          </h2>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-zinc-400">
            Altyapı kuruldu, iskelet ayakta. Bundan sonrası — daha fazla otomasyon, daha fazla
            modül, daha derin entegrasyon.
          </p>
          <div className="mt-12 flex flex-wrap items-center justify-center gap-3">
            <a href="/tv">
              <ShimmerButton
                background="linear-gradient(135deg, #059669, #047857)"
                shimmerColor="#6ee7b7"
                borderRadius="9999px"
                className="px-6 py-3"
              >
                <span className="inline-flex items-center gap-2 text-sm font-semibold text-white">
                  <Tv className="h-4 w-4" />
                  Canlı İzleme Ekranı
                </span>
              </ShimmerButton>
            </a>
            <a href="/monitoring">
              <ShimmerButton
                background="linear-gradient(135deg, #0284c7, #0369a1)"
                shimmerColor="#7dd3fc"
                borderRadius="9999px"
                className="px-6 py-3"
              >
                <span className="inline-flex items-center gap-2 text-sm font-semibold text-white">
                  <Radar className="h-4 w-4" />
                  İzleme Paneli
                </span>
              </ShimmerButton>
            </a>
            <a href="/">
              <ShimmerButton
                background="linear-gradient(135deg, #d97706, #b45309)"
                shimmerColor="#fcd34d"
                borderRadius="9999px"
                className="px-6 py-3"
              >
                <span className="inline-flex items-center gap-2 text-sm font-semibold text-white">
                  <LayoutDashboard className="h-4 w-4" />
                  Dashboard
                </span>
              </ShimmerButton>
            </a>
          </div>
          <div className="mt-16 text-xs text-zinc-600">
            Pusula Yazılım · 2026 · Muharrem Öz
          </div>
        </motion.div>
      </section>
    </main>
  )
}

/* ──────────────────────────────────────────────────────────────────────
 * Küçük yardımcı bileşenler
 * ────────────────────────────────────────────────────────────────────── */

function SectionTitle({ kicker, title }: { kicker: string; title: string }) {
  return (
    <div className="text-center">
      <div className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">{kicker}</div>
      <h2 className="mt-3 bg-gradient-to-br from-white to-zinc-400 bg-clip-text text-4xl font-bold leading-tight tracking-tight text-transparent md:text-5xl">
        {title}
      </h2>
    </div>
  )
}

function ArrowLine({ split = false }: { split?: boolean }) {
  return (
    <div className="flex flex-col items-center py-3">
      <div className="h-8 w-px bg-gradient-to-b from-white/30 to-white/5" />
      {split ? (
        <div className="relative h-8 w-full max-w-md">
          <div className="absolute left-1/2 top-0 h-4 w-px -translate-x-1/2 bg-white/20" />
          <div className="absolute top-4 left-1/4 right-1/4 h-px bg-white/20" />
          <div className="absolute top-4 left-1/4 h-4 w-px bg-white/20" />
          <div className="absolute top-4 right-1/4 h-4 w-px bg-white/20" />
        </div>
      ) : (
        <ArrowDown className="h-4 w-4 text-white/30" />
      )}
    </div>
  )
}

function MiniApp({
  name, port, icon: Icon, color, items,
}: {
  name: string; port: string; icon: React.ElementType; color: "emerald" | "amber"; items: string[]
}) {
  const tone = color === "emerald"
    ? { border: "border-emerald-400/30", bg: "from-emerald-500/15 to-emerald-500/5", text: "text-emerald-300", textSub: "text-emerald-200/80", glow: "shadow-[0_0_60px_-15px_rgba(52,211,153,0.4)]" }
    : { border: "border-amber-400/30",   bg: "from-amber-500/15 to-amber-500/5",    text: "text-amber-300",   textSub: "text-amber-200/80",   glow: "shadow-[0_0_60px_-15px_rgba(251,191,36,0.4)]" }
  return (
    <div className={`rounded-2xl border ${tone.border} bg-gradient-to-br ${tone.bg} p-5 ${tone.glow}`}>
      <div className="flex items-center gap-3">
        <Icon className={`h-6 w-6 ${tone.text}`} />
        <div>
          <div className="text-base font-bold text-white">{name}</div>
          <div className={`text-xs ${tone.textSub}`}>{port}</div>
        </div>
      </div>
      <ul className="mt-4 space-y-1.5">
        {items.map((it) => (
          <li key={it} className="flex items-center gap-2 text-sm text-zinc-300">
            <div className={`h-1 w-1 rounded-full ${tone.text.replace("text-", "bg-")}`} />
            {it}
          </li>
        ))}
      </ul>
    </div>
  )
}

function InfraNode({ icon: Icon, label, sub }: { icon: React.ElementType; label: string; sub: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-center">
      <Icon className="mx-auto h-5 w-5 text-zinc-400" />
      <div className="mt-1.5 text-xs font-semibold text-zinc-200">{label}</div>
      <div className="text-[10px] text-zinc-500">{sub}</div>
    </div>
  )
}

function AppSection({ app, idx }: { app: AppShowcase; idx: number }) {
  const Icon = app.icon
  return (
    <section className="relative px-6 py-24">
      <div className="mx-auto w-full max-w-6xl">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.7 }}
          className="flex flex-col gap-2"
        >
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
            {String(idx + 1).padStart(2, "0")} / {String(APPS.length).padStart(2, "0")}
          </div>
          <div className="flex flex-col items-start gap-6 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="flex items-center gap-4">
                <div
                  className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10"
                  style={{ backgroundColor: `${app.accent}22`, boxShadow: `0 0 40px -10px ${app.accent}66` }}
                >
                  <Icon className="h-7 w-7" style={{ color: app.accent }} />
                </div>
                <div>
                  <h2 className="text-4xl font-bold tracking-tight text-white md:text-5xl">{app.name}</h2>
                  <div className="text-base text-zinc-400 md:text-lg">{app.tagline}</div>
                </div>
              </div>
              <p className="mt-6 max-w-3xl text-base text-zinc-400 md:text-lg">{app.summary}</p>
            </div>
          </div>
        </motion.div>

        <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {app.features.map((f, i) => {
            const FIcon = f.icon
            const r = parseInt(app.accent.slice(1, 3), 16)
            const g = parseInt(app.accent.slice(3, 5), 16)
            const b = parseInt(app.accent.slice(5, 7), 16)
            return (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-80px" }}
                transition={{ duration: 0.5, delay: (i % 3) * 0.08 }}
              >
                <SpotlightCard
                  spotlightColor={`rgba(${r},${g},${b},0.15)`}
                  className="group h-full rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur transition hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.06]"
                >
                  <div
                    className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl transition group-hover:scale-110"
                    style={{ backgroundColor: `${app.accent}1a`, color: app.accent }}
                  >
                    <FIcon className="h-5 w-5" />
                  </div>
                  <div className="text-base font-semibold text-white">{f.title}</div>
                  <div className="mt-1 text-sm leading-relaxed text-zinc-400">{f.desc}</div>
                </SpotlightCard>
              </motion.div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
