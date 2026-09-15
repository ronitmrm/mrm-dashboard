export const brandingTypes = [
  "sop",
  "notice",
  "policy",
  "work-instruction",
] as const
export type BrandingType = (typeof brandingTypes)[number]
export const brandingLanguages = ["en", "hi", "gu"] as const
export type BrandingLanguage = (typeof brandingLanguages)[number]
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
export type BrandingTranslation = {
  language: BrandingLanguage
  title: string
  sections: { heading: string; body: string }[]
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
    if (!language || !Array.isArray(item.sections) || item.sections.length > 20)
      throw new Error("Document sections are invalid.")
    return {
      language,
      title: text(item.title, "Translated title", 240),
      sections: item.sections.map((entry: unknown) => {
        const section = object(entry)
        return {
          heading: text(section.heading, "Heading", 200),
          body: text(section.body, "Section"),
        }
      }),
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
  if (JSON.stringify(result).length > 180000)
    throw new Error("Document is too long. Split it into smaller documents.")
  return result
}
export function validateBrandingIssue(
  content: BrandingContent,
  revision: number
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
      translation.sections.some(({ heading, body }) => !heading || !body)
    )
      throw new Error(
        `Complete and review the ${brandingLanguageLabels[language]} content before issue.`
      )
  }
}
