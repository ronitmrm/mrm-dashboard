import PDFDocument from "pdfkit"
import {
  BRAND_BODY_SIZE_PT,
  CSS_PX_TO_PT,
  brandingLineBaselineY,
  drawBrandingText,
  inspectBrandingText,
  layoutBrandingText,
  registerPdfKitBrandFonts,
  type BrandingTextLayout,
  type BrandingTextStyle,
  type PdfKitBrandFonts,
} from "./pdfkit-fonts"
import type { BrandingLanguage } from "@workspace/db/branding-domain"

const green = "#006A49"
const black = "#050505"
const cream = "#F7F7F2"

const proofText = {
  en: "Machine safety controls stay selectable while this approved 11.25 pt body sentence wraps cleanly without losing content.",
  hi: "क्षेत्र में मशीन शुरू करने से पहले सुरक्षा, प्रगति और दृष्टि की जाँच करें। श्रमिक निर्देश स्पष्ट रखें।",
  gu: "ક્ષેત્રમાં મશીન શરૂ કરતાં પહેલાં શ્રમિક સુરક્ષા અને દૃષ્ટિ તપાસો. પગલાં ૧૨૩૪૫૬૭૮૯૦ પૂર્ણ કરો.",
} as const

function collectPdfBytes(doc: PDFKit.PDFDocument) {
  return new Promise<Uint8Array>((resolve, reject) => {
    const chunks: Buffer[] = []
    doc.on("data", (chunk: Buffer) => chunks.push(chunk))
    doc.once("error", reject)
    doc.once("end", () => resolve(Buffer.concat(chunks)))
  })
}

function drawLayout(
  doc: PDFKit.PDFDocument,
  fonts: PdfKitBrandFonts,
  text: string,
  style: BrandingTextStyle,
  x: number,
  y: number,
  width: number,
  color = black
) {
  const layout = layoutBrandingText(doc, fonts, text, style, width)
  return { layout, bottom: drawBrandingText(doc, layout, x, y, color) }
}

function wrappingDiagnostics(layout: BrandingTextLayout) {
  const lines = layout.lines.map((line) =>
    line.runs.map(({ text }) => text).join("")
  )
  return {
    lines,
    unsafeLineStarts: lines.filter((line) => /^\p{Mark}/u.test(line)),
    unsafeLineEnds: lines.filter((line) => /[\u094d\u0acd]$/u.test(line)),
    ...lineBoxDiagnostics(layout),
  }
}

function lineBoxDiagnostics(layout: BrandingTextLayout) {
  return {
    lineHeightPt: layout.lineHeightPt,
    baselineOffsetPt: layout.baselineOffsetPt,
    inkTopPt: layout.inkTopPt,
    inkBottomPt: layout.inkBottomPt,
    height: layout.height,
  }
}

