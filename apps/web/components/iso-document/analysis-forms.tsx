"use client"

import type { AnalysisRecord } from "@workspace/db"
import {
  analysisCategories,
  analysisPriorities,
  analysisFocuses,
  analysisToday,
  type AnalysisKind,
  type AnalysisOperation,
} from "@workspace/db/iso-analysis-domain"
import { Button } from "@workspace/ui/components/button"
import { Field, FieldGroup, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import {
  NativeSelect,
  NativeSelectOption,
} from "@workspace/ui/components/native-select"
import { Textarea } from "@workspace/ui/components/textarea"
import { useRouter } from "next/navigation"
import { useActionState, useId, useState } from "react"
import {
  saveAnalysisAction,
  updateAnalysisAction,
} from "@/app/iso-document/analysis/actions"
import { FormGrid, StandardState } from "@/components/ui/golden-patterns"

export function AnalysisMetadataForm({
  kind,
  owners,
  entry,
}: {
  kind: AnalysisKind
  owners: Array<{ id: string; name: string }>
  entry?: AnalysisRecord
}) {
  const id = useId()
  const router = useRouter()
  const [state, action, pending] = useActionState<
    Awaited<ReturnType<typeof saveAnalysisAction>> | null,
    FormData
  >(async (_previous, data) => {
    const result = await saveAnalysisAction(data)
    if ("id" in result && result.id) {
      router.push(`/iso-document/analysis/${kind.toLowerCase()}/${result.id}`)
      router.refresh()
    }
    return result
  }, null)
  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="kind" value={kind} />
      {entry ? (
        <>
          <input type="hidden" name="id" value={entry.id} />
          <input type="hidden" name="version" value={entry.version} />
        </>
      ) : null}
      <FieldGroup>
        <FormGrid>
          <Field>
            <FieldLabel htmlFor={`${id}-focus`}>Risk / Opportunity</FieldLabel>
            <NativeSelect
              id={`${id}-focus`}
              name="focus"
              defaultValue={entry?.focus ?? "Not assessed"}
              disabled={pending}
            >
              {analysisFocuses.map((value) => (
                <NativeSelectOption key={value} value={value}>
                  {value}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          <Field>
            <FieldLabel htmlFor={`${id}-priority`}>Priority</FieldLabel>
            <NativeSelect
              id={`${id}-priority`}
              name="priority"
              defaultValue={entry?.priority ?? "Not assessed"}
              disabled={pending}
            >
              {analysisPriorities.map((value) => (
                <NativeSelectOption key={value} value={value}>
                  {value}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          <Field>
            <FieldLabel htmlFor={`${id}-year`}>Analysis Year</FieldLabel>
            <Input
              id={`${id}-year`}
              name="analysisYear"
              type="number"
              min={2000}
              max={2100}
              required
              defaultValue={
                entry?.analysisYear ?? Number(analysisToday().slice(0, 4))
              }
              disabled={pending}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={`${id}-category`}>
              {kind === "PEST" ? "Factor" : "Analysis Category"}
            </FieldLabel>
            <NativeSelect
              id={`${id}-category`}
              name="category"
              defaultValue={entry?.category ?? analysisCategories[kind][0]}
              disabled={pending}
            >
              {analysisCategories[kind].map((category) => (
                <NativeSelectOption key={category} value={category}>
                  {category}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          <Field>
            <FieldLabel htmlFor={`${id}-department`}>
              Responsible Department
            </FieldLabel>
            <Input
              id={`${id}-department`}
              name="department"
              defaultValue={entry?.department ?? ""}
              disabled={pending}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={`${id}-owner`}>Responsible Staff</FieldLabel>
            <NativeSelect
              id={`${id}-owner`}
              name="ownerUserId"
              defaultValue={entry?.ownerUserId ?? ""}
              disabled={pending}
            >
              <NativeSelectOption value="">Assign later</NativeSelectOption>
              {entry?.ownerUserId &&
              !owners.some((owner) => owner.id === entry.ownerUserId) ? (
                <NativeSelectOption value={entry.ownerUserId}>
                  {entry.ownerName} (inactive; reassign)
                </NativeSelectOption>
              ) : null}
              {owners.map((owner) => (
                <NativeSelectOption key={owner.id} value={owner.id}>
                  {owner.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          <Field>
            <FieldLabel htmlFor={`${id}-identified`}>
              Issue Identified On
            </FieldLabel>
            <Input
              id={`${id}-identified`}
              type="date"
              name="identifiedOn"
              defaultValue={entry?.identifiedOn ?? ""}
              disabled={pending}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={`${id}-due`}>Target Date</FieldLabel>
            <Input
              id={`${id}-due`}
              type="date"
              name="dueOn"
              defaultValue={entry?.dueOn ?? ""}
              disabled={pending}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={`${id}-reviewed`}>Last Review Date</FieldLabel>
            <Input
              id={`${id}-reviewed`}
              type="date"
              name="reviewedOn"
              defaultValue={entry?.reviewedOn ?? ""}
              disabled={pending}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={`${id}-next-review`}>
              Next Review Date
            </FieldLabel>
            <Input
              id={`${id}-next-review`}
              type="date"
              name="nextReviewOn"
              defaultValue={entry?.nextReviewOn ?? ""}
              disabled={pending}
            />
          </Field>
        </FormGrid>
        <Field>
          <FieldLabel htmlFor={`${id}-impact`}>
            Business Impact & Assessment
          </FieldLabel>
          <Textarea
            id={`${id}-impact`}
            name="impact"
            maxLength={4000}
            defaultValue={entry?.impact ?? ""}
            disabled={pending}
            placeholder="Affected process, customer or interested party; likely consequence or benefit; why this priority was chosen"
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${id}-outcome`}>
            Expected Outcome / Success Criteria
          </FieldLabel>
          <Textarea
            id={`${id}-outcome`}
            name="expectedOutcome"
            maxLength={4000}
            defaultValue={entry?.expectedOutcome ?? ""}
            disabled={pending}
            placeholder="Describe the result to achieve and how it will be checked"
          />
        </Field>
        <p className="text-sm text-muted-foreground">
          Assessment and ownership are required before completion. Set review
          dates according to the importance and circumstances of the issue.
        </p>
        <Field>
          <FieldLabel htmlFor={`${id}-description`}>Issue / Insight</FieldLabel>
          <Textarea
            id={`${id}-description`}
            name="description"
            required
            maxLength={4000}
            defaultValue={entry?.description ?? ""}
            disabled={pending}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${id}-plan`}>Action Plan</FieldLabel>
          <Textarea
            id={`${id}-plan`}
            name="actionPlan"
            required
            maxLength={4000}
            defaultValue={entry?.actionPlan ?? ""}
            disabled={pending}
          />
        </Field>
        {entry ? (
          <Field>
            <FieldLabel htmlFor={`${id}-reason`}>Reason for Changes</FieldLabel>
            <Textarea
              id={`${id}-reason`}
              name="reason"
              required
              maxLength={4000}
              disabled={pending}
            />
          </Field>
        ) : null}
      </FieldGroup>
      {state?.error ? (
        <StandardState
          title="Item not saved"
          variant="error"
          description={state.error}
        />
      ) : null}
      <Button type="submit" disabled={pending} className="w-fit">
        {pending ? "Saving…" : entry ? "Save Changes" : "Create Item"}
      </Button>
    </form>
  )
}

const operationLabels: Record<AnalysisOperation, string> = {
  progress: "Record Progress",
  complete: "Mark Completed",
  verify: "QA Verify & Close",
  return: "Return for Further Work",
  reopen: "Reopen Action",
  review: "Record Review",
}
export function AnalysisUpdateForm({
  entry,
  canWork,
  canVerify,
}: {
  entry: AnalysisRecord
  canWork: boolean
  canVerify: boolean
}) {
  const id = useId()
  const router = useRouter()
  const operations: AnalysisOperation[] = [
    ...(canWork && (entry.status === "Open" || entry.status === "In Progress")
      ? ["progress" as const]
      : []),
    ...(canWork && entry.status !== "Closed" ? ["complete" as const] : []),
    ...(canVerify && entry.status === "Completed"
      ? ["verify" as const, "return" as const]
      : []),
    ...(canVerify && entry.status === "Closed" ? ["reopen" as const] : []),
    ...(canVerify ? ["review" as const] : []),
  ]
  const [operation, setOperation] = useState<AnalysisOperation>(
    operations[0] ?? "progress"
  )
  const [reviewedOn, setReviewedOn] = useState(analysisToday())
  const [state, action, pending] = useActionState<
    Awaited<ReturnType<typeof updateAnalysisAction>> | null,
    FormData
  >(async (_previous, data) => {
    const result = await updateAnalysisAction(data)
    if ("success" in result) router.refresh()
    return result
  }, null)
  if (!operations.length) return null
  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="id" value={entry.id} />
      <input type="hidden" name="version" value={entry.version} />
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor={`${id}-operation`}>Action</FieldLabel>
          <NativeSelect
            id={`${id}-operation`}
            name="operation"
            value={operation}
            onChange={(event) =>
              setOperation(event.target.value as AnalysisOperation)
            }
            disabled={pending}
          >
            {operations.map((value) => (
              <NativeSelectOption key={value} value={value}>
                {operationLabels[value]}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        <Field>
          <FieldLabel htmlFor={`${id}-notes`}>
            {operation === "complete"
              ? "Work Done / Completion Details"
              : operation === "verify"
                ? "QA Verification & Closure Remarks"
                : "Progress / Review / Decision Notes"}
          </FieldLabel>
          <Textarea
            id={`${id}-notes`}
            name="notes"
            required
            maxLength={4000}
            disabled={pending}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${id}-evidence`}>
            Evidence Link or Record Location
          </FieldLabel>
          <Input
            id={`${id}-evidence`}
            name="evidenceLocation"
            required={operation === "verify"}
            maxLength={4000}
            defaultValue={entry.evidenceLocation}
            disabled={pending}
            placeholder="Report reference, document link, or physical record location"
          />
        </Field>
        {operation === "verify" ? (
          <Field>
            <FieldLabel htmlFor={`${id}-effectiveness`}>
              Effectiveness Findings Against Expected Outcome
            </FieldLabel>
            <Textarea
              id={`${id}-effectiveness`}
              name="effectivenessNotes"
              required
              maxLength={4000}
              disabled={pending}
              placeholder="Expected result, observed result, how and when checked, and why the action is effective. Return work if ineffective or inconclusive."
            />
          </Field>
        ) : null}
        {operation === "review" ? (
          <FormGrid>
            <Field>
              <FieldLabel htmlFor={`${id}-reviewed`}>Review Date</FieldLabel>
              <Input
                id={`${id}-reviewed`}
                name="reviewedOn"
                type="date"
                required
                value={reviewedOn}
                onChange={(event) => setReviewedOn(event.target.value)}
                disabled={pending}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={`${id}-next`}>Next Review</FieldLabel>
              <Input
                id={`${id}-next`}
                name="nextReviewOn"
                type="date"
                defaultValue={entry.nextReviewOn ?? ""}
                disabled={pending}
              />
            </Field>
          </FormGrid>
        ) : null}
      </FieldGroup>
      {state?.error ? (
        <StandardState
          variant="error"
          title="Action not saved"
          description={state.error}
        />
      ) : null}
      {state?.success ? <p role="status">Action recorded.</p> : null}
      <Button className="w-fit" type="submit" disabled={pending}>
        {pending ? "Saving…" : operationLabels[operation]}
      </Button>
    </form>
  )
}
