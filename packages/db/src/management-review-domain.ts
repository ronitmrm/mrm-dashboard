import {
  analysisDate,
  analysisToday,
  type AnalysisStatus,
} from "./iso-analysis-domain"

export const reviewAgenda = [
  {
    key: "previous-actions",
    title: "Previous review actions",
    help: "Review pending actions from every earlier meeting and whether completed actions were effective.",
  },
  {
    key: "context",
    title: "Context and interested parties",
    help: "Changes in internal/external issues, customer and other interested-party needs; PEST/SWOT and relevant climate considerations.",
  },
  {
    key: "customers",
    title: "Customer satisfaction and feedback",
    help: "Complaint trends, satisfaction, returns and other customer feedback, with the period and evidence.",
  },
  {
    key: "objectives",
    title: "Quality objectives",
    help: "Targets, actual results, trends and decisions where objectives were not achieved.",
  },
  {
    key: "performance",
    title: "Process performance and product conformity",
    help: "Production, delivery, rejection, inspection and other relevant process/product results.",
  },
  {
    key: "corrective-actions",
    title: "Nonconformities and corrective actions",
    help: "Internal/external nonconformities, causes, action status and recurrence/effectiveness checks.",
  },
  {
    key: "measurement",
    title: "Monitoring and measurement",
    help: "Inspection/measurement results, calibration, monitoring methods and reliability of data.",
  },
  {
    key: "audits",
    title: "Audit results",
    help: "Internal, customer and certification audit findings, trends and follow-ups.",
  },
  {
    key: "suppliers",
    title: "External provider performance",
    help: "Supplier/job-worker quality, delivery, evaluation results and required improvements.",
  },
  {
    key: "resources",
    title: "Resources and competence",
    help: "People, training effectiveness, instruments, infrastructure, work environment and capacity.",
  },
  {
    key: "risk-effectiveness",
    title: "Risk and opportunity action effectiveness",
    help: "Whether actions addressing assessed risks/opportunities achieved their intended results; refer to PEST/SWOT evidence.",
  },
  {
    key: "improvements",
    title: "Improvement opportunities",
    help: "Prioritized improvements, proposed initiatives and their expected benefits.",
  },
  {
    key: "policy",
    title: "Quality policy and strategic direction",
    help: "Continuing alignment of the policy, objectives and QMS with business direction.",
  },
  {
    key: "additional",
    title: "Additional management topics",
    help: "Relevant legal/compliance, safety and other business matters; explain if no additional topic applies.",
  },
] as const
export type ReviewTopic = (typeof reviewAgenda)[number]["key"]
export const reviewOutcomes = [
  "Pending",
  "Reviewed",
  "Follow-up required",
  "Not applicable",
] as const
export const reviewAttendance = ["Invited", "Present", "Absent"] as const
export const actionPriorities = [
  "Not assessed",
  "Low",
  "Medium",
  "High",
] as const
export class ManagementReviewError extends Error {}
export type ReviewAttendee = {
  userId: string | null
  name: string
  designation: string
  department: string
  attendance: (typeof reviewAttendance)[number]
}
export type ReviewInput = {
  key: ReviewTopic
  outcome: (typeof reviewOutcomes)[number]
  discussion: string
  decision: string
  evidence: string
}
export type MeetingFields = {
  title: string
  heldOn: string
  startTime: string
  endTime: string
  location: string
  periodStart: string | null
  periodEnd: string | null
  nextReviewOn: string | null
  chairUserId: string | null
  attendees: ReviewAttendee[]
  agenda: ReviewInput[]
  suitability: string
  adequacy: string
  effectiveness: string
  improvementDecisions: string
  qmsChanges: string
  resourceDecisions: string
}
export type ReviewActionFields = {
  topicKey: ReviewTopic
  description: string
  expectedOutcome: string
  department: string
  ownerUserId: string | null
  dueOn: string | null
  priority: (typeof actionPriorities)[number]
  evidenceReference: string
}
export type ReviewActionOperation =
  | "progress"
  | "complete"
  | "verify"
  | "return"
  | "reopen"
