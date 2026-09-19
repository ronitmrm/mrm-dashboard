import { createRequire } from "node:module"
import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { PDFDict, PDFDocument, PDFName } from "pdf-lib"
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs"
import { generatePdfKitFontProof } from "../lib/branding/pdfkit-font-proof"

const outputRoot = "/tmp/mrm-pdfkit-152"
const pdfPath = path.join(outputRoot, "font-proof.pdf")
const pngPath = path.join(outputRoot, "font-proof-page-1.png")
const textPath = path.join(outputRoot, "font-proof-extracted.txt")
const diagnosticsPath = path.join(outputRoot, "font-proof-diagnostics.json")

type Canvas = {
  getContext(type: "2d"): unknown
  toBuffer(mime: "image/png"): Buffer
}

type CanvasModule = {
  createCanvas(width: number, height: number): Canvas
}

function embeddedFontNames(bytes: Uint8Array) {
  return PDFDocument.load(bytes).then((pdf) => {
    const names = new Set<string>()
    for (const page of pdf.getPages()) {
      const resources = page.node.Resources()
      const fonts = resources?.lookupMaybe(PDFName.of("Font"), PDFDict)
      for (const key of fonts?.keys() ?? []) {
        const font = fonts!.lookup(key, PDFDict)
        const baseFont = font.get(PDFName.of("BaseFont"))
        if (baseFont) names.add(baseFont.toString().replace(/^\//, ""))
      }
    }
    return [...names].sort()
  })
}

function assertNoMissingGlyphs(value: unknown) {
  const parsed = value as {
    text: Record<
      string,
      { missingCodePoints: string[]; notdefGlyphs: number }[]
    >
    bold: Record<
      string,
      { missingCodePoints: string[]; notdefGlyphs: number }[]
    >
  }
  for (const group of [
    ...Object.values(parsed.text),
    ...Object.values(parsed.bold),
  ])
    for (const run of group)
      if (run.missingCodePoints.length || run.notdefGlyphs)
        throw new Error(
          "Font diagnostics found a missing code point or .notdef glyph."
        )
}

function assertInkInsideLayout(
  lineBoxes: Record<
    string,
    { inkTopPt: number; inkBottomPt: number; height: number }
  >
) {
  for (const [name, box] of Object.entries(lineBoxes))
    if (box.inkTopPt < 0 || box.inkBottomPt > box.height)
      throw new Error(`${name} ink exceeds its measured layout bounds.`)
}

async function main() {
  await mkdir(outputRoot, { recursive: true })
  const proof = await generatePdfKitFontProof()
  await writeFile(pdfPath, proof.bytes)
  const fontNames = await embeddedFontNames(proof.bytes)
  const expectedOutfit = [400, 500, 600, 700, 800].map(
    (weight) => `Outfit-${weight}`
  )
  for (const expected of expectedOutfit)
    if (!fontNames.some((name) => name.endsWith(expected)))
      throw new Error(
        `Expected a distinct embedded ${expected} resource; found ${fontNames.join(", ")}.`
      )
  for (const weight of [400, 700] as const)
    if (
      !fontNames.some((name) => name.endsWith(`NotoGujaratiDigits-${weight}`))
    )
      throw new Error(
        `Expected a distinct embedded Noto Gujarati ${weight} resource.`
      )
  if (new Set(Object.values(proof.diagnostics.outfitAdvanceWidths)).size !== 5)
    throw new Error(
      "Outfit variable instances do not have distinct advance widths."
    )
  if (
    new Set(Object.values(proof.diagnostics.gujaratiDigitAdvanceWidths))
      .size !== 2
  )
    throw new Error(
      "Noto Gujarati variable instances do not have distinct advance widths."
    )
  for (const [language, wrapping] of Object.entries(proof.diagnostics.wrapping))
    if (wrapping.unsafeLineStarts.length || wrapping.unsafeLineEnds.length)
      throw new Error(`${language} wrapping split a combining sequence.`)
  assertInkInsideLayout({
    ...proof.diagnostics.lineBoxes,
    hindiWrapping: proof.diagnostics.wrapping.hi,
    gujaratiWrapping: proof.diagnostics.wrapping.gu,
  })
  assertNoMissingGlyphs(proof.diagnostics)

  const task = getDocument({
    data: Uint8Array.from(proof.bytes),
    useSystemFonts: false,
  })
  const pdf = await task.promise
  const extractedPages: string[] = []
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    const page = await pdf.getPage(pageNumber)
    const content = await page.getTextContent()
    extractedPages.push(
      content.items
        .filter((item) => "str" in item)
        .map(({ str }) => str)
        .join(" ")
    )
  }
  const extractedText = extractedPages.join("\n\n")
  if (!extractedText.includes("Machine safety controls"))
    throw new Error("Extracted text is missing the English proof sentence.")
  if (!/\p{Script=Devanagari}/u.test(extractedText))
    throw new Error("Extracted text has no mapped Devanagari characters.")
  if (!/\p{Script=Gujarati}/u.test(extractedText))
    throw new Error("Extracted text has no mapped Gujarati characters.")
  if (!extractedText.includes("૧૨૩૪૫૬૭૮૯૦"))
    throw new Error("Extracted text is missing the Gujarati numeral run.")
  if (extractedText.includes("�"))
    throw new Error("Extracted text contains a replacement glyph.")
  await writeFile(textPath, `${extractedText}\n`)

  const pdfjsRequire = createRequire(
    import.meta.resolve("pdfjs-dist/legacy/build/pdf.mjs")
  )
  const { createCanvas } = pdfjsRequire("@napi-rs/canvas") as CanvasModule
  const firstPage = await pdf.getPage(1)
  const viewport = firstPage.getViewport({ scale: 2 })
  const canvas = createCanvas(
    Math.ceil(viewport.width),
    Math.ceil(viewport.height)
  )
  await firstPage.render({
    canvas: canvas as unknown as HTMLCanvasElement,
    viewport,
  }).promise
  await writeFile(pngPath, canvas.toBuffer("image/png"))

  const diagnostics = {
    ...proof.diagnostics,
    embeddedFontNames: fontNames,
    extractedText,
    extractionOrder:
      extractedText.includes(proof.proofText.hi) &&
      extractedText.includes(proof.proofText.gu)
        ? "logical source order"
        : "PDF.js returns some Indic marks in visual/decomposed order despite ActualText; selectable text is not source-order exact",
    output: { pdfPath, pngPath, textPath },
  }
  await writeFile(diagnosticsPath, `${JSON.stringify(diagnostics, null, 2)}\n`)
  console.log(
    JSON.stringify(
      { ...diagnostics.output, diagnosticsPath, fontNames },
      null,
      2
    )
  )
}

await main()
