import {
  brandingRichTextPlain,
  parseBrandingRichText,
  type BrandingRichText,
} from "./branding-rich-text"
export {
  brandingRichTextPlain,
  parseBrandingRichText,
  plainBrandingRichText,
  brandingRichTextHtml,
  type BrandingRichText,
} from "./branding-rich-text"

export const brandingTypes = [
  "sop",
  "notice",
  "policy",
  "work-instruction",
] as const
export type BrandingType = (typeof brandingTypes)[number]
export const brandingLanguages = ["en", "hi", "gu"] as const
export type BrandingLanguage = (typeof brandingLanguages)[number]
export function brandingStepNumber(
  language: BrandingLanguage,
  position: number
) {
  const digits = { en: "0123456789", hi: "०१२३४५६७८९", gu: "૦૧૨૩૪૫૬૭૮૯" }[
    language
  ]
  return `${String(position).replace(/\d/g, (digit) => digits[Number(digit)]!)})`
}
export const brandingLanguageLabels = {
  en: "English",
  hi: "Hindi",
  gu: "Gujarati",
} as const
export const brandingTypeLabels = {
  sop: "SOPs",
  notice: "Notices",
  policy: "Policies",
  "work-instruction": "Work Instructions",
} as const
export const brandingPrefixes = {
  sop: "SOP",
  notice: "NTC",
  policy: "POL",
  "work-instruction": "WI",
} as const
export const brandingFields = {
  "work-instruction": ["Purpose", "Instructions", "Checks"],
  sop: [
    "Purpose",
    "Scope",
    "Responsibilities",
    "Equipment and PPE",
    "Procedure",
    "Precautions",
    "Records and checks",
  ],
  notice: ["Audience", "Message", "Required action", "Relevant dates"],
  policy: [
    "Purpose",
    "Scope",
    "Rules",
    "Responsibilities",
    "Exceptions",
    "Consequences",
  ],
} as const
export const workInstructionLayouts = [
  "text",
  "text-on-picture",
  "picture-left",
  "visual-guide",
] as const
export type WorkInstructionLayout = (typeof workInstructionLayouts)[number]
export const brandingPictureMaxLength = 400000
export type BrandingSection = {
  heading: string
  body: string
  richBody?: BrandingRichText
  children?: BrandingSection[]
  childNumbering?: "hierarchical" | "local" | "none"
  includeInIndex?: boolean
  pageBreakBefore?: boolean
  layout?: WorkInstructionLayout
  picture?: string
  assessment?: "good" | "bad"
}
export type BrandingTranslation = {
  language: BrandingLanguage
  title: string
  sections: BrandingSection[]
  details?: {
    introduction: BrandingRichText
    preparedBy: string
    attributions: {
      role: "Issued by" | "Reviewed by" | "Approved by"
      name: string
      designation: string
    }[]
  }
}

export function brandingNoticeBody(sections: BrandingSection[]) {
  return sections
    .map(({ heading, body }) => [heading, body].filter(Boolean).join("\n"))
    .filter(Boolean)
    .join("\n\n")
}

export function brandingNoticeRichText(
  sections: BrandingSection[]
): BrandingRichText {
  return {
    type: "doc",
    content: sections.flatMap(
      (section) =>
        section.richBody?.content ??
        brandingNoticeBody([section])
          .split(/\r?\n\s*\r?\n/)
          .map((paragraph) => ({
            type: "paragraph" as const,
            content: paragraph
              ? [
                  {
                    type: "text" as const,
                    text: paragraph.replace(/\s*\r?\n\s*/g, " "),
                  },
                ]
              : [],
          }))
    ),
  }
}

