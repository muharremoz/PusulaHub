"use client"

import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"

interface BlurFadeProps {
  children: React.ReactNode
  className?: string
  stepKey: string | number
  direction?: "left" | "right"
}

export function BlurFade({ children, className, stepKey, direction = "right" }: BlurFadeProps) {
  const x = direction === "right" ? 20 : -20
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={stepKey}
        initial={{ opacity: 0, x, filter: "blur(4px)" }}
        animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
        exit={{ opacity: 0, x: -x, filter: "blur(4px)" }}
        transition={{ duration: 0.25, ease: "easeInOut" }}
        className={cn("w-full", className)}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  )
}
