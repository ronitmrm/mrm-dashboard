import {
  brandingNoticeBody,
  brandingNoticeRichText,
  brandingStepNumber,
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
  drawPicture,
  drawText,
  drawWordmark,
  fitScale,
  fits,
  loadWordmark,
  mm,
  richBlocks,
  textLayout,
  type Box,
  type PdfContext,
} from "./pdfkit-layout"

export function isVisualGuide(input: BrandingPdfInput) {
  const sections = input.content.translations.flatMap(
    (translation) => translation.sections
  )
  return (
    sections.length > 0 &&
    sections.every((section) => section.layout === "visual-guide")
  )
}

export async function drawNotice(ctx: PdfContext, input: BrandingPdfInput) {
  const [width, height] = A4
  const bodyWidth = width - MARGIN * 2
  const banner = { x: MARGIN, y: mm(22), width: bodyWidth, height: mm(50) }
  const title = textLayout(ctx, "NOTICE", "en", "display", bodyWidth, 128 / 40)
  const metadata = (text: string, y: number, height: number) =>
    drawText(
      ctx,
      textLayout(ctx, text, "en", "caption", bodyWidth),
      { x: MARGIN, y, width: bodyWidth, height },
      GREEN,
      "right"
    )
  ctx.doc
    .roundedRect(banner.x, banner.y, banner.width, banner.height, mm(4))
    .fill(GREEN)
  drawText(ctx, title, banner, CREAM, "center", true)
  metadata(
    input.draft ? "Number assigned on issue" : input.number,
    MARGIN,
    banner.y - MARGIN
  )
  metadata(
    input.content.effectiveDate.split("-").reverse().join(" / ") ||
      "Date pending",
    mm(77),
    mm(13)
  )
  const order = { en: 0, gu: 1, hi: 2 }
  const translations = input.content.translations
    .filter(
      (translation) =>
        input.content.languages.includes(translation.language) &&
        brandingNoticeBody(translation.sections).trim()
    )
    .sort((a, b) => order[a.language] - order[b.language])
  const gap = mm(4)
  const regionHeight =
    (height - mm(90 + 25) - Math.max(0, translations.length - 1) * gap) /
    Math.max(1, translations.length)
  const bodies = translations.map((translation) => ({
    language: translation.language,
    body: brandingNoticeRichText(translation.sections),
  }))
  const layout = (scale: number) =>
    bodies.map(({ body, language }) =>
      richBlocks(ctx, body, language, bodyWidth, { scale, notice: true })
    )
  const scale = fitScale(
    (scale) =>
      layout(scale).every(
        (blocks) =>
          blocks.every(blockFits) &&
          blocks.reduce((sum, block) => sum + block.height, 0) <= regionHeight
      ),
    !bodies.length
  )
  layout(scale).forEach((blocks, index) => {
    let y = mm(90) + index * (regionHeight + gap)
    for (const block of blocks) {
      drawBlock(ctx, block, MARGIN, y)
      y += block.height
    }
  })
  const artwork = await loadWordmark()
  const logoWidth = mm(50)
  drawWordmark(
    ctx,
    artwork,
    (width - logoWidth) / 2,
    height - MARGIN - (logoWidth * artwork.height) / artwork.width,
    logoWidth
  )
}

