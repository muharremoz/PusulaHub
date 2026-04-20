/* ══════════════════════════════════════════════════════════
   AnnotationMark — Seçili metne ek not iliştiren Tiptap mark.
   Render: <mark class="note-annotation" data-note="..." title="...">
   Sarı arkaplan + hover'da tooltip.
══════════════════════════════════════════════════════════ */

import { Mark, mergeAttributes } from "@tiptap/react"

export interface AnnotationOptions {
  HTMLAttributes: Record<string, unknown>
}

declare module "@tiptap/react" {
  interface Commands<ReturnType> {
    annotation: {
      setAnnotation:    (note: string) => ReturnType
      unsetAnnotation:  () => ReturnType
    }
  }
}

export const AnnotationMark = Mark.create<AnnotationOptions>({
  name: "annotation",

  addOptions() {
    return {
      HTMLAttributes: { class: "note-annotation" },
    }
  },

  addAttributes() {
    return {
      note: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-note") ?? "",
        renderHTML: (attrs) => {
          // title attribute'u kullanılmıyor — hover tooltip'i shadcn
          // stilinde custom AnnotationHoverTooltip yönetiyor.
          const n = (attrs.note as string) || ""
          return n ? { "data-note": n } : {}
        },
      },
    }
  },

  parseHTML() {
    return [
      { tag: "mark.note-annotation" },
      { tag: "mark[data-note]" },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return ["mark", mergeAttributes(this.options.HTMLAttributes, HTMLAttributes), 0]
  },

  inclusive: false,

  addCommands() {
    return {
      setAnnotation:
        (note: string) =>
        ({ commands }) =>
          commands.setMark(this.name, { note }),
      unsetAnnotation:
        () =>
        ({ commands }) =>
          commands.unsetMark(this.name),
    }
  },
})
