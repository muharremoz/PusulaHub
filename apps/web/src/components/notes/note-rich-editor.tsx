"use client"

/* ══════════════════════════════════════════════════════════
   NoteRichEditor — Tiptap tabanlı zengin metin editörü
   Not alanı için: başlık, kalın, italik, altı çizili, liste,
   onay kutusu (checkbox task list), link desteği.
   İçerik HTML string olarak saklanır.
══════════════════════════════════════════════════════════ */

import { useEffect, useState, useRef } from "react"
import { createPortal } from "react-dom"
import {
  EditorContent, useEditor, ReactNodeViewRenderer,
  type Editor,
} from "@tiptap/react"
import { BubbleMenu } from "@tiptap/react/menus"
import StarterKit from "@tiptap/starter-kit"
import Underline from "@tiptap/extension-underline"
import Link from "@tiptap/extension-link"
import TaskList from "@tiptap/extension-task-list"
import TaskItem from "@tiptap/extension-task-item"
import Placeholder from "@tiptap/extension-placeholder"
import { Fragment, Slice } from "@tiptap/pm/model"
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  Heading1, Heading2, List, ListOrdered, CheckSquare,
  Link as LinkIcon, Unlink, Undo2, Redo2, Minus, Eraser,
  StickyNote, Trash2, Check, X as XIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { NoteTaskItemView } from "./note-task-item"
import { AnnotationMark } from "./annotation-mark"

/** shadcn Checkbox ile render eden özel TaskItem */
const ShadcnTaskItem = TaskItem.extend({
  addNodeView() {
    return ReactNodeViewRenderer(NoteTaskItemView)
  },
})

interface NoteRichEditorProps {
  value:       string
  onChange:    (html: string) => void
  placeholder?: string
  className?:   string
}

export function NoteRichEditor({ value, onChange, placeholder, className }: NoteRichEditorProps) {
  const editor = useEditor({
    immediatelyRender: false,      // SSR uyumluluğu
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Underline,
      Link.configure({
        openOnClick: true,
        autolink:    true,
        HTMLAttributes: { class: "text-blue-600 underline" },
      }),
      TaskList.configure({
        HTMLAttributes: { class: "note-task-list" },
      }),
      ShadcnTaskItem.configure({
        nested: true,
        HTMLAttributes: { class: "note-task-item" },
      }),
      Placeholder.configure({
        placeholder: placeholder ?? "Notunuzu buraya yazın...",
        emptyEditorClass: "is-editor-empty",
      }),
      AnnotationMark,
    ],
    content: value || "",
    editorProps: {
      attributes: {
        class: "tiptap-editor flex-1 w-full px-5 py-4 outline-none text-[13px] leading-relaxed min-h-full",
      },
      /**
       * Paste işleyicisi: Excel, liste vb. alt alta satırlar yapıştırıldığında
       * her satır ayrı bir paragraph olsun. Default davranış HTML öncelikli
       * olduğundan Excel'in tek hücre HTML'i yüzünden tek satıra kalıyor.
       * Burada satır içeriyorsa plain text'i paragraph'lara bölüp ekliyoruz.
       */
      handlePaste(view, event) {
        const text = event.clipboardData?.getData("text/plain") ?? ""
        const html = event.clipboardData?.getData("text/html") ?? ""
        if (!text || !/\r?\n/.test(text)) return false

        // Zengin HTML (başka web sayfasından) ise default davranış bozulmasın —
        // sadece Excel/tablolar veya düz metin için devreye gir.
        const looksLikeExcelOrPlain =
          !html ||
          /<table|<\/td>|urn:schemas-microsoft-com:office:excel/i.test(html)
        if (!looksLikeExcelOrPlain) return false

        const lines = text.replace(/\r\n/g, "\n").split("\n")
        const { state } = view
        const { schema, tr } = state
        const nodes = lines.map((line) =>
          line.length
            ? schema.nodes.paragraph.create(null, schema.text(line))
            : schema.nodes.paragraph.create(),
        )
        const slice = new Slice(Fragment.fromArray(nodes), 1, 1)
        view.dispatch(tr.replaceSelection(slice).scrollIntoView())
        return true
      },
    },
    onUpdate: ({ editor }) => {
      const html = editor.getHTML()
      // Boş editör "<p></p>" döndürür — gerçek boş kabul et
      onChange(html === "<p></p>" ? "" : html)
    },
  })

  // Dışarıdan value değiştiğinde (başka not açıldığında) senkronize et
  useEffect(() => {
    if (!editor) return
    const current = editor.getHTML()
    const target  = value || ""
    if (current !== target && current !== `<p>${target}</p>`) {
      editor.commands.setContent(target, { emitUpdate: false })
    }
  }, [value, editor])

  // Editörün DOM root'u — annotation hover tooltip için state ile tutulur
  // ki ilk render sonrası tooltip listener'ı doğru elemente bağlansın.
  const [editorContainer, setEditorContainer] = useState<HTMLDivElement | null>(null)

  return (
    <div className={cn("flex flex-col min-h-0 flex-1", className)}>
      <EditorToolbar editor={editor} />
      <div className="flex-1 overflow-auto" ref={setEditorContainer}>
        <EditorContent editor={editor} className="h-full" />
        <AnnotationBubble editor={editor} />
      </div>
      <AnnotationHoverTooltip container={editorContainer} />
    </div>
  )
}

