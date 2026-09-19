import {
  brandingOutline,
  plainBrandingRichText,
  revisionLabel,
  type BrandingLanguage,
} from "@workspace/db/branding-domain"
import type { BrandingPdfInput } from "./pdf"
import {
  A4,
  BLACK,
  CREAM,
  GREEN,
  MARGIN,
  blockFits,
  drawBlock,
  drawLogo,
  drawText,
  drawWordmark,
  loadWordmark,
  mm,
  richBlocks,
  textLayout,
  type PdfContext,
  type TextBlock,
  type TextPart,
} from "./pdfkit-layout"

const WIDTH = A4[0] - MARGIN * 2
const BOTTOM = A4[1] - mm(25)
type PlacedBlock = { block: TextBlock; y: number }
type FlowPage = PlacedBlock[]

/** Paginate measured lines; markers belong to their first line, never a page. */
function flow(top: number) {
  const pages: FlowPage[] = [[]]
  let y = top
  const newPage = () => {
    if (pages.at(-1)!.length) {
      pages.push([])
      y = top
    }
  }
  const add = (blocks: TextBlock[]) => {
    let relaxKeepThrough = -1
    for (let index = 0; index < blocks.length; index++) {
      const block = blocks[index]!
      const inkHeight = Math.max(
        0,
        ...block.parts.map((part) => part.y + part.layout.height),
        ...(block.borders ?? []).map((border) => border.y + border.height)
      )
      if (!blockFits(block) || inkHeight > BOTTOM - top)
        throw new Error("A book element cannot fit the fixed page region.")
      let keepHeight = inkHeight
      let precedingHeight = 0
      let chainEnd = index
      for (
        let cursor = index;
        index > relaxKeepThrough &&
        blocks[cursor]?.keepNext &&
        blocks[cursor + 1];
        cursor++
      ) {
        precedingHeight += blocks[cursor]!.height
        const next = blocks[cursor + 1]!
        keepHeight =
          precedingHeight +
          Math.max(
            0,
            ...next.parts.map((part) => part.y + part.layout.height),
            ...(next.borders ?? []).map((border) => border.y + border.height)
          )
        chainEnd = cursor + 1
      }
      if (keepHeight > BOTTOM - top && chainEnd > index) {
        // An oversized chain must flow. Keep its opening pair together, then
        // relax the remaining links so they cannot strand the first block.
        relaxKeepThrough = chainEnd
        const next = blocks[index + 1]!
        keepHeight =
          block.height +
          Math.max(
            0,
            ...next.parts.map((part) => part.y + part.layout.height),
            ...(next.borders ?? []).map((border) => border.y + border.height)
          )
      }
      if (y + Math.min(keepHeight, BOTTOM - top) > BOTTOM) newPage()
      if (y + inkHeight > BOTTOM) newPage()
      pages.at(-1)!.push({ block, y })
      y += block.height
    }
  }
  return {
    pages,
    add,
    newPage,
    get page() {
      return pages.length - 1
    },
    get y() {
      return y
    },
  }
}

function paragraph(
  ctx: PdfContext,
  text: string,
  language: BrandingLanguage,
  role: "display" | "section" | "subsection" | "caption",
  gap = 0,
  color = BLACK
): TextBlock {
  const layout = textLayout(ctx, text, language, role, WIDTH)
  return {
    height: layout.height + gap,
    parts: [{ layout, x: 0, y: 0, width: WIDTH, color }],
  }
}

function tableRow(
  ctx: PdfContext,
  values: string[],
  widths: number[],
  language: BrandingLanguage,
  role: "body" | "caption" | "subsection",
  centered = false,
  indent = 0
): TextBlock {
  let x = 0
  const padding = mm(3)
  const parts: TextPart[] = values.map((value, index) => {
    const left = padding + (index === 1 ? indent : 0)
    const width = widths[index]! - left - padding
    const part = {
      layout: textLayout(ctx, value, language, role, width),
      x: x + left,
      y: padding,
      width,
      align:
        centered || index === 0 || index === values.length - 1
          ? ("center" as const)
          : ("left" as const),
    }
    x += widths[index]!
    return part
  })
  const height = Math.max(
    mm(10),
    ...parts.map((part) => part.layout.height + padding * 2)
  )
  if (role === "body" && !centered)
    for (const part of parts) part.y = (height - part.layout.height) / 2
  x = 0
  const borders = widths.map((width) => {
    const box = { x, y: 0, width, height }
    x += width
    return box
  })
  return { height, parts, borders, borderColor: BLACK }
}

