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
}

export type BrandingTextLine = {
  runs: BrandingTextRun[]
  width: number
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
}

export type BrandingTextStyle = {
  language: BrandingLanguage
  weight: BrandFontWeight
  sizePt: number
  lineHeight: number
}

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
    const assetRoot = path.join(process.cwd(), "lib/branding/assets")
    const sources = {
      outfit: "Outfit.ttf",
      hind400: "Hind-Regular.ttf",
      hind700: "Hind-Bold.ttf",
      gujarati400: "HindVadodara-Regular.ttf",
      gujarati700: "HindVadodara-Bold.ttf",
      digits: "NotoSansGujarati.ttf",
    } as const
    const entries = await Promise.all(
      Object.entries(sources).map(
        async ([key, file]) =>
          [
            key,
            fontFromBytes(await readFile(path.join(assetRoot, file)), file),
          ] as const
      )
    )
    const sourceFonts = Object.fromEntries(entries) as Record<
      keyof typeof sources,
      Font
    >
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
    const font = fontAlias(
      language,
      weight,
      language === "gu" && gujaratiDigits.test(cluster)
    )
    const previous = runs.at(-1)
    if (previous?.font === font) previous.text += cluster
    else runs.push({ font, text: cluster })
  }
  return runs
}

function measureRuns(
  doc: PDFKit.PDFDocument,
  text: string,
  style: BrandingTextStyle
): BrandingTextRun[] {
  return measureUnshapedRuns(
    doc,
    unmeasuredRuns(text, style.language, style.weight),
    style
  )
}

function measureUnshapedRuns(
  doc: PDFKit.PDFDocument,
  runs: { font: FontAlias; text: string }[],
  style: BrandingTextStyle
) {
  const merged: { font: FontAlias; text: string }[] = []
  for (const run of runs) {
    const previous = merged.at(-1)
    if (previous?.font === run.font) previous.text += run.text
    else merged.push({ ...run })
  }
  return merged.map((run) => {
    doc.font(run.font).fontSize(style.sizePt)
    return { ...run, width: doc.widthOfString(run.text) }
  })
}

function emptyLine(): BrandingTextLine {
  return { runs: [], width: 0, ascentPt: 0, descentPt: 0 }
}

function appendRuns(
  doc: PDFKit.PDFDocument,
  line: BrandingTextLine,
  runs: BrandingTextRun[],
  style: BrandingTextStyle
) {
  line.runs = measureUnshapedRuns(doc, [...line.runs, ...runs], style)
  line.width = line.runs.reduce((sum, run) => sum + run.width, 0)
}

function combinedWidth(
  doc: PDFKit.PDFDocument,
  line: BrandingTextLine,
  runs: BrandingTextRun[],
  style: BrandingTextStyle
) {
  return measureUnshapedRuns(doc, [...line.runs, ...runs], style).reduce(
    (sum, run) => sum + run.width,
    0
  )
}

function splitOversizeToken(
  doc: PDFKit.PDFDocument,
  token: string,
  style: BrandingTextStyle,
  maxWidth: number
) {
  const pieces: BrandingTextRun[][] = []
  let current = ""
  for (const cluster of graphemes(token, style.language)) {
    const candidate = `${current}${cluster}`
    const candidateRuns = measureRuns(doc, candidate, style)
    const candidateWidth = candidateRuns.reduce(
      (sum, run) => sum + run.width,
      0
    )
    if (current && candidateWidth > maxWidth) {
      pieces.push(measureRuns(doc, current, style))
      current = cluster
    } else {
      current = candidate
    }
  }
  if (current) pieces.push(measureRuns(doc, current, style))
  return pieces
}

export function layoutBrandingText(
  doc: PDFKit.PDFDocument,
  fonts: PdfKitBrandFonts,
  text: string,
  style: BrandingTextStyle,
  maxWidth: number
): BrandingTextLayout {
  if (maxWidth <= 0) throw new Error("Text width must be positive.")
  const lines: BrandingTextLine[] = []
  const pushLine = (line: BrandingTextLine) => lines.push(line)
  const paragraphs = text.split("\n")
  for (const paragraph of paragraphs) {
    let line = emptyLine()
    const tokens = [
      ...new Intl.Segmenter(languageTags[style.language], {
        granularity: "word",
      }).segment(paragraph),
    ].map(({ segment }) => segment)
    for (const token of tokens) {
      const whitespace = /^\s+$/u.test(token)
      if (whitespace && !line.runs.length) continue
      const tokenRuns = measureRuns(doc, token, style)
      const tokenWidth = tokenRuns.reduce((sum, run) => sum + run.width, 0)
      if (
        line.runs.length &&
        combinedWidth(doc, line, tokenRuns, style) > maxWidth
      ) {
        pushLine(line)
        line = emptyLine()
        if (whitespace) continue
      }
      if (tokenWidth <= maxWidth) {
        appendRuns(doc, line, tokenRuns, style)
        continue
      }
      for (const piece of splitOversizeToken(doc, token, style, maxWidth)) {
        if (
          line.runs.length &&
          combinedWidth(doc, line, piece, style) > maxWidth
        ) {
          pushLine(line)
          line = emptyLine()
        }
        appendRuns(doc, line, piece, style)
      }
    }
    if (line.runs.length || !paragraph.length) pushLine(line)
  }
  if (!lines.length) lines.push(emptyLine())

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
    const runMetrics = line.runs.map(({ font }) => metricsFor(font))
    line.ascentPt = Math.max(
      primaryMetrics.ascentPt,
      ...runMetrics.map(({ ascentPt }) => ascentPt)
    )
    line.descentPt = Math.max(
      primaryMetrics.descentPt,
      ...runMetrics.map(({ descentPt }) => descentPt)
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
  }
}

export function drawBrandingText(
  doc: PDFKit.PDFDocument,
  layout: BrandingTextLayout,
  x: number,
  y: number,
  color = "#050505"
) {
  for (const [lineIndex, line] of layout.lines.entries()) {
    let cursor = x
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
        })
        .endMarkedContent()
      cursor += run.width
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
