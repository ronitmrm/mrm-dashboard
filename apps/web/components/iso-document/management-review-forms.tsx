"use client"

import type {
  ManagementReviewAction,
  ManagementReviewRecord,
} from "@workspace/db"
import {
  actionPriorities,
  emptyReviewAgenda,
  meetingReference,
  reviewActionReference,
  reviewAgenda,
  reviewAttendance,
  reviewOutcomes,
  reviewToday,
  type ReviewAttendee,
  type ReviewActionOperation,
} from "@workspace/db/management-review-domain"
import { Button } from "@workspace/ui/components/button"
import { Field, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import {
  NativeSelect,
  NativeSelectOption,
} from "@workspace/ui/components/native-select"
import { Textarea } from "@workspace/ui/components/textarea"
import { useActionState, useId, useState } from "react"
import { useRouter } from "next/navigation"
import {
  carryMeetingPointAction,
  decideMinutesAction,
  saveMeetingAction,
  saveMeetingPointAction,
  updateMeetingPointAction,
} from "@/app/iso-document/management-review/actions"
import {
  FormGrid,
  FormSection,
  StandardState,
} from "@/components/ui/golden-patterns"

type Staff = Array<{ id: string; name: string }>
const meetingInfo = [
  { name: "title", label: "Meeting title", type: "text", required: true },
  { name: "heldOn", label: "Meeting date", type: "date", required: true },
  {
    name: "location",
    label: "Location / meeting link",
    type: "text",
    required: true,
  },
  { name: "startTime", label: "Start time", type: "time" },
  { name: "endTime", label: "End time", type: "time" },
  { name: "periodStart", label: "Review period from", type: "date" },
  { name: "periodEnd", label: "Review period to", type: "date" },
  { name: "nextReviewOn", label: "Planned next review", type: "date" },
] as const
const outputFields = [
  {
    name: "suitability",
    label: "QMS suitability",
    help: "Does the system remain suitable for our business and interested-party needs? State the basis.",
  },
  {
    name: "adequacy",
    label: "QMS adequacy",
    help: "Are processes, controls and resources sufficient? Identify any gaps.",
  },
  {
    name: "effectiveness",
    label: "QMS effectiveness",
    help: "Are intended results achieved? Refer to reviewed results and unresolved weaknesses.",
  },
  {
    name: "improvementDecisions",
    label: "Improvement decisions",
    help: "Agreed improvements and expected benefits, or reasons no improvement is needed.",
  },
  {
    name: "qmsChanges",
    label: "Changes to the QMS",
    help: "Agreed changes to processes, policy/objectives or controls; record reasons for no changes.",
  },
  {
    name: "resourceDecisions",
    label: "Resource decisions",
    help: "People, equipment, training, budgets and other resources agreed; record reasons for no changes.",
  },
] as const

export function ManagementReviewMeetingForm({
  entry,
  staff,
}: {
  entry?: ManagementReviewRecord
  staff: Staff
}) {
  const prefix = useId(),
    router = useRouter()
  const [attendees, setAttendees] = useState<
    Array<ReviewAttendee & { rowId: string }>
  >(() =>
    (entry?.attendees ?? []).map((person, index) => ({
      ...person,
      rowId: `initial-${index}`,
    }))
  )
  const [state, action, pending] = useActionState<
    Awaited<ReturnType<typeof saveMeetingAction>> | null,
    FormData
  >(async (_, data) => {
    const result = await saveMeetingAction(data)
    if ("id" in result) {
      router.push(`/iso-document/management-review/${result.id}`)
      router.refresh()
    }
    return result
  }, null)
  const inputs = entry?.agenda ?? emptyReviewAgenda()
  function updateAttendee(rowId: string, changes: Partial<ReviewAttendee>) {
    setAttendees((previous) =>
      previous.map((person) =>
        person.rowId === rowId ? { ...person, ...changes } : person
      )
    )
  }
  return (
    <form action={action} className="grid gap-6">
      {entry ? (
        <>
          <input type="hidden" name="id" value={entry.id} />
          <input type="hidden" name="version" value={entry.version} />
        </>
      ) : null}
      <input type="hidden" name="attendees" value={JSON.stringify(attendees)} />
      {state && "error" in state ? (
        <StandardState
          variant="error"
          title="Meeting not saved"
          description={state.error}
        />
      ) : null}
      <FormSection
        title="Meeting and review period"
        description="Save as a draft while preparing. Confirm actual participation, inputs and decisions before submitting to QA."
      >
        <FormGrid>
          {meetingInfo.map((field) => (
            <Field key={field.name}>
              <FieldLabel htmlFor={`${prefix}-${field.name}`}>
                {field.label}
              </FieldLabel>
              <Input
                id={`${prefix}-${field.name}`}
                name={field.name}
                type={field.type}
                required={"required" in field && field.required}
                maxLength={4000}
                defaultValue={
                  entry?.[field.name] ??
                  (field.name === "heldOn"
                    ? reviewToday()
                    : field.name === "title"
                      ? "Management Review Meeting"
                      : "")
                }
                disabled={pending}
              />
            </Field>
          ))}
          <Field>
            <FieldLabel htmlFor={`${prefix}-chair`}>
              Top management chair
            </FieldLabel>
            <NativeSelect
              id={`${prefix}-chair`}
              name="chairUserId"
              defaultValue={entry?.chairUserId ?? ""}
              disabled={pending}
            >
              <NativeSelectOption value="">
                Choose staff account
              </NativeSelectOption>
              {staff.map((person) => (
                <NativeSelectOption key={person.id} value={person.id}>
                  {person.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
        </FormGrid>
      </FormSection>
      <FormSection
        title="People and attendance"
        description="Choose staff accounts for internal participants. Record guests by name. Invited does not confirm attendance; the chair must be recorded Present before submission."
        width="full"
      >
        <div className="grid gap-4">
          {attendees.map((person, index) => (
            <div key={person.rowId} className="grid gap-3 border-b pb-4">
              <FormGrid>
                <Field>
                  <FieldLabel htmlFor={`${prefix}-staff-${person.rowId}`}>
                    Participant {index + 1} account
                  </FieldLabel>
                  <NativeSelect
                    id={`${prefix}-staff-${person.rowId}`}
                    value={person.userId ?? ""}
                    disabled={pending}
                    onChange={(event) => {
                      const userId = event.target.value || null
                      updateAttendee(person.rowId, {
                        userId,
                        name:
                          staff.find((item) => item.id === userId)?.name ??
                          person.name,
                      })
                    }}
                  >
                    <NativeSelectOption value="">
                      Guest / account not yet confirmed
                    </NativeSelectOption>
                    {staff.map((item) => (
                      <NativeSelectOption key={item.id} value={item.id}>
                        {item.name}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </Field>
                <Field>
                  <FieldLabel htmlFor={`${prefix}-name-${person.rowId}`}>
                    Name
                  </FieldLabel>
                  <Input
                    id={`${prefix}-name-${person.rowId}`}
                    required
                    maxLength={4000}
                    value={person.name}
                    readOnly={Boolean(person.userId)}
                    disabled={pending}
                    onChange={(event) =>
                      updateAttendee(person.rowId, { name: event.target.value })
                    }
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor={`${prefix}-designation-${person.rowId}`}>
                    Designation / role
                  </FieldLabel>
                  <Input
                    id={`${prefix}-designation-${person.rowId}`}
                    maxLength={4000}
                    value={person.designation}
                    disabled={pending}
                    onChange={(event) =>
                      updateAttendee(person.rowId, {
                        designation: event.target.value,
                      })
                    }
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor={`${prefix}-department-${person.rowId}`}>
                    Department
                  </FieldLabel>
                  <Input
                    id={`${prefix}-department-${person.rowId}`}
                    maxLength={4000}
                    value={person.department}
                    disabled={pending}
                    onChange={(event) =>
                      updateAttendee(person.rowId, {
                        department: event.target.value,
                      })
                    }
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor={`${prefix}-attendance-${person.rowId}`}>
                    Attendance
                  </FieldLabel>
                  <NativeSelect
                    id={`${prefix}-attendance-${person.rowId}`}
                    value={person.attendance}
                    disabled={pending}
                    onChange={(event) =>
                      updateAttendee(person.rowId, {
                        attendance: event.target
                          .value as ReviewAttendee["attendance"],
                      })
                    }
                  >
                    {reviewAttendance.map((value) => (
                      <NativeSelectOption key={value} value={value}>
                        {value}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </Field>
              </FormGrid>
              <Button
                type="button"
                variant="outline"
                className="w-fit"
                disabled={pending}
                onClick={() =>
                  setAttendees((previous) =>
                    previous.filter((item) => item.rowId !== person.rowId)
                  )
                }
              >
                Remove participant {index + 1}
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            className="w-fit"
            disabled={pending || attendees.length >= 100}
            onClick={() =>
              setAttendees((previous) => [
                ...previous,
                {
                  rowId: crypto.randomUUID(),
                  userId: null,
                  name: "",
                  department: "",
                  designation: "",
                  attendance: "Invited",
                },
              ])
            }
          >
            Add participant
          </Button>
        </div>
      </FormSection>
      <FormSection
        title="Review inputs and discussions"
        description="Record the period, results/trends, evidence and decision for each input. Explain not-applicable topics. Link a pending point below for follow-ups."
      >
        {reviewAgenda.map((topic, index) => {
          const saved = inputs.find((item) => item.key === topic.key)
          return (
            <details
              key={topic.key}
              className="border-b py-3"
              open={index === 0}
            >
              <summary className="cursor-pointer font-medium">
                {index + 1}. {topic.title}
              </summary>
              <div className="grid gap-4 pt-4">
                <p className="text-sm text-muted-foreground">{topic.help}</p>
                <Field>
                  <FieldLabel htmlFor={`${prefix}-${topic.key}-outcome`}>
                    Review outcome
                  </FieldLabel>
                  <NativeSelect
                    id={`${prefix}-${topic.key}-outcome`}
                    name={`${topic.key}.outcome`}
                    defaultValue={saved?.outcome ?? "Pending"}
                    disabled={pending}
                  >
                    {reviewOutcomes.map((value) => (
                      <NativeSelectOption key={value} value={value}>
                        {value}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </Field>
                <Field>
                  <FieldLabel htmlFor={`${prefix}-${topic.key}-discussion`}>
                    Discussion / results and trends
                  </FieldLabel>
                  <Textarea
                    id={`${prefix}-${topic.key}-discussion`}
                    name={`${topic.key}.discussion`}
                    maxLength={4000}
                    defaultValue={saved?.discussion ?? ""}
                    disabled={pending}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor={`${prefix}-${topic.key}-evidence`}>
                    Evidence / related record reference
                  </FieldLabel>
                  <Input
                    id={`${prefix}-${topic.key}-evidence`}
                    name={`${topic.key}.evidence`}
                    maxLength={4000}
                    defaultValue={saved?.evidence ?? ""}
                    disabled={pending}
                    placeholder="Report, CAR, PEST/SWOT reference, document link or physical record location"
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor={`${prefix}-${topic.key}-decision`}>
                    Decision and rationale
                  </FieldLabel>
                  <Textarea
                    id={`${prefix}-${topic.key}-decision`}
                    name={`${topic.key}.decision`}
                    maxLength={4000}
                    defaultValue={saved?.decision ?? ""}
                    disabled={pending}
                    placeholder="Agreed decision, follow-up or reason no change is needed"
                  />
                </Field>
              </div>
            </details>
          )
        })}
      </FormSection>
      <FormSection
        title="Conclusions and management decisions"
        description="Record the basis for conclusions. Approving minutes leaves follow-up points pending until QA verifies their work and effectiveness."
      >
        <div className="grid gap-4">
          {outputFields.map((field) => (
            <Field key={field.name}>
              <FieldLabel htmlFor={`${prefix}-${field.name}`}>
                {field.label}
              </FieldLabel>
              <Textarea
                id={`${prefix}-${field.name}`}
                name={field.name}
                maxLength={4000}
                defaultValue={entry?.[field.name] ?? ""}
                disabled={pending}
                placeholder={field.help}
              />
            </Field>
          ))}
        </div>
      </FormSection>
      {entry ? (
        <Field className="max-w-5xl">
          <FieldLabel htmlFor={`${prefix}-reason`}>
            Reason for changes
          </FieldLabel>
          <Input
            id={`${prefix}-reason`}
            name="reason"
            required
            maxLength={4000}
            disabled={pending}
          />
        </Field>
      ) : null}
      <Button type="submit" className="w-fit" disabled={pending}>
        {pending
          ? "Saving…"
          : entry
            ? "Save meeting changes"
            : "Create meeting draft"}
      </Button>
    </form>
  )
}

export function MinutesDecisionForm({
  entry,
  canManage,
  canApprove,
}: {
  entry: ManagementReviewRecord
  canManage: boolean
  canApprove: boolean
}) {
  const router = useRouter(),
    prefix = useId()
  const [state, action, pending] = useActionState<
    Awaited<ReturnType<typeof decideMinutesAction>> | null,
    FormData
  >(async (_, data) => {
    const result = await decideMinutesAction(data)
    if ("success" in result) router.refresh()
    return result
  }, null)
  const operations =
    entry.status === "Draft"
      ? canManage
        ? [{ value: "submit", label: "Submit minutes to QA" }]
        : []
      : entry.status === "For Approval"
        ? canApprove
          ? [
              { value: "approve", label: "QA approve minutes" },
              { value: "return", label: "Return minutes for correction" },
            ]
          : []
        : canApprove
          ? [{ value: "reopen", label: "Reopen approved minutes" }]
          : []
  if (!operations.length) return null
  return (
    <FormSection
      title="Minutes approval"
      description="Save draft changes first. QA checks recorded participation, inputs, conclusions and decisions. Action closure is separate."
    >
      <form action={action} className="grid gap-4">
        <input type="hidden" name="id" value={entry.id} />
        <input type="hidden" name="version" value={entry.version} />
        {state && "error" in state ? (
          <StandardState
            variant="error"
            title="Decision not saved"
            description={state.error}
          />
        ) : null}
        <Field>
          <FieldLabel htmlFor={`${prefix}-operation`}>Decision</FieldLabel>
          <NativeSelect
            id={`${prefix}-operation`}
            name="operation"
            disabled={pending}
          >
            {operations.map((item) => (
              <NativeSelectOption key={item.value} value={item.value}>
                {item.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        <Field>
          <FieldLabel htmlFor={`${prefix}-notes`}>Remarks / reason</FieldLabel>
          <Textarea
            id={`${prefix}-notes`}
            name="notes"
            required
            maxLength={4000}
            disabled={pending}
          />
        </Field>
        <Button type="submit" className="w-fit" disabled={pending}>
          {pending ? "Saving…" : "Record minutes decision"}
        </Button>
      </form>
    </FormSection>
  )
}

export function MeetingPointForm({
  meeting,
  entry,
  staff,
}: {
  meeting?: ManagementReviewRecord
  entry?: ManagementReviewAction
  staff: Staff
}) {
  const router = useRouter(),
    prefix = useId()
  const [state, action, pending] = useActionState<
    Awaited<ReturnType<typeof saveMeetingPointAction>> | null,
    FormData
  >(async (_, data) => {
    const result = await saveMeetingPointAction(data)
    if ("id" in result) {
      router.push(`/iso-document/management-review/actions/${result.id}`)
      router.refresh()
    }
    return result
  }, null)
  return (
    <form action={action} className="grid gap-4">
      {entry ? (
        <>
          <input type="hidden" name="id" value={entry.id} />
          <input type="hidden" name="version" value={entry.version} />
        </>
      ) : (
        <>
          <input type="hidden" name="meetingId" value={meeting?.id ?? ""} />
          <input
            type="hidden"
            name="meetingVersion"
            value={meeting?.version ?? ""}
          />
        </>
      )}
      {state && "error" in state ? (
        <StandardState
          variant="error"
          title="Action not saved"
          description={state.error}
        />
      ) : null}
      <FormGrid>
        <Field>
          <FieldLabel htmlFor={`${prefix}-topic`}>Agenda topic</FieldLabel>
          <NativeSelect
            id={`${prefix}-topic`}
            name="topicKey"
            defaultValue={entry?.topicKey ?? reviewAgenda[0].key}
            disabled={pending}
          >
            {reviewAgenda.map((topic) => (
              <NativeSelectOption key={topic.key} value={topic.key}>
                {topic.title}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        <Field>
          <FieldLabel htmlFor={`${prefix}-owner`}>Responsible staff</FieldLabel>
          <NativeSelect
            id={`${prefix}-owner`}
            name="ownerUserId"
            defaultValue={entry?.ownerUserId ?? ""}
            disabled={pending}
          >
            <NativeSelectOption value="">Not assigned</NativeSelectOption>
            {staff.map((person) => (
              <NativeSelectOption key={person.id} value={person.id}>
                {person.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        <Field>
          <FieldLabel htmlFor={`${prefix}-department`}>
            Responsible department
          </FieldLabel>
          <Input
            id={`${prefix}-department`}
            name="department"
            maxLength={4000}
            defaultValue={entry?.department ?? ""}
            disabled={pending}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${prefix}-due`}>Target date</FieldLabel>
          <Input
            id={`${prefix}-due`}
            type="date"
            name="dueOn"
            defaultValue={entry?.dueOn ?? ""}
            disabled={pending}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${prefix}-priority`}>Priority</FieldLabel>
          <NativeSelect
            id={`${prefix}-priority`}
            name="priority"
            defaultValue={entry?.priority ?? "Not assessed"}
            disabled={pending}
          >
            {actionPriorities.map((value) => (
              <NativeSelectOption key={value} value={value}>
                {value}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
      </FormGrid>
      <Field>
        <FieldLabel htmlFor={`${prefix}-description`}>
          Action / pending point
        </FieldLabel>
        <Textarea
          id={`${prefix}-description`}
          name="description"
          required
          maxLength={4000}
          defaultValue={entry?.description ?? ""}
          disabled={pending}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor={`${prefix}-expected`}>
          Expected result / success criteria
        </FieldLabel>
        <Textarea
          id={`${prefix}-expected`}
          name="expectedOutcome"
          maxLength={4000}
          defaultValue={entry?.expectedOutcome ?? ""}
          disabled={pending}
          placeholder="What must change, and how will QA check that it worked?"
        />
      </Field>
      <Field>
        <FieldLabel htmlFor={`${prefix}-reference`}>
          Related operational record
        </FieldLabel>
        <Input
          id={`${prefix}-reference`}
          name="evidenceReference"
          maxLength={4000}
          defaultValue={entry?.evidenceReference ?? ""}
          disabled={pending}
          placeholder="CAR, PEST/SWOT, purchase request or other existing record reference"
        />
      </Field>
      {entry ? (
        <Field>
          <FieldLabel htmlFor={`${prefix}-reason`}>
            Reason for changes
          </FieldLabel>
          <Input
            id={`${prefix}-reason`}
            name="reason"
            required
            maxLength={4000}
            disabled={pending}
          />
        </Field>
      ) : null}
      <Button type="submit" className="w-fit" disabled={pending}>
        {pending
          ? "Saving…"
          : entry
            ? "Save action details"
            : "Raise meeting action"}
      </Button>
    </form>
  )
}

export function CarryMeetingPointForm({
  meeting,
  points,
}: {
  meeting: ManagementReviewRecord
  points: ManagementReviewAction[]
}) {
  const prefix = useId(),
    router = useRouter()
  const [state, action, pending] = useActionState<
    Awaited<ReturnType<typeof carryMeetingPointAction>> | null,
    FormData
  >(async (_, data) => {
    const result = await carryMeetingPointAction(data)
    if ("success" in result) router.refresh()
    return result
  }, null)
  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="meetingId" value={meeting.id} />
      <input type="hidden" name="meetingVersion" value={meeting.version} />
      {state && "error" in state ? (
        <StandardState
          variant="error"
          title="Review not saved"
          description={state.error}
        />
      ) : null}
      {state && "success" in state ? (
        <p role="status" className="text-sm">
          Discussion recorded against the existing point.
        </p>
      ) : null}
      <Field>
        <FieldLabel htmlFor={`${prefix}-point`}>
          Existing point from this or an earlier meeting
        </FieldLabel>
        <NativeSelect
          id={`${prefix}-point`}
          name="actionId"
          required
          disabled={pending || !points.length}
        >
          <NativeSelectOption value="">Choose a point</NativeSelectOption>
          {points.map((point) => (
            <NativeSelectOption key={point.id} value={point.id}>
              {reviewActionReference(point.number)} · {point.status} ·{" "}
              {point.description} ·{" "}
              {meetingReference(point.originMeetingNumber)}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </Field>
      <Field>
        <FieldLabel htmlFor={`${prefix}-notes`}>
          Discussion, decision and follow-up
        </FieldLabel>
        <Textarea
          id={`${prefix}-notes`}
          name="notes"
          required
          maxLength={4000}
          disabled={pending}
          placeholder="Current position, evidence reviewed and agreed next step. This preserves the same point reference."
        />
      </Field>
      <Button
        type="submit"
        className="w-fit"
        disabled={pending || !points.length}
      >
        {pending ? "Saving…" : "Record action review in this meeting"}
      </Button>
    </form>
  )
}

export function MeetingPointWorkForm({
  entry,
  canWork,
  canVerify,
}: {
  entry: ManagementReviewAction
  canWork: boolean
  canVerify: boolean
}) {
  const prefix = useId(),
    router = useRouter()
  const [operation, setOperation] = useState<ReviewActionOperation>(
    entry.status === "Closed"
      ? "reopen"
      : entry.status === "Completed" && canVerify
        ? "verify"
        : "progress"
  )
  const [state, action, pending] = useActionState<
    Awaited<ReturnType<typeof updateMeetingPointAction>> | null,
    FormData
  >(async (_, data) => {
    const result = await updateMeetingPointAction(data)
    if ("success" in result) router.refresh()
    return result
  }, null)
  const operations: Array<{ value: ReviewActionOperation; label: string }> = []
  if (canWork && entry.status !== "Closed") {
    if (entry.status !== "Completed")
      operations.push({ value: "progress", label: "Record progress" })
    operations.push({ value: "complete", label: "Mark work Completed" })
  }
  if (canVerify && entry.status === "Completed")
    operations.push(
      { value: "verify", label: "QA verify effectiveness and close" },
      { value: "return", label: "Return for further work" }
    )
  if (canVerify && entry.status === "Closed")
    operations.push({ value: "reopen", label: "Reopen with reason" })
  if (!operations.length) return null
  const selected = operations.some((item) => item.value === operation)
    ? operation
    : operations[0]!.value
  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="id" value={entry.id} />
      <input type="hidden" name="version" value={entry.version} />
      {state && "error" in state ? (
        <StandardState
          variant="error"
          title="Work not saved"
          description={state.error}
        />
      ) : null}
      <Field>
        <FieldLabel htmlFor={`${prefix}-operation`}>
          Work / QA decision
        </FieldLabel>
        <NativeSelect
          id={`${prefix}-operation`}
          name="operation"
          value={selected}
          disabled={pending}
          onChange={(event) =>
            setOperation(event.target.value as ReviewActionOperation)
          }
        >
          {operations.map((item) => (
            <NativeSelectOption key={item.value} value={item.value}>
              {item.label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </Field>
      <Field>
        <FieldLabel htmlFor={`${prefix}-notes`}>
          Work done / decision and reason
        </FieldLabel>
        <Textarea
          id={`${prefix}-notes`}
          name="notes"
          required
          maxLength={4000}
          disabled={pending}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor={`${prefix}-evidence`}>
          Evidence reference / location
        </FieldLabel>
        <Input
          id={`${prefix}-evidence`}
          name="evidenceLocation"
          required={selected === "verify"}
          maxLength={4000}
          defaultValue={entry.evidenceLocation}
          disabled={pending}
        />
      </Field>
      {selected === "verify" ? (
        <Field>
          <FieldLabel htmlFor={`${prefix}-findings`}>
            Effectiveness findings against expected result
          </FieldLabel>
          <Textarea
            id={`${prefix}-findings`}
            name="effectivenessNotes"
            required
            maxLength={4000}
            disabled={pending}
            placeholder="Expected result, actual result, how/when checked and why effective. Return ineffective or inconclusive work."
          />
        </Field>
      ) : null}
      <Button type="submit" className="w-fit" disabled={pending}>
        {pending ? "Saving…" : "Record work / QA decision"}
      </Button>
    </form>
  )
}
