import { readFile } from "node:fs/promises"
import path from "node:path"
import { create, type Font, type FontCollection } from "fontkit"
import type { BrandingLanguage } from "@workspace/db/branding-domain"

export const CSS_PX_TO_PT = 0.75
export const BRAND_BODY_SIZE_PT = 15 * CSS_PX_TO_PT

export type BrandFontWeight = 400 | 500 | 600 | 700 | 800

type FontAlias =
  | `Outfit-${BrandFontWeight}`
  | "Hind-400"
  | "Hind-700"
  | "HindVadodara-400"
  | "HindVadodara-700"
  | "NotoGujaratiDigits-400"
  | "NotoGujaratiDigits-700"

type LoadedBrandFont = {
  alias: FontAlias
  font: Font
  source: string
  weight: BrandFontWeight
}

export type PdfKitBrandFonts = {
  byAlias: ReadonlyMap<FontAlias, LoadedBrandFont>
  outfitAdvanceWidths: Readonly<Record<BrandFontWeight, number>>
  gujaratiDigitAdvanceWidths: Readonly<Record<400 | 700, number>>
}

export type BrandingTextRun = {
  font: FontAlias
  text: string
  width: number
  italic?: boolean
  underline?: boolean
}

export type BrandingTextLine = {
  runs: BrandingTextRun[]
  width: number
  leftInsetPt: number
  ascentPt: number
  descentPt: number
}

export type BrandingTextLayout = {
  lines: BrandingTextLine[]
  lineHeightPt: number
  baselineOffsetPt: number
  inkTopPt: number
  inkBottomPt: number
  height: number
  sizePt: number
  trackingPt: number
}

export type BrandingTextStyle = {
  language: BrandingLanguage
  weight: BrandFontWeight
  sizePt: number
  lineHeight: number
  trackingEm?: number
}

export type BrandingTextSpan = {
  text: string
  bold?: boolean
  italic?: boolean
  underline?: boolean
}

const obliqueDegrees = 14
const obliqueSlope = Math.tan((obliqueDegrees * Math.PI) / 180)

const outfitWeights = [400, 500, 600, 700, 800] as const
const gujaratiDigits = /^[\u0ae6-\u0aef]+$/u
const languageTags = { en: "en", hi: "hi", gu: "gu" } as const

let loadedFonts: Promise<PdfKitBrandFonts> | undefined

function isFont(value: Font | FontCollection): value is Font {
  return "layout" in value
}

function fontFromBytes(bytes: Buffer, source: string) {
  const font = create(bytes)
  if (!isFont(font))
    throw new Error(`${source} unexpectedly contains a font collection.`)
  return font
}

function uniqueVariation(font: Font, family: string, weight: BrandFontWeight) {
  const axis = font.variationAxes.wght
  if (!axis || weight < axis.min || weight > axis.max)
    throw new Error(`${family} does not provide the required ${weight} weight.`)
  const variation = font.getVariation({ wght: weight })
  // PDFKit 0.20.2 otherwise deduplicates variable instances by the shared
  // PostScript name and name/head tables, collapsing every weight to the first.
  Object.defineProperty(variation, "postscriptName", {
    configurable: true,
    value: `${family}-${weight}`,
  })
  return variation
}

function advanceWidth(font: Font, text: string) {
  return font
    .layout(text)
    .positions.reduce((sum, position) => sum + position.xAdvance, 0)
}