export type ReviewSource = {
  fileName: string
  fileHash: string
  sections: Array<{ text?: string; table?: string[][] }>
}
export type ReviewActionSnapshot = ReviewActionFields & {
  id: string
  number: number
  status: AnalysisStatus
  ownerName: string | null
  completionNotes: string
  evidenceLocation: string
  effectivenessNotes: string
}
export const reviewToday = analysisToday
export function meetingReference(number: number) {
  return `MRM-${String(number).padStart(4, "0")}`
}
export function reviewActionReference(number: number) {
  return `MRM-A-${String(number).padStart(4, "0")}`
}
export function emptyReviewAgenda(): ReviewInput[] {
  return reviewAgenda.map(({ key }) => ({
    key,
    outcome: "Pending",
    discussion: "",
    decision: "",
    evidence: "",
  }))
}
function object(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new ManagementReviewError("Invalid review details.")
  return value as Record<string, unknown>
}
export function reviewText(value: unknown, label: string, required = false) {
  const text = typeof value === "string" ? value.trim() : ""
  if ((required && !text) || text.length > 4000)
    throw new ManagementReviewError(`Enter ${label} within 4,000 characters.`)
  return text
}
export function reviewUserId(value: unknown) {
  const id = reviewText(value, "staff account")
  if (id && !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id))
    throw new ManagementReviewError("Choose a valid staff account.")
  return id || null
}
function choice<const T extends readonly string[]>(
  value: unknown,
  choices: T,
  label: string
): T[number] {
  const found = choices.find((item) => item === value)
  if (!found) throw new ManagementReviewError(`Choose a valid ${label}.`)
  return found
}
export function reviewTopic(value: unknown): ReviewTopic {
  return choice(
    value,
    reviewAgenda.map((item) => item.key),
    "agenda topic"
  )
}
export function parseMeetingFields(input: unknown): MeetingFields {
  const data = object(input)
  const heldOn = analysisDate(data.heldOn)
  if (!heldOn) throw new ManagementReviewError("Enter the meeting date.")
  const periodStart = analysisDate(data.periodStart),
    periodEnd = analysisDate(data.periodEnd)
  if (periodStart && periodEnd && periodStart > periodEnd)
    throw new ManagementReviewError("Review period end must follow its start.")
  const startTime = reviewText(data.startTime, "start time"),
    endTime = reviewText(data.endTime, "end time")
  if (
    [startTime, endTime].some(
      (time) => time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)
    )
  )
    throw new ManagementReviewError("Enter valid meeting times.")
  if (startTime && endTime && endTime < startTime)
    throw new ManagementReviewError("Meeting end must follow its start.")
  if (!Array.isArray(data.attendees) || data.attendees.length > 100)
    throw new ManagementReviewError("Use up to 100 attendees.")
  const attendees = data.attendees.map((value): ReviewAttendee => {
    const item = object(value)
    return {
      userId: reviewUserId(item.userId),
      name: reviewText(item.name, "attendee name", true),
      designation: reviewText(item.designation, "designation"),
      department: reviewText(item.department, "department"),
      attendance: choice(item.attendance, reviewAttendance, "attendance"),
    }
  })
  const staffIds = attendees.flatMap((person) =>
    person.userId ? [person.userId] : []
  )
  if (new Set(staffIds).size !== staffIds.length)
    throw new ManagementReviewError(
      "A staff account can appear once in attendance."
    )
  if (!Array.isArray(data.agenda) || data.agenda.length !== reviewAgenda.length)
    throw new ManagementReviewError("Record every review input.")
  const agenda = data.agenda.map((value): ReviewInput => {
    const item = object(value)
    return {
      key: reviewTopic(item.key),
      outcome: choice(item.outcome, reviewOutcomes, "review outcome"),
      discussion: reviewText(item.discussion, "discussion"),
      decision: reviewText(item.decision, "decision"),
      evidence: reviewText(item.evidence, "evidence reference"),
    }
  })
  if (new Set(agenda.map((item) => item.key)).size !== reviewAgenda.length)
    throw new ManagementReviewError("Each review input must appear once.")
  return {
    title: reviewText(data.title, "meeting title", true),
    heldOn,
    startTime,
    endTime,
    location: reviewText(data.location, "location", true),
    periodStart,
    periodEnd,
    nextReviewOn: analysisDate(data.nextReviewOn),
    chairUserId: reviewUserId(data.chairUserId),
    attendees,
    agenda,
    suitability: reviewText(data.suitability, "suitability conclusion"),
    adequacy: reviewText(data.adequacy, "adequacy conclusion"),
    effectiveness: reviewText(data.effectiveness, "effectiveness conclusion"),
    improvementDecisions: reviewText(
      data.improvementDecisions,
      "improvement decisions"
    ),
    qmsChanges: reviewText(data.qmsChanges, "QMS change decisions"),
    resourceDecisions: reviewText(data.resourceDecisions, "resource decisions"),
  }
}
export function parseReviewActionFields(input: unknown): ReviewActionFields {
  const data = object(input)
  return {
    topicKey: reviewTopic(data.topicKey),
    description: reviewText(data.description, "action", true),
    expectedOutcome: reviewText(data.expectedOutcome, "expected result"),
    department: reviewText(data.department, "department"),
    ownerUserId: reviewUserId(data.ownerUserId),
    dueOn: analysisDate(data.dueOn),
    priority: choice(
      data.priority ?? "Not assessed",
      actionPriorities,
      "priority"
    ),
    evidenceReference: reviewText(
      data.evidenceReference,
      "related record reference"
    ),
  }
}
export function validateReviewSubmission(
  meeting: MeetingFields,
  followUpTopics: readonly ReviewTopic[]
) {
  if (meeting.periodEnd && meeting.periodEnd > meeting.heldOn)
    throw new ManagementReviewError(
      "The reviewed period must end on or before the meeting date."
    )
  if (
    !meeting.periodStart ||
    !meeting.periodEnd ||
    !meeting.startTime ||
    !meeting.endTime ||
    meeting.heldOn > reviewToday()
  )
    throw new ManagementReviewError(
      "Record the actual meeting times and review period before submission."
    )
  if (
    !meeting.chairUserId ||
    !meeting.attendees.some(
      (person) =>
        person.userId === meeting.chairUserId && person.attendance === "Present"
    )
  )
    throw new ManagementReviewError(
      "Identify the top management chair and record their participation as Present."
    )
  if (
    meeting.agenda.some(
      (topic) =>
        topic.outcome === "Pending" || !topic.discussion || !topic.decision
    )
  )
    throw new ManagementReviewError(
      "Record outcomes, discussion and decisions for every review input. Explain any not-applicable input."
    )
  if (
    meeting.agenda.some(
      (topic) =>
        topic.outcome === "Follow-up required" &&
        !followUpTopics.includes(topic.key)
    )
  )
    throw new ManagementReviewError(
      "Link an action to each input requiring follow-up."
    )
  if (
    ![
      meeting.suitability,
      meeting.adequacy,
      meeting.effectiveness,
      meeting.improvementDecisions,
      meeting.qmsChanges,
      meeting.resourceDecisions,
    ].every(Boolean)
  )
    throw new ManagementReviewError(
      "Record all QMS conclusions and output decisions, including reasons for no changes."
    )
}
