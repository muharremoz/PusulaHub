/**
 * /sunum — Patron sunumu için full-bleed sayfa. Ana layout grubunun dışında
 * (sidebar/header yok). Karanlık tema + forced dark class wrapper.
 *
 * Global keyframe burada tanımlı — page.tsx içindeki inline <style> React 19
 * hoisting kurallarıyla çakışmasın diye layout head'ine alındı.
 */
export default function SunumLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="dark min-h-screen w-full bg-zinc-950 text-zinc-100 antialiased">
      <style>{`
        @keyframes sunum-hero-gradient {
          0%, 100% { background-position: 0% 50%; }
          50%      { background-position: 100% 50%; }
        }
        .sunum-hero-gradient {
          background-image: linear-gradient(90deg, #38bdf8, #34d399, #fbbf24, #34d399, #38bdf8);
          background-size: 200% 100%;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          animation: sunum-hero-gradient 6s ease-in-out infinite;
        }
      `}</style>
      {children}
    </div>
  )
}
