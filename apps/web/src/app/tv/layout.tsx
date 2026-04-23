/**
 * /tv — Full-bleed, dark, kiosk tarzı TV izleme sayfası.
 *
 * Ana (main) layout grubunun DIŞINDA. Sidebar/header/padding yok. Root
 * layout'un ThemeProvider'ı `defaultTheme="light"` olduğu için burada
 * tailwind `dark` class'ını wrapper'a elle veriyoruz (ThemeProvider'ı
 * çalıştırmadan forced dark).
 *
 * Font: Geist (next/font/google) — Inter yerine /tv altına özel.
 */
import { Geist, Geist_Mono } from "next/font/google"

const geist = Geist({
  subsets:  ["latin"],
  variable: "--font-geist",
  display:  "swap",
})

const geistMono = Geist_Mono({
  subsets:  ["latin"],
  variable: "--font-geist-mono",
  display:  "swap",
})

export default function TvLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={`${geist.variable} ${geistMono.variable} dark min-h-screen w-full bg-zinc-950 text-zinc-100 antialiased`}
      style={{
        fontFamily: "var(--font-geist), ui-sans-serif, system-ui, sans-serif",
      }}
    >
      {/* /tv altındaki font-mono sınıfı Geist Mono'ya bağlansın */}
      <style>{`
        .font-mono, [class*="font-mono"] {
          font-family: var(--font-geist-mono), ui-monospace, SFMono-Regular, Menlo, monospace !important;
        }
      `}</style>
      {children}
    </div>
  )
}
