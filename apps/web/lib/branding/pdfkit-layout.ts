import { readFile } from "node:fs/promises"
import path from "node:path"
import type {
  BrandingLanguage,
  BrandingRichText,
} from "@workspace/db/branding-domain"
import { brandType } from "./typography"
import {
  drawBrandingText,
  layoutBrandingText,
  type BrandingTextLayout,
  type BrandingTextSpan,
  type PdfKitBrandFonts,
} from "./pdfkit-fonts"

export const mm = (value: number) => (value * 72) / 25.4
export const A4 = [mm(210), mm(297)] as const
export const MARGIN = 36
export const GREEN = "#006A49"
export const CREAM = "#F7F7F2"
export const BLACK = "#050505"
export type Box = { x: number; y: number; width: number; height: number }
export type PdfContext = { doc: PDFKit.PDFDocument; fonts: PdfKitBrandFonts }
export type TextPart = {
  layout: BrandingTextLayout
  x: number
  y: number
  width: number
  align?: "left" | "center" | "right"
  color?: string
}
export type TextBlock = {
  height: number
  parts: TextPart[]
  borderColor?: string
  borders?: Box[]
  keepNext?: boolean
}

export function textLayout(
  ctx: PdfContext,
  text: string | BrandingTextSpan[],
  language: BrandingLanguage,
  role: keyof typeof brandType,
  width: number,
  scale = 1
) {
  const localRole =
    language !== "en" &&
    (role === "display" || role === "section" || role === "subsection")
      ? "localHeading"
      : language !== "en" && (role === "body" || role === "lede")
        ? "localBody"
        : role
  const [size, weight, lineHeight, tracking] = brandType[localRole]
  return layoutBrandingText(
    ctx.doc,
    ctx.fonts,
    text,
    {
      language,
      weight,
      sizePt: size * 0.75 * scale,
      lineHeight,
      trackingEm: Number.parseFloat(tracking),
    },
    width
  )
}

export function fits(
  layout: BrandingTextLayout,
  width: number,
  height: number
) {
  return (
    layout.height <= height + 0.001 &&
    layout.lines.every((line) => line.width <= width + 0.001)
  )
}

export function drawText(
  ctx: PdfContext,
  layout: BrandingTextLayout,
  box: Box,
  color = BLACK,
  align: TextPart["align"] = "left",
  middle = false
) {
  if (!fits(layout, box.width, box.height))
    throw new Error("Text cannot fit its fixed PDF region.")
  drawBrandingText(
    ctx.doc,
    layout,
    box.x,
    box.y + (middle ? (box.height - layout.height) / 2 : 0),
    color,
    align,
    box.width
  )
}

export function drawBlock(
  ctx: PdfContext,
  block: TextBlock,
  x: number,
  y: number,
  color = BLACK
) {
  for (const border of block.borders ?? [])
    ctx.doc
      .lineWidth(0.5)
      .rect(x + border.x, y + border.y, border.width, border.height)
      .stroke(block.borderColor ?? GREEN)
  for (const part of block.parts)
    drawBrandingText(
      ctx.doc,
      part.layout,
      x + part.x,
      y + part.y,
      part.color ?? color,
      part.align,
      part.width
    )
}

export function blockFits(block: TextBlock) {
  return (
    Number.isFinite(block.height) &&
    block.parts.every(({ layout, width }) => fits(layout, width, layout.height))
  )
}

function inline(node: BrandingRichText, bold = false): BrandingTextSpan[] {
  if (node.type === "text")
    return [
      {
        text: node.text ?? "",
        bold: bold || node.marks?.some((mark) => mark.type === "bold"),
        italic: node.marks?.some((mark) => mark.type === "italic"),
        underline: node.marks?.some((mark) => mark.type === "underline"),
      },
    ]
  if (node.type === "hardBreak") return [{ text: "\n", bold }]
  return (node.content ?? []).flatMap((child) => inline(child, bold))
}