/* ── Ek nota (annotation) hover edildiğinde shadcn tarzı tooltip ── */
function AnnotationHoverTooltip({ container }: { container: HTMLElement | null }) {
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

/* ── Seçim yapıldığında metnin yanında çıkan "Ek Not Ekle" balonu ── */
function AnnotationBubble({ editor }: { editor: Editor | null }) {
  const [mode, setMode]   = useState<"idle" | "editing">("idle")
  const [text, setText]   = useState("")
  const inputRef          = useRef<HTMLInputElement>(null)

  if (!editor) return null

  const handleOpen = () => {
    const prev = (editor.getAttributes("annotation").note as string) ?? ""
    setText(prev)
    setMode("editing")
    setTimeout(() => inputRef.current?.focus(), 10)
  }

  const handleSave = () => {
    const v = text.trim()
    if (!v) {
      editor.chain().focus().extendMarkRange("annotation").unsetAnnotation().run()
    } else {
      editor.chain().focus().setAnnotation(v).run()
    }
    setMode("idle"); setText("")
  }

  const handleRemove = () => {
    editor.chain().focus().extendMarkRange("annotation").unsetAnnotation().run()
    setMode("idle"); setText("")
  }

  const handleCancel = () => { setMode("idle"); setText("") }

  return (
    <BubbleMenu
      editor={editor}
      options={{ placement: "bottom" }}
      shouldShow={({ editor, from, to }) => {
        // Edit modu açıksa her zaman göster (kapanmasın)
        if (mode === "editing") return true
        // Var olan bir annotation'a dokunulmuşsa göster
        if (editor.isActive("annotation")) return true
        // Aksi halde: metin seçimi varsa göster
        return from !== to
      }}
      // Seçim değişince form kapansın
      updateDelay={0}
    >
      <div className="rounded-[6px] border border-border/60 bg-white shadow-lg p-1 flex items-center gap-1">
        {mode === "idle" ? (
          <>
            <button
              type="button"
              onMouseDown={(e) => { e.preventDefault(); handleOpen() }}
              className="inline-flex items-center gap-1.5 px-2.5 h-7 rounded-[5px] text-[11px] font-medium text-foreground hover:bg-muted/60 transition-colors"
              title="Bu seçime ek not ekle"
            >
              <StickyNote className="size-3.5 text-amber-600" />
              {editor.isActive("annotation") ? "Notu düzenle" : "Ek Not Ekle"}
            </button>
            {editor.isActive("annotation") && (
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); handleRemove() }}
                className="inline-flex items-center justify-center size-7 rounded-[5px] text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                title="Ek notu kaldır"
              >
                <Trash2 className="size-3.5" />
              </button>
            )}
          </>
        ) : (
          <>
            <input
              ref={inputRef}
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter")  { e.preventDefault(); handleSave() }
                if (e.key === "Escape") { e.preventDefault(); handleCancel() }
              }}
              placeholder="Ek notu yaz..."
              className="h-7 w-64 px-2 text-[11px] bg-transparent outline-none rounded-[5px] border border-border/60 focus:border-foreground/40"
            />
            <button
              type="button"
              onMouseDown={(e) => { e.preventDefault(); handleSave() }}
              className="inline-flex items-center justify-center size-7 rounded-[5px] text-emerald-600 hover:bg-emerald-50 transition-colors"
              title="Kaydet (Enter)"
            >
              <Check className="size-3.5" />
            </button>
            <button
              type="button"
              onMouseDown={(e) => { e.preventDefault(); handleCancel() }}
              className="inline-flex items-center justify-center size-7 rounded-[5px] text-muted-foreground hover:bg-muted/60 transition-colors"
              title="İptal (Esc)"
            >
              <XIcon className="size-3.5" />
            </button>
          </>
        )}
      </div>
    </BubbleMenu>
  )
}

