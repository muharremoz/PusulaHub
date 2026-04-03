import { cn } from "@/lib/utils"

interface AnimatedGradientTextProps {
  children: React.ReactNode
  className?: string
}

export function AnimatedGradientText({ children, className }: AnimatedGradientTextProps) {
  return (
    <span
      className={cn(
        "bg-gradient-to-r from-foreground via-foreground/70 to-foreground",
        "bg-clip-text text-transparent",
        "animate-[gradient-shift_4s_ease-in-out_infinite]",
        className
      )}
      style={{
        backgroundImage: "linear-gradient(90deg, hsl(var(--foreground)), hsl(var(--primary)), hsl(var(--foreground)))",
        backgroundSize: "200% 100%",
        animation: "gradient-shift 4s ease-in-out infinite",
        WebkitBackgroundClip: "text",
        WebkitTextFillColor: "transparent",
        backgroundClip: "text",
      }}
    >
      {children}
      <style>{`
        @keyframes gradient-shift {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }
      `}</style>
    </span>
  )
}
