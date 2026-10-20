import { readFile } from "node:fs/promises"
import path from "node:path"
import PDFDocument from "pdfkit"

export const LETTER_WIDTH = 595.5
export const LETTER_HEIGHT = 842.25
export const LETTER_LEFT = 59.55
export const LETTER_BODY_WIDTH = LETTER_WIDTH - LETTER_LEFT * 2
export const LETTER_GREEN = "#006B4A"

export async function createEmploymentLetterPdf(
  type: "offer" | "appointment",
  employeeName: string
) {
  const [regular, medium, title, header, footer] = await Promise.all([
    readFile(path.join(process.cwd(), "lib/pricing/assets/Outfit-Regular.ttf")),
    readFile(path.join(process.cwd(), "lib/pricing/assets/Outfit-Medium.ttf")),
    readFile(path.join(process.cwd(), `lib/hr/assets/${type}-title.ttf`)),
    readFile(path.join(process.cwd(), "lib/hr/assets/offer-header.png")),
    readFile(path.join(process.cwd(), "lib/hr/assets/offer-footer.png")),
  ])
  const doc = new PDFDocument({
    autoFirstPage: false,
    size: [LETTER_WIDTH, LETTER_HEIGHT],
    margins: { top: 0, bottom: 0, left: 0, right: 0 },
    info: {
      Title: `${employeeName} ${type === "offer" ? "Offer" : "Appointment"} Letter`,
      Subject: `${type} employment letter`,
      Creator: "MRM Dashboard",
      Producer: "MRM Dashboard",
    },
  })
  doc.registerFont("regular", regular)
  doc.registerFont("medium", medium)
  doc.registerFont("title", title)
  const chunks: Buffer[] = []
  const result = new Promise<Uint8Array>((resolve, reject) => {
    doc.on("data", (chunk: Buffer) => chunks.push(chunk))
    doc.on("end", () => resolve(new Uint8Array(Buffer.concat(chunks))))
    doc.on("error", reject)
  })
  function addPage() {
    doc.addPage()
    doc.image(header, 38.7, 23.5, { width: 521.1, height: 69.1 })
    doc.image(footer, 38.7, 737.1, { width: 524, height: 89.4 })
  }
  async function finish() {
    doc.end()
    return result
  }
  return { doc, addPage, finish }
}
