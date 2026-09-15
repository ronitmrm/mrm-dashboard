import { describe, expect, it } from "vitest"
import {
  brandingNumber,
  brandingStepNumber,
  parseBrandingContent,
  revisionLabel,
  validateBrandingIssue,
} from "@workspace/db/branding-domain"
import { brandingHtml, escapeBrandingHtml } from "./pdf"

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
    const notice = await brandingHtml({
      content: parsed,
      number: brandingNumber("notice", 1),
      type: "notice",
      revision: 0,
      issuedAt: "2026-09-14",
      authorName: "Author",
    })
    const footer = notice.footer.replace(/<style>[\s\S]*?<\/style>/g, "")
    expect(footer).not.toContain("MRM-NTC-0001")
    expect(footer).not.toContain("R00")
    expect(notice.html).toContain(
      '<div class="notice-number">MRM-NTC-0001</div>'
    )
    expect(notice.html).toContain("14 / 09 / 2026")
    expect(notice.html).toContain("સમય")
    expect(notice.html).toContain("समय")
    expect(notice.html.indexOf('lang="gu"')).toBeLessThan(
      notice.html.indexOf('lang="hi"')
    )
    expect(escapeBrandingHtml('<script>"text"</script>')).toBe(
      "&lt;script&gt;&quot;text&quot;&lt;/script&gt;"
    )
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
              picture: "data:image/jpeg;base64,/9j/2Q==",
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
    const result = await brandingHtml({
      content: parsed,
      type: "work-instruction",
      number: "Draft",
      revision: 0,
      issuedAt: "2026-09-15",
      authorName: "Author",
      draft: true,
    })
    expect(result.html).toContain(
      'aria-label="Bad" fill="none" stroke="#F51524"'
    )
    expect(result.html).toContain(
      'aria-label="Good" fill="none" stroke="#006A49"'
    )
    expect(result.html).toContain("bad assembly")
    expect(result.html).not.toContain('<span class="wi-step">')
  })
  it("retains four editable pictures and captions in a fixed two-by-two instruction grid", async () => {
    const picture = "data:image/jpeg;base64,/9j/2Q=="
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
    const result = await brandingHtml({
      content: parsed,
      type: "work-instruction",
      number: "Draft",
      revision: 0,
      issuedAt: "2026-09-15",
      authorName: "Author",
      draft: true,
    })
    expect(result.html.match(/<img /g)).toHaveLength(4)
    expect(result.html).toContain(
      "grid-template-columns:repeat(2,minmax(0,1fr));grid-template-rows:repeat(2,minmax(0,1fr))"
    )
    expect(result.html).toContain("Step 4")
    expect(result.html).toContain('<span class="wi-step">4)</span>')
    expect(result.html).toContain("object-fit:cover")
    const side = await brandingHtml({
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
    expect(side.html).toContain(
      "grid-template-columns:repeat(1,minmax(0,1fr));grid-template-rows:repeat(4,minmax(0,1fr))"
    )
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
})
