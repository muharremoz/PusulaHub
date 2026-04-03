import { cn } from "@/lib/utils"

interface BorderBeamProps {
  className?: string
  size?: number
  duration?: number
  colorFrom?: string
  colorTo?: string
}

export function BorderBeam({
  className,
  size = 200,
  duration = 12,
  colorFrom = "hsl(var(--primary))",
  colorTo = "transparent",
}: BorderBeamProps) {
  return (
    <div
      className={cn("pointer-events-none absolute inset-0 rounded-[inherit]", className)}
      style={
        {
          "--size": `${size}px`,
          "--duration": `${duration}s`,
          "--color-from": colorFrom,
          "--color-to": colorTo,
        } as React.CSSProperties
      }
    >
      <div
        className="absolute inset-[-1px] rounded-[inherit]"
        style={{
          background: `conic-gradient(from calc(var(--angle, 0) * 1turn), var(--color-to), var(--color-from) 5%, var(--color-to) 15%)`,
          WebkitMask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
          WebkitMaskComposite: "xor",
          maskComposite: "exclude",
          padding: "1.5px",
          animation: `border-beam-rotate var(--duration) linear infinite`,
        }}
      />
      <style>{`
        @property --angle {
          syntax: "<number>";
          inherits: false;
          initial-value: 0;
        }
        @keyframes border-beam-rotate {
          to { --angle: 1; }
        }
      `}</style>
    </div>
  )
}