export function loadPdfKitBrandFonts() {
  return (loadedFonts ??= (async () => {
    const sources = {
      outfit: "Outfit.ttf",
      hind400: "Hind-Regular.ttf",
      hind700: "Hind-Bold.ttf",
      gujarati400: "HindVadodara-Regular.ttf",
      gujarati700: "HindVadodara-Bold.ttf",
      digits: "NotoSansGujarati.ttf",
    } as const
    // Explicit reads let Next trace only the six runtime fonts, including when
    // the renderer is grouped with server actions outside Branding routes.
    const bytes = await Promise.all([
      readFile(path.join(process.cwd(), "lib/branding/assets/Outfit.ttf")),
      readFile(
        path.join(process.cwd(), "lib/branding/assets/Hind-Regular.ttf")
      ),
      readFile(path.join(process.cwd(), "lib/branding/assets/Hind-Bold.ttf")),
      readFile(
        path.join(process.cwd(), "lib/branding/assets/HindVadodara-Regular.ttf")
      ),
      readFile(
        path.join(process.cwd(), "lib/branding/assets/HindVadodara-Bold.ttf")
      ),
      readFile(
        path.join(process.cwd(), "lib/branding/assets/NotoSansGujarati.ttf")
      ),
    ])
    const sourceFonts = {
      outfit: fontFromBytes(bytes[0], sources.outfit),
      hind400: fontFromBytes(bytes[1], sources.hind400),
      hind700: fontFromBytes(bytes[2], sources.hind700),
      gujarati400: fontFromBytes(bytes[3], sources.gujarati400),
      gujarati700: fontFromBytes(bytes[4], sources.gujarati700),
      digits: fontFromBytes(bytes[5], sources.digits),
    }
    const loaded: LoadedBrandFont[] = outfitWeights.map((weight) => ({
      alias: `Outfit-${weight}`,
      font: uniqueVariation(sourceFonts.outfit, "Outfit", weight),
      source: sources.outfit,
      weight,
    }))
    loaded.push(
      {
        alias: "Hind-400",
        font: sourceFonts.hind400,
        source: sources.hind400,
        weight: 400,
      },
      {
        alias: "Hind-700",
        font: sourceFonts.hind700,
        source: sources.hind700,
        weight: 700,
      },
      {
        alias: "HindVadodara-400",
        font: sourceFonts.gujarati400,
        source: sources.gujarati400,
        weight: 400,
      },
      {
        alias: "HindVadodara-700",
        font: sourceFonts.gujarati700,
        source: sources.gujarati700,
        weight: 700,
      },
      {
        alias: "NotoGujaratiDigits-400",
        font: uniqueVariation(sourceFonts.digits, "NotoGujaratiDigits", 400),
        source: sources.digits,
        weight: 400,
      },
      {
        alias: "NotoGujaratiDigits-700",
        font: uniqueVariation(sourceFonts.digits, "NotoGujaratiDigits", 700),
        source: sources.digits,
        weight: 700,
      }
    )
    const byAlias = new Map(loaded.map((entry) => [entry.alias, entry]))
    const outfitAdvanceWidths = Object.fromEntries(
      outfitWeights.map((weight) => [
        weight,
        advanceWidth(byAlias.get(`Outfit-${weight}`)!.font, "NOTICE"),
      ])
    ) as Record<BrandFontWeight, number>
    if (
      new Set(Object.values(outfitAdvanceWidths)).size !== outfitWeights.length
    )
      throw new Error(
        "Outfit variable weights did not produce distinct metrics."
      )
    const gujaratiDigitAdvanceWidths = Object.fromEntries(
      ([400, 700] as const).map((weight) => [
        weight,
        advanceWidth(
          byAlias.get(`NotoGujaratiDigits-${weight}`)!.font,
          "૧૨૩૪૫૬૭૮૯૦"
        ),
      ])
    ) as Record<400 | 700, number>
    if (gujaratiDigitAdvanceWidths[400] === gujaratiDigitAdvanceWidths[700])
      throw new Error(
        "Noto Gujarati variable weights did not produce distinct metrics."
      )
    return { byAlias, outfitAdvanceWidths, gujaratiDigitAdvanceWidths }
  })())
}

export async function registerPdfKitBrandFonts(doc: PDFKit.PDFDocument) {
  const fonts = await loadPdfKitBrandFonts()
  for (const { alias, font } of fonts.byAlias.values())
    // PDFKit 0.20 accepts parsed Fontkit fonts; @types/pdfkit has not yet added
    // that documented 0.20 overload.
    doc.registerFont(alias, font as unknown as Uint8Array)
  return fonts
}

