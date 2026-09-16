import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRef } from "pdf-lib"
import type { Page } from "puppeteer-core"
import {
  brandingOutline,
  brandingRichTextHtml,
  plainBrandingRichText,
  revisionLabel,
} from "@workspace/db/branding-domain"
import type { BrandingPdfInput } from "./pdf"
import { brandTypography, typeStyle } from "./typography"

const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ]!
  )

export function brandingBookHtml(
  input: BrandingPdfInput,
  fonts: string,
  logo: string,
  wordmark: string
) {
  const styles = `${fonts}
${brandTypography}
    *{box-sizing:border-box}body{margin:0;color:#050505;background:white;overflow-wrap:anywhere}
    h1,h2,h3,h4{break-after:avoid;margin:8mm 0 4mm;color:#006A49}
    h2,h3,h4{color:#050505;margin-top:5mm}article>h1:first-child{margin-top:0}
    p{margin:0 0 4mm;white-space:pre-wrap;orphans:3;widows:3}
    ul,ol{padding-left:8mm;margin:2mm 0 5mm}ul{list-style-type:disc}ol{list-style-type:decimal}
    li>p{margin-bottom:0}ol>li{margin-bottom:3mm}li>ul,li>ol{margin-top:3mm;margin-bottom:0;padding-left:6mm}
    li>p:has(+ul),li>p:has(+ol){break-after:avoid}.new-page{break-before:page}
    .cover{position:fixed;inset:12.7mm;background:#006A49;padding:5mm}
    .cover-panel{height:100%;border-radius:9mm;background:#F7F7F2;color:#006A49;padding:10mm;display:flex;flex-direction:column;align-items:center}
    .cover-logo{width:84mm;max-width:100%;margin:0 0 40mm;flex-shrink:0}
    .cover h1{text-align:center;margin:0;width:100%;flex-shrink:0;${typeStyle("display")}}
    .cover-footer{margin-top:auto;display:flex;justify-content:space-between;width:100%;gap:6mm;${typeStyle("caption")}}
    .cover-draft{${typeStyle("caption")}margin-top:5mm}
    .details h1{${typeStyle("display")}margin:0 0 12mm}.introduction{${typeStyle("lede")}}
    .meta{margin:7mm 0 15mm}.meta p{margin:1mm 0}
    .meta,.attributions td{font-family:'Outfit','Hind','Hind Vadodara','Gujarati numerals',sans-serif;${typeStyle("caption")}}
    .meta p,.meta strong{font-weight:inherit}
    .attributions,.index{width:100%;border-collapse:collapse}
    .attributions th,.attributions td,.index th,.index td{border:.5pt solid #050505;padding:3mm;text-align:left;vertical-align:top}
    .attributions{text-align:center;table-layout:fixed}.attributions th,.attributions td{text-align:center}
    .attributions th{color:#006A49;${typeStyle("subsection")}}
    .index-title{text-align:center;margin:12mm 0 4mm!important}
    .index th{${typeStyle("subsection")}}.index td{height:10mm;vertical-align:middle}
    .index thead{display:table-header-group}.index tr,.attributions tr{break-inside:avoid}
    .index th:first-child,.index td:first-child{width:17mm;text-align:center}
    .index th:last-child,.index td:last-child{width:23mm;text-align:center}
    [lang=hi] .cover h1,[lang=gu] .cover h1,[lang=hi] .details h1,[lang=gu] .details h1{${typeStyle("localHeading")}}
    [lang=hi] .introduction,[lang=gu] .introduction{${typeStyle("localBody")}}
  `
  const header = (title: string, language = "en") =>
    `<style>${fonts}</style><div style="margin:0 12.7mm;display:flex;align-items:center;gap:6px;color:#006A49;${typeStyle(language === "en" ? "subsection" : "localHeading")}"><div style="flex-shrink:0">${logo}</div><div style="overflow-wrap:anywhere">${escape(title)}${input.draft ? " · DRAFT" : ""}</div></div>`
  const footer = `<style>${fonts}</style><div style="margin:0 12.7mm;border-top:1pt solid #050505;padding-top:3mm;color:#050505;${typeStyle("caption")}font-family:Outfit;padding-right:12mm">Doc. No.: ${escape(input.number)} | Rev. No.: ${revisionLabel(input.revision)} | Effective Date: ${escape(input.content.effectiveDate || "Pending")}</div>`
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>${styles}</style></head><body></body></html>`
  return {
    html,
    header: header(input.content.title),
    footer,
    bookHeader: header,
    wordmark,
  }
}

/** Chromium outlines resolve headings to actual printed pages, including list wrapping. */
function headingPages(pdf: PDFDocument) {
  const pages = new Map(
    pdf.getPages().map((page, index) => [page.ref.toString(), index])
  )
  const result: number[] = []
  const visit = (item: PDFDict | undefined) => {
    while (item) {
      const destination = item.lookupMaybe(PDFName.of("Dest"), PDFArray)
      const ref = destination?.get(0)
      const page = ref instanceof PDFRef ? pages.get(ref.toString()) : undefined
      if (page === undefined)
        throw new Error("Could not resolve a heading's PDF page.")
      result.push(page)
      visit(item.lookupMaybe(PDFName.of("First"), PDFDict))
      item = item.lookupMaybe(PDFName.of("Next"), PDFDict)
    }
  }
  visit(
    pdf.catalog
      .lookupMaybe(PDFName.of("Outlines"), PDFDict)
      ?.lookupMaybe(PDFName.of("First"), PDFDict)
  )
  return result
}

export async function generateBrandingBookPdf(
  page: Page,
  input: BrandingPdfInput,
  template: ReturnType<typeof brandingBookHtml>
) {
  const output = await PDFDocument.create()
  const numbers = new Map<number, number>()
  const append = async (document: PDFDocument, firstNumber?: number) => {
    for (const [index, embedded] of (
      await output.embedPages(document.getPages())
    ).entries()) {
      if (firstNumber !== undefined)
        numbers.set(output.getPageCount(), firstNumber + index)
      output.addPage([embedded.width, embedded.height]).drawPage(embedded)
    }
  }
  for (const translation of input.content.translations) {
    const render = async (
      body: string,
      cover = false,
      outline = false,
      detailsPage = false
    ) => {
      await page.setContent(
        template.html.replace(
          "<body></body>",
          () =>
            `<body><article lang="${translation.language}">${body}</article></body>`
        ),
        { waitUntil: "load" }
      )
      return PDFDocument.load(
        await page.pdf({
          format: "A4",
          printBackground: true,
          waitForFonts: true,
          tagged: outline,
          outline,
          displayHeaderFooter: false,
          omitBackground: true,
          margin: cover
            ? { top: 0, bottom: 0, left: 0, right: 0 }
            : {
                top: detailsPage ? "12.7mm" : "30mm",
                bottom: "25mm",
                left: "12.7mm",
                right: "12.7mm",
              },
          timeout: 30000,
        })
      )
    }
    const cover = await render(
      `<div class="cover"><div class="cover-panel"><div class="cover-logo">${template.wordmark}</div><h1>${escape(translation.title)}</h1>${input.draft ? '<p class="cover-draft">DRAFT</p>' : ""}<div class="cover-footer"><span>${escape(input.number)}</span><span>Rev No. ${revisionLabel(input.revision)}</span><span>${escape(input.content.effectiveDate || "Date pending")}</span></div></div></div>`,
      true
    )
    if (cover.getPageCount() !== 1)
      throw new Error(
        "Cover title is too long for one page. Shorten the title."
      )
    const details = translation.details
    const attributions =
      details?.attributions.filter(
        (entry) => entry.name || entry.designation
      ) ?? []
    const detailsPdf = await render(
      `<div class="details"><h1>${escape(translation.title)}</h1><div class="introduction">${details ? brandingRichTextHtml(details.introduction) : ""}</div><div class="meta"><p><strong>Document No.:</strong> ${escape(input.number)}</p><p><strong>Revision:</strong> ${revisionLabel(input.revision)}</p><p><strong>Effective Date:</strong> ${escape(input.content.effectiveDate || "Pending")}</p><p><strong>Prepared by:</strong> ${escape(details?.preparedBy || input.content.department)}</p></div>${attributions.length ? `<table class="attributions"><thead><tr>${attributions.map((entry) => `<th>${escape(entry.role)}</th>`).join("")}</tr></thead><tbody><tr>${attributions.map((entry) => `<td>${escape(entry.name)}</td>`).join("")}</tr><tr>${attributions.map(() => "<th>Designation</th>").join("")}</tr><tr>${attributions.map((entry) => `<td>${escape(entry.designation)}</td>`).join("")}</tr></tbody></table>` : ""}</div>`,
      false,
      false,
      true
    )
    // Render the frame once as normal page content. Chromium's repeated PDF calls
    // can omit web-font header/footer templates on the first page of a segment.
    const frame = await render(
      `<style>body{background:transparent!important}</style><div style="position:absolute;top:12.7mm;left:0;right:0">${template.bookHeader(translation.title, translation.language)}</div><div style="position:absolute;bottom:12.7mm;left:0;right:0">${template.footer}</div>`,
      true
    )
    const embeddedFrame = await output.embedPage(frame.getPage(0))
    // Crop the same complete frame for details pages. An otherwise empty HTML
    // page with only a bottom-positioned footer can print without that footer.
    const embeddedFooter = await output.embedPage(frame.getPage(0), {
      left: 0,
      bottom: 0,
      right: frame.getPage(0).getWidth(),
      top: 100,
    })
    const firstPage = output.getPageCount()
    const outline = brandingOutline(translation.sections)
    const body = outline
      .map(
        ({ section, depth, label }) =>
          `<h${depth + 1}${section.pageBreakBefore ? ' class="new-page"' : ""}>${escape(label)}</h${depth + 1}>${section.body.trim() ? brandingRichTextHtml(section.richBody ?? plainBrandingRichText(section.body)) : ""}`
      )
      .join("")
    const contentPdf = await render(
      body || "<p>No content entered.</p>",
      false,
      true
    )
    const positions = headingPages(contentPdf)
    if (positions.length !== outline.length)
      throw new Error(
        "Could not calculate all index page numbers. Check the document headings."
      )
    const indexTitle = { en: "Index", hi: "अनुक्रमणिका", gu: "અનુક્રમણિકા" }[
      translation.language
    ]
    const indexBody = (indexPages: number) =>
      `<h1 class="index-title">${indexTitle}</h1><table class="index"><thead><tr><th>No.</th><th>Table Of Contents</th><th>Page</th></tr></thead><tbody>${outline.map((entry, index) => (entry.depth && entry.section.includeInIndex === false ? "" : `<tr><td>${escape(entry.number)}</td><td style="padding-left:${3 + entry.depth * 3}mm">${escape(entry.section.heading)}</td><td>${detailsPdf.getPageCount() + indexPages + positions[index]! + 1}</td></tr>`)).join("")}</tbody></table>`
    let indexPdf = await render(indexBody(1))
    let stable = false
    for (let attempt = 0; attempt < 4; attempt++) {
      const count = indexPdf.getPageCount()
      indexPdf = await render(indexBody(count))
      if (indexPdf.getPageCount() === count) {
        stable = true
        break
      }
    }
    if (!stable)
      throw new Error(
        "Index pagination did not settle. Shorten the heading titles."
      )
    await append(cover)
    await append(detailsPdf, 1)
    await append(indexPdf, detailsPdf.getPageCount() + 1)
    await append(
      contentPdf,
      detailsPdf.getPageCount() + indexPdf.getPageCount() + 1
    )
    for (let index = firstPage + 1; index < output.getPageCount(); index++) {
      output
        .getPage(index)
        .drawPage(
          index > firstPage + detailsPdf.getPageCount()
            ? embeddedFrame
            : embeddedFooter
        )
    }
  }
  for (const [index, number] of numbers) {
    await page.setContent(
      template.html.replace(
        "<body></body>",
        () =>
          `<body style="background:transparent"><div style="position:absolute;bottom:12.7mm;right:12.7mm;${typeStyle("caption")}font-family:Outfit">${number}</div></body>`
      )
    )
    const numberPdf = await PDFDocument.load(
      await page.pdf({
        format: "A4",
        printBackground: true,
        omitBackground: true,
        waitForFonts: true,
        margin: { top: 0, bottom: 0, left: 0, right: 0 },
      })
    )
    output.getPage(index).drawPage(await output.embedPage(numberPdf.getPage(0)))
  }
  output.setTitle(input.content.title)
  output.setAuthor(input.authorName)
  output.setSubject(
    `${input.number} · ${revisionLabel(input.revision)}${input.draft ? " · DRAFT" : ""}`
  )
  return output.save()
}
