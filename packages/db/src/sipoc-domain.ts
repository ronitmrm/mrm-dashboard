export const sipocTextFields = [
  { key: "name", label: "Process name" },
  { key: "purpose", label: "Purpose / expected result" },
  { key: "scope", label: "Scope / exclusions" },
  { key: "start", label: "Start trigger / boundary" },
  { key: "end", label: "End result / boundary" },
  { key: "department", label: "Responsible department" },
  { key: "inputRequirements", label: "Input requirements / specifications" },
  { key: "outputCriteria", label: "Output acceptance criteria" },
  { key: "resources", label: "Resources / constraints" },
  { key: "controls", label: "Controls / records" },
  { key: "risks", label: "Risks / opportunities / controls" },
  { key: "interfaces", label: "Interfaces / related document references" },
  { key: "measure", label: "Performance measure" },
  { key: "measurement", label: "Measurement method / record" },
  { key: "target", label: "Target / acceptance level" },
  { key: "frequency", label: "Measurement / review frequency" },
] as const
export const sipocLists = [
  {
    key: "suppliers",
    label: "Suppliers",
    help: "Who provides inputs? Internal departments or external providers.",
  },
  {
    key: "inputs",
    label: "Inputs",
    help: "Material, information, approvals or records needed.",
  },
  {
    key: "steps",
    label: "Process steps",
    help: "Ordered high-level activities. Usually 5–7; keep the map concise.",
  },
  {
    key: "outputs",
    label: "Outputs",
    help: "Products, services or records produced.",
  },
  {
    key: "customers",
    label: "Customers",
    help: "Who receives each output? Internal or external.",
  },
] as const
export type SipocFields = Record<
  (typeof sipocTextFields)[number]["key"],
  string
> &
  Record<(typeof sipocLists)[number]["key"], string[]> & {
    ownerUserId: string | null
    nextReviewOn: string | null
  }
export function sipocText(value: unknown, max = 4000) {
  if (value == null) return ""
  if (typeof value !== "string" || value.trim().length > max)
    throw new Error(`Use text within ${max} characters.`)
  return value.trim()
}
export function parseSipoc(value: unknown): SipocFields {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Check the SIPOC fields.")
  const row = value as Record<string, unknown>
  const fields = Object.fromEntries(
    sipocTextFields.map(({ key }) => [key, sipocText(row[key])])
  )
  const lists = Object.fromEntries(
    sipocLists.map(({ key }) => {
      const list = row[key] ?? []
      if (!Array.isArray(list) || list.length > 30)
        throw new Error("Use at most 30 entries in each SIPOC element.")
      return [key, list.map((item) => sipocText(item, 1000)).filter(Boolean)]
    })
  )
  const ownerUserId = sipocText(row.ownerUserId, 100) || null
  if (
    ownerUserId &&
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      ownerUserId
    )
  )
    throw new Error("Select a process owner.")
  const nextReviewOn = sipocText(row.nextReviewOn, 10) || null
  if (
    nextReviewOn &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(nextReviewOn) ||
      !Number.isFinite(Date.parse(nextReviewOn)) ||
      new Date(nextReviewOn).toISOString().slice(0, 10) !== nextReviewOn)
  )
    throw new Error("Choose a valid review date.")
  if (!fields.name) throw new Error("Process name is required.")
  return { ...fields, ...lists, ownerUserId, nextReviewOn } as SipocFields
}
export function sipocToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date())
}
export function validateSipocSubmission(fields: SipocFields) {
  const today = sipocToday()
  if (fields.nextReviewOn && fields.nextReviewOn < today)
    throw new Error(
      "Choose a current or future next review date before submission or approval."
    )
  if (
    !fields.ownerUserId ||
    !fields.nextReviewOn ||
    ![
      "purpose",
      "scope",
      "start",
      "end",
      "department",
      "inputRequirements",
      "outputCriteria",
      "controls",
      "measure",
      "measurement",
      "target",
      "frequency",
    ].every((key) => fields[key as keyof SipocFields])
  )
    throw new Error(
      "Complete ownership, scope, boundaries, input requirements, acceptance criteria, controls, performance measure/method/target/frequency and next review date before submission."
    )
  if (sipocLists.some(({ key }) => !fields[key].length))
    throw new Error("Complete all five SIPOC elements before submission.")
}