function fontAlias(
  language: BrandingLanguage,
  weight: BrandFontWeight,
  digit = false
): FontAlias {
  if (language === "en") return `Outfit-${weight}`
  const localWeight = weight >= 600 ? 700 : 400
  if (language === "hi") return `Hind-${localWeight}`
  if (digit) return `NotoGujaratiDigits-${localWeight}`
  return `HindVadodara-${localWeight}`
}

function clusterFont(
  cluster: string,
  language: BrandingLanguage,
  weight: BrandFontWeight
) {
  const script = /[\p{Script=Gujarati}]/u.test(cluster)
    ? "gu"
    : /[\p{Script=Devanagari}]/u.test(cluster)
      ? "hi"
      : language
  return fontAlias(
    script,
    weight,
    script === "gu" && gujaratiDigits.test(cluster)
  )
}

function graphemes(text: string, language: BrandingLanguage) {
  return [
    ...new Intl.Segmenter(languageTags[language], {
      granularity: "grapheme",
    }).segment(text),
  ].map(({ segment }) => segment)
}

function unmeasuredRuns(
  text: string,
  language: BrandingLanguage,
  weight: BrandFontWeight
) {
  const runs: { font: FontAlias; text: string }[] = []
  for (const cluster of graphemes(text, language)) {
    const font = clusterFont(cluster, language, weight)
    const previous = runs.at(-1)
    if (previous?.font === font) previous.text += cluster
    else runs.push({ font, text: cluster })
  }
  return runs
}

/** Resolve emphasis only at grapheme boundaries, including marks crossing a cluster. */
function styledRuns(
  text: string | BrandingTextSpan[],
  style: BrandingTextStyle
) {
  const spans = typeof text === "string" ? [{ text }] : text
  const source = spans.map((span) => span.text).join("")
  let offset = 0
  const ends = spans.map((span) => (offset += span.text.length))
  let position = 0
  let spanIndex = 0
  const runs: Omit<BrandingTextRun, "width">[] = []
  for (const cluster of graphemes(source, style.language)) {
    while (spanIndex < ends.length - 1 && position >= ends[spanIndex]!)
      spanIndex++
    const weight = spans[spanIndex]?.bold ? 700 : style.weight
    const font = clusterFont(cluster, style.language, weight)
    const italic = !!spans[spanIndex]?.italic
    const underline = !!spans[spanIndex]?.underline
    const previous = runs.at(-1)
    if (
      previous?.font === font &&
      previous.italic === italic &&
      previous.underline === underline
    )
      previous.text += cluster
    else runs.push({ font, text: cluster, italic, underline })
    position += cluster.length
  }
  return runs
}

