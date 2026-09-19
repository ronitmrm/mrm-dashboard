import { describe, expect, it } from "vitest"
import {
  brandingNumber,
  brandingStepNumber,
  parseBrandingContent,
  revisionLabel,
  validateBrandingIssue,
  brandingOutline,
  brandingRichTextHtml,
} from "@workspace/db/branding-domain"
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFRawStream,
  decodePDFRawStream,
} from "pdf-lib"
import { create } from "fontkit"
import { loadPdfKitBrandFonts } from "./pdfkit-fonts"
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs"
import { generateBrandingPdf } from "./pdf"
import { brandingVerificationFixtures } from "./verification-fixtures"

const pictureFixture = brandingVerificationFixtures.find(
  (fixture) => fixture.name === "wi-grid"
)!
const jpeg = parseBrandingContent(pictureFixture.content, "work-instruction")
  .translations[0]!.sections[0]!.picture!

async function inspect(bytes: Uint8Array) {
  expect(bytes.byteLength).toBeLessThanOrEqual(5 * 1024 * 1024)
  const document = await PDFDocument.load(bytes)
  const fontNames = new Set<string>()
  const inspectedFonts = new Set<string>()
  for (const page of document.getPages()) {
    const fonts = page.node
      .Resources()
      ?.lookupMaybe(PDFName.of("Font"), PDFDict)
    for (const key of fonts?.keys() ?? []) {
      const font = fonts!.lookup(key, PDFDict)
      fontNames.add(font.get(PDFName.of("BaseFont"))!.toString())
      const descendant = font
        .lookup(PDFName.of("DescendantFonts"), PDFArray)
        .lookup(0, PDFDict)
      const descriptor = descendant.lookup(
        PDFName.of("FontDescriptor"),
        PDFDict
      )
      expect(
        descriptor.has(PDFName.of("FontFile2")) ||
          descriptor.has(PDFName.of("FontFile3"))
      ).toBe(true)
      const embeddedRef = descriptor.get(PDFName.of("FontFile2"))
      if (embeddedRef && !inspectedFonts.has(embeddedRef.toString())) {
        inspectedFonts.add(embeddedRef.toString())
        const stream = descriptor.lookup(PDFName.of("FontFile2"))
        if (!(stream instanceof PDFRawStream))
          throw new Error("Expected an embedded font stream.")
        const embedded = create(
          Buffer.from(decodePDFRawStream(stream).decode())
        )
        if (!("getGlyph" in embedded))
          throw new Error("Expected an embedded font, not a collection.")
        const unicodeStream = font.lookup(PDFName.of("ToUnicode"))
        if (!(unicodeStream instanceof PDFRawStream))
          throw new Error("Expected a Unicode map stream.")
        const unicode = Buffer.from(
          decodePDFRawStream(unicodeStream).decode()
        ).toString()
        if (
          font.get(PDFName.of("BaseFont"))!.toString().endsWith("Outfit-400")
        ) {
          for (const range of unicode.matchAll(
            /<([\da-f]+)>\s*<[\da-f]+>\s*\[([^\]]+)\]/gi
          )) {
            const mappings = [...range[2]!.matchAll(/<([^>]+)>/g)].map(
              (match) => match[1]
            )
            const comma = mappings.indexOf("002c")
            if (comma < 0) continue
            const actual = embedded.getGlyph(
              Number.parseInt(range[1]!, 16) + comma
            ).path.bbox
            const expected = (await loadPdfKitBrandFonts()).byAlias
              .get("Outfit-400")!
              .font.glyphForCodePoint(44).path.bbox
            for (const coordinate of ["minX", "minY", "maxX", "maxY"] as const)
              expect(
                Math.abs(actual[coordinate] - expected[coordinate])
              ).toBeLessThanOrEqual(1)
          }
        }
      }
    }
  }
  const pdf = await getDocument({
    data: Uint8Array.from(bytes),
    useSystemFonts: false,
  }).promise
  const pages = []
  for (let number = 1; number <= pdf.numPages; number++) {
    const page = await pdf.getPage(number)
    const content = await page.getTextContent()
    const items = content.items
      .filter((item) => "str" in item)
      .map((item) => ({
        text: item.str,
        x: item.transform[4]!,
        y: item.transform[5]!,
        shear: item.transform[2]!,
        size: item.transform[0]!,
      }))
    pages.push({ text: items.map((item) => item.text).join(" "), items })
  }
  await pdf.destroy()
  expect(
    pages.every(
      (page) => !page.text.includes("\u0000") && !page.text.includes("�")
    )
  ).toBe(true)
  return {
    document,
    pages,
    fontNames: [...fontNames].join(" "),
    text: pages.map((page) => page.text).join("\n"),
  }
}

