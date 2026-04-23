/**
 * /tv — Full-bleed, dark, kiosk tarzı TV izleme sayfası.
 *
 * Ana (main) layout grubunun DIŞINDA. Sidebar/header/padding yok. Root
 * layout'un ThemeProvider'ı `defaultTheme="light"` olduğu için burada
 * tailwind `dark` class'ını wrapper'a elle veriyoruz (ThemeProvider'ı
 * çalıştırmadan forced dark).
 */
export default function TvLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="dark min-h-screen w-full bg-zinc-950 text-zinc-100 antialiased">
      {children}
    </div>
  )
}