export function layoutBrandingText(
  doc: PDFKit.PDFDocument,
  fonts: PdfKitBrandFonts,
  text: string | BrandingTextSpan[],
  style: BrandingTextStyle,
  maxWidth: number
): BrandingTextLayout {
  if (!(maxWidth > 0) || !Number.isFinite(maxWidth))
    throw new Error("Text width must be positive.")
  const trackingPt = (style.trackingEm ?? 0) * style.sizePt
  const features: PDFKit.Mixins.TextOptions["features"] = trackingPt
    ? []
    : undefined
  const sourceRuns = styledRuns(text, style)
  const source = sourceRuns.map((run) => run.text).join("")
  // Shape the exact final runs for each candidate line. Never add independently
  // measured graphemes and then reshape that sum when drawing.
  const measure = (start: number, end: number): BrandingTextLine => {
    let offset = 0
    const runs: BrandingTextRun[] = []
    for (const run of sourceRuns) {
      const from = Math.max(0, start - offset)
      const to = Math.min(run.text.length, end - offset)
      if (to > from) {
        const value = run.text.slice(from, to)
        doc.font(run.font).fontSize(style.sizePt)
        const count = trackingPt
          ? fonts.byAlias.get(run.font)!.font.layout(value, features).glyphs
              .length
          : 0
        const width =
          doc.widthOfString(value, { features }) +
          trackingPt * Math.max(0, count - 1)
        runs.push({ ...run, text: value, width })
      }
      offset += run.text.length
      if (offset >= end) break
    }
    let advance = 0
    let left = 0
    let right = 0
    for (const [index, run] of runs.entries()) {
      const font = fonts.byAlias.get(run.font)!.font
      const shear = run.italic
        ? (obliqueSlope * style.sizePt) / font.unitsPerEm
        : 0
      left = Math.min(left, advance - Math.abs(font.descent) * shear)
      right = Math.max(right, advance + run.width + font.ascent * shear)
      advance += run.width + (index < runs.length - 1 ? trackingPt : 0)
    }
    return {
      runs,
      width: right - left,
      leftInsetPt: -left,
      ascentPt: 0,
      descentPt: 0,
    }
  }
  const lines: BrandingTextLine[] = []
  let paragraphOffset = 0
  for (const paragraph of source.split("\n")) {
    let lineStart = paragraphOffset
    let lineEnd = lineStart
    const trimEnd = (end: number) => {
      while (end > lineStart && /\s/u.test(source[end - 1]!)) end--
      return end
    }
    const push = () => {
      lines.push(measure(lineStart, trimEnd(lineEnd)))
      lineStart = lineEnd
    }
    for (const { segment, index } of new Intl.Segmenter(style.language, {
      granularity: "word",
    }).segment(paragraph)) {
      const tokenStart = paragraphOffset + index
      const tokenEnd = tokenStart + segment.length
      if (/^\s+$/u.test(segment)) {
        if (lineEnd > lineStart) lineEnd = tokenEnd
        else lineStart = lineEnd = tokenEnd
        continue
      }
      if (
        lineEnd > lineStart &&
        measure(lineStart, tokenEnd).width > maxWidth
      ) {
        push()
        lineStart = lineEnd = tokenStart
      }
      if (measure(tokenStart, tokenEnd).width <= maxWidth) {
        lineEnd = tokenEnd
        continue
      }
      let clusterOffset = tokenStart
      for (const cluster of graphemes(segment, style.language)) {
        const end = clusterOffset + cluster.length
        if (lineEnd > lineStart && measure(lineStart, end).width > maxWidth)
          push()
        lineEnd = end
        clusterOffset = end
      }
    }
    if (lineEnd > lineStart || !paragraph.length) push()
    paragraphOffset += paragraph.length + 1
  }
  if (!lines.length) lines.push(measure(0, 0))

  const lineHeightPt = style.sizePt * style.lineHeight
  const metricsFor = (alias: FontAlias) => {
    const font = fonts.byAlias.get(alias)?.font
    if (!font) throw new Error(`Font ${alias} was not loaded.`)
    const scale = style.sizePt / font.unitsPerEm
    return {
      ascentPt: font.ascent * scale,
      descentPt: Math.abs(font.descent) * scale,
    }
  }
  const primaryMetrics = metricsFor(fontAlias(style.language, style.weight))
  for (const line of lines) {
    for (const run of line.runs) {
      const shaped = fonts.byAlias
        .get(run.font)!
        .font.layout(run.text, features)
      const missing = shaped.glyphs.filter((glyph) => glyph.id === 0)
      if (missing.length) {
        const characters = [
          ...new Set(missing.flatMap((glyph) => glyph.codePoints)),
        ]
          .map((point) => `U+${point.toString(16).toUpperCase()}`)
          .join(", ")
        throw new Error(
          `Unsupported character for font ${run.font}: ${characters || "unmapped glyph"}.`
        )
      }
    }
    const runMetrics = line.runs.map(({ font }) => metricsFor(font))
    line.ascentPt = Math.max(
      primaryMetrics.ascentPt,
      ...runMetrics.map(({ ascentPt }) => ascentPt)
    )
    line.descentPt = Math.max(
      primaryMetrics.descentPt,
      ...runMetrics.map(({ descentPt }) => descentPt),
      line.runs.some((run) => run.underline) ? style.sizePt * 0.125 : 0
    )
  }
  const primaryInkHeight = primaryMetrics.ascentPt + primaryMetrics.descentPt
  const nominalBaselineOffset =
    (lineHeightPt - primaryInkHeight) / 2 + primaryMetrics.ascentPt
  const inkTop = Math.min(
    ...lines.map(
      (line, index) =>
        nominalBaselineOffset + index * lineHeightPt - line.ascentPt
    )
  )
  const inkBottom = Math.max(
    ...lines.map(
      (line, index) =>
        nominalBaselineOffset + index * lineHeightPt + line.descentPt
    )
  )
  const boundsTop = Math.min(0, inkTop)
  const boundsBottom = Math.max(lines.length * lineHeightPt, inkBottom)
  const baselineOffsetPt = nominalBaselineOffset - boundsTop
  return {
    lines,
    lineHeightPt,
    baselineOffsetPt,
    inkTopPt: inkTop - boundsTop,
    inkBottomPt: inkBottom - boundsTop,
    height: boundsBottom - boundsTop,
    sizePt: style.sizePt,
    trackingPt,
  }
}

