"use client"

import { useRef, useState } from "react"
import { cn } from "@/lib/utils"

interface SpotlightCardProps {
  children: React.ReactNode
  className?: string
  spotlightColor?: string
}

export function SpotlightCard({ children, className, spotlightColor = "rgba(99,102,241,0.08)" }: SpotlightCardProps) {
  const divRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const [isHovered, setIsHovered] = useState(false)

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!divRef.current) return
    const rect = divRef.current.getBoundingClientRect()
    setPos({ x: e.clientX - rect.left, y: e.clientY - rect.top })
  }

  return (
    <div
      ref={divRef}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={cn("relative overflow-hidden", className)}
      style={{
        background: isHovered
          ? `radial-gradient(300px circle at ${pos.x}px ${pos.y}px, ${spotlightColor}, transparent 70%)`
          : undefined,
      }}
    >
      {children}
    </div>
  )
}