export function brandingOutline(
  sections: BrandingSection[],
  parent: number[] = [],
  style: BrandingSection["childNumbering"] = "hierarchical"
): {
  section: BrandingSection
  number: string
  label: string
  depth: number
  path: number[]
}[] {
  return sections.flatMap((section, index) => {
    const path = [...parent, index + 1]
    const number =
      style === "none"
        ? ""
        : style === "local"
          ? `${index + 1}`
          : path.join(".")
    return [
      {
        section,
        number,
        label: `${number ? `${number}. ` : ""}${section.heading}`,
        depth: parent.length,
        path,
      },
      ...brandingOutline(section.children ?? [], path, section.childNumbering),
    ]
  })
}
export type BrandingContent = {
  title: string
  department: string
  effectiveDate: string
  languages: BrandingLanguage[]
  inputs: Record<string, string>
  translations: BrandingTranslation[]
  changeReason: string
}
export function isBrandingType(value: unknown): value is BrandingType {
  return brandingTypes.some((type) => type === value)
}
export function revisionLabel(revision: number) {
  return `R${String(revision).padStart(2, "0")}`
}
export function brandingNumber(type: BrandingType, sequence: number) {
  return `MRM-${brandingPrefixes[type]}-${String(sequence).padStart(4, "0")}`
}
function text(value: unknown, label: string, max = 12000) {
  if (typeof value !== "string" || value.length > max)
    throw new Error(`${label} is invalid or too long.`)
  return value.trim()
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Document content is invalid.")
  return value as Record<string, unknown>
}
export function parseBrandingTranslations(
  value: unknown
): BrandingTranslation[] {
  if (!Array.isArray(value) || value.length > 3)
    throw new Error("Language content is invalid.")
  return value.map((entry: unknown) => {
    const item = object(entry)
    const language = brandingLanguages.find(
      (language) => language === item.language
    )
    if (
      !language ||
      !Array.isArray(item.sections) ||
      item.sections.length > 100
    )
      throw new Error("Document sections are invalid.")
    let sectionCount = 0
    const parseSection = (entry: unknown, depth = 0): BrandingSection => {
      if (++sectionCount > 100 || depth > 3)
        throw new Error(
          "Use at most 100 headings and four heading levels per language."
        )
      const section = object(entry)
      const richBody =
        section.richBody === undefined
          ? undefined
          : parseBrandingRichText(section.richBody)
      if (section.children !== undefined && !Array.isArray(section.children))
        throw new Error("Subheadings are invalid.")
      const childNumbering = section.childNumbering
      if (
        childNumbering !== undefined &&
        childNumbering !== "hierarchical" &&
        childNumbering !== "local" &&
        childNumbering !== "none"
      )
        throw new Error("Subheading numbering is invalid.")
      for (const key of ["includeInIndex", "pageBreakBefore"]) {
        if (section[key] !== undefined && typeof section[key] !== "boolean")
          throw new Error("Heading options are invalid.")
      }
      const extras: Partial<BrandingSection> = {
        ...(richBody ? { richBody } : {}),
        ...(section.children
          ? {
              children: (section.children as unknown[]).map((child) =>
                parseSection(child, depth + 1)
              ),
            }
          : {}),
        ...(childNumbering ? { childNumbering } : {}),
        ...(section.includeInIndex !== undefined
          ? { includeInIndex: section.includeInIndex as boolean }
          : {}),
        ...(section.pageBreakBefore !== undefined
          ? { pageBreakBefore: section.pageBreakBefore as boolean }
          : {}),
      }
      const layout =
        section.layout === undefined
          ? undefined
          : workInstructionLayouts.find((layout) => layout === section.layout)
      if (section.layout !== undefined && !layout)
        throw new Error("Section format is invalid.")
      if (
        layout === "visual-guide" &&
        section.assessment !== "good" &&
        section.assessment !== "bad"
      )
        throw new Error("Choose Good or Bad for each visual guide picture.")
      const picture =
        section.picture === undefined
          ? undefined
          : text(section.picture, "Picture", brandingPictureMaxLength)
      if (
        picture &&
        !/^data:image\/jpeg;base64,\/9j\/[A-Za-z0-9+/]*={0,2}$/.test(picture)
      )
        throw new Error("Use an uploaded JPEG picture.")
      return {
        ...extras,
        heading: text(section.heading, "Heading", 200),
        body: richBody
          ? brandingRichTextPlain(richBody).trim()
          : text(section.body, "Section"),
        ...(layout ? { layout } : {}),
        ...(picture && layout && layout !== "text" ? { picture } : {}),
        ...(layout === "visual-guide"
          ? { assessment: section.assessment as "good" | "bad" }
          : {}),
      }
    }
    const details =
      item.details === undefined ? undefined : object(item.details)
    const attributions = details?.attributions ?? []
    if (!Array.isArray(attributions) || attributions.length > 3)
      throw new Error("Printed attributions are invalid.")
    return {
      language,
      title: text(item.title, "Translated title", 240),
      sections: item.sections.map((section) => parseSection(section)),
      ...(details
        ? {
            details: {
              introduction: parseBrandingRichText(details.introduction),
              preparedBy: text(details.preparedBy ?? "", "Prepared by", 240),
              attributions: attributions.map((entry: unknown) => {
                const attribution = object(entry)
                const role = attribution.role
                if (
                  role !== "Issued by" &&
                  role !== "Reviewed by" &&
                  role !== "Approved by"
                )
                  throw new Error("Printed attribution role is invalid.")
                return {
                  role,
                  name: text(attribution.name, "Name", 160),
                  designation: text(
                    attribution.designation,
                    "Designation",
                    160
                  ),
                }
              }),
            },
          }
        : {}),
    }
  })
}
export function parseBrandingContent(
  value: unknown,
  type: BrandingType
): BrandingContent {
  const item = object(value)
  const title = text(item.title, "Title", 240)
  const department = text(item.department, "Department", 160)
  if (!title || !department)
    throw new Error("Title and department are required.")
  if (!Array.isArray(item.languages))
    throw new Error("Select at least one language.")
  const languages = brandingLanguages.filter((language) =>
    (item.languages as unknown[]).includes(language)
  )
  if (!languages.length || languages.length !== item.languages.length)
    throw new Error("Select English, Hindi or Gujarati without duplicates.")
  const effectiveDate = text(item.effectiveDate, "Effective date", 10)
  if (
    effectiveDate &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate) ||
      !Number.isFinite(Date.parse(effectiveDate)) ||
      new Date(effectiveDate).toISOString().slice(0, 10) !== effectiveDate)
  )
    throw new Error("Effective date is invalid.")
  const inputs = object(item.inputs)
  const translations = parseBrandingTranslations(item.translations)
  if (
    type !== "sop" &&
    type !== "policy" &&
    translations.some((translation) => translation.sections.length > 20)
  )
    throw new Error("Use at most 20 sections per language.")
  const sections = translations.flatMap((translation) =>
    brandingOutline(translation.sections).map(({ section }) => section)
  )
  if (
    type !== "sop" &&
    type !== "policy" &&
    (translations.some((entry) => entry.details) ||
      sections.some(
        (section) =>
          (section.richBody && type !== "notice") ||
          section.children ||
          section.childNumbering ||
          section.includeInIndex !== undefined ||
          section.pageBreakBefore !== undefined
      ))
  )
    throw new Error(
      "Formatted documents are only available for SOPs and Policies."
    )
  if (
    type !== "work-instruction" &&
    sections.some((section) => section.layout || section.picture)
  )
    throw new Error("Picture formats are only available for Work Instructions.")
  if (
    sections.some((section) => section.layout === "visual-guide") &&
    translations.some(
      ({ sections }) =>
        sections.length !== 2 ||
        sections[0]?.assessment !== "bad" ||
        sections[1]?.assessment !== "good" ||
        sections.some(
          (section) => section.layout !== "visual-guide" || section.heading
        )
    )
  )
    throw new Error(
      "Visual Guide requires exactly one fixed Bad and Good picture/text pair per language, without headings or other formats."
    )
  if (sections.filter((section) => section.picture).length > 20)
    throw new Error("A Work Instruction supports up to 20 pictures.")
  if (
    new Set(translations.map(({ language }) => language)).size !==
      translations.length ||
    translations.some(({ language }) => !languages.includes(language))
  )
    throw new Error("Content must match selected languages.")
  const result = {
    title,
    department,
    effectiveDate,
    languages,
    inputs: Object.fromEntries(
      brandingFields[type].map((field) => [
        field,
        text(inputs[field] ?? "", field),
      ])
    ),
    translations,
    changeReason: text(item.changeReason ?? "", "Change reason", 2000),
  }
  if (
    JSON.stringify(result, (key, value: unknown) =>
      key === "picture" ? undefined : value
    ).length > 180000
  )
    throw new Error("Document is too long. Split it into smaller documents.")
  return result
}
export function validateBrandingIssue(
  content: BrandingContent,
  revision: number,
  type?: BrandingType
) {
  if (!content.effectiveDate)
    throw new Error("Effective date is required before issue.")
  if (revision > 0 && !content.changeReason)
    throw new Error("Enter a reason for this revision.")
  for (const language of content.languages) {
    const translation = content.translations.find(
      (entry) => entry.language === language
    )
    if (
      !translation?.title ||
      !translation.sections.length ||
      brandingOutline(translation.sections).some(
        ({ section: { heading, body, layout, picture, children } }) =>
          (!body.trim() && !children?.length) ||
          (layout && layout !== "text"
            ? !picture
            : type !== "notice" && !heading)
      )
    )
      throw new Error(
        `Complete and review the ${brandingLanguageLabels[language]} content before issue.`
      )
  }
}
