import { readFile } from "node:fs/promises"
import path from "node:path"
import { existsSync } from "node:fs"
import chromium from "@sparticuz/chromium"
import puppeteer from "puppeteer-core"
import type { Page } from "puppeteer-core"
import { PDFDocument } from "pdf-lib"
import { brandingBookHtml, generateBrandingBookPdf } from "./book-pdf"
import { brandTypography, typeStyle } from "./typography"
import {
  brandingStepNumber,
  brandingNoticeBody,
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
function isVisualGuide(content: BrandingContent) {
  const sections = content.translations.flatMap(
    (translation) => translation.sections
  )
  return (
    sections.length > 0 &&
    sections.every((section) => section.layout === "visual-guide")
  )
}
function visualSymbol(bad: boolean) {
  return `<svg class="wi-symbol" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-label="${bad ? "Bad" : "Good"}" fill="none" stroke="${bad ? "#F51524" : "#006A49"}" stroke-width="11" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="7" width="86" height="86" rx="23"/><path d="${bad ? "M30 29L70 71M70 29L30 71" : "M25 52L43 72L76 32"}"/></svg>`
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
    const sideRows =
      sections.length > 0 &&
      sections.every((section) => section.layout === "picture-left")
    const visual = isVisualGuide(input.content)
    const columns =
      visual || sideRows || sections.length === 1
        ? 1
        : sections.length <= 8
          ? 2
          : 3
    const rows = Math.ceil(sections.length / columns)
    const content = pictures
      ? sections
          .map(
            (section) =>
              `<section class="wi-tile ${section.layout ?? "text"}${section.assessment === "bad" ? " bad" : ""}" lang="${section.language}">${section.layout && section.layout !== "text" ? (section.picture ? `<img src="${e(section.picture)}" alt="">` : '<div class="wi-missing">Add picture</div>') : ""}${section.layout === "visual-guide" ? visualSymbol(section.assessment === "bad") : ""}<div class="wi-caption"><div class="wi-caption-inner">${section.layout && section.layout !== "text" && section.layout !== "visual-guide" ? `<span class="wi-step">${e(section.step)}</span>` : ""}<div class="wi-caption-text">${section.heading ? `<h2>${e(section.heading)}</h2>` : ""}<p>${e(section.body)}</p></div></div></div></section>`
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
      *{box-sizing:border-box}body{margin:0;color:#050505}
      .wi-sheet{position:fixed;inset:12.7mm;background:#006A49;}
      .wi-logo{position:absolute;left:3mm;top:7mm}.wi-logo svg{width:14mm;height:14mm}
      .wi-number{position:absolute;right:3mm;top:0;color:#F7F7F2;}
      .wi-title{position:absolute;top:8mm;left:22mm;right:3mm;height:20mm;display:flex;align-items:center;justify-content:flex-end;text-align:right;color:#F7F7F2;}
      .wi-title span{display:block;max-width:100%;overflow-wrap:anywhere;text-wrap:balance}
      .wi-panel{position:absolute;top:32mm;left:3mm;right:3mm;bottom:3mm;padding:6mm;border-radius:10mm;background:#F7F7F2}


      section+section,article+article{margin-top:1.5em}h2{display:table;max-width:100%;margin:0 0 .5em;padding:.08em .28em;border-radius:.4em;background:#006A49;color:#F7F7F2;overflow-wrap:anywhere}
      p{margin:0;white-space:pre-wrap;overflow-wrap:anywhere}
      .wi-pictures{background:#F7F7F2}.wi-pictures .wi-title,.wi-pictures .wi-number{color:#006A49}
      .wi-pictures .wi-panel{top:35mm;left:0;right:0;bottom:0;padding:0;border-radius:0}
      .wi-pictures .wi-content{height:100%;display:grid;grid-template-columns:repeat(${columns},minmax(0,1fr));grid-template-rows:repeat(${rows},minmax(0,1fr));gap:8mm 14mm}
      .wi-tile{position:relative;min-width:0;min-height:0;margin:0;overflow:hidden;border:1pt solid #006A49;border-radius:4mm}
      .wi-tile img,.wi-missing{position:absolute;inset:0;width:100%;height:80%;object-fit:cover}.wi-missing{display:grid;place-items:center;color:#006A49}
      .wi-caption{position:absolute;bottom:0;left:0;width:100%;height:25%;padding:2mm 3mm;background:#006A49;color:#F7F7F2;border-radius:3mm;overflow:hidden;display:flex;align-items:center}
      .wi-caption-inner{display:flex;align-items:center;gap:.4em;width:100%;min-width:0}
      .wi-step{flex:none;}
      .wi-caption-text{flex:1;min-width:0}.wi-caption h2{max-width:100%;background:none;padding:0;margin:0 0 .2em;color:inherit;}

      .picture-left{border:0}.picture-left img,.picture-left .wi-missing{width:40%;height:100%;border:1.5mm solid #006A49;border-radius:4mm}
      .picture-left .wi-caption{left:40%;width:60%;height:100%;border-radius:4mm;padding:3mm 5mm}
      .picture-left .wi-caption-inner{align-items:flex-start}.wi-tile.text .wi-caption-inner{display:block}
      .picture-left h2,.wi-tile.text h2{max-width:100%;margin-bottom:.4em}
      .wi-tile.text .wi-caption{height:100%}
      .wi-visual .wi-panel{top:32mm;left:0;right:0;bottom:0}
      .wi-visual .wi-content{gap:0;border:1mm solid #006A49;border-radius:7mm;overflow:hidden}
      .wi-visual .wi-tile{border:0;border-radius:0}.wi-visual .wi-tile+.wi-tile{border-top:1mm solid #006A49}
      .visual-guide img,.visual-guide .wi-missing{width:54%;height:100%;object-fit:contain;padding:4mm}
      .wi-symbol{position:absolute;left:56%;top:10%;width:20%;height:80%}
      .visual-guide .wi-caption{left:78%;width:22%;height:100%;background:transparent;color:#006A49;padding:3mm 5mm 3mm 1mm;border-radius:0}
      .visual-guide.bad .wi-caption{color:#F51524}

      ${brandTypography}
      .wi-title{${typeStyle("display")}}.wi-number{${typeStyle("caption")}}
      .wi-content,.wi-caption{${typeStyle("body")}}
      .wi-content h2{${typeStyle("section")}}
      .wi-step{${typeStyle("subsection")}}
      .wi-content [lang=hi],.wi-content [lang=gu]{line-height:1.6}
      .wi-content [lang=hi] .wi-caption,.wi-content [lang=gu] .wi-caption{line-height:1.6}
      .wi-content [lang=hi] h2,.wi-content [lang=gu] h2{${typeStyle("localHeading")}}
      .wi-title[lang=hi],.wi-title[lang=gu]{${typeStyle("localHeading")}}
      </style></head><body><div class="wi-sheet${pictures ? " wi-pictures" : ""}${visual ? " wi-visual" : ""}"><div class="wi-logo">${pictures ? logo : logo.replaceAll("#006A49", "#F7F7F2")}</div><div class="wi-number">${e(reference)}${input.draft ? " · DRAFT" : ""}</div><div class="wi-title" lang="${input.content.languages[0] ?? "en"}"><span>${e(input.content.title)}</span></div><div class="wi-panel"><main class="wi-content">${content}</main></div></div></body></html>`,
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
      ${brandTypography}
      *{box-sizing:border-box}body{margin:0;background:white;color:#050505}
      .notice-banner{position:absolute;top:22mm;left:12.7mm;right:12.7mm;height:22mm;border-radius:4mm;background:#006A49;color:#F7F7F2;display:flex;align-items:center;justify-content:center;${typeStyle("display")}}
      .notice-number{position:absolute;top:12.7mm;right:12.7mm;color:#006A49;${typeStyle("caption")}}
      .notice-date{position:absolute;top:49mm;right:12.7mm;color:#006A49;${typeStyle("caption")}}
      .notice-content{position:absolute;top:62mm;left:12.7mm;right:12.7mm;${typeStyle("body")}}
      article+article{margin-top:1.5em}p{margin:0;white-space:pre-wrap;overflow-wrap:anywhere}
      .notice-logo{position:absolute;bottom:12.7mm;left:12.7mm;width:50mm;color:#006A49}
      </style></head><body><div class="notice-number">${e(input.draft ? "Number assigned on issue" : input.number)}</div><div class="notice-banner">NOTICE</div><div class="notice-date">${e(date || "Date pending")}</div><main class="notice-content">${translations.map((translation) => `<article lang="${translation.language}"><p>${e(brandingNoticeBody(translation.sections))}</p></article>`).join("")}</main><div class="notice-logo">${await wordmark()}</div></body></html>`,
    }
  }
  return brandingBookHtml(input, styles, logo, await wordmark())
}
export async function fitSinglePageText(
  page: Page,
  type: "notice" | "work-instruction"
) {
  await page.evaluate(() => document.fonts.ready)
  return page.evaluate((documentType) => {
    const root = document.documentElement
    const check = {
      fits() {
        if (documentType === "notice") {
          const body = document.querySelector<HTMLElement>(".notice-content")!
          const logo = document.querySelector<HTMLElement>(".notice-logo")!
          return (
            body.getBoundingClientRect().bottom <=
              logo.getBoundingClientRect().top - 16 &&
            body.scrollWidth <= body.clientWidth
          )
        }
        const title = document.querySelector<HTMLElement>(".wi-title")!
        const titleText = title.querySelector("span")!
        if (
          titleText.getBoundingClientRect().height > title.clientHeight ||
          title.scrollWidth > title.clientWidth
        )
          return false
        const content = document.querySelector<HTMLElement>(".wi-content")!
        const panel = document.querySelector<HTMLElement>(".wi-panel")!
        if (
          content.getBoundingClientRect().bottom >
            panel.getBoundingClientRect().bottom -
              parseFloat(getComputedStyle(panel).paddingBottom) +
              1 ||
          content.scrollWidth > content.clientWidth
        )
          return false
        for (const caption of document.querySelectorAll<HTMLElement>(
          ".wi-caption"
        )) {
          const inner = caption.querySelector<HTMLElement>(".wi-caption-inner")!
          const style = getComputedStyle(caption)
          const height =
            caption.clientHeight -
            parseFloat(style.paddingTop) -
            parseFloat(style.paddingBottom)
          if (
            inner.getBoundingClientRect().height > height ||
            inner.scrollWidth > inner.clientWidth
          )
            return false
        }
        return true
      },
    }
    root.style.setProperty("--print-scale", "1")
    if (check.fits()) return 1
    let low = 0.001,
      high = 1
    root.style.setProperty("--print-scale", String(low))
    if (!check.fits())
      throw new Error(
        "Too many sections to fit on one page. Remove a section or shorten the content."
      )
    for (let step = 0; step < 20; step++) {
      const scale = (low + high) / 2
      root.style.setProperty("--print-scale", String(scale))
      if (check.fits()) low = scale
      else high = scale
    }
    root.style.setProperty("--print-scale", String(low))
    return low
  }, type)
}

export async function generateBrandingPdf(input: BrandingPdfInput) {
  const template = await brandingHtml(input)
  const { html } = template
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
      await page.setViewport(
        isVisualGuide(input.content)
          ? { width: 1123, height: 794 }
          : { width: 794, height: 1122 }
      )
    await page.setJavaScriptEnabled(false)
    await page.setRequestInterception(true)
    page.on("request", (request) => {
      void (request.url().startsWith("data:")
        ? request.continue()
        : request.abort())
    })
    await page.setContent(html, { waitUntil: "load", timeout: 30000 })
    if (input.type === "work-instruction") {
      await fitSinglePageText(page, "work-instruction")
      const bytes = await page.pdf({
        format: "A4",
        landscape: isVisualGuide(input.content),
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
      await fitSinglePageText(page, "notice")
      const bytes = await page.pdf({
        format: "A4",
        printBackground: true,
        waitForFonts: true,
        margin: { top: 0, bottom: 0, left: 0, right: 0 },
      })
      const noticePdf = await PDFDocument.load(bytes)
      if (noticePdf.getPageCount() !== 1)
        throw new Error("Notice could not be fitted to one page.")
      noticePdf.setTitle(input.content.title)
      noticePdf.setSubject(`${input.number}${input.draft ? " · DRAFT" : ""}`)
      noticePdf.setAuthor(input.authorName)
      return noticePdf.save()
    }
    if (!("bookHeader" in template))
      throw new Error("Document template is unavailable.")
    return await generateBrandingBookPdf(page, input, template)
  } finally {
    await browser.close()
  }
}