export async function drawBrandingBook(
  ctx: PdfContext,
  input: BrandingPdfInput
) {
  const artwork = await loadWordmark()
  const reference = revisionLabel(input.revision)
  for (const translation of input.content.translations) {
    const language = translation.language
    const details = translation.details
    const detailsFlow = flow(MARGIN)
    detailsFlow.add([
      paragraph(ctx, translation.title, language, "display", mm(12), GREEN),
    ])
    if (details)
      detailsFlow.add(
        richBlocks(ctx, details.introduction, language, WIDTH, { role: "lede" })
      )
    const metadata = [
      `Document No.: ${input.number}`,
      `Revision: ${reference}`,
      `Effective Date: ${input.content.effectiveDate || "Pending"}`,
      `Prepared by: ${details?.preparedBy || input.content.department}`,
    ].map((text) => paragraph(ctx, text, "en", "caption", mm(1)))
    metadata[0]!.parts.forEach((part) => (part.y += mm(7)))
    metadata[0]!.height += mm(7)
    metadata.at(-1)!.height += mm(15)
    detailsFlow.add(metadata)
    const attributions =
      details?.attributions.filter(
        (entry) => entry.name || entry.designation
      ) ?? []
    if (attributions.length) {
      const widths = attributions.map(() => WIDTH / attributions.length)
      const rows = [
        tableRow(
          ctx,
          attributions.map((entry) => entry.role),
          widths,
          "en",
          "subsection",
          true
        ),
        tableRow(
          ctx,
          attributions.map((entry) => entry.name),
          widths,
          "en",
          "caption",
          true
        ),
        tableRow(
          ctx,
          attributions.map(() => "Designation"),
          widths,
          "en",
          "subsection",
          true
        ),
        tableRow(
          ctx,
          attributions.map((entry) => entry.designation),
          widths,
          "en",
          "caption",
          true
        ),
      ]
      rows[0]!.parts.forEach((part) => (part.color = GREEN))
      rows[2]!.parts.forEach((part) => (part.color = GREEN))
      detailsFlow.add([
        {
          height: rows.reduce((sum, row) => sum + row.height, 0),
          borderColor: BLACK,
          parts: rows.flatMap((row, index) =>
            row.parts.map((part) => ({
              ...part,
              y:
                part.y +
                rows.slice(0, index).reduce((sum, row) => sum + row.height, 0),
            }))
          ),
          borders: rows.flatMap((row, index) =>
            row.borders!.map((border) => ({
              ...border,
              y:
                border.y +
                rows.slice(0, index).reduce((sum, row) => sum + row.height, 0),
            }))
          ),
        },
      ])
    }

    const outline = brandingOutline(translation.sections)
    const body = flow(mm(30))
    const destinations: number[] = []
    for (const { section, depth, label } of outline) {
      if (section.pageBreakBefore) body.newPage()
      const heading = paragraph(
        ctx,
        label,
        language,
        depth ? "subsection" : "section",
        mm(4),
        depth ? BLACK : GREEN
      )
      const previous = body.pages.at(-1)!.at(-1)?.block
      const previousMargin = previous
        ? previous.height -
          Math.max(
            0,
            ...previous.parts.map((part) => part.y + part.layout.height)
          )
        : 0
      const topGap = previous
        ? Math.max(0, mm(depth ? 5 : 8) - previousMargin)
        : 0
      heading.parts.forEach((part) => (part.y += topGap))
      heading.height += topGap
      heading.keepNext = true
      const blocks = section.body.trim()
        ? richBlocks(
            ctx,
            section.richBody ?? plainBrandingRichText(section.body),
            language,
            WIDTH
          )
        : []
      // Keep the heading and the first body line together, without preventing
      // the rest of a long paragraph/list from flowing normally.
      const before = body.pages.map((page) => page.length)
      body.add([heading, ...blocks])
      const headingPage = body.pages.findIndex(
        (page, index) =>
          page.length > (before[index] ?? 0) &&
          page.some((entry) => entry.block === heading)
      )
      if (headingPage < 0)
        throw new Error("Could not locate a rendered heading.")
      destinations.push(headingPage)
    }
    if (!outline.length)
      body.add(
        richBlocks(
          ctx,
          plainBrandingRichText("No content entered."),
          language,
          WIDTH
        )
      )

    const indexTitle = { en: "Index", hi: "अनुक्रमणिका", gu: "અનુક્રમણિકા" }[
      language
    ]
    const indexWidths = [mm(17), WIDTH - mm(40), mm(23)]
    const indexHeader = tableRow(
      ctx,
      ["No.", "Table Of Contents", "Page"],
      indexWidths,
      "en",
      "subsection"
    )
    const makeIndex = (count: number) => {
      const pages: FlowPage[] = [[]]
      const title = paragraph(
        ctx,
        indexTitle,
        language,
        "section",
        mm(4),
        GREEN
      )
      title.parts[0]!.align = "center"
      title.parts[0]!.y = mm(12)
      title.height += mm(12)
      pages[0]!.push(
        { block: title, y: mm(30) },
        { block: indexHeader, y: mm(30) + title.height }
      )
      let y = mm(30) + title.height + indexHeader.height
      outline.forEach((entry, index) => {
        if (entry.depth && entry.section.includeInIndex === false) return
        const printed =
          detailsFlow.pages.length + count + destinations[index]! + 1
        const row = tableRow(
          ctx,
          [entry.number, entry.section.heading, String(printed)],
          indexWidths,
          language,
          "body",
          false,
          mm(entry.depth * 3)
        )
        if (
          !blockFits(row) ||
          row.height + indexHeader.height > BOTTOM - mm(30)
        )
          throw new Error("An index entry cannot fit a page.")
        if (y + row.height > BOTTOM) {
          pages.push([{ block: indexHeader, y: mm(30) }])
          y = mm(30) + indexHeader.height
        }
        pages.at(-1)!.push({ block: row, y })
        y += row.height
      })
      return pages
    }
    let indexPages = makeIndex(1)
    let settled = false
    for (let pass = 0; pass < 4; pass++) {
      const next = makeIndex(indexPages.length)
      if (next.length === indexPages.length) {
        indexPages = next
        settled = true
        break
      }
      indexPages = next
    }
    if (!settled)
      throw new Error(
        "Index pagination did not settle. Shorten the heading titles."
      )

    ctx.doc.addPage({ size: [...A4], margin: 0 })
    ctx.doc.rect(MARGIN, MARGIN, WIDTH, A4[1] - MARGIN * 2).fill(GREEN)
    const panel = {
      x: MARGIN + mm(5),
      y: MARGIN + mm(5),
      width: WIDTH - mm(10),
      height: A4[1] - MARGIN * 2 - mm(10),
    }
    ctx.doc
      .roundedRect(panel.x, panel.y, panel.width, panel.height, mm(9))
      .fill(CREAM)
    const logoWidth = Math.min(mm(84), panel.width - mm(20))
    const logoHeight = (logoWidth * artwork.height) / artwork.width
    drawWordmark(
      ctx,
      artwork,
      (A4[0] - logoWidth) / 2,
      panel.y + mm(10),
      logoWidth
    )
    const titleY = panel.y + mm(10) + logoHeight + mm(40)
    const title = textLayout(
      ctx,
      translation.title,
      language,
      "display",
      panel.width - mm(20)
    )
    const footerY = panel.y + panel.height - mm(10) - 15.6
    drawText(
      ctx,
      title,
      {
        x: panel.x + mm(10),
        y: titleY,
        width: panel.width - mm(20),
        height: footerY - mm(15) - titleY,
      },
      GREEN,
      "center"
    )
    if (input.draft)
      drawText(
        ctx,
        textLayout(ctx, "DRAFT", "en", "caption", panel.width - mm(20)),
        {
          x: panel.x + mm(10),
          y: titleY + title.height + mm(5),
          width: panel.width - mm(20),
          height: footerY - titleY - title.height - mm(5),
        },
        GREEN,
        "center"
      )
    const coverValues = [
      input.number,
      `Rev No. ${reference}`,
      input.content.effectiveDate || "Date pending",
    ]
    const footerWidth = panel.width - mm(20)
    const values = coverValues.map((value) =>
      textLayout(ctx, value, "en", "caption", footerWidth)
    )
    const widths = values.map((value) =>
      Math.max(...value.lines.map((line) => line.width))
    )
    const gap =
      (footerWidth - widths.reduce((sum, width) => sum + width, 0)) / 2
    if (gap < mm(6))
      throw new Error("Cover metadata cannot fit the fixed region.")
    let footerX = panel.x + mm(10)
    values.forEach((value, index) => {
      drawText(
        ctx,
        value,
        { x: footerX, y: footerY, width: widths[index]!, height: 15.6 },
        GREEN
      )
      footerX += widths[index]! + gap
    })

    const internalPages = [...detailsFlow.pages, ...indexPages, ...body.pages]
    internalPages.forEach((page, index) => {
      ctx.doc.addPage({ size: [...A4], margin: 0 })
      if (index >= detailsFlow.pages.length) {
        drawLogo(ctx, MARGIN, MARGIN, 24)
        const header = textLayout(
          ctx,
          `${translation.title}${input.draft ? " · DRAFT" : ""}`,
          language,
          "subsection",
          WIDTH - 28.5
        )
        drawText(
          ctx,
          header,
          {
            x: MARGIN + 28.5,
            y: MARGIN,
            width: WIDTH - 28.5,
            height: mm(30) - MARGIN - mm(2),
          },
          GREEN
        )
      }
      const footer = textLayout(
        ctx,
        `Doc. No.: ${input.number} | Rev. No.: ${reference} | Effective Date: ${input.content.effectiveDate || "Pending"}`,
        "en",
        "caption",
        WIDTH - mm(12)
      )
      const footerTop = A4[1] - MARGIN - footer.height
      if (footerTop - mm(3) < BOTTOM)
        throw new Error("Footer cannot fit its reserved page region.")
      ctx.doc
        .moveTo(MARGIN, footerTop - mm(3))
        .lineTo(A4[0] - MARGIN, footerTop - mm(3))
        .lineWidth(1)
        .stroke(BLACK)
      drawText(ctx, footer, {
        x: MARGIN,
        y: footerTop,
        width: WIDTH - mm(12),
        height: footer.height,
      })
      drawText(
        ctx,
        textLayout(ctx, String(index + 1), "en", "caption", mm(12)),
        {
          x: A4[0] - MARGIN - mm(12),
          y: A4[1] - MARGIN - 15.6,
          width: mm(12),
          height: 15.6,
        },
        BLACK,
        "right"
      )
      for (const { block, y } of page) drawBlock(ctx, block, MARGIN, y)
    })
  }
}
