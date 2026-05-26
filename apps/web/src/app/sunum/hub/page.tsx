"use client"

/**
 * /sunum/hub — PusulaHub özel sunum sayfası.
 *
 * Window-scrolled (snap kullanılmıyor, doğal kaydırma + smooth scroll).
 * Her büyük özellik kendi viewport'unda — motion.div `whileInView` ile içerik
 * görünüme girer girmez fade + slide. Hero sticky parallax, kapanış için
 * büyük rakam ticker.
 *
 * Renk paleti: emerald (#34d399) — Hub'ın brand tonu.
 * Layout (sunum/layout.tsx) zaten karanlık tema + scroll-smooth sağlıyor.
 */

import Link from "next/link"
import { motion, useScroll, useTransform, AnimatePresence } from "motion/react"
import { useRef, useState } from "react"
import { NumberTicker } from "@/components/magicui/number-ticker"
import { BorderBeam } from "@/components/magicui/border-beam"
import { Meteors } from "@/components/ui/meteors"
import {
  ArrowLeft,
  ArrowDown,
  Bell,
  Building2,
  Command,
  DatabaseBackup,
  KeyRound,
  LayoutDashboard,
  MessageSquare,
  Radar,
  Server,
  Sparkles,
  Wrench,
} from "lucide-react"

const ACCENT = "#34d399"

/* ── Veriler ─────────────────────────────────────────────────────── */

const HERO_STATS = [
  { num: 50,  suffix: "+", label: "Sayfa / Modül" },
  { num: 100, suffix: "+", label: "API Endpoint" },
  { num: 12,  suffix: "",  label: "İzlenen Servis" },
  { num: 1,   suffix: "",  label: "Tek Kontrol Merkezi" },
] as const

interface FeatureStory {
  icon:     React.ElementType
  title:    string
  kicker:   string
  body:     string
  bullets:  string[]
}

const STORIES: FeatureStory[] = [
  {
    icon:    Server,
    title:   "Sunucu Yönetimi",
    kicker:  "01 · Altyapı",
    body:    "Windows ve Active Directory sunucularının tek panelden yönetimi. CPU, RAM, disk kullanımı, servis durumu ve çalışan kullanıcılar canlı izlenir.",
    bullets: [
      "Canlı kaynak grafikleri (CPU / RAM / Disk)",
      "Servis ve IIS site kontrolü",
      "RDP, SQL ve dosya erişim yönetimi",
      "Tek tıkla yeniden başlatma ve komut çalıştırma",
    ],
  },
  {
    icon:    Wrench,
    title:   "Windows Agent",
    kicker:  "02 · Uzaktan Komut",
    body:    "Sunucularda çalışan kendi C# servisi. PowerShell, AD, IIS, SQL ve yedek işlemleri agent üzerinden güvenle yürütülür — RDP açmaya gerek kalmaz.",
    bullets: [
      "Boot'ta otomatik başlayan Windows Service",
      "AD kullanıcı/grup yönetimi",
      "WTS session injection ile kullanıcıya popup",
      "Self-update — Hub'dan tek tık güncelleme",
    ],
  },
  {
    icon:    Building2,
    title:   "Firma Kurulum Sihirbazı",
    kicker:  "03 · Sıfırdan Müşteri",
    body:    "Yeni bir firma için sunucu seçimi, AD kullanıcısı oluşturma, veritabanı restore, SQL login + DENY VIEW + DB owner ataması — hepsi adım adım canlı log'la.",
    bullets: [
      "AD OU + kullanıcı + grup üyelikleri",
      "Veritabanı restore + sahiplik devri",
      "IIS hizmet kurulumu ve Users.xml senkronu",
      "Adım adım canlı checklist — geri alınabilir",
    ],
  },
  {
    icon:    Radar,
    title:   "Uptime Kuma + TV Ekranı",
    kicker:  "04 · 7/24 İzleme",
    body:    "12 servis / sunucu kesintisiz izleniyor. DOWN olduğu an Telegram bildirimi gidiyor, 55″ 4K TV ekranında kırmızı flash + sesli uyarı tetikleniyor.",
    bullets: [
      "11 monitor — ping, HTTP, keyword",
      "DOWN tespitinde sesli alarm + Telegram",
      "Heartbeat geçmişi — son 100 beat hover detayı",
      "Kiosk modu — 4K TV için tam ekran",
    ],
  },
  {
    icon:    MessageSquare,
    title:   "Kullanıcı Mesajlaşma",
    kicker:  "05 · Sunucudaki Kullanıcıya Anında",
    body:    "Sunucuda oturum açmış bir kullanıcıya doğrudan popup gönderilebilir. WTS session injection ile mesaj kullanıcının ekranında belirir, okunduğunda Hub'a geri bildirim gelir.",
    bullets: [
      "WTS session injection — sistem servisi → kullanıcı",
      "Okundu / kapatıldı takibi",
      "Şablonlar ve toplu gönderim",
      "Sesli bildirim seçeneği",
    ],
  },
  {
    icon:    DatabaseBackup,
    title:   "SQL Yedek & Restore",
    kicker:  "06 · Veri Güvenliği",
    body:    "Firma başına yedek dosyaları listeleniyor, tek tıkla istenen bir yedek geri yükleniyor. Sihirbaz akışı içinde otomatik backup + import dahil.",
    bullets: [
      "BACKUP DATABASE — COMPRESSION + INIT",
      "Sıralı restore + login + DB owner ataması",
      "Vault entry'sinden doğrudan yedek alma",
      "Yedek dizini tarama ve filtreleme",
    ],
  },
  {
    icon:    KeyRound,
    title:   "Vault — Kasa",
    kicker:  "07 · Güvenli Kimlik Bilgileri",
    body:    "Sunucu, veritabanı, panel ve uygulama şifreleri AES-256-GCM ile şifrelenmiş şekilde saklanıyor. Şifre güç ölçer, geçmiş, erişim log'u ve favori yıldızlama dahil.",
    bullets: [
      "AES-256-GCM şifrelenmiş şifre saklama",
      "Şifre yaşı uyarısı (90 gün)",
      "Şifre geçmişi + erişim audit log'u",
      "Veritabanı kategorisinde \"Yedek al\" aksiyonu",
    ],
  },
  {
    icon:    Command,
    title:   "Komut Paleti & Hızlı Erişim",
    kicker:  "08 · Bir Tuşla Her Yere",
    body:    "Ctrl+K ile arama — sayfalar, sunucular, firmalar tek listede. İş akışını klavyeye taşıyarak fare ile sayfa avlamayı bitiriyor.",
    bullets: [
      "Sayfa / sunucu / firma birleşik arama",
      "Klavye odaklı hızlı geçiş",
      "Son ziyaret + favori önerileri",
      "Mobil uyumlu arama drawer",
    ],
  },
]

