"use client"

import React from "react"
import { cn } from "@/lib/utils"

interface ShimmerButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  shimmerColor?: string
  shimmerSize?: string
  borderRadius?: string
  shimmerDuration?: string
  background?: string
  children: React.ReactNode
}

export function ShimmerButton({
  shimmerColor = "#ffffff",
  shimmerSize = "0.05em",
  shimmerDuration = "1.8s",
  borderRadius = "8px",
  background = "hsl(var(--primary))",
  className,
  children,
  ...props
}: ShimmerButtonProps) {
  return (
    <button
      style={
        {
          "--shimmer-color": shimmerColor,
          "--shimmer-size": shimmerSize,
          "--shimmer-duration": shimmerDuration,
          "--border-radius": borderRadius,
          "--background": background,
        } as React.CSSProperties
      }
      className={cn(
        "group relative cursor-pointer overflow-hidden whitespace-nowrap",
        "px-5 py-2 text-sm font-medium text-white",
        "transition-all duration-300 ease-in-out",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "[background:var(--background)]",
        "[border-radius:var(--border-radius)]",
        className
      )}
      {...props}
    >
      <span
        className="absolute inset-0 overflow-hidden rounded-[inherit]"
        style={{ borderRadius: "inherit" }}
      >
        <span
          className="absolute inset-[-100%] animate-[shimmer_var(--shimmer-duration)_linear_infinite]"
          style={{
            background: `conic-gradient(from 90deg at 50% 50%, transparent 0%, var(--shimmer-color) 50%, transparent 100%)`,
            opacity: 0.15,
          }}
        />
      </span>
      <span className="relative z-10 flex items-center gap-2">{children}</span>
      <style>{`
        @keyframes shimmer {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </button>
  )
}