/* ── Araç çubuğu ── */
function EditorToolbar({ editor }: { editor: Editor | null }) {
  if (!editor) {
    return <div className="h-9 border-b border-border/30 bg-muted/10" />
  }

  const addLink = () => {
    const prev = editor.getAttributes("link").href as string | undefined
    const url = window.prompt("Link URL", prev ?? "https://")
    if (url === null) return
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run()
      return
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run()
  }

  return (
    <div className="flex flex-wrap items-center gap-0.5 px-3 py-1.5 border-b border-border/30 bg-muted/10 shrink-0">
      <TBtn onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            active={editor.isActive("heading", { level: 1 })} title="Başlık 1">
        <Heading1 className="size-3.5" />
      </TBtn>
      <TBtn onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            active={editor.isActive("heading", { level: 2 })} title="Başlık 2">
        <Heading2 className="size-3.5" />
      </TBtn>

      <Divider />

      <TBtn onClick={() => editor.chain().focus().toggleBold().run()}
            active={editor.isActive("bold")} title="Kalın (Ctrl+B)">
        <Bold className="size-3.5" />
      </TBtn>
      <TBtn onClick={() => editor.chain().focus().toggleItalic().run()}
            active={editor.isActive("italic")} title="İtalik (Ctrl+I)">
        <Italic className="size-3.5" />
      </TBtn>
      <TBtn onClick={() => editor.chain().focus().toggleUnderline().run()}
            active={editor.isActive("underline")} title="Altı çizili (Ctrl+U)">
        <UnderlineIcon className="size-3.5" />
      </TBtn>
      <TBtn onClick={() => editor.chain().focus().toggleStrike().run()}
            active={editor.isActive("strike")} title="Üstü çizili">
        <Strikethrough className="size-3.5" />
      </TBtn>

      <Divider />

      <TBtn onClick={() => editor.chain().focus().toggleBulletList().run()}
            active={editor.isActive("bulletList")} title="Madde listesi">
        <List className="size-3.5" />
      </TBtn>
      <TBtn onClick={() => editor.chain().focus().toggleOrderedList().run()}
            active={editor.isActive("orderedList")} title="Numaralı liste">
        <ListOrdered className="size-3.5" />
      </TBtn>
      <TBtn onClick={() => editor.chain().focus().toggleTaskList().run()}
            active={editor.isActive("taskList")} title="Onay kutusu listesi">
        <CheckSquare className="size-3.5" />
      </TBtn>

      <Divider />

      <TBtn onClick={addLink} active={editor.isActive("link")} title="Link ekle">
        <LinkIcon className="size-3.5" />
      </TBtn>
      <TBtn onClick={() => editor.chain().focus().unsetLink().run()}
            disabled={!editor.isActive("link")} title="Linki kaldır">
        <Unlink className="size-3.5" />
      </TBtn>
      <TBtn onClick={() => editor.chain().focus().setHorizontalRule().run()} title="Ayırıcı çizgi">
        <Minus className="size-3.5" />
      </TBtn>
      <TBtn onClick={() => editor.chain().focus().clearNodes().unsetAllMarks().run()} title="Biçimi temizle">
        <Eraser className="size-3.5" />
      </TBtn>

      <Divider />

      <TBtn onClick={() => editor.chain().focus().undo().run()}
            disabled={!editor.can().undo()} title="Geri al (Ctrl+Z)">
        <Undo2 className="size-3.5" />
      </TBtn>
      <TBtn onClick={() => editor.chain().focus().redo().run()}
            disabled={!editor.can().redo()} title="Yinele (Ctrl+Y)">
        <Redo2 className="size-3.5" />
      </TBtn>
    </div>
  )
}

/* ── Toolbar butonu ── */
function TBtn({
  onClick, active, disabled, title, children,
}: {
  onClick:    () => void
  active?:    boolean
  disabled?:  boolean
  title:      string
  children:   React.ReactNode
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => { e.preventDefault(); if (!disabled) onClick() }}
      disabled={disabled}
      title={title}
      className={cn(
        "h-7 w-7 rounded-[5px] inline-flex items-center justify-center transition-colors",
        disabled
          ? "text-muted-foreground/40 cursor-not-allowed"
          : active
            ? "bg-foreground/10 text-foreground"
            : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
      )}
    >
      {children}
    </button>
  )
}

function Divider() {
  return <div className="h-4 w-px bg-border/50 mx-1" />
}
