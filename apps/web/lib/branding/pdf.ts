import PDFDocument from "pdfkit"
import {
  revisionLabel,
  type BrandingContent,
  type BrandingType,
} from "@workspace/db/branding-domain"
import { drawBrandingBook } from "./book-pdf"
import { registerPdfKitBrandFonts } from "./pdfkit-fonts"
import { A4 } from "./pdfkit-layout"
import { drawNotice, drawWorkInstruction, isVisualGuide } from "./poster-pdf"

export type BrandingPdfInput = {
  content: BrandingContent
  number: string
  revision: number
  issuedAt: string
  authorName: string
  type: BrandingType
  draft?: boolean
}

const MAX_PDF_BYTES = 5 * 1024 * 1024

export async function generateBrandingPdf(
  input: BrandingPdfInput
): Promise<Uint8Array> {
  if (input.type === "controlled-document")
    throw new Error("Controlled Documents retain their uploaded PDF.")
  const book = input.type === "sop" || input.type === "policy"
  const doc = new PDFDocument({
    autoFirstPage: false,
    compress: true,
    info: {
      Title: input.content.title,
      Author: input.authorName,
      Subject: `${input.number}${book ? ` · ${revisionLabel(input.revision)}${input.draft ? " · DRAFT" : ""}` : ""}`,
      Creator: "MRM Document Templates",
    },
  })
  // Guard at Readable.push, before PDFKit can accumulate an oversized internal
  // queue while synchronous drawing/end() prevents data events from draining it.
  let produced = doc.readableLength
  const push = doc.push.bind(doc)
  doc.push = (chunk: Uint8Array | string | null, encoding?: BufferEncoding) => {
    if (chunk !== null) {
      produced +=
        typeof chunk === "string"
          ? Buffer.byteLength(chunk, encoding)
          : chunk.byteLength
      if (produced > MAX_PDF_BYTES)
        throw new Error("Generated PDF exceeds the 5 MB limit.")
    }
    return push(chunk, encoding)
  }
  const chunks: Buffer[] = []
  let size = 0
  // Resolve errors as values until the producer is awaited: a drawing exception
  // and a stream error cannot leave a second, unhandled rejected promise.
  const completion = new Promise<{ bytes: Uint8Array } | { error: Error }>(
    (resolve) => {
      doc.on("data", (chunk: Buffer) => {
        size += chunk.length
        if (size > MAX_PDF_BYTES) {
          chunks.length = 0
          doc.destroy(new Error("Generated PDF exceeds the 5 MB limit."))
          return
        }
        chunks.push(chunk)
      })
      doc.once("end", () => resolve({ bytes: Buffer.concat(chunks, size) }))
      doc.once("error", (error: Error) => {
        chunks.length = 0
        resolve({ error })
      })
      doc.once("close", () => {
        if (!doc.readableEnded)
          resolve({ error: new Error("PDF stream closed before completion.") })
      })
    }
  )
  try {
    const fonts = await registerPdfKitBrandFonts(doc)
    const ctx = { doc, fonts }
    if (book) await drawBrandingBook(ctx, input)
    else {
      doc.addPage({
        size: isVisualGuide(input) ? [A4[1], A4[0]] : [...A4],
        margin: 0,
      })
      if (input.type === "notice") await drawNotice(ctx, input)
      else drawWorkInstruction(ctx, input)
    }
    doc.end()
  } catch (error) {
    doc.destroy(error instanceof Error ? error : new Error(String(error)))
    await completion
    throw error
  }
  const result = await completion
  if ("error" in result) throw result.error
  return result.bytes
}
