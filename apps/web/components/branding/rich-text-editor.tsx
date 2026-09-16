"use client"

import { useEffect } from "react"
import { EditorContent, useEditor } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import { TableKit } from "@tiptap/extension-table"
import {
  brandingRichTextPlain,
  type BrandingRichText,
} from "@workspace/db/branding-domain"
import { Button } from "@workspace/ui/components/button"
import "./structured-text.css"

const extensions = [
  StarterKit.configure({
    heading: false,
    blockquote: false,
    code: false,
    codeBlock: false,
    horizontalRule: false,
    link: false,
    strike: false,
    italic: false,
    underline: false,
    trailingNode: false,
  }),
]

// Old drafts may contain marks from the former toolbar. Keep their text while
// adapting them to the locked schema, including on reopening an existing draft.
function editorContent(value: BrandingRichText): BrandingRichText {
  return {
    ...value,
    ...(value.marks && {
      marks: value.marks.filter((mark) => mark.type === "bold"),
    }),
    ...(value.content && { content: value.content.map(editorContent) }),
  }
}

export default function BrandingRichTextEditor({
  value,
  onChange,
  id,
  label,
  language,
  disabled = false,
  tables = false,
  headings = false,
}: {
  value: BrandingRichText
  onChange: (value: BrandingRichText) => void
  id: string
  label: string
  language: string
  disabled?: boolean
  tables?: boolean
  headings?: boolean
}) {
  const editor = useEditor({
    extensions: [
      ...extensions.map((extension) =>
        headings ? extension.configure({ heading: { levels: [2] } }) : extension
      ),
      ...(tables ? [TableKit.configure({ table: { resizable: false } })] : []),
    ],
    content: editorContent(value),
    immediatelyRender: false,
    shouldRerenderOnTransaction: true,
    editable: !disabled,
    editorProps: {
      attributes: {
        id,
        role: "textbox",
        "aria-label": label,
        "aria-multiline": "true",
        lang: language,
        class: "branding-prose min-h-32 p-3 outline-none",
      },
    },
    // ProseMirror attributes have null prototypes. Server Actions need plain JSON
    // objects, otherwise React sends a temporary client reference for list attrs.
    // The configured schema produces this subset; the server validates every save.
    onUpdate: ({ editor }) =>
      onChange(
        JSON.parse(JSON.stringify(editor.getJSON())) as BrandingRichText
      ),
  })
  useEffect(() => {
    const normalized = editorContent(value)
    if (
      editor &&
      JSON.stringify(editor.getJSON()) !== JSON.stringify(normalized)
    )
      editor.commands.setContent(normalized, { emitUpdate: false })
  }, [editor, value])
  useEffect(() => {
    editor?.setEditable(!disabled)
  }, [editor, disabled])

  if (!editor)
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Loading text editor…
      </p>
    )

  const nearestList = (() => {
    const { $from } = editor.state.selection
    for (let depth = $from.depth; depth > 0; depth--) {
      const type = $from.node(depth).type.name
      if (type === "orderedList" || type === "bulletList")
        return { type, depth }
    }
    return undefined
  })()
  const listDepth = nearestList?.type === "orderedList" ? nearestList.depth : 0
  let continuation: number | undefined
  if (listDepth) {
    const { $from } = editor.state.selection
    const parent = $from.node(listDepth - 1)
    const current = $from.index(listDepth - 1)
    parent.forEach((node, _offset, index) => {
      if (index < current && node.type.name === "orderedList")
        continuation = Number(node.attrs.start ?? 1) + node.childCount
    })
  }
  const controls = [
    ...(headings
      ? [
          {
            label: "Heading",
            active: editor.isActive("heading", { level: 2 }),
            disabled: editor.isActive("table") || Boolean(nearestList),
            run: () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
          },
        ]
      : []),
    ...(tables
      ? [
          {
            label: "Insert table",
            disabled: editor.isActive("table"),
            run: () =>
              editor
                .chain()
                .focus()
                .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
                .run(),
          },
          ...[
            {
              label: "Add row",
              run: () => editor.chain().focus().addRowAfter().run(),
            },
            {
              label: "Add column",
              run: () => editor.chain().focus().addColumnAfter().run(),
            },
            {
              label: "Delete row",
              run: () => editor.chain().focus().deleteRow().run(),
            },
            {
              label: "Delete column",
              run: () => editor.chain().focus().deleteColumn().run(),
            },
            {
              label: "Delete table",
              run: () => editor.chain().focus().deleteTable().run(),
            },
          ].map((control) => ({
            ...control,
            disabled: !editor.isActive("table"),
          })),
        ]
      : []),
    {
      label: "Paragraph",
      run: () => editor.chain().focus().clearNodes().setParagraph().run(),
    },
    {
      label: "Bold",
      active: editor.isActive("bold"),
      run: () => editor.chain().focus().toggleBold().run(),
    },
    {
      label: "Bullets",
      active: nearestList?.type === "bulletList",
      run: () => editor.chain().focus().toggleBulletList().run(),
    },
    {
      label: "Numbering",
      active: nearestList?.type === "orderedList",
      run: () => editor.chain().focus().toggleOrderedList().run(),
    },
    {
      label: "Increase indent",
      disabled: !editor.can().sinkListItem("listItem"),
      run: () => editor.chain().focus().sinkListItem("listItem").run(),
    },
    {
      label: "Decrease indent",
      disabled: !editor.can().liftListItem("listItem"),
      run: () => editor.chain().focus().liftListItem("listItem").run(),
    },
    {
      label: "Restart numbering",
      disabled: !listDepth,
      run: () =>
        editor
          .chain()
          .focus()
          .updateAttributes("orderedList", { start: 1 })
          .run(),
    },
    {
      label: "Continue numbering",
      disabled: continuation === undefined,
      run: () =>
        editor
          .chain()
          .focus()
          .updateAttributes("orderedList", { start: continuation })
          .run(),
    },
    {
      label: "Undo",
      disabled: !editor.can().undo(),
      run: () => editor.chain().focus().undo().run(),
    },
    {
      label: "Redo",
      disabled: !editor.can().redo(),
      run: () => editor.chain().focus().redo().run(),
    },
  ]
  return (
    <div
      className="min-w-0 rounded-md border focus-within:ring-2 focus-within:ring-ring"
      aria-disabled={disabled}
    >
      <div
        role="group"
        aria-label={`${label} formatting`}
        className="flex flex-wrap gap-1 border-b p-2"
      >
        {controls.map((control) => (
          <Button
            key={control.label}
            type="button"
            size="sm"
            variant={control.active ? "secondary" : "ghost"}
            aria-pressed={control.active}
            disabled={disabled || control.disabled}
            onMouseDown={(event) => event.preventDefault()}
            onClick={control.run}
          >
            {control.label}
          </Button>
        ))}
      </div>
      <EditorContent editor={editor} />
      {brandingRichTextPlain(value).length > 12000 ? (
        <p role="alert" className="p-2 text-sm">
          This body exceeds 12,000 characters. Shorten it before saving.
        </p>
      ) : null}
    </div>
  )
}
