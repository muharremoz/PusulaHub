"use client"

/* ══════════════════════════════════════════════════════════
   NoteViewer — Tiptap HTML çıktısını salt-okunur gösterir.
   Başka yerlerden (takvim sheet'i, preview, vb.) çağrıldığında
   editör ile aynı görsel stilleri uygular ve ek-not (annotation)
   hover'ında aynı tooltip'i gösterir.
══════════════════════════════════════════════════════════ */

import { useState, useEffect } from "react"
import { createPortal } from "react-dom"
import { cn } from "@/lib/utils"

interface NoteViewerProps {
  html:       string
  className?: string
}

export function NoteViewer({ html, className }: NoteViewerProps) {
  const [root, setRoot] = useState<HTMLDivElement | null>(null)

  return (
    <>
      <div
        ref={setRoot}
        className={cn("tiptap-editor note-viewer", className)}
        dangerouslySetInnerHTML={{ __html: html }}
      />
      <ViewerAnnotationTooltip container={root} />
    </>
  )
}

/* Editördeki AnnotationHoverTooltip ile aynı davranış, ayrı bir instance. */
function ViewerAnnotationTooltip({ container }: { container: HTMLElement | null }) {
  const [state, setState] = useState<{ note: string; x: number; y: number } | null>(null)

  useEffect(() => {
    if (!container) return
    const onOver = (e: MouseEvent) => {
      const target = e.target as Element | null
      const el = target?.closest("mark.note-annotation") as HTMLElement | null
      if (!el) return
      const note = el.getAttribute("data-note") ?? ""
      if (!note) return
      const rect = el.getBoundingClientRect()
      setState({ note, x: rect.left + rect.width / 2, y: rect.top })
    }
    const onOut = (e: MouseEvent) => {
      const related = e.relatedTarget as Element | null
      if (related?.closest("mark.note-annotation")) return
      setState(null)
    }
    const onScroll = () => setState(null)
    container.addEventListener("mouseover", onOver)
    container.addEventListener("mouseout",  onOut)
    container.addEventListener("scroll",    onScroll, true)
    window.addEventListener("scroll",       onScroll, true)
    return () => {
      container.removeEventListener("mouseover", onOver)
      container.removeEventListener("mouseout",  onOut)
      container.removeEventListener("scroll",    onScroll, true)
      window.removeEventListener("scroll",       onScroll, true)
    }
  }, [container])

  if (!state || typeof document === "undefined") return null
  return createPortal(
    <div
      className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-full -mt-2 rounded-md bg-foreground px-3 py-1.5 text-xs text-background shadow-md animate-in fade-in-0 zoom-in-95 max-w-xs text-center"
      style={{ left: state.x, top: state.y }}
      role="tooltip"
    >
      {state.note}
      <span className="absolute left-1/2 -bottom-1 -translate-x-1/2 size-2 rotate-45 bg-foreground rounded-[2px]" />
    </div>,
    document.body,
  )
}