/* ── Yardımcılar ──────────────────────────────────────────────────── */

function FadeUp({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ duration: 0.7, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  )
}

/* ── Hero ────────────────────────────────────────────────────────── */

function Hero() {
  const ref = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] })
  const titleY    = useTransform(scrollYProgress, [0, 1], ["0%", "-30%"])
  const titleOp   = useTransform(scrollYProgress, [0, 0.8], [1, 0])
  const bgOpacity = useTransform(scrollYProgress, [0, 1], [0.6, 0])

  return (
    <section ref={ref} className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden">
      {/* Arka plan — meteors + gradient */}
      <motion.div className="absolute inset-0 pointer-events-none" style={{ opacity: bgOpacity }}>
        <div
          className="absolute inset-0"
          style={{ background: `radial-gradient(circle at 50% 30%, ${ACCENT}22 0%, transparent 55%)` }}
        />
        <Meteors number={20} />
      </motion.div>

      <motion.div style={{ y: titleY, opacity: titleOp }} className="relative z-10 text-center px-6">
        <FadeUp>
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 text-[11px] font-medium mb-6">
            <LayoutDashboard className="size-3.5" />
            Sunucu Yönetim Paneli
          </div>
        </FadeUp>

        <FadeUp delay={0.1}>
          <h1 className="text-6xl md:text-8xl font-black tracking-tight leading-[0.95]">
            <span className="sunum-hero-gradient">Pusula</span>
            <span className="text-white">Hub</span>
          </h1>
        </FadeUp>

        <FadeUp delay={0.2}>
          <p className="mt-6 max-w-2xl mx-auto text-base md:text-xl text-zinc-400 leading-relaxed">
            Sunucular, firmalar, kullanıcılar ve izleme sistemini
            <span className="text-white font-medium"> tek panelden </span>
            yöneten altyapı kontrol merkezi.
          </p>
        </FadeUp>

        <FadeUp delay={0.4}>
          <div className="mt-12 flex items-center justify-center gap-2 text-zinc-500 text-[12px]">
            <motion.div animate={{ y: [0, 6, 0] }} transition={{ duration: 1.8, repeat: Infinity }}>
              <ArrowDown className="size-4" />
            </motion.div>
            <span>Kaydır</span>
          </div>
        </FadeUp>
      </motion.div>

      {/* Geri dön */}
      <Link
        href="/sunum"
        className="absolute top-6 left-6 z-20 flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-white/10 bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white text-[11px] transition-colors backdrop-blur"
      >
        <ArrowLeft className="size-3.5" /> Sunum
      </Link>
    </section>
  )
}