export async function generatePdfKitFontProof() {
  const doc = new PDFDocument({
    autoFirstPage: false,
    compress: true,
    fontLayoutCache: false,
    info: {
      Title: "MRM PDFKit actual-font proof",
      Author: "MRM PDF migration verification",
      Subject: "Outfit, Hind, Hind Vadodara and Gujarati numeral fallback",
    },
    margin: 0,
    size: "A4",
  })
  const output = collectPdfBytes(doc)
  const fonts = await registerPdfKitBrandFonts(doc)
  doc.addPage({ margin: 0, size: "A4" })
  const pageWidth = doc.page.width
  const margin = 36
  const contentWidth = pageWidth - margin * 2

  doc.rect(0, 0, pageWidth, 67).fill(green)
  const display = drawLayout(
    doc,
    fonts,
    "PDFKit actual-font proof",
    { language: "en", weight: 800, sizePt: 30, lineHeight: 1.1 },
    margin,
    18,
    contentWidth,
    cream
  )

  let y = 84
  doc
    .font("Outfit-600")
    .fontSize(9)
    .fillColor(green)
    .text("OUTFIT VARIABLE WEIGHTS — ONE PDF", margin, y)
  y += 16
  for (const weight of [400, 500, 600, 700, 800] as const) {
    doc
      .font(`Outfit-${weight}`)
      .fontSize(14)
      .fillColor(black)
      .text(`${weight}  NOTICE Machine control`, margin, y, {
        lineBreak: false,
      })
    y += 20
  }

  const english = drawLayout(
    doc,
    fonts,
    proofText.en,
    {
      language: "en",
      weight: 400,
      sizePt: BRAND_BODY_SIZE_PT,
      lineHeight: 1.68,
    },
    margin,
    y + 6,
    contentWidth
  )
  const englishBold = drawLayout(
    doc,
    fonts,
    "Real Outfit 700 bold: stop and report an unsafe condition.",
    {
      language: "en",
      weight: 700,
      sizePt: BRAND_BODY_SIZE_PT,
      lineHeight: 1.68,
    },
    margin,
    english.bottom + 2,
    contentWidth
  )

  const gap = 18
  const columnWidth = (contentWidth - gap) / 2
  const columnsY = englishBold.bottom + 20
  doc
    .roundedRect(margin, columnsY, columnWidth, 238, 8)
    .fillAndStroke(cream, green)
  doc
    .roundedRect(margin + columnWidth + gap, columnsY, columnWidth, 238, 8)
    .fillAndStroke(cream, green)

  const panelX = [margin + 12, margin + columnWidth + gap + 12]
  const panelWidth = columnWidth - 24
  const headingSize = 23 * CSS_PX_TO_PT
  const hindiHeading = drawLayout(
    doc,
    fonts,
    "हिंदी — संयुक्त अक्षर और मात्राएँ",
    { language: "hi", weight: 700, sizePt: headingSize, lineHeight: 1.35 },
    panelX[0]!,
    columnsY + 14,
    panelWidth,
    green
  )
  const hindiBody = drawLayout(
    doc,
    fonts,
    proofText.hi,
    {
      language: "hi",
      weight: 400,
      sizePt: BRAND_BODY_SIZE_PT,
      lineHeight: 1.6,
    },
    panelX[0]!,
    hindiHeading.bottom + 8,
    panelWidth
  )
  drawLayout(
    doc,
    fonts,
    "सही बोल्ड: क्षेत्र, श्रमिक, दृष्टि",
    {
      language: "hi",
      weight: 700,
      sizePt: BRAND_BODY_SIZE_PT,
      lineHeight: 1.6,
    },
    panelX[0]!,
    hindiBody.bottom + 8,
    panelWidth
  )

  const gujaratiHeading = drawLayout(
    doc,
    fonts,
    "ગુજરાતી — સંયુક્ત અક્ષર અને માત્રા",
    { language: "gu", weight: 700, sizePt: headingSize, lineHeight: 1.35 },
    panelX[1]!,
    columnsY + 14,
    panelWidth,
    green
  )
  const gujaratiBody = drawLayout(
    doc,
    fonts,
    proofText.gu,
    {
      language: "gu",
      weight: 400,
      sizePt: BRAND_BODY_SIZE_PT,
      lineHeight: 1.6,
    },
    panelX[1]!,
    gujaratiHeading.bottom + 8,
    panelWidth
  )
  const gujaratiBoldY = gujaratiBody.bottom + 8
  const gujaratiBoldLayout = layoutBrandingText(
    doc,
    fonts,
    "બોલ્ડ ૧૨૩૪૫૬૭૮૯૦ એકસરખી આધારરેખા",
    {
      language: "gu",
      weight: 700,
      sizePt: BRAND_BODY_SIZE_PT,
      lineHeight: 1.6,
    },
    panelWidth
  )
  const baselineY = brandingLineBaselineY(gujaratiBoldLayout, gujaratiBoldY, 0)
  doc
    .save()
    .strokeColor("#D2644A")
    .lineWidth(0.55)
    .moveTo(panelX[1]!, baselineY)
    .lineTo(panelX[1]! + panelWidth, baselineY)
    .stroke()
    .restore()
  drawBrandingText(doc, gujaratiBoldLayout, panelX[1]!, gujaratiBoldY)

  doc
    .font("Outfit-500")
    .fontSize(9.75)
    .fillColor(green)
    .text(
      "Body: 15 CSS px × 0.75 = 11.25 pt · red guide = common alphabetic baseline · selectable text",
      margin,
      columnsY + 257,
      { width: contentWidth, align: "center" }
    )

  const diagnostics = {
    bodySizePt: BRAND_BODY_SIZE_PT,
    outfitAdvanceWidths: fonts.outfitAdvanceWidths,
    gujaratiDigitAdvanceWidths: fonts.gujaratiDigitAdvanceWidths,
    wrapping: {
      hi: wrappingDiagnostics(hindiBody.layout),
      gu: wrappingDiagnostics(gujaratiBody.layout),
    },
    lineBoxes: {
      display: lineBoxDiagnostics(display.layout),
      gujaratiMixed: lineBoxDiagnostics(gujaratiBoldLayout),
    },
    text: Object.fromEntries(
      await Promise.all(
        (Object.entries(proofText) as [BrandingLanguage, string][]).map(
          async ([language, text]) => [
            language,
            await inspectBrandingText(text, language, 400),
          ]
        )
      )
    ),
    bold: {
      en: await inspectBrandingText("Real Outfit 700 bold", "en", 700),
      hi: await inspectBrandingText("क्षेत्र श्रमिक दृष्टि", "hi", 700),
      gu: await inspectBrandingText("શ્રમિક દૃષ્ટિ ૧૨૩૪૫૬૭૮૯૦", "gu", 700),
    },
  }
  doc.end()
  return { bytes: await output, diagnostics, proofText }
}
