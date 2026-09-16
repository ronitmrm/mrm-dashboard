/** The portable, allowlisted subset used by the editor and PDF renderer. */
export type BrandingRichText = {
  type:
    | "doc"
    | "paragraph"
    | "text"
    | "hardBreak"
    | "bulletList"
    | "orderedList"
    | "listItem"
    | "table"
    | "tableRow"
    | "tableCell"
    | "tableHeader"
  text?: string
  marks?: { type: "bold" | "italic" | "underline" }[]
  attrs?: { start?: number; colspan?: number; rowspan?: number }
  content?: BrandingRichText[]
}

export function plainBrandingRichText(text: string): BrandingRichText {
  return {
    type: "doc",
    content: text.split("\n").map((line) => ({
      type: "paragraph",
      content: line ? [{ type: "text", text: line }] : [],
    })),
  }
}

export function brandingRichTextPlain(node: BrandingRichText): string {
  if (node.type === "text") return node.text ?? ""
  if (node.type === "hardBreak") return "\n"
  return (node.content ?? [])
    .map(brandingRichTextPlain)
    .join(
      node.type === "paragraph" ? "" : node.type === "tableRow" ? "\t" : "\n"
    )
}

export function parseBrandingRichText(value: unknown): BrandingRichText {
  let nodes = 0
  let characters = 0
  const parse = (
    value: unknown,
    allowed: string[],
    depth: number
  ): BrandingRichText => {
    if (
      !value ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      depth > 16 ||
      ++nodes > 2500
    )
      throw new Error("Formatted text is too complex.")
    const item = value as Record<string, unknown>
    if (typeof item.type !== "string" || !allowed.includes(item.type))
      throw new Error("Unsupported document text format.")
    const type = item.type as BrandingRichText["type"]
    if (type === "text") {
      if (
        typeof item.text !== "string" ||
        (characters += item.text.length) > 12000
      )
        throw new Error("Section text is invalid or too long.")
      if (
        item.marks !== undefined &&
        (!Array.isArray(item.marks) || item.marks.length > 3)
      )
        throw new Error("Text emphasis is invalid.")
      const marks = ((item.marks ?? []) as unknown[]).map((value) => {
        const mark =
          value && typeof value === "object"
            ? (value as Record<string, unknown>).type
            : undefined
        if (mark !== "bold" && mark !== "italic" && mark !== "underline")
          throw new Error("Text emphasis is invalid.")
        return { type: mark } as const
      })
      return { type, text: item.text, ...(marks.length ? { marks } : {}) }
    }
    if (type === "hardBreak") return { type }
    if (item.content !== undefined && !Array.isArray(item.content))
      throw new Error("Formatted text content is invalid.")
    const allowedChildren =
      type === "paragraph"
        ? ["text", "hardBreak"]
        : type === "table"
          ? ["tableRow"]
          : type === "tableRow"
            ? ["tableCell", "tableHeader"]
            : type === "orderedList" || type === "bulletList"
              ? ["listItem"]
              : [
                  "paragraph",
                  "orderedList",
                  "bulletList",
                  ...(type === "doc" ? ["table"] : []),
                ]
    const content = ((item.content ?? []) as unknown[]).map((child) =>
      parse(child, allowedChildren, depth + 1)
    )
    if (
      (type === "listItem" && content[0]?.type !== "paragraph") ||
      ((type === "orderedList" || type === "bulletList" || type === "doc") &&
        !content.length)
    )
      throw new Error("Formatted text structure is incomplete.")
    if (type === "orderedList") {
      const attrs = item.attrs as { start?: unknown } | undefined
      const start = attrs?.start ?? 1
      if (
        typeof start !== "number" ||
        !Number.isInteger(start) ||
        start < 1 ||
        start > 9999
      )
        throw new Error("List starting number is invalid.")
      return { type, attrs: { start }, content }
    }
    if (type === "table") {
      const columns = content[0]?.content?.length ?? 0
      if (
        !columns ||
        columns > 8 ||
        content.length > 20 ||
        content.some((row) => row.content?.length !== columns)
      )
        throw new Error(
          "Tables need 1–20 rows with the same 1–8 columns in each row."
        )
    }
    if (type === "tableCell" || type === "tableHeader") {
      const attrs = item.attrs as
        | { colspan?: unknown; rowspan?: unknown }
        | undefined
      if (
        (attrs?.colspan ?? 1) !== 1 ||
        (attrs?.rowspan ?? 1) !== 1 ||
        !content.length
      )
        throw new Error("Use unmerged table cells containing paragraphs.")
      return { type, attrs: { colspan: 1, rowspan: 1 }, content }
    }
    return { type, content }
  }
  return parse(value, ["doc"], 0)
}

export function brandingRichTextHtml(node: BrandingRichText): string {
  const escape = (value: string) =>
    value.replace(
      /[&<>"']/g,
      (char) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[char]!
    )
  if (node.type === "text") {
    return (node.marks ?? []).reduce(
      (text, mark) => {
        const tag = { bold: "strong", italic: "em", underline: "u" }[mark.type]
        return `<${tag}>${text}</${tag}>`
      },
      escape(node.text ?? "")
    )
  }
  if (node.type === "hardBreak") return "<br>"
  const body = (node.content ?? []).map(brandingRichTextHtml).join("")
  if (node.type === "doc") return body
  const tag = {
    paragraph: "p",
    bulletList: "ul",
    orderedList: "ol",
    listItem: "li",
    table: "table",
    tableRow: "tr",
    tableCell: "td",
    tableHeader: "th",
  }[node.type]
  return `<${tag}${node.type === "orderedList" ? ` start="${node.attrs?.start ?? 1}"` : ""}>${body || (node.type === "paragraph" ? "<br>" : "")}</${tag}>`
}
