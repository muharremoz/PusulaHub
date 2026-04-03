"use client"

import { useEffect, useRef } from "react"

export function Confetti({ trigger }: { trigger: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (!trigger || !canvasRef.current) return
    const canvas = canvasRef.current
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    canvas.width = window.innerWidth
    canvas.height = window.innerHeight

    const particles = Array.from({ length: 120 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height - canvas.height,
      size: Math.random() * 8 + 4,
      color: ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4"][Math.floor(Math.random() * 6)],
      vx: (Math.random() - 0.5) * 4,
      vy: Math.random() * 3 + 2,
      opacity: 1,
      rotation: Math.random() * 360,
      rotationSpeed: (Math.random() - 0.5) * 10,
    }))

    let frame: number
    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      let alive = false
      particles.forEach((p) => {
        p.x += p.vx
        p.y += p.vy
        p.vy += 0.08
        p.rotation += p.rotationSpeed
        p.opacity -= 0.008
        if (p.opacity > 0) {
          alive = true
          ctx.save()
          ctx.globalAlpha = Math.max(0, p.opacity)
          ctx.fillStyle = p.color
          ctx.translate(p.x, p.y)
          ctx.rotate((p.rotation * Math.PI) / 180)
          ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.5)
          ctx.restore()
        }
      })
      if (alive) frame = requestAnimationFrame(animate)
      else ctx.clearRect(0, 0, canvas.width, canvas.height)
    }
    animate()
    return () => cancelAnimationFrame(frame)
  }, [trigger])

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 z-50"
      style={{ display: trigger ? "block" : "none" }}
    />
  )
}
