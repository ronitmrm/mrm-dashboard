import { readFile } from "node:fs/promises"
import path from "node:path"
import { existsSync } from "node:fs"
import chromium from "@sparticuz/chromium"
import puppeteer from "puppeteer-core"
import { PDFDocument, StandardFonts, rgb } from "pdf-lib"
import {
  brandingTypeLabels,
  revisionLabel,
  type BrandingContent,
  type BrandingType,
} from "@workspace/db/branding-domain"

export type BrandingPdfInput = {
  content: BrandingContent
  number: string
  revision: number
  issuedAt: string
  authorName: string
  type: BrandingType
  draft?: boolean
}
export function escapeBrandingHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ]!
  )
}
let fontStyles: Promise<string> | undefined
function fonts() {
  return (fontStyles ??= Promise.all(
    [
      ["Outfit", "Outfit.ttf", "100 900"],
      ["Hind", "Hind-Regular.ttf", "400"],
      ["Hind", "Hind-Bold.ttf", "700"],
      ["Hind Vadodara", "HindVadodara-Regular.ttf", "400"],
      ["Hind Vadodara", "HindVadodara-Bold.ttf", "700"],
    ].map(async ([family, file, weight]) => {
      const bytes = await readFile(
        path.join(process.cwd(), "lib/branding/assets", file!)
      )
      return `@font-face{font-family:'${family}';font-weight:${weight};src:url(data:font/ttf;base64,${bytes.toString("base64")}) format('truetype');}`
    })
  ).then((styles) => styles.join("\n")))
}
// Original block artwork from the supplied guide; never recreate the wordmark as text.
const logo = `<svg width="32" height="32" viewBox="0 0 112.66 112.67" xmlns="http://www.w3.org/2000/svg"><path fill="#006A49" d="M101.39,0H11.27C5.04,0,0,5.01,0,11.18v50.79h112.66V11.18c0-6.17-5.04-11.18-11.27-11.18Z"/><path fill="#006A49" d="M0,101.16c0,6.36,5.04,11.51,11.27,11.51h90.13c6.22,0,11.27-5.16,11.27-11.51v-11.02H0v11.02Z"/></svg>`
export async function brandingHtml(input: BrandingPdfInput) {
  const e = escapeBrandingHtml
  const reference = `${input.number}${input.type === "notice" || input.type === "work-instruction" ? "" : ` · ${revisionLabel(input.revision)}`}`
  const styles = await fonts()
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>${styles}
    *{box-sizing:border-box}html{-webkit-print-color-adjust:exact;print-color-adjust:exact}
    body{margin:0;color:#050505;background:#F7F7F2;font:11pt/1.6 'Outfit','Hind','Hind Vadodara',sans-serif}
    article+article{break-before:page}article{padding:0 2mm}
    .cover{padding-top:45mm}.cover h1{font-size:32pt}.cover .meta{margin-top:18mm}
    .index-row{display:flex;gap:5mm;justify-content:space-between;border-bottom:1px dotted #006A49;padding:3mm 0;break-inside:avoid}.index-row span:last-child{min-width:12mm;text-align:right}
    ${input.type === "work-instruction" ? "article+article{break-before:auto;margin-top:5mm}.eyebrow{margin-bottom:3mm}h1{font-size:20pt;margin-bottom:3mm}h2{margin-top:3mm}.meta{margin-bottom:4mm}" : ""}
    [lang=hi]{font-family:'Hind','Outfit',sans-serif}[lang=gu]{font-family:'Hind Vadodara','Outfit',sans-serif}
    .eyebrow{font:600 9pt 'Outfit';letter-spacing:.14em;color:#006A49;margin:0 0 8mm}
    h1{font-size:24pt;font-weight:800;line-height:1.3;color:#006A49;margin:0 0 6mm;overflow-wrap:anywhere}
    .meta{font-size:10pt;border-bottom:1pt solid #006A49;padding-bottom:5mm;margin-bottom:7mm;white-space:pre-wrap;overflow-wrap:anywhere}
    h2{font-size:13pt;line-height:1.4;color:#006A49;border-left:3pt solid #8BC341;padding-left:3mm;margin:7mm 0 3mm;break-after:avoid}
    p{margin:0 0 4mm;white-space:pre-wrap;overflow-wrap:anywhere;orphans:3;widows:3}
  </style></head><body>${input.content.translations
    .map(
      (translation) => `<article lang="${translation.language}">
    <div class="eyebrow">${e(brandingTypeLabels[input.type])} · INTERNAL${input.draft ? " · DRAFT" : ""}</div>
    <h1>${e(translation.title)}</h1>
    <div class="meta">${e(input.content.department)} · ${e(input.content.effectiveDate || "Effective date pending")}</div>
    ${translation.sections.map((section) => `<section><h2>${e(section.heading)}</h2><p>${e(section.body)}</p></section>`).join("")}
    </article>`
    )
    .join("")}</body></html>`
  const header = `<style>${styles}</style><div style="width:100%;padding:0 16mm;display:flex;align-items:center;justify-content:space-between;font:9px Outfit;color:#006A49">${logo}<span>${e(reference)}${input.draft ? " · DRAFT" : ""}</span></div>`
  const footer = `<style>${styles}</style><div style="width:100%;padding:0 16mm;display:flex;justify-content:space-between;font:9px Outfit,Hind,'Hind Vadodara';color:#006A49"><span>${e(input.authorName)} · ${e(input.issuedAt.slice(0, 10))}</span><span>${e(reference)} · <span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`
  return { html, header, footer }
}
export async function generateBrandingPdf(input: BrandingPdfInput) {
  const { html, header, footer } = await brandingHtml(input)
  const localBrowser =
    process.env.BRANDING_CHROMIUM_PATH ||
    (process.platform === "win32"
      ? [
          "C:/Program Files/Google/Chrome/Application/chrome.exe",
          "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
        ].find(existsSync)
      : undefined)
  const browser = await puppeteer.launch({
    executablePath: localBrowser ?? (await chromium.executablePath()),
    args: localBrowser ? ["--disable-extensions"] : chromium.args,
    headless: true,
  })
  try {
    const page = await browser.newPage()
    await page.setJavaScriptEnabled(false)
    await page.setRequestInterception(true)
    page.on("request", (request) => {
      void (request.url().startsWith("data:")
        ? request.continue()
        : request.abort())
    })
    await page.setContent(html, { waitUntil: "load", timeout: 30000 })
    const render = async (body?: string) => {
      if (body !== undefined)
        await page.setContent(
          html.replace(/<body>[\s\S]*<\/body>/, () => `<body>${body}</body>`),
          { waitUntil: "load" }
        )
      const bytes = await page.pdf({
        format: "A4",
        printBackground: true,
        waitForFonts: true,
        displayHeaderFooter: true,
        headerTemplate: header,
        footerTemplate: footer.replace(
          / · <span class="pageNumber"><\/span> \/ <span class="totalPages"><\/span>/,
          ""
        ),
        margin: { top: "24mm", bottom: "22mm", left: "16mm", right: "16mm" },
        timeout: 30000,
      })
      return PDFDocument.load(bytes)
    }
    const output = await PDFDocument.create()
    const append = async (document: PDFDocument) => {
      for (const copied of await output.copyPages(
        document,
        document.getPageIndices()
      ))
        output.addPage(copied)
    }
    if (input.type === "sop" || input.type === "policy") {
      const e = escapeBrandingHtml
      for (const translation of input.content.translations) {
        const wrap = (body: string) =>
          `<article lang="${translation.language}">${body}</article>`
        const cover = await render(
          wrap(
            `<div class="cover"><div class="eyebrow">${e(brandingTypeLabels[input.type])}${input.draft ? " · DRAFT" : ""}</div><h1>${e(translation.title)}</h1><div class="meta">${e(input.number)} · ${revisionLabel(input.revision)}<br>${e(input.content.department)}<br>Effective: ${e(input.content.effectiveDate || "Pending")}<br>${e(input.authorName)}</div></div>`
          )
        )
        if (cover.getPageCount() !== 1)
          throw new Error(
            "Cover details are too long for one page. Shorten the title or department."
          )
        const topics: PDFDocument[] = []
        for (const [index, section] of translation.sections.entries()) {
          topics.push(
            await render(
              wrap(
                `<h1>${index + 1}. ${e(section.heading)}</h1><p>${e(section.body)}</p>`
              )
            )
          )
        }
        const indexTitle = {
          en: "Index",
          hi: "अनुक्रमणिका",
          gu: "અનુક્રમણિકા",
        }[translation.language]
        const indexBody = (firstPage: number) => {
          let pageNumber = firstPage
          return wrap(
            `<h1>${indexTitle}</h1>${translation.sections
              .map((section, index) => {
                const row = `<div class="index-row"><span>${index + 1}. ${e(section.heading)}</span><span>${pageNumber}</span></div>`
                pageNumber += topics[index]!.getPageCount()
                return row
              })
              .join("")}`
          )
        }
        let indexPdf = await render(indexBody(9999))
        indexPdf = await render(
          indexBody(
            output.getPageCount() +
              cover.getPageCount() +
              indexPdf.getPageCount() +
              1
          )
        )
        await append(cover)
        await append(indexPdf)
        for (const topic of topics) await append(topic)
      }
    } else {
      const document = await render()
      if (input.type === "work-instruction" && document.getPageCount() !== 1)
        throw new Error(
          "Work Instruction exceeds one page. Shorten the text or split it into separate work instructions."
        )
      await append(document)
    }
    const font = await output.embedFont(StandardFonts.Helvetica)
    output.getPages().forEach((sheet, index) => {
      const label = `${index + 1} / ${output.getPageCount()}`
      sheet.drawText(label, {
        x: (sheet.getWidth() - font.widthOfTextAtSize(label, 8)) / 2,
        y: 16,
        size: 8,
        font,
        color: rgb(0, 0.416, 0.286),
      })
    })
    return output.save()
  } finally {
    await browser.close()
  }
}
