"use client"

/**
 * /sunum — Son 90 günde yapılanları özetleyen patron sunumu.
 *
 * Üç uygulamanın (PusulaSwitch, PusulaHub, SpareFlow) yeteneklerini ve
 * 2026-03-10 → 2026-04-23 aralığında eklenen özellikleri tek sayfada
 * gösterir. Slayt-benzeri, scroll ile geçişli, karanlık tema.
 *
 * Bütün veriler sabit (commit log'undan derlendi) — canlı API çağrısı yok,
 * sunum sırasında bağlantı sorunlarından etkilenmesin.
 */

import { Fragment } from "react"
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
  ArrowUpDown,
  Activity,
  AlertCircle,
  BarChart3,
  Bell,
  BookOpen,
  Boxes,
  Building2,
  Cable,
  Clock,
  Cloud,
  CalendarClock,
  Database,
  DollarSign,
  Download,
  Mail,
  MapPin,
  Command,
  Cpu,
  DatabaseBackup,
  FileCheck2,
  FileSpreadsheet,
  FileText,
  Gauge,
  Gem,
  Globe,
  HardDrive,
  Key,
  KeyRound,
  Layers,
  LayoutDashboard,
  LineChart,
  Lock,
  MessageSquare,
  Monitor,
  Network,
  Printer,
  Radar,
  Receipt,
  Rocket,
  Router,
  ScanBarcode,
  Search,
  Server,
  Settings,
  ShieldCheck,
  Siren,
  Smartphone,
  Sparkles,
  Stethoscope,
  Terminal,
  TrendingUp,
  Tv,
  UserCog,
  Users,
  Wand2,
  Waypoints,
  Webcam,
  Wrench,
  Zap,
} from "lucide-react"

/* ──────────────────────────────────────────────────────────────────────
 * Veriler — commit log'undan derlendi (2026-03-10 → 2026-04-23).
 * ────────────────────────────────────────────────────────────────────── */