/* ── Stats ───────────────────────────────────────────────────────── */

function Stats() {
  return (
    <section className="relative min-h-screen flex items-center justify-center px-6 py-24">
      <div className="max-w-6xl mx-auto w-full">
        <FadeUp>
          <p className="text-emerald-400 text-[11px] font-semibold uppercase tracking-[0.2em] mb-3">Rakamlarla</p>
          <h2 className="text-4xl md:text-6xl font-bold mb-16 leading-tight">
            Tek noktadan <span className="text-emerald-400">bütün altyapı</span>.
          </h2>
        </FadeUp>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {HERO_STATS.map((s, i) => (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.5 }}
              transition={{ duration: 0.6, delay: i * 0.1 }}
              className="relative p-6 md:p-8 rounded-2xl border border-white/10 bg-zinc-900/40 backdrop-blur overflow-hidden"
            >
              <div className="text-5xl md:text-7xl font-black text-white tabular-nums leading-none">
                <NumberTicker value={s.num} className="text-white" />
                <span className="text-emerald-400">{s.suffix}</span>
              </div>
              <p className="mt-4 text-[12px] md:text-[13px] text-zinc-400 uppercase tracking-wider">{s.label}</p>
              <BorderBeam size={120} duration={10 + i * 2} colorFrom={ACCENT} colorTo="#22d3ee" />
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ── Scrollytelling — sol sticky panel, sağ scroll'lu liste ─────────
 *
 * Apple/Stripe tarzı: kullanıcı scroll yaparken sağdaki kısa metin/özellik
 * blokları geçerken, sol taraftaki büyük ikon + başlık o özelliğe göre
 * değişir. Sticky panel viewport içinde sabit kalır, sağdaki içerikler
 * sırayla yukarı kayar.
 *
 * Aktif item, her sağ bloğun `onViewportEnter` callback'i ile tetiklenir —
 * `viewport.amount: 0.6` sayesinde blok yarısından fazlası göründüğünde
 * aktif olur; iki blok arasındaki geçişler ortalanır.
 */

interface ScrollyItem {
  icon:  React.ElementType
  title: string
  desc:  string
  tone:  string  // "from-{color}/30 ..." hazır class — accent ring/glow için
}

const SCROLLY: ScrollyItem[] = [
  { icon: LayoutDashboard, title: "Dashboard",     desc: "Tüm sistemin sağlık özeti — sunucu, izleme ve firma KPI'ları tek ekranda.",                tone: "emerald" },
  { icon: Server,          title: "Sunucular",     desc: "Windows ve AD sunucularını liste, durum, disk ve servis detayıyla yönet.",                 tone: "sky" },
  { icon: Radar,           title: "İzleme",        desc: "Uptime Kuma'dan canlı veri — DOWN tespitinde anlık Telegram bildirimi.",                   tone: "amber" },
  { icon: Building2,       title: "Firmalar",      desc: "Kurulum sihirbazı, kullanıcı yönetimi, IIS hizmetleri ve veritabanları.",                  tone: "violet" },
  { icon: MessageSquare,   title: "Mesajlar",      desc: "Sunucudaki kullanıcılara doğrudan popup — okundu takibi ile.",                             tone: "rose" },
  { icon: DatabaseBackup,  title: "SQL & Yedek",   desc: "Firma başına yedek listeleme, tek tıkla restore, vault üzerinden direct backup.",          tone: "teal" },
  { icon: KeyRound,        title: "Vault",         desc: "AES-256-GCM şifreli kasa — şifre yaşı, geçmiş ve erişim audit log'u dahil.",               tone: "cyan" },
  { icon: Command,         title: "Komut Paleti",  desc: "Ctrl+K ile birleşik arama — sayfa, sunucu, firma tek listede.",                            tone: "fuchsia" },
]

const TONE_CLASS: Record<string, { bg: string; ring: string; text: string }> = {
  emerald:  { bg: "from-emerald-500/30 to-emerald-500/5",   ring: "border-emerald-500/30",  text: "text-emerald-300"  },
  sky:      { bg: "from-sky-500/30     to-sky-500/5",       ring: "border-sky-500/30",      text: "text-sky-300"      },
  amber:    { bg: "from-amber-500/30   to-amber-500/5",     ring: "border-amber-500/30",    text: "text-amber-300"    },
  violet:   { bg: "from-violet-500/30  to-violet-500/5",    ring: "border-violet-500/30",   text: "text-violet-300"   },
  rose:     { bg: "from-rose-500/30    to-rose-500/5",      ring: "border-rose-500/30",     text: "text-rose-300"     },
  teal:     { bg: "from-teal-500/30    to-teal-500/5",      ring: "border-teal-500/30",     text: "text-teal-300"     },
  cyan:     { bg: "from-cyan-500/30    to-cyan-500/5",      ring: "border-cyan-500/30",     text: "text-cyan-300"     },
  fuchsia:  { bg: "from-fuchsia-500/30 to-fuchsia-500/5",   ring: "border-fuchsia-500/30",  text: "text-fuchsia-300"  },
}

function Scrollytelling() {
  const [active, setActive] = useState(0)
  const current = SCROLLY[active]
  const CurrentIcon = current.icon
  const t = TONE_CLASS[current.tone]

  return (
    <section className="relative px-6 py-24">
      <div className="max-w-6xl mx-auto">
        <FadeUp>
          <p className="text-emerald-400 text-[11px] font-semibold uppercase tracking-[0.2em] mb-3">Bir bakışta</p>
          <h2 className="text-4xl md:text-5xl font-bold mb-16">
            Scroll'la <span className="text-emerald-400">modülleri gez</span>.
          </h2>
        </FadeUp>

        <div className="grid md:grid-cols-2 gap-10 md:gap-16">
          {/* Sol — sticky görsel/başlık paneli */}
          <div className="hidden md:block">
            <div className="sticky top-1/4">
              <AnimatePresence mode="wait">
                <motion.div
                  key={current.title}
                  initial={{ opacity: 0, y: 20, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -20, scale: 0.96 }}
                  transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                  className={`relative aspect-square rounded-3xl border ${t.ring} bg-gradient-to-br ${t.bg} flex flex-col items-center justify-center gap-6 overflow-hidden`}
                >
                  <CurrentIcon className={`size-32 ${t.text}`} strokeWidth={1.2} />
                  <div className="text-center">
                    <p className="text-[10px] font-mono text-zinc-500 mb-1">
                      {String(active + 1).padStart(2, "0")} / {SCROLLY.length}
                    </p>
                    <h3 className="text-3xl font-bold text-white">{current.title}</h3>
                  </div>

                  {/* nokta göstergesi */}
                  <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-1.5">
                    {SCROLLY.map((_, i) => (
                      <span
                        key={i}
                        className={`h-1.5 rounded-full transition-all duration-300 ${
                          i === active ? "w-6 bg-white" : "w-1.5 bg-white/30"
                        }`}
                      />
                    ))}
                  </div>
                </motion.div>
              </AnimatePresence>
            </div>
          </div>

          {/* Sağ — scroll'lu içerik */}
          <div className="space-y-24 md:space-y-32">
            {SCROLLY.map((item, i) => {
              const Icon = item.icon
              return (
                <motion.div
                  key={item.title}
                  // amount: 0.6 → blok yarısından fazlası viewport'taysa aktif olur
                  onViewportEnter={() => setActive(i)}
                  viewport={{ amount: 0.6 }}
                  initial={{ opacity: 0, x: 30 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                  className="md:min-h-[40vh] flex flex-col justify-center"
                >
                  {/* Mobilde sol panel olmadığı için ikon burada inline gösterilir */}
                  <Icon className={`md:hidden size-10 mb-4 ${TONE_CLASS[item.tone].text}`} strokeWidth={1.4} />
                  <p className={`text-[11px] font-semibold uppercase tracking-[0.2em] mb-3 ${TONE_CLASS[item.tone].text}`}>
                    {String(i + 1).padStart(2, "0")} · Modül
                  </p>
                  <h3 className="text-3xl md:text-4xl font-bold mb-4">{item.title}</h3>
                  <p className="text-zinc-400 text-[15px] md:text-base leading-relaxed">{item.desc}</p>
                </motion.div>
              )
            })}
          </div>
        </div>
      </div>
    </section>
  )
}

/* ── Tek özellik bölümü ──────────────────────────────────────────── */

function Story({ s, index }: { s: FeatureStory; index: number }) {
  const Icon = s.icon
  const flip = index % 2 === 1   // tek index'lerde sağ/sol ters
  return (
    <section className="relative min-h-screen flex items-center px-6 py-24 overflow-hidden">
      <div className="max-w-6xl mx-auto w-full grid md:grid-cols-2 gap-12 items-center">
        {/* Metin */}
        <div className={flip ? "md:order-2" : ""}>
          <FadeUp>
            <p className="text-emerald-400 text-[11px] font-semibold uppercase tracking-[0.2em] mb-3">{s.kicker}</p>
            <h2 className="text-4xl md:text-5xl font-bold leading-tight mb-5">{s.title}</h2>
            <p className="text-zinc-400 text-[15px] md:text-base leading-relaxed mb-7">{s.body}</p>
          </FadeUp>

          <ul className="space-y-2.5">
            {s.bullets.map((b, i) => (
              <motion.li
                key={b}
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, amount: 0.5 }}
                transition={{ duration: 0.5, delay: 0.15 + i * 0.08 }}
                className="flex items-start gap-3 text-zinc-300 text-[13px] md:text-[14px]"
              >
                <span className="mt-1.5 size-1.5 rounded-full bg-emerald-400 shrink-0" />
                <span>{b}</span>
              </motion.li>
            ))}
          </ul>
        </div>

        {/* Görsel — büyük ikon kartı */}
        <div className={flip ? "md:order-1" : ""}>
          <motion.div
            initial={{ opacity: 0, scale: 0.92, rotate: flip ? -2 : 2 }}
            whileInView={{ opacity: 1, scale: 1, rotate: 0 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
            className="relative aspect-[4/3] rounded-3xl overflow-hidden border border-white/10 bg-gradient-to-br from-emerald-500/10 via-zinc-900/40 to-cyan-500/10 flex items-center justify-center"
          >
            <div className="absolute inset-0" style={{ background: `radial-gradient(circle at 50% 50%, ${ACCENT}25, transparent 60%)` }} />
            <Icon className="size-32 md:size-44 text-emerald-300/90 relative z-10" strokeWidth={1.2} />
            <BorderBeam size={200} duration={12} colorFrom={ACCENT} colorTo="#22d3ee" />

            {/* Köşedeki indeks */}
            <div className="absolute top-4 left-4 text-[10px] font-mono text-zinc-500">
              {String(index + 1).padStart(2, "0")} / {STORIES.length}
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}

/* ── Mimari ──────────────────────────────────────────────────────── */

function Architecture() {
  const nodes = [
    { icon: LayoutDashboard, label: "Hub",      tone: "emerald" },
    { icon: Wrench,          label: "Agent",    tone: "sky" },
    { icon: Radar,           label: "Kuma",     tone: "amber" },
    { icon: Bell,            label: "Telegram", tone: "violet" },
  ]
  const toneClass: Record<string, string> = {
    emerald: "from-emerald-500/30 to-emerald-500/0 text-emerald-300 border-emerald-500/30",
    sky:     "from-sky-500/30     to-sky-500/0     text-sky-300     border-sky-500/30",
    amber:   "from-amber-500/30   to-amber-500/0   text-amber-300   border-amber-500/30",
    violet:  "from-violet-500/30  to-violet-500/0  text-violet-300  border-violet-500/30",
  }
  return (
    <section className="relative min-h-screen flex items-center px-6 py-24 overflow-hidden">
      <div className="max-w-6xl mx-auto w-full">
        <FadeUp>
          <p className="text-emerald-400 text-[11px] font-semibold uppercase tracking-[0.2em] mb-3">Mimari</p>
          <h2 className="text-4xl md:text-5xl font-bold mb-14">Bileşenler nasıl konuşuyor?</h2>
        </FadeUp>

        <div className="relative grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
          {nodes.map((n, i) => {
            const Icon = n.icon
            return (
              <motion.div
                key={n.label}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: i * 0.1 }}
                className={`relative aspect-square rounded-2xl border bg-gradient-to-br ${toneClass[n.tone]} flex flex-col items-center justify-center gap-3`}
              >
                <Icon className="size-12 md:size-16" strokeWidth={1.3} />
                <span className="text-[14px] md:text-[16px] font-semibold">{n.label}</span>
              </motion.div>
            )
          })}
        </div>

        <FadeUp delay={0.4}>
          <div className="mt-10 grid md:grid-cols-3 gap-3 text-[12px] text-zinc-400">
            <div className="px-4 py-3 rounded-lg border border-white/5 bg-white/5">
              <span className="text-white font-medium">Hub ↔ Agent</span> · TCP/HTTPS, polling + komut sırası
            </div>
            <div className="px-4 py-3 rounded-lg border border-white/5 bg-white/5">
              <span className="text-white font-medium">Hub ↔ Kuma</span> · Prometheus metrics + SQLite okuma
            </div>
            <div className="px-4 py-3 rounded-lg border border-white/5 bg-white/5">
              <span className="text-white font-medium">Kuma → Telegram</span> · DOWN/UP anlık bildirim
            </div>
          </div>
        </FadeUp>
      </div>
    </section>
  )
}

/* ── Tech stack ──────────────────────────────────────────────────── */

function TechStack() {
  const techs = [
    "Next.js 15", "React 19", "TypeScript", "Tailwind v4", "shadcn/ui",
    "SQL Server", "Node.js", "C# / .NET", "PowerShell", "Docker",
    "Uptime Kuma", "Radix UI", "Recharts", "Motion", "PM2",
  ]
  return (
    <section className="relative min-h-screen flex items-center px-6 py-24">
      <div className="max-w-6xl mx-auto w-full text-center">
        <FadeUp>
          <p className="text-emerald-400 text-[11px] font-semibold uppercase tracking-[0.2em] mb-3">Teknoloji</p>
          <h2 className="text-4xl md:text-5xl font-bold mb-14">Modern stack üzerine kurulu.</h2>
        </FadeUp>

        <div className="flex flex-wrap justify-center gap-3">
          {techs.map((t, i) => (
            <motion.span
              key={t}
              initial={{ opacity: 0, scale: 0.85 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.04 }}
              className="px-4 py-2 rounded-full border border-emerald-500/20 bg-emerald-500/5 text-emerald-200 text-[13px] font-medium hover:bg-emerald-500/10 transition-colors"
            >
              {t}
            </motion.span>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ── Closing ─────────────────────────────────────────────────────── */

function Closing() {
  return (
    <section className="relative min-h-screen flex items-center justify-center px-6 py-24 overflow-hidden">
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: `radial-gradient(circle at 50% 50%, ${ACCENT}18, transparent 60%)` }}
      />

      <div className="relative z-10 text-center max-w-3xl mx-auto">
        <FadeUp>
          <Sparkles className="size-12 text-emerald-400 mx-auto mb-6" strokeWidth={1.5} />
        </FadeUp>
        <FadeUp delay={0.1}>
          <h2 className="text-5xl md:text-7xl font-black leading-tight mb-6">
            Altyapı artık <span className="sunum-hero-gradient">tek panelde</span>.
          </h2>
        </FadeUp>
        <FadeUp delay={0.2}>
          <p className="text-zinc-400 text-base md:text-lg leading-relaxed">
            PusulaHub her gün büyüyen modüler bir kontrol merkezi.
            Yeni özellikler, yeni izleme akışları ve yeni otomasyonlar
            kullanıma sunulduğunda buradan erişebileceksiniz.
          </p>
        </FadeUp>
        <FadeUp delay={0.4}>
          <Link
            href="/sunum"
            className="mt-10 inline-flex items-center gap-2 px-6 py-3 rounded-full border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-200 text-sm font-medium transition-colors"
          >
            <ArrowLeft className="size-4" />
            Diğer uygulamalara dön
          </Link>
        </FadeUp>
      </div>
    </section>
  )
}

/* ── Sayfa ───────────────────────────────────────────────────────── */

export default function SunumHubPage() {
  return (
    <main className="relative">
      {/* İlerleme çizgisi — scroll'a göre soldan sağa dolar */}
      <ScrollProgressBar />

      <Hero />
      <Stats />
      <Scrollytelling />
      {STORIES.map((s, i) => (
        <Story key={s.title} s={s} index={i} />
      ))}
      <Architecture />
      <TechStack />
      <Closing />
    </main>
  )
}

function ScrollProgressBar() {
  const { scrollYProgress } = useScroll()
  return (
    <motion.div
      style={{ scaleX: scrollYProgress, transformOrigin: "0% 50%" }}
      className="fixed top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-emerald-400 via-cyan-300 to-emerald-400 z-50"
    />
  )
}

