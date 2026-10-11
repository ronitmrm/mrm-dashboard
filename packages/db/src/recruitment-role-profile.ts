export const roleProfileFields = [
  {
    key: "purpose",
    label: "Role purpose",
    help: "State the result this role exists to deliver.",
  },
  {
    key: "reportsTo",
    label: "Reports to / accountability",
    help: "Identify the reporting role and who reviews the work.",
  },
  {
    key: "authority",
    label: "Decision authority",
    help: "Record decisions this role may make or approve under confirmed company delegation.",
  },
  {
    key: "limits",
    label: "Authority limits / required approvals",
    help: "Record financial, quality, safety and operational limits, and decisions requiring approval.",
  },
  {
    key: "escalation",
    label: "Escalation and handoffs",
    help: "State what must be escalated, to whom, and the records or information to hand over.",
  },
  {
    key: "measures",
    label: "Accountability / expected results",
    help: "State measurable or observable results and the records used to review performance.",
  },
  {
    key: "competence",
    label: "Required competence / training",
    help: "Specify job-related skills, demonstrations and training required for the role.",
  },
] as const
export type RecruitmentRoleProfile = Partial<
  Record<(typeof roleProfileFields)[number]["key"], string>
>
export const roleQuestionFocus = [
  "Role",
  "Responsibilities",
  "Authority",
  "Technical",
  "Availability",
] as const
export const roleQuestionRounds = [
  "Screening Round",
  "Technical Round",
  "HR Round",
] as const
export type RecruitmentRoleQuestion = {
  id: string
  round: (typeof roleQuestionRounds)[number]
  focus: (typeof roleQuestionFocus)[number]
  prompt: string
  evidence: string
  originalPrompt?: string
}
function object(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Check the role profile values.")
  return value as Record<string, unknown>
}
function text(value: unknown, max = 4000) {
  if (value == null) return ""
  if (typeof value !== "string" || value.trim().length > max)
    throw new Error(`Enter text within ${max.toLocaleString()} characters.`)
  return value.trim()
}
export function parseRoleProfile(value: unknown): RecruitmentRoleProfile {
  const fields = object(value)
  return Object.fromEntries(
    roleProfileFields.map(({ key }) => [key, text(fields[key])])
  )
}
export function roleProfileComplete(
  profile: RecruitmentRoleProfile,
  responsibilities: string | null
) {
  return Boolean(
    responsibilities?.trim() &&
    ["purpose", "reportsTo", "authority", "limits", "escalation"].every((key) =>
      profile[key as keyof RecruitmentRoleProfile]?.trim()
    )
  )
}
export function parseRoleQuestions(value: unknown): RecruitmentRoleQuestion[] {
  if (!Array.isArray(value) || value.length > 40)
    throw new Error("Use at most 40 questions per role.")
  const ids = new Set<string>()
  const result = value.map((item) => {
    const row = object(item),
      id = text(row.id, 100)
    if (!id || ids.has(id))
      throw new Error("Question identifiers must be distinct.")
    ids.add(id)
    const round = roleQuestionRounds.find((round) => round === row.round)
    const focus = roleQuestionFocus.find((focus) => focus === row.focus)
    const prompt = text(row.prompt)
    if (!round || !focus || !prompt)
      throw new Error("Record a round, focus and prompt for each question.")
    const evidence = text(row.evidence)
    if (!evidence)
      throw new Error(
        "Record the evidence or response indicators to seek for each question."
      )
    return {
      id,
      round,
      focus,
      prompt,
      evidence,
      ...(row.originalPrompt
        ? { originalPrompt: text(row.originalPrompt) }
        : {}),
    }
  })
  if (
    !["Role", "Responsibilities", "Authority"].every((focus) =>
      result.some((question) => question.focus === focus)
    )
  )
    throw new Error(
      "Include at least one Role, Responsibilities and Authority question."
    )
  return result
}
export const defaultRoleQuestions: RecruitmentRoleQuestion[] = [
  {
    id: "role-purpose",
    round: "Screening Round",
    focus: "Role",
    prompt:
      "Explain the purpose of this role, its main outputs and who relies on them. Give a relevant work example.",
    evidence:
      "Connect the stated role purpose to outputs, customers or internal handoffs; verify against the role profile.",
  },
  {
    id: "responsibility-scenario",
    round: "Technical Round",
    focus: "Responsibilities",
    prompt:
      "Walk through a normal task and a quality or safety problem. What are you responsible for checking, recording and handing over?",
    evidence:
      "Specific task sequence, required checks and records, containment and timely escalation; use a job-related demonstration.",
  },
  {
    id: "authority-escalation",
    round: "HR Round",
    focus: "Authority",
    prompt:
      "Which decisions could you make within this role's authority, and which require approval? Explain how you would handle a request beyond your limits.",
    evidence:
      "Distinguish responsibility from approval authority; identify the limit, approving role, escalation and retained evidence. Confirm against the approved delegation.",
  },
]