export function drawWorkInstruction(ctx: PdfContext, input: BrandingPdfInput) {
  const visual = isVisualGuide(input)
  const [width, height] = visual ? [A4[1], A4[0]] : A4
  const sections = input.content.translations.flatMap((translation) =>
    translation.sections.map((section, index) => ({
      ...section,
      language: translation.language,
      step: brandingStepNumber(translation.language, index + 1),
    }))
  )
  const pictures = sections.some(
    (section) => section.layout && section.layout !== "text"
  )
  const sideRows =
    sections.length > 0 &&
    sections.every((section) => section.layout === "picture-left")
  if (
    sections.some((section) => section.layout === "visual-guide") &&
    (!visual ||
      input.content.translations.some(
        (translation) =>
          translation.sections.length !== 2 ||
          translation.sections[0]?.assessment !== "bad" ||
          translation.sections[1]?.assessment !== "good"
      ))
  )
    throw new Error(
      "Visual Guide requires exactly one fixed Bad and Good pair per language."
    )
  const sheet = {
    x: MARGIN,
    y: MARGIN,
    width: width - MARGIN * 2,
    height: height - MARGIN * 2,
  }
  const titleBox = {
    x: sheet.x + mm(22),
    y: sheet.y + mm(8),
    width: sheet.width - mm(25),
    height: mm(20),
  }
  const numberBox = {
    x: sheet.x + mm(3),
    y: sheet.y,
    width: sheet.width - mm(6),
    height: mm(8),
  }
  const panel = pictures
    ? {
        x: sheet.x,
        y: sheet.y + mm(visual ? 32 : 35),
        width: sheet.width,
        height: sheet.height - mm(visual ? 32 : 35),
      }
    : {
        x: sheet.x + mm(3),
        y: sheet.y + mm(32),
        width: sheet.width - mm(6),
        height: sheet.height - mm(35),
      }
  const columns =
    visual || sideRows || sections.length === 1
      ? 1
      : sections.length <= 8
        ? 2
        : 3
  const rows = Math.ceil(sections.length / columns)
  const gapX = visual ? 0 : mm(14),
    gapY = visual ? 0 : mm(8)
  const cellWidth = (panel.width - gapX * (columns - 1)) / columns
  const cellHeight = (panel.height - gapY * (rows - 1)) / Math.max(1, rows)
  if (pictures && (cellWidth <= 0 || cellHeight <= mm(6)))
    throw new Error("Too many picture sections to fit on one page.")
  const cards = sections.map((section, index) => {
    const box = {
      x: panel.x + (index % columns) * (cellWidth + gapX),
      y: panel.y + Math.floor(index / columns) * (cellHeight + gapY),
      width: cellWidth,
      height: cellHeight,
    }
    const side = section.layout === "picture-left"
    const text = !section.layout || section.layout === "text"
    const caption = visual
      ? {
          x: box.x + box.width * 0.78,
          y: box.y,
          width: box.width * 0.22,
          height: box.height,
        }
      : side
        ? {
            x: box.x + box.width * 0.4,
            y: box.y,
            width: box.width * 0.6,
            height: box.height,
          }
        : {
            x: box.x,
            y: box.y + (text ? 0 : box.height * 0.75),
            width: box.width,
            height: text ? box.height : box.height * 0.25,
          }
    const paddingX = mm(side || visual ? 5 : 3),
      paddingY = mm(side || visual ? 3 : 2)
    const contentBox = {
      x: caption.x + (visual ? mm(1) : paddingX),
      y: caption.y + paddingY,
      width: caption.width - (visual ? mm(1) + paddingX : paddingX * 2),
      height: caption.height - paddingY * 2,
    }
    if (pictures && (contentBox.width <= 0 || contentBox.height <= 0))
      throw new Error("Caption cannot fit its fixed PDF region.")
    const imageBox: Box = visual
      ? {
          x: box.x + mm(4),
          y: box.y + mm(4),
          width: box.width * 0.54 - mm(8),
          height: box.height - mm(8),
        }
      : side
        ? {
            x: box.x + mm(0.75),
            y: box.y + mm(0.75),
            width: box.width * 0.4 - mm(1.5),
            height: box.height - mm(1.5),
          }
        : { ...box, height: box.height * 0.8 }
    return { section, box, caption, contentBox, side, text, imageBox }
  })
  const textSections = (
    scale: number,
    language: BrandingLanguage,
    heading: string,
    body: string,
    width: number,
    label = false
  ) => {
    const headSize = (language === "en" ? 27 : 23) * 0.75 * scale
    const padX = label ? headSize * 0.28 : 0,
      padY = label ? headSize * 0.08 : 0
    const head = heading
      ? textLayout(
          ctx,
          heading,
          language,
          "section",
          Math.max(0.001, width - padX * 2),
          scale
        )
      : undefined
    const content = textLayout(ctx, body, language, "body", width, scale)
    const headHeight = head
      ? head.height + padY * 2 + headSize * (label ? 0.5 : 0.2)
      : 0
    return {
      head,
      content,
      headHeight,
      padX,
      padY,
      height: headHeight + content.height,
      fits:
        (!head || fits(head, width - padX * 2, Infinity)) &&
        fits(content, width, Infinity),
    }
  }
  const layouts = (scale: number) => {
    const title = textLayout(
      ctx,
      input.content.title,
      input.content.languages[0] ?? "en",
      "display",
      titleBox.width,
      scale
    )
    const number = textLayout(
      ctx,
      `${input.number}${input.draft ? " · DRAFT" : ""}`,
      "en",
      "caption",
      numberBox.width,
      scale
    )
    const placeholders = cards.map((card) =>
      pictures && !card.text && !card.section.picture
        ? textLayout(
            ctx,
            "Add picture",
            "en",
            "caption",
            card.imageBox.width,
            scale
          )
        : undefined
    )
    const items = cards.map((card) => {
      const step =
        pictures && !visual && !card.text
          ? textLayout(
              ctx,
              card.section.step,
              card.section.language,
              "subsection",
              card.contentBox.width,
              scale
            )
          : undefined
      const stepWidth = step
        ? Math.max(...step.lines.map((line) => line.width)) +
          15 * 0.75 * scale * 0.4
        : 0
      const width = pictures
        ? card.contentBox.width - stepWidth
        : panel.width - mm(12)
      if (width <= 0) return undefined
      const text = textSections(
        scale,
        card.section.language,
        card.section.heading,
        card.section.body,
        width,
        !pictures
      )
      return {
        ...text,
        step,
        stepWidth,
        width,
        height: Math.max(text.height, step?.height ?? 0),
      }
    })
    const valid =
      fits(title, titleBox.width, titleBox.height) &&
      fits(number, numberBox.width, numberBox.height) &&
      placeholders.every(
        (placeholder, index) =>
          !placeholder ||
          fits(
            placeholder,
            cards[index]!.imageBox.width,
            cards[index]!.imageBox.height
          )
      ) &&
      items.every(
        (item, index) =>
          item?.fits &&
          (!pictures || item.height <= cards[index]!.contentBox.height)
      ) &&
      (pictures ||
        items.reduce((sum, item) => sum + (item?.height ?? Infinity), 0) +
          Math.max(0, items.length - 1) * 15 * 0.75 * scale * 1.5 <=
          panel.height - mm(12))
    return { title, number, items, placeholders, valid }
  }
  const scale = fitScale((scale) => layouts(scale).valid)
  const result = layouts(scale)
  ctx.doc
    .rect(sheet.x, sheet.y, sheet.width, sheet.height)
    .fill(pictures ? CREAM : GREEN)
  drawLogo(
    ctx,
    sheet.x + mm(3),
    sheet.y + mm(7),
    mm(14),
    pictures ? GREEN : CREAM
  )
  drawText(ctx, result.title, titleBox, pictures ? GREEN : CREAM, "right", true)
  drawText(ctx, result.number, numberBox, pictures ? GREEN : CREAM, "right")
  if (!pictures)
    ctx.doc
      .roundedRect(panel.x, panel.y, panel.width, panel.height, mm(10))
      .fill(CREAM)
  let flowY = panel.y + mm(6)
  cards.forEach((card, index) => {
    const item = result.items[index]!
    const { section, box, caption, contentBox, side, text, imageBox } = card
    if (pictures) {
      if (!visual && !side)
        ctx.doc
          .roundedRect(box.x, box.y, box.width, box.height, mm(4))
          .lineWidth(1)
          .stroke(GREEN)
      if (!text) {
        drawPicture(ctx, section.picture, imageBox, visual, visual ? 0 : mm(4))
        const placeholder = result.placeholders[index]
        if (placeholder)
          drawText(ctx, placeholder, imageBox, GREEN, "center", true)
        if (side)
          ctx.doc
            .roundedRect(
              box.x + mm(0.75),
              box.y + mm(0.75),
              box.width * 0.4 - mm(1.5),
              box.height - mm(1.5),
              mm(4)
            )
            .lineWidth(mm(1.5))
            .stroke(GREEN)
      }
      if (!visual)
        ctx.doc
          .roundedRect(
            caption.x,
            caption.y,
            caption.width,
            caption.height,
            mm(side ? 4 : 3)
          )
          .fill(GREEN)
      else {
        const color = section.assessment === "bad" ? "#F51524" : GREEN
        const size = Math.min(box.width * 0.2, box.height * 0.8)
        const x = box.x + box.width * 0.56 + (box.width * 0.2 - size) / 2,
          y = box.y + (box.height - size) / 2
        ctx.doc
          .save()
          .translate(x, y)
          .scale(size / 100)
          .lineWidth(11)
          .lineCap("round")
          .lineJoin("round")
          .roundedRect(7, 7, 86, 86, 23)
          .stroke(color)
          .path(
            section.assessment === "bad"
              ? "M30 29L70 71M70 29L30 71"
              : "M25 52L43 72L76 32"
          )
          .stroke(color)
          .restore()
        if (index)
          ctx.doc
            .moveTo(box.x, box.y)
            .lineTo(box.x + box.width, box.y)
            .lineWidth(mm(1))
            .stroke(GREEN)
      }
    }
    const color = pictures
      ? visual
        ? section.assessment === "bad"
          ? "#F51524"
          : GREEN
        : CREAM
      : BLACK
    const x = pictures ? contentBox.x + item.stepWidth : panel.x + mm(6)
    const y = pictures
      ? contentBox.y + (contentBox.height - item.height) / 2
      : flowY
    if (item.step)
      drawText(
        ctx,
        item.step,
        { x: contentBox.x, y, width: item.stepWidth, height: item.height },
        color,
        "left",
        !side
      )
    if (item.head) {
      if (!pictures)
        ctx.doc
          .roundedRect(
            x,
            y,
            Math.min(
              item.width,
              Math.max(...item.head.lines.map((line) => line.width)) +
                item.padX * 2
            ),
            item.head.height + item.padY * 2,
            (section.language === "en" ? 27 : 23) * 0.75 * scale * 0.4
          )
          .fill(GREEN)
      drawText(
        ctx,
        item.head,
        {
          x: x + item.padX,
          y: y + item.padY,
          width: item.width - item.padX * 2,
          height: item.head.height,
        },
        pictures ? color : CREAM
      )
    }
    drawText(
      ctx,
      item.content,
      {
        x,
        y: y + item.headHeight,
        width: item.width,
        height: item.content.height,
      },
      color
    )
    flowY += item.height + 15 * 0.75 * scale * 1.5
  })
  if (visual)
    ctx.doc
      .roundedRect(
        panel.x + mm(0.5),
        panel.y + mm(0.5),
        panel.width - mm(1),
        panel.height - mm(1),
        mm(7)
      )
      .lineWidth(mm(1))
      .stroke(GREEN)
}