export function drawBrandingText(
  doc: PDFKit.PDFDocument,
  layout: BrandingTextLayout,
  x: number,
  y: number,
  color = "#050505",
  align: "left" | "center" | "right" = "left",
  width = 0
) {
  for (const [lineIndex, line] of layout.lines.entries()) {
    let cursor =
      x +
      line.leftInsetPt +
      (align === "center"
        ? (width - line.width) / 2
        : align === "right"
          ? width - line.width
          : 0)
    const baselineY = brandingLineBaselineY(layout, y, lineIndex)
    for (const run of line.runs) {
      doc
        .markContent("Span", { actual: run.text })
        .font(run.font)
        .fontSize(layout.sizePt)
        .fillColor(color)
        .text(run.text, cursor, baselineY, {
          baseline: "alphabetic",
          lineBreak: false,
          characterSpacing: layout.trackingPt,
          features: layout.trackingPt ? [] : undefined,
          oblique: run.italic ? obliqueDegrees : false,
        })
        .endMarkedContent()
      if (run.underline) {
        const underlineY = baselineY + layout.sizePt * 0.1
        doc
          .save()
          .strokeColor(color)
          .lineWidth(layout.sizePt * 0.05)
          .moveTo(cursor, underlineY)
          .lineTo(cursor + run.width, underlineY)
          .stroke()
          .restore()
      }
      cursor += run.width + layout.trackingPt
    }
  }
  return y + layout.height
}

export function brandingLineBaselineY(
  layout: BrandingTextLayout,
  y: number,
  lineIndex: number
) {
  return y + layout.baselineOffsetPt + lineIndex * layout.lineHeightPt
}

export async function inspectBrandingText(
  text: string,
  language: BrandingLanguage,
  weight: BrandFontWeight
) {
  const fonts = await loadPdfKitBrandFonts()
  const runs = unmeasuredRuns(text, language, weight)
  return runs.map(({ font: alias, text: runText }) => {
    const font = fonts.byAlias.get(alias)!.font
    const layout = font.layout(runText)
    return {
      alias,
      text: runText,
      codePoints: [...runText].length,
      glyphs: layout.glyphs.length,
      missingCodePoints: [...runText]
        .filter(
          (character) => !font.hasGlyphForCodePoint(character.codePointAt(0)!)
        )
        .map(
          (character) =>
            `U+${character.codePointAt(0)!.toString(16).toUpperCase()}`
        ),
      notdefGlyphs: layout.glyphs.filter(({ id }) => id === 0).length,
      positionedGlyphs: layout.positions.filter(
        ({ xOffset, yOffset, yAdvance }) => xOffset || yOffset || yAdvance
      ).length,
    }
  })
}