const HERO_STATS: { label: string; num: number; suffix?: string; sub: string }[] = [
  { label: "Gün",      num: 90,  sub: "10 Mart → 8 Haziran" },
  { label: "Uygulama", num: 7,   sub: "Web · Masaüstü · Servis" },
  { label: "Commit",   num: 420, suffix: "+", sub: "Yedi repo toplam" },
  { label: "Özellik",  num: 140, suffix: "+", sub: "Yeni modül ve sayfa" },
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
      { icon: KeyRound,    title: "Tek Oturum (SSO)",         desc: "Tüm Pusula uygulamalarında merkezi oturum ve JWT paylaşımı." },
      { icon: ShieldCheck, title: "2FA Desteği",              desc: "TOTP tabanlı iki faktörlü kimlik doğrulama güvenliği." },
      { icon: Users,       title: "Rol Tabanlı Yetki",        desc: "Uygulama bazlı rol ve modül düzeyinde izin yönetimi." },
      { icon: Lock,        title: "Modern Giriş Ekranı",      desc: "BorderBeam animasyonlu, sade ve güvenli login arayüzü." },
      { icon: Rocket,      title: "Gateway Mimarisi",         desc: "Tek origin'den (localhost:4000) tüm uygulamalara erişim." },
      { icon: Globe,       title: "LAN HTTPS/HTTP Uyumu",     desc: "Ofis LAN kurulumunda hem HTTP hem HTTPS ortamlarda çalışır." },
      { icon: BookOpen,    title: "İnteraktif Eğitim",        desc: "Adım adım yazılım kurulum ve yapılandırma rehberleri (VPN vb.)." },
      { icon: Layers,      title: "Çok Uygulama Yönetimi",    desc: "Basit konfigürasyonla yeni uygulamaları Switch'e hızlıca ekle." },
      { icon: Activity,    title: "Oturum Yönetimi",          desc: "TTL tabanlı session kontrolü ve güvenli logout işlemleri." },
      { icon: Network,     title: "Proxy & Rewrite",          desc: "Next.js rewrites ile upstream uygulamalara sorunsuz veri geçişi." },
    ],
  },
  {
    key:     "hub",
    name:    "PusulaHub",
    tagline: "Altyapı yönetim merkezi",
    color:   "from-emerald-500/20 to-emerald-500/0",
    accent:  "#34d399",
    icon:    LayoutDashboard,
    summary: "Sunucuları, firmaları, kullanıcıları, izleme sistemini, şifre kasasını ve ekip işbirliği araçlarını (notlar, takvim, projeler) tek panelden yöneten ana kontrol merkezi. Windows agent ile sunucularda doğrudan komut çalıştırma, izleme ve bildirim altyapısını içerir.",
    features: [
      { icon: Tv,               title: "TV İzleme Ekranı",          desc: "55\" 4K TV için kiosk tarzı canlı izleme — DOWN alarmı, sesli uyarı, 1 sn canlı." },
      { icon: Radar,            title: "Uptime Kuma Entegrasyonu",  desc: "12+ sunucu/servis izlemesi, heartbeat geçmişi, Telegram bildirimi." },
      { icon: Siren,            title: "Alarm & Ses Uyarısı",       desc: "DOWN tespitinde ekranda flash + beep, DOWN süresi sayacı, olay log'u." },
      { icon: Building2,        title: "Firma Kurulum Sihirbazı",   desc: "Sunucu, kullanıcı, yedek, SQL login + DENY VIEW + DB owner tek akışta." },
      { icon: Server,           title: "Sunucu Yönetimi",           desc: "Windows ve AD sunucularını liste, durum, disk, servis detayı." },
      { icon: Wrench,           title: "Windows Agent",             desc: "C# servis — uzaktan komut, Active Directory, IIS ve yedek işlemleri." },
      { icon: MessageSquare,    title: "Kullanıcı Mesajlaşma",      desc: "Oturuma popup gönderme, okundu takibi (WTS session injection)." },
      { icon: DatabaseBackup,   title: "SQL Yedek & Restore",       desc: "Firma başına yedek listeleme, tek tık geri yükleme (`D:\\SQLData\\{firmaId}`)." },
      { icon: KeyRound,         title: "Vault — Şifre Kasası",      desc: "AES-256-GCM ile sunucu/DB/panel şifreleri, geçmiş + erişim audit log'u." },
      { icon: FileText,         title: "Not Defteri",               desc: "Tiptap zengin metin editörü, etiket + sabitleme, kullanıcı bazlı filtre." },
      { icon: CalendarClock,    title: "Takvim",                    desc: "Ay/hafta görünümü, tekrarlayan etkinlikler, drag-drop, kullanıcı filtresi." },
      { icon: Boxes,            title: "Projeler (Kanban)",         desc: "Görev panosu, alt görevler, dosya ekleme, ekip atamaları." },
      { icon: FileSpreadsheet,  title: "Firma Aktarımı",            desc: "Müşteri tarafında SQL backup helper + Hub'a aktarım sihirbazı." },
      { icon: UserCog,          title: "Yetki Yönetimi",            desc: "Modül bazlı read/write izinleri, rol tabanlı erişim (admin / kullanıcı)." },
      { icon: Monitor,          title: "Dashboard KPI Kartları",    desc: "Canlı izleme durumu, sunucu sayısı, aktif kullanıcı özeti." },
      { icon: LineChart,        title: "Heartbeat Bar Grafiği",     desc: "Uptime Kuma tarzı son 100 beat — hover ile tarih/durum/ping." },
      { icon: Bell,             title: "Telegram Bildirimi",        desc: "DOWN/UP durum değişiminde anlık bot mesajı." },
    ],
  },
  {
    key:     "flow",
    name:    "SpareFlow",
    tagline: "Müşteri yedekleme yönetim merkezi",
    color:   "from-amber-500/20 to-amber-500/0",
    accent:  "#fbbf24",
    icon:    Boxes,
    summary: "Müşterilere kurulu SpareBackup agent'larından gelen heartbeat, log ve yedekleme durumlarını izleyen merkezi panel. SFTP bulut sunucusunda yedeklerin doğrulanması, kota/disk takibi, başarı oranı ve çevrimdışı uyarıları; Spare Cloud sunucu yönetimi, Pusula Bridge ve Kur API entegrasyonu, müşteri başına API key + cihaz kısıtlaması ile çok-müşteri yönetimine hazır.",
    features: [
      { icon: Monitor,         title: "Kurulum Yönetimi",          desc: "SpareBackup ve Bridge kurulumlarına merkezi erişim ve durum takibi." },
      { icon: MapPin,          title: "İnteraktif Harita",         desc: "Tüm kurulumların coğrafi konumu, IP'ler ve durum filtreli görünüm." },
      { icon: HardDrive,       title: "Yedek Takibi",              desc: "SFTP bulut sunucusunda yedek görevleri, disk kullanımı, sağlık durumu." },
      { icon: Cloud,           title: "Spare Cloud Yönetimi",      desc: "Bulut sunucu metrikleri, güvenlik, servisler, kullanıcı ve disk analizi." },
      { icon: Activity,        title: "Heartbeat Sistemi",         desc: "Kurulumlardan periyodik sinyalle çevrimiçi/sorunlu/çevrimdışı durum." },
      { icon: ShieldCheck,     title: "2FA & Güvenlik",            desc: "TOTP iki adımlı doğrulama, audit log ve Hub üzerinden SSO entegrasyonu." },
      { icon: Boxes,           title: "Bridge Entegrasyonu",       desc: "Pusula Bridge kurulumları, Kur API, lisans yönetimi ve SQL sorgu havuzu." },
      { icon: Cable,           title: "API Yönetimi",              desc: "Özel API tanımı, token yönetimi ve telemetri ile dinamik API kataloğu." },
      { icon: Smartphone,      title: "Cihaz Kısıtlaması",         desc: "API key'leri cihaz parmak iziyle bağlayarak güvenli çok-cihaz yönetimi." },
      { icon: Wrench,          title: "Bridge Link Kısaltma",      desc: "Mail görsel ve form URL'lerini kalıcı kısa linklere dönüştürme servisi." },
      { icon: Users,           title: "Kur Yönetimi",              desc: "Kur firmaları, müşteri mesajları ve şifre kontrol paneli." },
      { icon: FileCheck2,      title: "Bridge Raporları",          desc: "Kategoriye uygun dinamik SQL raporlar, parametreler ve firma ataması." },
      { icon: Gauge,           title: "Bulut Sunucu İzleme",       desc: "CPU, bellek, disk I/O, ağ metrikleri ve servis durumu gerçek zamanlı." },
      { icon: Zap,             title: "Fastify Backend",           desc: "Yüksek performanslı Node.js API — döviz, health, upstream entegrasyonları." },
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
      { icon: Clock,           title: "Zamanlanmış Yedek",         desc: "Cron tabanlı günlük/saatlik/özel zamanlama ile SQL ve dosya yedeği." },
      { icon: DatabaseBackup,  title: "SQL Server Desteği",        desc: "Full/Differential yedek, sıkıştırma, hash doğrulama ve otomatik restore." },
      { icon: HardDrive,       title: "Dosya & Klasör Yedeği",     desc: "Artımlı yedek, manifest tabanlı versiyonlama, silinen dosya yönetimi." },
      { icon: Rocket,          title: "Uzaktan Güncelleme",        desc: "SpareFlow panelinden OTA sürüm yükseltme, sessiz kurulum, tray IPC." },
      { icon: ShieldCheck,     title: "İmzalı Installer",          desc: "Inno Setup ile SHA256 imzalı .exe, zorunlu güncelleme bayrağı + tray." },
      { icon: Activity,        title: "Heartbeat",                 desc: "İstemci durumu, sürüm, son yedek ve görev detaylarını panele raporlama." },
      { icon: LayoutDashboard, title: "Yerel Yönetim UI",          desc: "Next.js web arayüzü ile yedek geçmişi, hata logları, sistem haritası." },
      { icon: KeyRound,        title: "Setup Sihirbazı",           desc: "İlk kurulumda admin şifresi, QR ile mobil giriş ve makine kimliği." },
      { icon: Cloud,           title: "Spare Cloud Desteği",       desc: "Uçtan uca şifreli bulut yedekleme, paralel batch upload ve indirme." },
      { icon: Lock,            title: "2FA & Lisans Yönetimi",     desc: "İki adımlı kimlik doğrulama, tek lisans tek PC kontrolü ve audit log." },
      { icon: Bell,            title: "Bildirim Kanalları",        desc: "Email, Telegram, WhatsApp ile yedek sonucu bildirimi ve hata uyarısı." },
      { icon: FileText,        title: "Audit & Log Yönetimi",      desc: "Detaylı işlem logları, otomatik log rotasyon, görüntüleme ve filtre." },
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
      { icon: Database,        title: "4 Kaynak Format",          desc: "Excel · Microsoft Access · SQL Server · DBF (eski kuyumcu yazılımları)." },
      { icon: Users,           title: "Hesap Kartları Aktarımı",  desc: "Müşteri/cari kartları, FirmaTipi eşleştirme, staging tabloları." },
      { icon: Boxes,           title: "Altın Stokları Yönetimi",  desc: "Grup/alt grup eşleştirme, prefix auto-generate, dinamik toplam satırları." },
      { icon: Gem,             title: "Pırlanta & Özel Ürün",     desc: "Taş detaylarıyla beraber özel ürünleri veritabanına aktar." },
      { icon: Clock,           title: "Saat Stok Aktarımı",       desc: "Saat ürünlerini alt grup eşleştirmesiyle yönet ve aktar." },
      { icon: TrendingUp,      title: "Bakiye Transferi",         desc: "Hesap bakiyelerini birden fazla para birimiyle taşıma desteği." },
      { icon: Wand2,           title: "Sihirbaz Arayüzü",         desc: "3 adımlı kolay kullanımlı veri aktarım sihirbazı." },
      { icon: Network,         title: "SQL Instance Keşfi",       desc: "Yerel ağdaki SQL Server instance'larını otomatik algılama." },
      { icon: FileSpreadsheet, title: "Excel Şablon İndirme",     desc: "Hazır Excel şablonları indir ve örneklere uygun veri gir." },
      { icon: Search,          title: "Veri Önizleme & Arama",    desc: "Aktarım öncesi verileri sayfalama ve sütun bazlı aramayla incele." },
      { icon: Download,        title: "Filtreli Excel Export",    desc: "Seçilen verileri filtrelenmiş şekilde Excel'e aktar." },
      { icon: Zap,             title: "241 & Devir Hareketleri",  desc: "Otomatik 241 muhasebe hareketi ve cari devir oluşturma." },
      { icon: Lock,            title: "Dönem Kapatma",            desc: "Kasa ve bakiye devirle dönemsel kapama işlemlerini yönet." },
      { icon: AlertCircle,     title: "Canlı İşlem Log'u",        desc: "Terminal tarzı log ile aktarım ilerlemesini gerçek zamanlı takip et." },
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
      { icon: Network,         title: "IP Sabitleme",             desc: "Ethernet kartı seçip statik IP atar ve adaptörü yeniden başlatır." },
      { icon: FileCheck2,      title: "Hosts Dosyası",            desc: "Elevated erişim ile hosts dosyasına kayıt ekleme ve silme." },
      { icon: Key,             title: "Kimlik Bilgisi",           desc: "Ağ paylaşımları için Windows kimlik bilgilerini yönetin." },
      { icon: Router,          title: "RDP Sorun Giderici",       desc: "RDP bağlantı sorunları ve adım adım çözüm rehberi." },
      { icon: UserCog,         title: "Kullanıcı Yönetimi",       desc: "Windows lokal kullanıcı oluşturma, silme ve yönetme." },
      { icon: Database,        title: "SQL Editör",               desc: "Lokal SQL Server'a bağlanıp SELECT sorguları çalıştırma." },
      { icon: Wrench,          title: "Servis Yönetimi",          desc: "Windows servislerini başlat, durdur veya yeniden başlat." },
      { icon: Gauge,           title: "Kaynak İzleme",            desc: "CPU, RAM ve en çok kaynak tüketen uygulamaları canlı izle." },
      { icon: Printer,         title: "Yazıcı Kuyruğu",           desc: "Bekleyen yazdırma işlerini temizle, spooler'ı yeniden başlat." },
      { icon: Webcam,          title: "Web Kamera Testi",         desc: "Bağlı kameraları listele ve canlı görüntüyü test et." },
      { icon: Activity,        title: "Sistem Bilgisi",           desc: "Donanım, OS ve ağ bilgilerini görüntüle ve kopyala." },
      { icon: Globe,           title: "İnternet Testi",           desc: "Sürekli ping ile bağlantı izleme ve internet hız testi." },
      { icon: Zap,             title: "Ağ Sıfırlama",             desc: "DNS, Winsock, TCP/IP sıfırlama ve IP yenileme." },
      { icon: ScanBarcode,     title: "RFID Sayım",               desc: "RFID tabanlı stok ve envanter sayım hizmeti." },
    ],
  },
  {
    key:     "bridge",
    name:    "Pusula Bridge",
    tagline: "PusulaX için raporlama & tray köprüsü",
    color:   "from-indigo-500/20 to-indigo-500/0",
    accent:  "#818cf8",
    icon:    Waypoints,
    summary: "PusulaX kuyumcu otomasyonu için yardımcı web + tray + müşteri formu uygulaması. SQL Server raporları planlı çalıştırır, mail/HTML şablonlarla gönderir, tenant izolasyonu ile çoklu firma yönetir; TV ekranı, döviz, görev panosu ve müşteri formu dahil.",
    features: [
      { icon: FileText,        title: "SQL Rapor Motoru",          desc: "Manuel + API raporları, test query, Excel/CSV/PDF export." },
      { icon: Mail,            title: "Mail ile Gönderim",         desc: "Otomatik/manuel mail, HTML şablon, inline ürün görselleri." },
      { icon: CalendarClock,   title: "Zamanlanmış Görevler",      desc: "node-cron tabanlı scheduler, görsel flow builder, yazıcı + mail." },
      { icon: DollarSign,      title: "Döviz Kurları",             desc: "Pars API + canlı DB senkronu, per-ürün kur takibi ve ekran." },
      { icon: Monitor,         title: "Fiyat Ekranı (TV)",         desc: "12-grid layout editör, 11 widget tipi, SSE ile canlı güncelleme." },
      { icon: Smartphone,      title: "Müşteri Tanı Formu",        desc: "Mobil-first QR form, kamera capture, dijital imza, PDF export." },
      { icon: Database,        title: "Tenant İzolasyonu",         desc: "Çoklu müşteri, tenant-scoped veri, f<firmaId> subdomain, Pars senkronu." },
      { icon: BarChart3,       title: "Konsolide Raporlama",       desc: "Çoklu SQL Server'dan sonuç birleştirme, Recharts grafikleri." },
      { icon: Settings,        title: "Konfigürasyon Paneli",      desc: "SMTP, SQL, lisans, güvenlik politikası, mail görselleri." },
      { icon: Network,         title: "WAN Tüneli (frpc)",         desc: "Pusula API sunucusundaki frps üzerinden f<firkod>.bridge.pusulayazilim.net." },
      { icon: Wrench,          title: "Windows Servisi & Tray",    desc: "NSSM otomatik servis, .NET tray, sistem tepsisi, Inno Setup installer." },
    ],
  },
  {
    key:     "api",
    name:    "Pusula API",
    tagline: "Tüm uygulamaların ortak backend'i",
    color:   "from-lime-500/20 to-lime-500/0",
    accent:  "#a3e635",
    icon:    Zap,
    summary: "Ubuntu sunucuda (10.15.2.6) çalışan Fastify Node.js servisi. Döviz kurları, kur API entegrasyonu, müşteri kayıt sistemi, Bridge frps tüneli, mail göndericisi ve sağlık kontrolü gibi merkezi servisleri tüm Pusula uygulamalarına sunar. PM2 ile yönetilir, LAN/WAN failover ile her ortamdan erişilebilir.",
    features: [
      { icon: Zap,             title: "Fastify Node.js",           desc: "Yüksek performanslı HTTP API — PM2 yönetiminde, SQLite veritabanı." },
      { icon: KeyRound,        title: "API Key + IP Whitelist",    desc: "10.15.2.x LAN whitelist + 127.0.0.1, header tabanlı X-API-Key kontrolü." },
      { icon: DollarSign,      title: "Döviz Kur Servisi",         desc: "Pars API entegrasyonu, anlık döviz kurları (USD, EUR, altın, vs.)." },
      { icon: Database,        title: "Kur API Entegrasyonu",      desc: "PusulaKur Supabase'i ile çift yönlü senkron — müşteri, parametre, hesaplama." },
      { icon: Users,           title: "Customer Registry",         desc: "Firma kayıtları, abonelik durumu, lisans yönetimi merkezi." },
      { icon: Network,         title: "Bridge frps Tüneli",        desc: "Müşteri Bridge frpc istemcilerine subdomain dağıtan reverse proxy sunucusu." },
      { icon: Mail,            title: "SMTP Mail Servisi",         desc: "Şifre sıfırlama, rapor mailleri, sistem bildirimleri için merkezi SMTP." },
      { icon: Activity,        title: "Health & Status",           desc: "/health endpoint, döviz kaynakları durumu, upstream sağlık kontrolü." },
      { icon: Globe,           title: "LAN/WAN Failover",          desc: "LAN'da `10.15.2.6:3000`, WAN'da `api.pusulanet.net` — otomatik geçiş." },
      { icon: FileCheck2,      title: "Audit Log",                 desc: "Her API çağrısının kim/ne/nereden detayı, debug ve güvenlik için." },
    ],
  },
  {
    key:     "cloud",
    name:    "Cloud SFTP",
    tagline: "Müşteri yedek depolama sunucusu",
    color:   "from-cyan-500/20 to-cyan-500/0",
    accent:  "#22d3ee",
    icon:    Cloud,
    summary: "SpareBackup agent'larının ürettiği yedek dosyalarını saklayan SFTP sunucusu. Firma başına izole klasör yapısı, kota takibi, otomatik temizlik ve SpareFlow paneline canlı raporlama ile bulut-disk hibrit depolama çözümü sunar.",
    features: [
      { icon: Cloud,           title: "SFTP Backup Storage",       desc: "OpenSSH/SFTP üzerinde güvenli yedek dosya depolama, dosya başına hash." },
      { icon: Boxes,           title: "Firma Bazlı İzolasyon",     desc: "Her müşteri kendi klasöründe — başkasının dosyasına erişemez." },
      { icon: Gauge,           title: "Kota & Disk Takibi",        desc: "Firma başına maks disk alanı, kullanım yüzdesi, SpareFlow'da canlı." },
      { icon: HardDrive,       title: "Otomatik Temizlik",         desc: "Kota aşımında eski yedek dosyalarını LIFO/retention kuralıyla sil." },
      { icon: Lock,            title: "LAN-Only Erişim",           desc: "VPN/LAN üzerinden 22 portu erişilebilir — internete açık değil." },
      { icon: FileText,        title: "Manifest Tracking",         desc: "Her yedeğin dosya listesi, hash, boyut ve zaman damgası kaydı." },
      { icon: Search,          title: "Tarama & Arama",            desc: "SpareFlow panelinden dosya listele, ara, indir veya sil." },
      { icon: TrendingUp,      title: "Kullanım Trendleri",        desc: "Firma bazlı haftalık/aylık disk büyüme grafiği ve uyarıları." },
    ],
  },
]


