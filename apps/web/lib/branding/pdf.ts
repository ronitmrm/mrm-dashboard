import { readFile } from "node:fs/promises"
import path from "node:path"
import { existsSync } from "node:fs"
import chromium from "@sparticuz/chromium"
import puppeteer from "puppeteer-core"
import { PDFDocument, StandardFonts, rgb } from "pdf-lib"
import {
  brandingTypeLabels,
  brandingStepNumber,
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
      ["Noto Sans Gujarati", "NotoSansGujarati.ttf", "100 900"],
      ["Noto Sans Devanagari", "NotoSansDevanagari.ttf", "100 900"],
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
async function wordmark(tagline = false) {
  return readFile(
    path.join(
      process.cwd(),
      "lib/branding/assets",
      tagline ? "mrm-full-tagline.svg" : "mrm-full.svg"
    ),
    "utf8"
  )
}
export async function brandingHtml(input: BrandingPdfInput) {
  const e = escapeBrandingHtml
  const reference = `${input.number}${input.type === "notice" || input.type === "work-instruction" ? "" : ` · ${revisionLabel(input.revision)}`}`
  const styles = `${await fonts()} *{-webkit-print-color-adjust:exact;print-color-adjust:exact}`
  if (input.type === "work-instruction") {
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
    const columns = sections.length === 1 ? 1 : sections.length <= 8 ? 2 : 3
    const rows = Math.ceil(sections.length / columns)
    const content = pictures
      ? sections
          .map(
            (section) =>
              `<section class="wi-tile ${section.layout ?? "text"}" lang="${section.language}">${section.layout && section.layout !== "text" ? (section.picture ? `<img src="${e(section.picture)}" alt="">` : '<div class="wi-missing">Add picture</div>') : ""}<div class="wi-caption"><div class="wi-caption-inner">${section.layout && section.layout !== "text" ? `<span class="wi-step">${e(section.step)}</span>` : ""}<div class="wi-caption-text">${section.heading ? `<h2>${e(section.heading)}</h2>` : ""}<p>${e(section.body)}</p></div></div></div></section>`
          )
          .join("")
      : input.content.translations
          .map(
            (translation) =>
              `<article lang="${translation.language}">${translation.sections.map((section) => `<section><h2>${e(section.heading)}</h2><p>${e(section.body)}</p></section>`).join("")}</article>`
          )
          .join("")
    return {
      header: "<span></span>",
      footer: "<span></span>",
      html: `<!doctype html><html><head><meta charset="utf-8"><style>${styles}
      *{box-sizing:border-box}body{margin:0;font-family:'Outfit','Hind','Hind Vadodara',sans-serif;color:#050505}
      .wi-sheet{position:fixed;inset:0;background:#006A49;--wi-size:22pt;--wi-title:36pt}
      .wi-logo{position:absolute;left:14mm;top:10mm}.wi-logo svg{width:14mm;height:14mm}
      .wi-number{position:absolute;right:16mm;top:7mm;color:#F7F7F2;font-size:8pt}
      .wi-title{position:absolute;top:11mm;left:40mm;right:16mm;height:17mm;display:flex;align-items:center;justify-content:flex-end;text-align:right;color:#F7F7F2;font-size:var(--wi-title);font-weight:700;line-height:1.05}
      .wi-title span{max-width:100%;overflow-wrap:anywhere}
      .wi-panel{position:absolute;top:32mm;left:12mm;right:12mm;bottom:8mm;padding:10mm 9mm;border-radius:10mm;background:#F7F7F2}
      .wi-content{font-size:var(--wi-size);line-height:1.4;font-weight:600}
      [lang=gu]{font-family:'Hind Vadodara','Outfit',sans-serif}[lang=hi]{font-family:'Hind','Outfit',sans-serif}
      section+section,article+article{margin-top:1.5em}h2{display:table;max-width:100%;margin:0 0 .5em;padding:.08em .28em;border-radius:.4em;background:#006A49;color:#F7F7F2;font-size:min(2em,34.45pt);line-height:1.15;font-weight:400;overflow-wrap:anywhere}
      p{margin:0;white-space:pre-wrap;overflow-wrap:anywhere}
      .wi-pictures{background:#F7F7F2}.wi-pictures .wi-title,.wi-pictures .wi-number{color:#006A49}
      .wi-pictures .wi-panel{top:41mm;left:21mm;right:21mm;bottom:14mm;padding:0;border-radius:0}
      .wi-pictures .wi-content{height:100%;display:grid;grid-template-columns:repeat(${columns},minmax(0,1fr));grid-template-rows:repeat(${rows},minmax(0,1fr));gap:8mm 14mm}
      .wi-tile{position:relative;min-width:0;min-height:0;margin:0;overflow:hidden;border:1pt solid #006A49;border-radius:4mm}
      .wi-tile img,.wi-missing{position:absolute;inset:0;width:100%;height:80%;object-fit:cover}.wi-missing{display:grid;place-items:center;font:12pt Outfit;color:#006A49}
      .wi-caption{position:absolute;bottom:0;left:0;width:100%;height:25%;padding:2mm 3mm;background:#006A49;color:#F7F7F2;border-radius:3mm;overflow:hidden;font-size:22pt;line-height:1.15;display:flex;align-items:center}
      .wi-caption-inner{display:flex;align-items:center;gap:.4em;width:100%;min-width:0}
      .wi-step{flex:none;font-size:1.4em;line-height:1.1}
      .wi-caption-text{flex:1;min-width:0}.wi-caption h2{max-width:100%;font-size:1.1em;line-height:1.15;background:none;padding:0;margin:0 0 .2em;color:inherit;font-weight:700}
      .wi-caption p{font-weight:500}
      .picture-left img,.picture-left .wi-missing{width:50%;height:100%}
      .picture-left .wi-caption{left:50%;width:50%;height:100%;border-radius:0}
      .picture-left .wi-caption-inner{align-items:flex-start}.wi-tile.text .wi-caption-inner{display:block}
      .picture-left h2,.wi-tile.text h2{max-width:100%;margin-bottom:.4em}
      .wi-tile.text .wi-caption{height:100%}
      </style></head><body><div class="wi-sheet${pictures ? " wi-pictures" : ""}"><div class="wi-logo">${pictures ? logo : logo.replaceAll("#006A49", "#F7F7F2")}</div><div class="wi-number">${e(reference)}${input.draft ? " · DRAFT" : ""}</div><div class="wi-title"><span>${e(input.content.title)}</span></div><div class="wi-panel"><main class="wi-content">${content}</main></div></div></body></html>`,
    }
  }
  if (input.type === "notice") {
    const date = input.content.effectiveDate.split("-").reverse().join(" / ")
    const languageOrder = { en: 0, gu: 1, hi: 2 }
    const translations = [...input.content.translations].sort(
      (a, b) => languageOrder[a.language] - languageOrder[b.language]
    )
    return {
      header: "<span></span>",
      footer: "<span></span>",
      html: `<!doctype html><html><head><meta charset="utf-8"><style>${styles}
      *{box-sizing:border-box}body{margin:0;background:white;color:#231F20;font:400 21.5pt/30pt 'Outfit',sans-serif}
      .notice-banner{position:absolute;top:32pt;left:36pt;right:36pt;height:140pt;border-radius:17pt;background:#006A49;color:white;display:flex;align-items:center;justify-content:center;font:600 100pt/1 'Outfit';letter-spacing:1.2pt}
      .notice-date{position:absolute;top:243pt;right:60pt;font:500 20pt/28pt 'Outfit';color:#006A49}
      .notice-number{position:absolute;top:10pt;right:36pt;font:500 11pt/14pt 'Outfit';color:#006A49}
      .notice-content{position:absolute;top:241pt;left:55.5pt;right:55.5pt}
      [lang=gu]{font-family:'Outfit','Noto Sans Gujarati',sans-serif}[lang=hi]{font-family:'Outfit','Noto Sans Devanagari',sans-serif}
      section+section,article+article{margin-top:64pt}h1{font-size:27.5pt;font-weight:700;line-height:40pt;text-align:center;margin:0 0 28pt;overflow-wrap:anywhere}article:first-child section:first-child h1{max-width:210pt;margin-left:auto;margin-right:auto}
      p{margin:0;white-space:pre-wrap;overflow-wrap:anywhere}.notice-logo{position:absolute;top:779pt;left:178pt;width:239pt;color:#006A49}
      </style></head><body><div class="notice-number">${e(input.draft ? "Number assigned on issue" : input.number)}</div><div class="notice-banner">NOTICE</div><div class="notice-date">${e(date || "Date pending")}</div><main class="notice-content">${translations.map((translation) => `<article lang="${translation.language}">${translation.sections.map((section) => `<section><h1>${e(section.heading)}</h1><p>${e(section.body)}</p></section>`).join("")}</article>`).join("")}</main><div class="notice-logo">${await wordmark()}</div></body></html>`,
    }
  }
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>${styles}
    *{box-sizing:border-box}html{-webkit-print-color-adjust:exact;print-color-adjust:exact}
    body{margin:0;color:#050505;background:white;font:11pt/1.6 'Outfit','Hind','Hind Vadodara',sans-serif}
    article+article{break-before:page}article{padding:0 2mm}
    .cover{height:296mm;padding:5mm;background:#F7F7F2}.cover-panel{height:100%;border-radius:7mm;background:#006A49;color:#F7F7F2;padding:16mm 10mm 12mm;display:flex;flex-direction:column;align-items:center}.cover-logo{width:115mm;margin:2mm 0 36mm}.cover h1{color:inherit;text-align:center;text-transform:uppercase;font-size:48pt;line-height:1.25;width:100%;margin:0}.cover-label{font-size:10pt;letter-spacing:.12em;margin-bottom:10mm}.cover-footer{margin-top:auto;display:flex;justify-content:space-between;gap:4mm;width:100%;font-size:10pt;font-weight:600}.cover-footer span{max-width:45%;overflow-wrap:anywhere}
    .topic{border:1pt solid #006A49;border-radius:4mm;padding:6mm;color:#006A49;box-decoration-break:clone}.topic h1{font-size:22pt;border-bottom:1pt solid #006A49;padding-bottom:4mm}
    .index-row{display:flex;gap:5mm;justify-content:space-between;border-bottom:1px dotted #006A49;padding:3mm 0;break-inside:avoid}.index-row span:last-child{min-width:12mm;text-align:right}
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
  const header = `<style>${styles}</style><div style="margin:0 10mm;width:100%;display:flex;border:1px solid #006A49;border-radius:12px;overflow:hidden;font:10px Outfit,Hind,'Hind Vadodara';height:94px"><div style="background:#006A49;color:white;width:29%;padding:10px;line-height:1.7">Effective: ${e(input.content.effectiveDate || "Pending")}<br>${e(reference)}<br><span style="font-size:8px;line-height:1.2;display:block;overflow-wrap:anywhere">${e(input.content.department)}</span></div><div style="background:#006A49;color:white;flex:1;text-align:center;padding:10px;border-left:1px solid white"><b>${input.type === "sop" ? "STANDARD OPERATING PROCEDURE" : e(brandingTypeLabels[input.type]).toUpperCase()}${input.draft ? " · DRAFT" : ""}</b><div style="margin-top:5px;font-size:9px;line-height:1.2;overflow-wrap:anywhere">${e(input.content.title)}</div></div><div style="width:16%;display:flex;align-items:center;justify-content:center">${logo.replaceAll('width="32" height="32"', 'width="54" height="54"')}</div></div>`
  const footer = `<style>${styles}</style><div style="width:100%;padding:0 10mm;font:9px Outfit,Hind,'Hind Vadodara';color:#006A49"><div style="display:flex;justify-content:space-between"><span>${e(input.authorName)} · ${e(input.issuedAt.slice(0, 10))}</span><span>${e(reference)}${input.draft ? " · DRAFT" : ""}</span></div></div>`
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
    if (input.type === "notice")
      await page.setViewport({ width: 794, height: 1123 })
    if (input.type === "work-instruction")
      await page.setViewport({ width: 794, height: 1122 })
    await page.setJavaScriptEnabled(false)
    await page.setRequestInterception(true)
    page.on("request", (request) => {
      void (request.url().startsWith("data:")
        ? request.continue()
        : request.abort())
    })
    await page.setContent(html, { waitUntil: "load", timeout: 30000 })
    if (input.type === "work-instruction") {
      await page.evaluate(() => document.fonts.ready)
      await page.evaluate(() => {
        const sheet = document.querySelector<HTMLElement>(".wi-sheet")!
        const panel = document.querySelector<HTMLElement>(".wi-panel")!
        const content = document.querySelector<HTMLElement>(".wi-content")!
        const title = document.querySelector<HTMLElement>(".wi-title")!
        const titleText = title.querySelector("span")!
        for (const target of [
          { property: "--wi-title", min: 0.01, max: 36 },
          ...(!sheet.classList.contains("wi-pictures")
            ? [{ property: "--wi-size", min: 0.01, max: 22 }]
            : []),
        ]) {
          let low = target.min,
            high = target.max
          for (let step = 0; step <= 16; step++) {
            const size = step === 0 ? low : (low + high) / 2
            sheet.style.setProperty(target.property, `${size}pt`)
            const fits =
              target.property === "--wi-title"
                ? titleText.getBoundingClientRect().height <=
                    title.clientHeight && title.scrollWidth <= title.clientWidth
                : content.getBoundingClientRect().bottom <=
                    panel.getBoundingClientRect().bottom -
                      parseFloat(getComputedStyle(panel).paddingBottom) &&
                  content.scrollWidth <= content.clientWidth
            if (fits) low = size
            else high = size
          }
          sheet.style.setProperty(target.property, `${low}pt`)
        }
        // Tile dimensions are already fixed by count. Only change the caption font.
        for (const caption of document.querySelectorAll<HTMLElement>(
          ".wi-caption"
        )) {
          const inner = caption.querySelector<HTMLElement>(".wi-caption-inner")!
          const style = getComputedStyle(caption)
          const height =
            caption.clientHeight -
            parseFloat(style.paddingTop) -
            parseFloat(style.paddingBottom)
          let low = 0.01,
            high = 22
          for (let step = 0; step < 18; step++) {
            const size = (low + high) / 2
            caption.style.fontSize = `${size}pt`
            if (
              inner.getBoundingClientRect().height <= height &&
              inner.scrollWidth <= inner.clientWidth
            )
              low = size
            else high = size
          }
          caption.style.fontSize = `${low}pt`
        }
      })
      const bytes = await page.pdf({
        format: "A4",
        printBackground: true,
        waitForFonts: true,
        margin: { top: 0, bottom: 0, left: 0, right: 0 },
      })
      const instructionPdf = await PDFDocument.load(bytes)
      if (instructionPdf.getPageCount() !== 1)
        throw new Error("Work Instruction could not be fitted to one page.")
      instructionPdf.setTitle(input.content.title)
      instructionPdf.setSubject(input.number)
      instructionPdf.setAuthor(input.authorName)
      return instructionPdf.save()
    }
    if (input.type === "notice") {
      await page.evaluate(() => document.fonts.ready)
      const fits = await page.evaluate(() => {
        const body = document
          .querySelector(".notice-content")!
          .getBoundingClientRect()
        const logo = document
          .querySelector(".notice-logo")!
          .getBoundingClientRect()
        return body.bottom + 24 * (96 / 72) <= logo.top
      })
      if (!fits)
        throw new Error(
          "Notice exceeds the reference's one-page layout. Shorten the text or split it into separate notices."
        )
      const bytes = await page.pdf({
        width: `${595.5 / 72}in`,
        height: `${842.25 / 72}in`,
        printBackground: true,
        waitForFonts: true,
        margin: { top: 0, bottom: 0, left: 0, right: 0 },
      })
      const noticePdf = await PDFDocument.load(bytes)
      noticePdf.setTitle(input.content.title)
      noticePdf.setSubject(`${input.number}${input.draft ? " · DRAFT" : ""}`)
      noticePdf.setAuthor(input.authorName)
      return noticePdf.save()
    }
    const render = async (body?: string, cover = false) => {
      if (body !== undefined)
        await page.setContent(
          html.replace(/<body>[\s\S]*<\/body>/, () => `<body>${body}</body>`),
          { waitUntil: "load" }
        )
      const bytes = await page.pdf({
        format: "A4",
        printBackground: true,
        waitForFonts: true,
        displayHeaderFooter: !cover,
        headerTemplate: header,
        footerTemplate: footer.replace(
          / · <span class="pageNumber"><\/span> \/ <span class="totalPages"><\/span>/,
          ""
        ),
        margin: cover
          ? { top: 0, bottom: 0, left: 0, right: 0 }
          : {
              top: "38mm",
              bottom: "20mm",
              left: "12mm",
              right: "12mm",
            },
        timeout: 30000,
      })
      return PDFDocument.load(bytes)
    }
    const output = await PDFDocument.create()
    const coverPages = new Set<number>()
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
          `<div class="cover" lang="${translation.language}"><div class="cover-panel"><div class="cover-logo">${await wordmark(true)}</div><div class="cover-label">${e(brandingTypeLabels[input.type])}${input.draft ? " · DRAFT" : ""}</div><h1 style="font-size:${translation.title.length > 100 ? 30 : translation.title.length > 55 ? 38 : 48}pt">${e(translation.title)}</h1><div class="cover-footer"><span>${e(input.number)}</span><span>Rev No. ${String(input.revision).padStart(2, "0")}</span><span>${e(input.content.effectiveDate || "Date pending")}</span></div></div></div>`,
          true
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
                `<section class="topic"><h1>${index + 1}. ${e(section.heading)}</h1><p>${e(section.body)}</p></section>`
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
        coverPages.add(output.getPageCount())
        await append(cover)
        await append(indexPdf)
        for (const topic of topics) await append(topic)
      }
    }
    const font = await output.embedFont(StandardFonts.Helvetica)
    output.getPages().forEach((sheet, index) => {
      if (coverPages.has(index)) return
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