/** One block per line permits flowing a hanging list through a page break. */
export function richBlocks(
  ctx: PdfContext,
  node: BrandingRichText,
  language: BrandingLanguage,
  width: number,
  options: {
    scale?: number
    notice?: boolean
    role?: "body" | "lede" | "caption"
    bold?: boolean
  } = {}
): TextBlock[] {
  if (width <= 0) return [{ height: Infinity, parts: [] }]
  const scale = options.scale ?? 1
  const bodyRole = options.role ?? "body"
  const bodySize = brandType[bodyRole][0] * 0.75 * scale
  const blocks: TextBlock[] = []
  const marginAfter = (margin: number) => {
    const last = blocks.at(-1)
    if (!last) return
    const ink = Math.max(
      0,
      ...last.parts.map((part) => part.y + part.layout.height),
      ...(last.borders ?? []).map((border) => border.y + border.height)
    )
    last.height = Math.max(last.height, ink + margin)
  }
  const visit = (
    node: BrandingRichText,
    indent = 0,
    marker?: string,
    markerWidth = 0,
    inList = false
  ) => {
    if (node.type === "paragraph" || node.type === "heading") {
      const heading = node.type === "heading"
      if (heading && !options.notice) marginAfter(mm(5))
      const available = width - indent
      if (available <= 0) {
        blocks.push({ height: Infinity, parts: [] })
        return
      }
      const layout = textLayout(
        ctx,
        inline(node, options.bold),
        language,
        heading ? (options.notice ? "section" : "subsection") : bodyRole,
        available,
        scale
      )
      const align = options.notice && !inList ? "center" : "left"
      for (let index = 0; index < layout.lines.length; index++) {
        const line = layout.lines[index]!
        const lineLayout = {
          ...layout,
          lines: [line],
          height:
            index === layout.lines.length - 1
              ? layout.height - index * layout.lineHeightPt
              : layout.lineHeightPt,
        }
        const part: TextPart = {
          layout: lineLayout,
          x: indent,
          y: 0,
          width: available,
          align,
        }
        const parts = [part]
        if (!index && marker) {
          const bullet = textLayout(
            ctx,
            marker,
            language,
            bodyRole,
            markerWidth,
            scale
          )
          parts.push({
            layout: bullet,
            x: indent - markerWidth,
            y: layout.baselineOffsetPt - bullet.baselineOffsetPt,
            width: markerWidth - bodySize * 0.2,
            align: "right",
          })
        }
        const last = index === layout.lines.length - 1
        const gap = last
          ? options.notice
            ? bodySize * 0.65
            : inList
              ? 0
              : mm(4)
          : 0
        blocks.push({
          height: lineLayout.height + gap,
          parts,
          keepNext: heading || (!last && layout.lines.length <= 3),
        })
      }
      return
    }
    if (node.type === "orderedList" || node.type === "bulletList") {
      if (options.notice && blocks.length)
        blocks[blocks.length - 1]!.height += bodySize * 0.3
      else marginAfter(mm(inList ? 3 : 2))
      const items = node.content ?? []
      const start = node.attrs?.start ?? 1
      const widest = textLayout(
        ctx,
        `${start + items.length - 1}.`,
        language,
        bodyRole,
        width,
        scale
      )
      const hanging = Math.max(
        options.notice ? bodySize * 1.5 : mm(inList ? 6 : 8),
        ...widest.lines.map((line) => line.width + bodySize * 0.4)
      )
      items.forEach((item, index) => {
        const marker = node.type === "orderedList" ? `${start + index}.` : "•"
        item.content?.forEach((child, childIndex) => {
          visit(
            child,
            indent + hanging,
            childIndex ? undefined : marker,
            hanging,
            true
          )
          const next = item.content?.[childIndex + 1]
          if (
            blocks.length &&
            (next?.type === "bulletList" || next?.type === "orderedList")
          )
            blocks[blocks.length - 1]!.keepNext = true
        })
        if (options.notice && blocks.length)
          blocks[blocks.length - 1]!.height += bodySize * 0.25
        else if (node.type === "orderedList") marginAfter(mm(3))
      })
      if (!options.notice && !inList) marginAfter(mm(5))
      return
    }
    if (node.type === "table") {
      for (const row of node.content ?? []) {
        const cells = row.content ?? []
        const cellWidth = (width - indent) / cells.length
        const padding = options.notice ? bodySize * 0.25 : mm(3)
        const layouts = cells.map((cell) =>
          richBlocks(
            ctx,
            { type: "doc", content: cell.content },
            language,
            cellWidth - padding * 2,
            { ...options, bold: cell.type === "tableHeader" }
          )
        )
        const height =
          Math.max(
            ...layouts.map((parts) =>
              parts.reduce((sum, part) => sum + part.height, 0)
            )
          ) +
          padding * 2
        const parts: TextPart[] = []
        const borders: Box[] = []
        layouts.forEach((cellBlocks, index) => {
          let y = padding
          for (const block of cellBlocks) {
            parts.push(
              ...block.parts.map((part) => ({
                ...part,
                x: part.x + indent + index * cellWidth + padding,
                y: part.y + y,
              }))
            )
            y += block.height
          }
          borders.push({
            x: indent + index * cellWidth,
            y: 0,
            width: cellWidth,
            height,
          })
        })
        blocks.push({ height, parts, borders })
      }
      return
    }
    node.content?.forEach((child) =>
      visit(child, indent, marker, markerWidth, inList)
    )
  }
  visit(node)
  // The final paragraph has no trailing margin in fixed poster regions.
  const last = blocks.at(-1)
  if (options.notice && last && !last.borders)
    last.height = Math.max(
      ...last.parts.map((part) => part.y + part.layout.height)
    )
  return blocks
}

