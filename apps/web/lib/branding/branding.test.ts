import { describe, expect, it } from "vitest"
import {
  brandingNumber,
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
    const header = notice.header.replace(/<style>[\s\S]*?<\/style>/g, "")
    expect(header).toContain("MRM-NTC-0001")
    expect(header).not.toContain("R00")
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
})