/* ──────────────────────────────────────────────────────────────────────
 * Sayfa
 * ────────────────────────────────────────────────────────────────────── */

export default function SunumPage() {
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
          <motion.h1
            initial={{ opacity: 0, y: 30, filter: "blur(8px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{ duration: 0.9, ease: "easeOut" }}
            className="bg-gradient-to-br from-white via-white to-zinc-500 bg-clip-text text-5xl font-bold leading-[1.05] tracking-tight text-transparent md:text-7xl lg:text-8xl"
          >
            Pusula Yazılım Ekosistemi
            <br />
            <span className="sunum-hero-gradient bg-clip-text text-transparent">
              90 günde inşa edildi.
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
      <EcosystemDiagram />

      {/* ── UYGULAMALAR ─────────────────────────────────────────────
          Pusula Bridge'in hemen altına Bridge Bağlantısı diyagramı
          eklenir — kullanıcı "Bridge nedir" gördükten sonra "WAN'dan
          nasıl erişilir" sorusunun cevabı bağlam içinde gelir. */}
      {APPS.map((app, idx) => (
        <Fragment key={app.key}>
          <AppSection app={app} idx={idx} />
          {app.key === "bridge" && <TunnelDiagram />}
        </Fragment>
      ))}

      {/* ── GÜVENLİK ─────────────────────────────────────────────── */}
      <SecuritySection />

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
            90 gün sadece başlangıç.
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

/* ──────────────────────────────────────────────────────────────────────
 * Ekosistem Diyagramı
 * ──────────────────────────────────────────────────────────────────────
 * 5 katmanlı görsel: Kullanıcı → Gateway → Web Apps → Backend Servisler
 * → Müşteri tarafı. Her node DiagramNode component'i ile çizilir,
 * katmanlar arası bağlantı ArrowLine helper'ı ile gösterilir. Renkler
 * her uygulamanın brand tonu (Hub mavi, Flow amber, vs.) ile eşleşir.
 * ────────────────────────────────────────────────────────────────────── */
function DiagramNode({
  icon: Icon, name, sub, accent, size = "md",
}: {
  icon: React.ElementType
  name: string
  sub?: string
  /** hex renk — kart border, gradient ve glow için kullanılır */
  accent: string
  /** sm: müşteri tarafı kompakt | md: standart | lg: ana hub kartı */
  size?: "sm" | "md" | "lg"
}) {
  const pad   = size === "sm" ? "px-3 py-2.5" : size === "lg" ? "px-6 py-4" : "px-4 py-3"
  const iconSize = size === "sm" ? "h-4 w-4" : size === "lg" ? "h-7 w-7" : "h-5 w-5"
  const nameSize = size === "sm" ? "text-[12px]" : size === "lg" ? "text-base" : "text-sm"
  const subSize  = size === "sm" ? "text-[10px]" : size === "lg" ? "text-xs" : "text-[11px]"
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-30px" }}
      transition={{ duration: 0.4 }}
      className={`relative overflow-hidden rounded-xl border ${pad} backdrop-blur`}
      style={{
        borderColor:     `${accent}55`,
        backgroundImage: `linear-gradient(135deg, ${accent}22, ${accent}05)`,
        boxShadow:       `0 0 40px -15px ${accent}66`,
      }}
    >
      <div className="flex items-center gap-2.5">
        <Icon className={iconSize} style={{ color: accent }} />
        <div className="min-w-0">
          <div className={`${nameSize} font-bold text-white truncate`}>{name}</div>
          {sub && <div className={`${subSize} text-zinc-400 truncate`}>{sub}</div>}
        </div>
      </div>
    </motion.div>
  )
}

function LayerLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-3 text-center text-[10px] font-semibold uppercase tracking-[0.25em] text-zinc-500">
      {children}
    </div>
  )
}