export function fitScale(check: (scale: number) => boolean, empty = false) {
  let low = 0.001,
    high = 1
  if (!check(low))
    throw new Error(
      "Too many sections to fit on one page. Remove a section or shorten the content."
    )
  if (empty) return 1
  for (let step = 0; step < 20 && check(high); step++) {
    low = high
    high *= 2
  }
  if (check(high)) throw new Error("Could not bound the document text scale.")
  for (let step = 0; step < 20; step++) {
    const middle = (low + high) / 2
    if (check(middle)) low = middle
    else high = middle
  }
  return low
}

let wordmark:
  | Promise<{ width: number; height: number; paths: string[] }>
  | undefined
export function loadWordmark() {
  return (wordmark ??= readFile(
    path.join(process.cwd(), "lib/branding/assets/mrm-full.svg"),
    "utf8"
  ).then((svg) => {
    // Only our fixed, path-only artwork. This is deliberately not an SVG interpreter.
    const viewBox = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg)
    const paths = [...svg.matchAll(/<path\s[^>]*\bd="([^"]+)"/g)].map(
      (match) => match[1]!
    )
    if (
      !viewBox ||
      !paths.length ||
      /<(?:image|use|text|script)\b|\btransform=/.test(svg)
    )
      throw new Error("Unsupported bundled wordmark artwork.")
    return { width: Number(viewBox[1]), height: Number(viewBox[2]), paths }
  }))
}

export function drawWordmark(
  ctx: PdfContext,
  artwork: Awaited<ReturnType<typeof loadWordmark>>,
  x: number,
  y: number,
  width: number
) {
  ctx.doc
    .save()
    .translate(x, y)
    .scale(width / artwork.width)
  for (const path of artwork.paths) ctx.doc.path(path).fill(GREEN)
  ctx.doc.restore()
}

export function drawLogo(
  ctx: PdfContext,
  x: number,
  y: number,
  width: number,
  color = GREEN
) {
  ctx.doc
    .save()
    .translate(x, y)
    .scale(width / 112.66)
    .path(
      "M101.39,0H11.27C5.04,0,0,5.01,0,11.18v50.79h112.66V11.18c0-6.17-5.04-11.18-11.27-11.18Z"
    )
    .fill(color)
    .path(
      "M0,101.16c0,6.36,5.04,11.51,11.27,11.51h90.13c6.22,0,11.27-5.16,11.27-11.51v-11.02H0v11.02Z"
    )
    .fill(color)
    .restore()
}

export function drawPicture(
  ctx: PdfContext,
  picture: string | undefined,
  box: Box,
  contain = false,
  radius = 0
) {
  if (!(box.width > 0 && box.height > 0))
    throw new Error("Picture cannot fit its fixed PDF region.")
  if (!picture) return
  if (
    !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/.test(picture) ||
    picture.length > 400_000
  )
    throw new Error("Pictures must be bounded uploaded JPEG data URLs.")
  const bytes = Buffer.from(picture.slice(picture.indexOf(",") + 1), "base64")
  if (
    bytes[0] !== 0xff ||
    bytes[1] !== 0xd8 ||
    bytes.at(-2) !== 0xff ||
    bytes.at(-1) !== 0xd9
  )
    throw new Error("Invalid uploaded JPEG.")
  ctx.doc.save().roundedRect(box.x, box.y, box.width, box.height, radius).clip()
  ctx.doc
    .image(bytes, box.x, box.y, {
      ...(contain
        ? { fit: [box.width, box.height] as [number, number] }
        : { cover: [box.width, box.height] as [number, number] }),
      align: "center",
      valign: "center",
    })
    .restore()
}