function portrait(result: Awaited<ReturnType<typeof inspect>>) {
  expect(result.pages).toHaveLength(1)
  expect(result.document.getPage(0).getWidth()).toBeCloseTo(595.276, 2)
  expect(result.document.getPage(0).getHeight()).toBeCloseTo(841.89, 2)
}

const content = {
  title: "Notice",
  department: "HR",
  effectiveDate: "2026-09-14",
  languages: ["en", "hi", "gu"],
  inputs: { Message: "Meeting at 10:00" },
  changeReason: "Time corrected",
  translations: [
    {
      language: "en",
      title: "Meeting",
      sections: [{ heading: "Time", body: "10:00" }],
    },
    {
      language: "hi",
      title: "बैठक",
      sections: [{ heading: "समय", body: "10:00" }],
    },
    {
      language: "gu",
      title: "મીટિંગ",
      sections: [{ heading: "સમય", body: "10:00" }],
    },
  ],
}
describe("Branding issue contract", () => {
  it("issues multilingual notices with one body per language and no headings", async () => {
    const parsed = parseBrandingContent(
      {
        ...content,
        translations: content.translations.map((entry) => ({
          ...entry,
          sections: [
            {
              heading: "",
              body: "Meeting at 10:00.\nPlease attend.\n\nBring notes.",
            },
          ],
        })),
      },
      "notice"
    )
    expect(() => validateBrandingIssue(parsed, 0, "notice")).not.toThrow()
    const notice = await generateBrandingPdf({
      content: parsed,
      type: "notice",
      number: "Draft",
      revision: 0,
      issuedAt: "2026-09-15",
      authorName: "Author",
      draft: true,
    })
    const output = await inspect(notice)
    portrait(output)
    expect(
      output.text.match(/Meeting at 10:00\. Please attend\./g)
    ).toHaveLength(3)
    expect(output.text.match(/Bring notes\./g)).toHaveLength(3)
    expect(output.text).toContain("Number assigned on issue")
    expect(output.fontNames).toContain("Outfit-800")
    expect(output.fontNames).toContain("Hind-Regular")
    expect(output.fontNames).toContain("HindVadodara-Regular")
    expect(parsed.translations[0]!.sections[0]!.body).toContain(
      "10:00.\nPlease"
    )
    parsed.translations[1]!.sections[0]!.body = ""
    expect(() => validateBrandingIssue(parsed, 0, "notice")).toThrow("Hindi")
  })
  it("preserves notice headings and tables across saves and omits empty languages", async () => {
    const richBody = {
      type: "doc",
      content: [
        {
          type: "table",
          content: [
            {
              type: "tableRow",
              content: [
                {
                  type: "tableCell",
                  content: [
                    {
                      type: "paragraph",
                      content: [
                        { type: "text", text: "૦૧૨૩૪૫૬૭૮૯ <schedule>" },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    }
    const parsed = parseBrandingContent(
      {
        ...content,
        languages: ["en", "gu"],
        translations: [
          { ...content.translations[0], sections: [{ heading: "", body: "" }] },
          {
            ...content.translations[2],
            sections: [
              {
                heading: "",
                body: "",
                richBody: {
                  ...richBody,
                  content: [
                    {
                      type: "heading",
                      attrs: { level: 2 },
                      content: [{ type: "text", text: "નોટિસ" }],
                    },
                    ...richBody.content,
                    {
                      type: "paragraph",
                      content: [
                        {
                          type: "text",
                          text: "Styled notice text",
                          marks: [
                            { type: "bold" },
                            { type: "italic" },
                            { type: "underline" },
                          ],
                        },
                      ],
                    },
                  ],
                },
              },
            ],
          },
        ],
      },
      "notice"
    )
    const reopened = parseBrandingContent(
      JSON.parse(JSON.stringify(parsed)),
      "notice"
    )
    expect(reopened).toEqual(parsed)
    const notice = await generateBrandingPdf({
      content: reopened,
      type: "notice",
      number: "Draft",
      revision: 0,
      issuedAt: "2026-09-16",
      authorName: "Author",
      draft: true,
    })
    const output = await inspect(notice)
    portrait(output)
    expect(reopened.translations[1]!.sections[0]!.body).toContain("નોટિસ")
    expect(output.text).toContain("૦૧૨૩૪૫૬૭૮૯")
    expect(output.text).toMatch(/<\s*schedule>/)
    expect(output.fontNames).toContain("NotoGujaratiDigits-400")
    expect(output.fontNames).toContain("HindVadodara-Bold")
    const styled = output.pages[0]!.items.find(
      (item) => item.text === "Styled notice text"
    )!
    expect(Math.abs(styled.shear)).toBeGreaterThan(0)
    const streams = output.document.getPage(0).node.Contents()!
    const references =
      streams instanceof PDFArray ? streams.asArray() : [streams]
    const commands = references
      .map((reference) => {
        const stream = output.document.context.lookup(reference)
        if (!(stream instanceof PDFRawStream))
          throw new Error("Expected page content stream.")
        return Buffer.from(decodePDFRawStream(stream).decode()).toString()
      })
      .join("\n")
    const underlineY =
      output.document.getPage(0).getHeight() - styled.y + styled.size * 0.1
    expect(
      [
        ...commands.matchAll(
          /([\d.-]+) ([\d.-]+) m\n([\d.-]+) ([\d.-]+) l\nS/g
        ),
      ].some(
        (line) =>
          Math.abs(Number(line[1]) - styled.x) < 0.01 &&
          Math.abs(Number(line[2]) - underlineY) < 0.01 &&
          Number(line[3]) > Number(line[1]) &&
          line[2] === line[4]
      )
    ).toBe(true)
    expect(output.text).not.toContain("Meeting")
    const heading = output.pages[0]!.items.find((item) =>
      /[\u0a80-\u0aff]/u.test(item.text)
    )!
    expect(heading.y).toBeGreaterThan(400)
    const cell = richBody.content[0]!.content[0]!.content[0]!
    Object.assign(cell, { attrs: { colspan: 2 } })
    expect(() =>
      parseBrandingContent(
        {
          ...parsed,
          translations: [
            {
              ...parsed.translations[1],
              sections: [{ heading: "", body: "", richBody }],
            },
          ],
        },
        "notice"
      )
    ).toThrow("unmerged")
  })
  it("round-trips nested SOP/Policy headings and independently numbered and bulleted bodies", () => {
    const paragraph = (text: string) => ({
      type: "paragraph",
      content: [{ type: "text", text, marks: [{ type: "bold" }] }],
    })
    const richBody = {
      type: "doc",
      content: [
        {
          type: "orderedList",
          attrs: { start: 8 },
          content: [
            {
              type: "listItem",
              content: [
                paragraph("Coordinate internally:"),
                {
                  type: "bulletList",
                  content: [
                    {
                      type: "listItem",
                      content: [paragraph("Purchase & Production")],
                    },
                  ],
                },
              ],
            },
            { type: "listItem", content: [paragraph("Next responsibility")] },
          ],
        },
      ],
    }
    const draft = {
      ...content,
      languages: ["en"],
      translations: [
        {
          language: "en",
          title: "Procedure",
          details: {
            introduction: {
              type: "doc",
              content: [paragraph("About this document")],
            },
            preparedBy: "Sales",
            attributions: [],
          },
          sections: [
            {
              heading: "Input & Output",
              body: "",
              childNumbering: "local",
              children: [
                {
                  heading: "Input",
                  body: "Legacy plain text",
                  includeInIndex: false,
                },
              ],
            },
            {
              heading: "Responsibilities",
              body: "ignored derived text",
              richBody,
              pageBreakBefore: true,
            },
          ],
        },
      ],
    }
    const parsed = parseBrandingContent(draft, "sop")
    expect(
      parseBrandingContent(JSON.parse(JSON.stringify(parsed)), "sop")
    ).toEqual(parsed)
    expect(parseBrandingContent(draft, "policy").translations).toEqual(
      parsed.translations
    )
    expect(() => validateBrandingIssue(parsed, 0)).not.toThrow()
    const outline = brandingOutline(parsed.translations[0]!.sections)
    expect(outline.map(({ label }) => label)).toEqual([
      "1. Input & Output",
      "1. Input",
      "2. Responsibilities",
    ])
    expect(outline[1]!.section.body).toBe("Legacy plain text")
    expect(outline[1]!.section.includeInIndex).toBe(false)
    const section = outline[2]!.section
    expect(section.body).toBe(
      "Coordinate internally:\nPurchase & Production\nNext responsibility"
    )
    expect(section.pageBreakBefore).toBe(true)
    expect(brandingRichTextHtml(section.richBody!)).toBe(
      '<ol start="8"><li><p><strong>Coordinate internally:</strong></p><ul><li><p><strong>Purchase &amp; Production</strong></p></li></ul></li><li><p><strong>Next responsibility</strong></p></li></ol>'
    )
  })
  it("rejects unsupported rich-text nodes at the save boundary", () => {
    expect(() =>
      parseBrandingContent(
        {
          ...content,
          languages: ["en"],
          translations: [
            {
              language: "en",
              title: "Policy",
              sections: [
                {
                  heading: "Purpose",
                  body: "",
                  richBody: {
                    type: "doc",
                    content: [{ type: "script", text: "alert(1)" }],
                  },
                },
              ],
            },
          ],
        },
        "policy"
      )
    ).toThrow("Unsupported document text format")
  })
  it("retains three-language content with independent numbers and no notice revision label", async () => {
    const parsed = parseBrandingContent(content, "notice")
    expect(() => validateBrandingIssue(parsed, 1)).not.toThrow()
    expect(parsed.translations[1]?.title).toBe("बैठक")
    expect(parsed.translations[2]?.title).toBe("મીટિંગ")
    expect([
      brandingNumber("sop", 1),
      brandingNumber("notice", 1),
      brandingNumber("policy", 1),
      brandingNumber("work-instruction", 1),
    ]).toEqual(["MRM-SOP-0001", "MRM-NTC-0001", "MRM-POL-0001", "MRM-WI-0001"])
    expect(revisionLabel(1)).toBe("R01")
    const notice = await generateBrandingPdf({
      content: parsed,
      number: brandingNumber("notice", 1),
      type: "notice",
      revision: 0,
      issuedAt: "2026-09-14",
      authorName: "Author",
    })
    const output = await inspect(notice)
    portrait(output)
    expect(output.text).toContain("MRM-NTC-0001")
    expect(output.text).toContain("14 / 09 / 2026")
    expect(output.text).not.toContain("R00")
    const items = output.pages[0]!.items
    const number = items.find((item) => item.text === "MRM-NTC-0001")!
    expect(number.x).toBeGreaterThan(450)
    const gu = items.find((item) => /\p{Script=Gujarati}/u.test(item.text))!
    const hi = items.find((item) => /\p{Script=Devanagari}/u.test(item.text))!
    expect(gu.y).toBeGreaterThan(hi.y)
    expect(items.filter((item) => item.y < 70)).toHaveLength(0)
  })
  it("blocks issue when a selected language has no reviewed content", () => {
    const parsed = parseBrandingContent(
      { ...content, translations: content.translations.slice(0, 2) },
      "notice"
    )
    expect(() => validateBrandingIssue(parsed, 0)).toThrow("Gujarati")
  })
  it("keeps visual guide symbols fixed while retaining editable captions", async () => {
    const parsed = parseBrandingContent(
      {
        ...content,
        languages: ["en"],
        translations: [
          {
            language: "en",
            title: "Visual guide",
            sections: ["bad", "good"].map((assessment) => ({
              heading: "",
              body: `${assessment} assembly`,
              layout: "visual-guide",
              assessment,
              picture: jpeg,
            })),
          },
        ],
      },
      "work-instruction"
    )
    expect(() => validateBrandingIssue(parsed, 0)).not.toThrow()
    expect(() =>
      parseBrandingContent(
        {
          ...parsed,
          translations: parsed.translations.map((entry) => ({
            ...entry,
            sections: entry.sections.slice(0, 1),
          })),
        },
        "work-instruction"
      )
    ).toThrow("exactly one fixed Bad and Good")
    const result = await generateBrandingPdf({
      content: parsed,
      type: "work-instruction",
      number: "Draft",
      revision: 0,
      issuedAt: "2026-09-15",
      authorName: "Author",
      draft: true,
    })
    const output = await inspect(result)
    expect(output.pages).toHaveLength(1)
    expect(output.document.getPage(0).getWidth()).toBeCloseTo(841.89, 2)
    expect(output.document.getPage(0).getHeight()).toBeCloseTo(595.276, 2)
    expect(output.text).toContain("bad assembly")
    expect(output.text).toContain("good assembly")
    expect(output.text).not.toContain("1)")
    expect(output.text).not.toContain("2)")
    expect(
      output.pages[0]!.items.find((item) => item.text.includes("bad"))!.y
    ).toBeGreaterThan(
      output.pages[0]!.items.find((item) => item.text.includes("good"))!.y
    )
  })
  it("retains four editable pictures and captions in a fixed two-by-two instruction grid", async () => {
    const picture = jpeg
    const parsed = parseBrandingContent(
      {
        ...content,
        languages: ["en"],
        translations: [
          {
            language: "en",
            title: "Washing",
            sections: Array.from({ length: 4 }, (_, i) => ({
              heading: "",
              body: `Step ${i + 1}`,
              layout: "text-on-picture",
              picture,
            })),
          },
        ],
      },
      "work-instruction"
    )
    expect(parsed.translations[0]?.sections[3]?.picture).toBe(picture)
    expect(() => validateBrandingIssue(parsed, 0)).not.toThrow()
    expect(brandingStepNumber("gu", 4)).toBe("૪)")
    const result = await generateBrandingPdf({
      content: parsed,
      type: "work-instruction",
      number: "Draft",
      revision: 0,
      issuedAt: "2026-09-15",
      authorName: "Author",
      draft: true,
    })
    const output = await inspect(result)
    portrait(output)
    expect(output.text).toContain("Step 4")
    expect(output.text).toContain("4)")
    const positions = [1, 2, 3, 4].map(
      (step) =>
        output.pages[0]!.items.find((item) => item.text === `Step ${step}`)!
    )
    expect(positions[0]!.x).toBeLessThan(positions[1]!.x)
    expect(positions[0]!.y).toBeCloseTo(positions[1]!.y, 2)
    expect(positions[0]!.y).toBeGreaterThan(positions[2]!.y)
    const side = await generateBrandingPdf({
      content: {
        ...parsed,
        translations: parsed.translations.map((translation) => ({
          ...translation,
          sections: translation.sections.map((section) => ({
            ...section,
            layout: "picture-left",
          })),
        })),
      },
      type: "work-instruction",
      number: "Draft",
      revision: 0,
      issuedAt: "2026-09-15",
      authorName: "Author",
      draft: true,
    })
    const sideOutput = await inspect(side)
    portrait(sideOutput)
    const sidePositions = [1, 2, 3, 4].map(
      (step) =>
        sideOutput.pages[0]!.items.find((item) => item.text === `Step ${step}`)!
    )
    const stepPositions = [1, 2, 3, 4].map(
      (step) =>
        sideOutput.pages[0]!.items.find((item) => item.text === `${step})`)!
    )
    expect(new Set(stepPositions.map((item) => Math.round(item.x))).size).toBe(
      1
    )
    expect(sidePositions[0]!.y).toBeGreaterThan(sidePositions[3]!.y)
    expect(() =>
      parseBrandingContent(
        {
          ...parsed,
          translations: [
            {
              ...parsed.translations[0],
              sections: [
                {
                  heading: "1",
                  body: "Step",
                  layout: "text-on-picture",
                  picture: "https://example.com/private-image",
                },
              ],
            },
          ],
        },
        "work-instruction"
      )
    ).toThrow("uploaded JPEG")
  })
  it("flows a book with mixed metadata, hanging lists and actual multi-page index references", async () => {
    const fixture = structuredClone(
      brandingVerificationFixtures.find(
        (fixture) => fixture.name === "multipage-book"
      )!
    )
    const parsed = parseBrandingContent(fixture.content, "sop")
    parsed.translations[0]!.details!.preparedBy =
      "Quality / गुणवत्ता / ગુણવત્તા ૧૨"
    parsed.translations[0]!.sections.push(
      ...Array.from({ length: 24 }, (_, index) => ({
        heading: `Additional control ${index + 1}`,
        body: "Retain the approved record.",
      }))
    )
    parsed.languages.push("hi")
    parsed.translations.push({
      language: "hi",
      title: "हिन्दी प्रक्रिया",
      details: structuredClone(parsed.translations[0]!.details!),
      sections: [
        {
          heading: "Translated control one",
          body: "कार्य क्षेत्र की जाँच करें। પગલાં ૧૨ પૂર્ણ કરો.",
        },
        {
          heading: "Translated control two",
          body: "Retain the translated record.",
          pageBreakBefore: true,
        },
      ],
    })
    const output = await inspect(
      await generateBrandingPdf({ ...fixture, content: parsed })
    )
    expect(output.pages.length).toBeGreaterThan(8)
    expect(output.pages[0]!.text).not.toContain("Doc. No.:")
    expect(output.pages[1]!.text).toContain("Prepared by: Quality")
    expect(output.pages[1]!.text).toMatch(/\p{Script=Devanagari}/u)
    expect(output.pages[1]!.text).toMatch(/\p{Script=Gujarati}/u)
    expect(output.pages[1]!.text).toContain("૧૨")
    expect(output.fontNames).toContain("Hind-Regular")
    expect(output.fontNames).toContain("HindVadodara-Regular")
    expect(output.fontNames).toContain("NotoGujaratiDigits-400")
    expect(output.text).toContain("Verify the work area and machine condition.")
    expect(output.text).toContain("Record the result before proceeding.")
    const covers = output.pages.flatMap((page, index) =>
      page.items.some(
        (item) => item.x > 540 && item.y < 60 && /^\d+$/.test(item.text)
      )
        ? []
        : [index]
    )
    expect(covers).toHaveLength(2)
    for (const [languageIndex, translation] of parsed.translations.entries()) {
      const first = covers[languageIndex]!
      const last = covers[languageIndex + 1] ?? output.pages.length
      const pages = output.pages.slice(first, last)
      expect(
        pages[1]!.items.find((item) => item.x > 540 && item.y < 60)!.text
      ).toBe("1")
      const indexPages = pages.filter((page) =>
        page.text.includes("Table Of Contents")
      )
      if (!languageIndex) expect(indexPages.length).toBeGreaterThan(1)
      for (const entry of brandingOutline(translation.sections)) {
        const actual = pages.findIndex(
          (page, index) =>
            index > 1 &&
            !page.text.includes("Table Of Contents") &&
            page.items.some((item) => item.text === entry.label)
        )
        expect(actual).toBeGreaterThan(0)
        if (entry.section.heading === "Control stage 6")
          expect(pages[actual]!.text).toContain("Stage 6 establishes")
        const indexPage = indexPages.find((page) =>
          page.items.some((item) => item.text === entry.section.heading)
        )!
        const title = indexPage.items.find(
          (item) => item.text === entry.section.heading
        )!
        const printedReference = indexPage.items.find(
          (item) => item.x > 500 && Math.abs(item.y - title.y) < 1
        )!
        expect(printedReference.text).toBe(String(actual))
        const footer = pages[actual]!.items.find(
          (item) => item.x > 540 && item.y < 60
        )!
        expect(footer.text).toBe(String(actual))
        expect(title.y).toBeGreaterThan(70)
      }
    }
  })
  it("rejects an impossible fixed notice element without returning a partial PDF", async () => {
    const fixture = brandingVerificationFixtures[0]!
    await expect(
      generateBrandingPdf({
        ...fixture,
        content: parseBrandingContent(fixture.content, "notice"),
        draft: false,
        number: "X".repeat(10000),
      })
    ).rejects.toThrow("fixed PDF region")
  })
})