function EcosystemDiagram() {
  return (
    <section className="relative px-6 py-24">
      <div className="mx-auto w-full max-w-6xl">
        <SectionTitle kicker="Ekosistem Mimarisi" title="Tüm parçalar nasıl konuşuyor?" />
        <p className="mx-auto mt-4 max-w-2xl text-center text-base text-zinc-400">
          Pusula sunucularındaki web uygulamaları, ortak Fastify API'si, müşteri
          PC'lerine kurulu agent'lar ve bulut yedek depolama tek bir akışta birleşir.
        </p>

        <div className="mt-12 rounded-3xl border border-white/10 bg-white/[0.02] p-6 backdrop-blur md:p-10">

          {/* ── KATMAN 1 — Kullanıcı ──────────────────────────────── */}
          <div className="flex flex-col items-center">
            <DiagramNode icon={Users} name="Kullanıcı / Müşteri" sub="Tarayıcı · LAN / WAN" accent="#e5e7eb" />
            <ArrowLine />

            {/* ── KATMAN 2 — Gateway ────────────────────────────── */}
            <DiagramNode icon={Network} name="PusulaSwitch" sub="Gateway · SSO · 2FA · :4000" accent="#38bdf8" size="lg" />
            <ArrowLine split />

            {/* ── KATMAN 3 — Web Uygulamaları ───────────────────── */}
            <div className="w-full">
              <LayerLabel>Pusula Sunucuları · Web Uygulamaları</LayerLabel>
              <div className="grid w-full grid-cols-1 gap-4 md:grid-cols-3">
                <DiagramNode icon={LayoutDashboard} name="PusulaHub"    sub="Altyapı · Sunucular · İzleme · :4242" accent="#1d64ff" />
                <DiagramNode icon={Boxes}           name="SpareFlow"    sub="Yedek yönetimi · :4243"               accent="#fbbf24" />
                <DiagramNode icon={Waypoints}       name="Pusula Bridge" sub="Raporlama · Tray · :58748"           accent="#818cf8" />
              </div>
            </div>
            <ArrowLine />

            {/* ── KATMAN 4 — Backend / Altyapı ──────────────────── */}
            <div className="w-full">
              <LayerLabel>Pusula API Sunucusu · Bulut Altyapı</LayerLabel>
              <div className="grid w-full grid-cols-1 gap-4 md:grid-cols-3">
                <DiagramNode icon={Zap}   name="Pusula API (Fastify)" sub="10.15.2.6:3000 · Auth · Döviz · Kur · frps" accent="#a3e635" />
                <DiagramNode icon={Cloud} name="Cloud SFTP"           sub="Yedek depolama · Kota · Manifest"          accent="#22d3ee" />
                <DiagramNode icon={Radar} name="Uptime Kuma"          sub="İzleme · Telegram bildirimi · 3001"        accent="#f472b6" />
              </div>
            </div>

            {/* VPN / Internet ayırıcı */}
            <div className="my-6 flex w-full items-center gap-3">
              <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/15 to-transparent" />
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
                VPN · Internet · WAN
              </span>
              <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/15 to-transparent" />
            </div>

            {/* ── KATMAN 5 — Müşteri tarafı ─────────────────────── */}
            <div className="w-full">
              <LayerLabel>Müşteri Bilgisayarı · Agent ve Masaüstü Araçlar</LayerLabel>
              <div className="grid w-full grid-cols-2 gap-3 md:grid-cols-5">
                <DiagramNode icon={DatabaseBackup}  name="SpareBackup"   sub="Win servis + UI"   accent="#2dd4bf" size="sm" />
                <DiagramNode icon={Waypoints}       name="Bridge frpc"   sub="Tunnel istemci"    accent="#818cf8" size="sm" />
                <DiagramNode icon={Wrench}          name="Windows Agent" sub="Hub uzaktan komut" accent="#1d64ff" size="sm" />
                <DiagramNode icon={Stethoscope}     name="PusulaFix"     sub=".NET WPF · BT"     accent="#fb7185" size="sm" />
                <DiagramNode icon={FileSpreadsheet} name="PusulaImport"  sub=".NET 8 WPF · ETL"  accent="#a78bfa" size="sm" />
              </div>
            </div>

            {/* Açıklayıcı alt metin — veri akışı kuralları */}
            <div className="mt-10 grid w-full grid-cols-1 gap-3 text-[12px] text-zinc-400 md:grid-cols-3">
              <div className="rounded-lg border border-white/5 bg-white/[0.03] px-4 py-3">
                <span className="font-semibold text-white">Switch → Web App</span> · SSO oturumu reverse proxy ile aktarılır.
              </div>
              <div className="rounded-lg border border-white/5 bg-white/[0.03] px-4 py-3">
                <span className="font-semibold text-white">Web App → API</span> · Fastify döviz, kur, tunnel, customer servisleri sunar.
              </div>
              <div className="rounded-lg border border-white/5 bg-white/[0.03] px-4 py-3">
                <span className="font-semibold text-white">Agent → Cloud SFTP</span> · SpareBackup yedek dosyalarını şifreli yükler.
              </div>
            </div>

          </div>
        </div>
      </div>
    </section>
  )
}

