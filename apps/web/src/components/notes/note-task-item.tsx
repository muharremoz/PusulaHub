"use client"

/* ══════════════════════════════════════════════════════════
   NoteTaskItemView — Tiptap TaskItem için shadcn Checkbox
   ile render eden React NodeView.
══════════════════════════════════════════════════════════ */

import {
  NodeViewContent,
  NodeViewWrapper,
  type NodeViewProps,
} from "@tiptap/react"
import { Checkbox } from "@/components/ui/checkbox"

export function NoteTaskItemView({ node, updateAttributes, editor }: NodeViewProps) {
  const checked = node.attrs.checked as boolean
  const editable = editor.isEditable

  return (
    <NodeViewWrapper
      as="li"
      data-checked={checked ? "true" : "false"}
      className="flex items-start gap-2 my-1"
    >
      <label
        contentEditable={false}
        className="mt-[3px] select-none shrink-0"
      >
        <Checkbox
          checked={checked}
          disabled={!editable}
          onCheckedChange={(v) => updateAttributes({ checked: v === true })}
        />
      </label>
      <NodeViewContent className="flex-1 min-w-0" as="div" />
    </NodeViewWrapper>
  )
}