/* ──────────────────────────────────────────────────────────────────────
 * Bridge Bağlantı Akışı (sade anlatım)
 * ──────────────────────────────────────────────────────────────────────
 * Bridge müşterinin lokal bilgisayarında çalışır; telefondan/tabletten
 * erişebilmesi için Pusula sunucusu üzerinden bir köprü kuruluyor.
 *
 * Teknik isimler (frps/frpc/subdomain/port) sunum izleyicisini boğmamak
 * için gizli — diagram dilini "köprü, kapı, bilgisayar" gibi günlük
 * kavramlarla ifade ediyoruz. Çift yönlü oklar veriler her iki yönde
 * de aynı köprüden geçtiğini gösterir.
 * ────────────────────────────────────────────────────────────────────── */
function TunnelDiagram() {
  /** Bağlantı akışı — 4 sade node. */
  const steps = [
    {
      icon: Users,
      accent: "#e5e7eb",
      title: "Müşterinin Telefonu / Tableti",
      sub:   "Bridge'e bağlanmak ister",
      arrow: "İnternet üzerinden gidip gelir",
    },
    {
      icon: Network,
      accent: "#a3e635",
      title: "Pusula Sunucusu",
      sub:   "Köprü — isteği doğru bilgisayara yönlendirir, cevabı geri taşır",
      arrow: "Doğru müşteriye iletilir",
    },
    {
      icon: Monitor,
      accent: "#22d3ee",
      title: "Müşteri Bilgisayarı",
      sub:   "Bridge'in çalıştığı PC — bağlantıyı kabul eder",
      arrow: "Yerel ağda Bridge'e ulaşır",
    },
    {
      icon: Waypoints,
      accent: "#818cf8",
      title: "Pusula Bridge",
      sub:   "Müşterinin web arayüzü",
      arrow: undefined,
    },
  ]

  /** Sağdaki özellik kartları — sade dilde 5 madde. */
  const features = [
    { icon: Boxes,       title: "Çoklu Firma",       desc: "Tek altyapı tüm müşterilere aynı anda hizmet eder." },
    { icon: Sparkles,    title: "Otomatik Kurulum",  desc: "Lisans girilince bağlantı kendi kendine kurulur, ek ayar gerekmez." },
    { icon: ShieldCheck, title: "Her Zaman Hazır",   desc: "Bilgisayar her açıldığında bağlantı otomatik gelir." },
    { icon: Lock,        title: "Güvenli Bağlantı",  desc: "Her firma kendi şifreli kapısından geçer; kimse başkasının verisine ulaşamaz." },
    { icon: Activity,    title: "Panelden İzleme",   desc: "SpareFlow'da \"bağlı / bağlı değil\" durumu anında görünür." },
  ]

  return (
    <section className="relative px-6 py-24">
      <div className="mx-auto w-full max-w-6xl">
        <SectionTitle kicker="Bridge Bağlantısı" title="Bridge'e dışarıdan nasıl ulaşılıyor?" />
        <p className="mx-auto mt-4 max-w-2xl text-center text-base text-zinc-400">
          Bridge müşterinin lokal bilgisayarında çalışır. Telefonundan ya da
          tabletinden uzaktan bağlanabilsin diye Pusula sunucusu üzerinden bir
          <span className="font-semibold text-white"> köprü </span>
          kuruyoruz.
        </p>

        <div className="mt-12 grid gap-6 md:grid-cols-5">
          {/* SOL — Akış diyagramı */}
          <div className="md:col-span-3 rounded-3xl border border-white/10 bg-white/[0.02] p-6 backdrop-blur md:p-8">
            <LayerLabel>Bağlantı Akışı</LayerLabel>
            <div className="flex flex-col items-stretch gap-0">
              {steps.map((s, i) => (
                <div key={s.title}>
                  <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true, margin: "-30px" }}
                    transition={{ duration: 0.4, delay: i * 0.06 }}
                  >
                    <DiagramNode icon={s.icon} name={s.title} sub={s.sub} accent={s.accent} />
                  </motion.div>
                  {s.arrow && (
                    <div className="flex items-center gap-3 pl-4 py-2.5">
                      <ArrowUpDown className="size-3.5 text-zinc-500" />
                      <span className="text-[11px] tracking-wide text-zinc-400">
                        {s.arrow}
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Çift yönlü akış açıklaması */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.3 }}
              className="mt-6 rounded-xl border border-amber-500/20 bg-gradient-to-br from-amber-500/10 to-amber-500/5 p-4"
            >
              <div className="flex items-start gap-3">
                <ArrowUpDown className="size-4 mt-0.5 text-amber-300 shrink-0" />
                <div>
                  <div className="text-[13px] font-semibold text-white">Veriler sürekli iki yönde geçer</div>
                  <div className="mt-1 text-[12px] text-zinc-400 leading-relaxed">
                    Müşterinin gördüğü her sayfa, tıkladığı her buton, doldurduğu her
                    form aynı köprüden geri döner. Bu yüzden Pusula sunucusu sürekli
                    açık olmalı — köprü kapanırsa müşteriler Bridge'e ulaşamaz.
                  </div>
                </div>
              </div>
            </motion.div>
          </div>

          {/* SAĞ — Özellik kartları */}
          <div className="md:col-span-2 grid gap-3 content-start">
            <LayerLabel>Özellikler</LayerLabel>
            {features.map((f, i) => {
              const FIcon = f.icon
              return (
                <motion.div
                  key={f.title}
                  initial={{ opacity: 0, x: 20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true, margin: "-30px" }}
                  transition={{ duration: 0.4, delay: i * 0.05 }}
                  className="rounded-xl border border-indigo-500/20 bg-gradient-to-br from-indigo-500/10 to-indigo-500/5 p-4 backdrop-blur"
                >
                  <div className="flex items-start gap-3">
                    <FIcon className="size-4 mt-0.5 text-indigo-300 shrink-0" />
                    <div className="min-w-0">
                      <div className="text-[13px] font-semibold text-white">{f.title}</div>
                      <div className="mt-0.5 text-[11px] text-zinc-400 leading-relaxed">{f.desc}</div>
                    </div>
                  </div>
                </motion.div>
              )
            })}
          </div>
        </div>
      </div>
    </section>
  )
}

/* ──────────────────────────────────────────────────────────────────────
 * Güvenlik Bölümü
 * ──────────────────────────────────────────────────────────────────────
 * 6 katmanlı kart grid'i: Sunucu Erişimi (VPN + IP whitelist + API key),
 * Kimlik Doğrulama (JWT/2FA/cihaz kilidi), Veri Şifreleme (AES-256-GCM),
 * SQL İzolasyonu (DENY VIEW + DB owner), Tünel Güvenliği (token auth),
 * İzleme & Alarm (Kuma + Telegram). Her kart belirgin bir accent renkle
 * çerçevelenir ve maddeli liste içerir.
 * ────────────────────────────────────────────────────────────────────── */
function SecuritySection() {
  const layers = [
    {
      icon: Lock,
      accent: "#22d3ee",
      title: "Sunucu Erişimi",
      desc: "API ve FTP sunucularına internet üzerinden doğrudan erişim YOK.",
      points: [
        "VPN zorunlu (FortiClient) — şirket ağına girmeden hiçbir backend'e ulaşılmaz",
        "IP whitelist — sadece 10.15.2.x LAN aralığı kabul edilir",
        "Pusula API: her uygulamanın kendi X-API-Key header'ı",
        "Cloud FTP: SSH key + şifre, sadece LAN'da port 22 açık",
      ],
    },
    {
      icon: KeyRound,
      accent: "#1d64ff",
      title: "Kimlik Doğrulama",
      desc: "Her giriş çift adımlı, oturum şifreli.",
      points: [
        "JWT tabanlı oturum — Switch tek girişle tüm uygulamaları açar (SSO)",
        "TOTP 2FA — kimlik doğrulama uygulaması ile ikinci adım",
        "Cihaz kilidi — SpareBackup/Bridge API key ilk PC'ye bağlanır, başka cihaz reddedilir",
        "Rate limit — şifre denemeleri IP bazlı sınırlı, brute-force engelli",
      ],
    },
    {
      icon: ShieldCheck,
      accent: "#a78bfa",
      title: "Veri Şifreleme",
      desc: "Hassas her şey diskte şifreli durur.",
      points: [
        "Vault şifreleri AES-256-GCM ile şifreli — anahtar olmadan çözülemez",
        "Agent kimlik bilgileri (sunucu şifreleri) DB'de şifreli",
        "ENCRYPTION_KEY makineye özel — başka sunucuda DB çözülemez",
        "Şifre geçmişi tutulur — sızıntıda eski şifreler revoke edilebilir",
      ],
    },
    {
      icon: Database,
      accent: "#fbbf24",
      title: "SQL İzolasyonu",
      desc: "Firmalar birbirinin veritabanını göremez.",
      points: [
        "DENY VIEW ANY DATABASE — kullanıcı sadece kendi DB'lerini görür",
        "Firma başına ayrı SQL login + DB owner ataması",
        "Vault'tan tek tıkla yedek (BACKUP DATABASE WITH COMPRESSION + INIT)",
        "sa şifresi sadece sunucuda — .env.production dosyasında",
      ],
    },
    {
      icon: Network,
      accent: "#818cf8",
      title: "Tünel Güvenliği (Bridge)",
      desc: "Her firma kendi şifreli kapısından geçer.",
      points: [
        "Token tabanlı kimlik — her tenant'ın kendi anahtarı",
        "TLS sertifikası Pusula sunucusunda — WAN'dan HTTPS, içeride güvenli kanal",
        "Tenant izolasyonu — subdomain bazlı, başka firma'nın domain'ine sızılamaz",
        "frps Pusula API sunucusunda — tüm trafik audit'e tabi",
      ],
    },
    {
      icon: Radar,
      accent: "#f472b6",
      title: "İzleme & Alarm",
      desc: "Bir şey ters giderse saniyeler içinde haber gelir.",
      points: [
        "Uptime Kuma — 12+ sunucu/servis 24/7 izleniyor",
        "DOWN tespitinde Telegram bildirimi (bot + chat)",
        "TV ekranında DOWN alarmı + sesli uyarı (4K kiosk)",
        "Audit log — kim/ne/nereden çağırdı, tüm kritik işlemler kayıt altında",
      ],
    },
  ]

  return (
    <section className="relative px-6 py-24">
      <div className="mx-auto w-full max-w-6xl">
        <SectionTitle kicker="Güvenlik" title="Sistemin her katmanı korumalı" />
        <p className="mx-auto mt-4 max-w-2xl text-center text-base text-zinc-400">
          API ve FTP sunucusu internete açık değil. VPN, IP whitelist, API key,
          2FA, AES-256-GCM şifreleme ve audit log ile her aksiyon korunur ve izlenir.
        </p>

        <div className="mt-12 grid gap-5 md:grid-cols-2">
          {layers.map((l, i) => {
            const LIcon = l.icon
            return (
              <motion.div
                key={l.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-50px" }}
                transition={{ duration: 0.5, delay: i * 0.06 }}
                className="relative overflow-hidden rounded-2xl border p-6 backdrop-blur"
                style={{
                  borderColor:     `${l.accent}40`,
                  backgroundImage: `linear-gradient(135deg, ${l.accent}15, ${l.accent}03)`,
                  boxShadow:       `0 0 60px -20px ${l.accent}66`,
                }}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="flex h-10 w-10 items-center justify-center rounded-xl border"
                    style={{
                      borderColor:     `${l.accent}50`,
                      backgroundColor: `${l.accent}1a`,
                    }}
                  >
                    <LIcon className="h-5 w-5" style={{ color: l.accent }} />
                  </div>
                  <div>
                    <div className="text-[15px] font-bold text-white">{l.title}</div>
                    <div className="text-[12px] text-zinc-400">{l.desc}</div>
                  </div>
                </div>

                <ul className="mt-4 space-y-2">
                  {l.points.map((p) => (
                    <li key={p} className="flex items-start gap-2.5 text-[12px] text-zinc-300 leading-relaxed">
                      <ShieldCheck className="mt-0.5 size-3.5 shrink-0" style={{ color: l.accent }} />
                      <span>{p}</span>
                    </li>
                  ))}
                </ul>
              </motion.div>
            )
          })}
        </div>

        {/* Alt bilgi şeridi — kısa özet */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="mt-8 grid gap-3 md:grid-cols-3"
        >
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-4 text-center">
            <div className="text-2xl font-bold text-emerald-300 tabular-nums">3</div>
            <div className="mt-1 text-[11px] text-zinc-400">Katman: VPN · IP · API Key</div>
          </div>
          <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 px-4 py-4 text-center">
            <div className="text-2xl font-bold text-blue-300 tabular-nums">AES-256</div>
            <div className="mt-1 text-[11px] text-zinc-400">Vault + Agent şifreleri</div>
          </div>
          <div className="rounded-xl border border-pink-500/20 bg-pink-500/5 px-4 py-4 text-center">
            <div className="text-2xl font-bold text-pink-300 tabular-nums">24/7</div>
            <div className="mt-1 text-[11px] text-zinc-400">İzleme + Telegram alarm</div>
          </div>
        </motion.div>
      </div>
    </section>
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
