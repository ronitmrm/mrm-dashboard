"use client"
import { useActionState, useId, useState } from "react"
import { useRouter } from "next/navigation"
import type {
  InterestedPartyRequirement,
  InterestedPartyMonitoring,
} from "@workspace/db"
import {
  partyTypes,
  requirementBases,
  requirementLifecycles,
  requirementRelevance,
  monitoringOutcomes,
  monitoringToday,
} from "@workspace/db/interested-parties-domain"
import { Field, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import { Textarea } from "@workspace/ui/components/textarea"
import {
  NativeSelect,
  NativeSelectOption,
} from "@workspace/ui/components/native-select"
import { Button } from "@workspace/ui/components/button"
import {
  FormGrid,
  FormSection,
  StandardState,
} from "@/components/ui/golden-patterns"
import {
  saveRequirementAction,
  submitMonitoringAction,
  decideMonitoringAction,
} from "@/app/iso-document/interested-parties/actions"

type Staff = Array<{ id: string; name: string }>
type FormResult = { error?: string; success?: boolean; id?: string }
const planText = [
  {
    name: "scope",
    label: "Specific party / product / contract scope",
    help: "Distinguish the customer, supplier, item or agreement where requirements differ.",
  },
  {
    name: "requirement",
    label: "Requirement / expectation",
    help: "State what the party needs; keep one independently monitored requirement per record.",
    required: true,
  },
  {
    name: "sourceReference",
    label: "Requirement source / agreement reference",
    help: "Record the contract, customer communication, regulation or feedback that establishes the requirement.",
  },
  {
    name: "relevanceReason",
    label: "Reason for QMS relevance decision",
    help: "Explain the effect on product/service conformity, customers or the QMS.",
  },
  {
    name: "acceptanceCriteria",
    label: "Acceptance criteria / expected result",
    help: "How will we establish that the requirement is met? Use a measurable target or clear observable condition.",
  },
  {
    name: "monitoringMethod",
    label: "Monitoring method",
    help: "Describe the check and records used. Buying equipment or creating a sheet alone is not a monitoring result.",
  },
  {
    name: "frequency",
    label: "Monitoring frequency / event trigger",
    help: "For example, each order or payment cycle, monthly review, or when an agreement changes. Choose the appropriate interval.",
  },
  {
    name: "climateNotes",
    label: "Climate-related considerations (if applicable)",
    help: "Record relevant customer, supply, regulatory or other climate-related requirements and their effect.",
  },
  {
    name: "relatedReference",
    label: "Related risk / action / document references",
    help: "Refer to CAR, PEST/SWOT, management-review actions or controlled documents where follow-up is managed.",
  },
  {
    name: "inactiveReason",
    label: "Reason if inactive",
    help: "Explain why this requirement no longer needs active monitoring. A Met result does not automatically make it inactive.",
  },
] as const
export function RequirementForm({
  entry,
  staff,
}: {
  entry?: InterestedPartyRequirement
  staff: Staff
}) {
  const prefix = useId(),
    router = useRouter()
  const [state, action, pending] = useActionState(
    async (_previous: FormResult, data: FormData): Promise<FormResult> => {
      const result = await saveRequirementAction(data)
      if (result.id) {
        router.push(`/iso-document/interested-parties/${result.id}`)
        router.refresh()
      }
      return result
    },
    {}
  )
  return (
    <form action={action} className="grid min-w-0 gap-6">
      {entry && (
        <>
          <input type="hidden" name="id" value={entry.id} />
          <input type="hidden" name="version" value={entry.version} />
        </>
      )}
      <FormSection
        title="Requirement and monitoring plan"
        description="Save incomplete work as Draft. Activate after relevance, responsibility and the monitoring plan are complete."
      >
        <FormGrid>
          <Field>
            <FieldLabel htmlFor={`${prefix}-partyGroup`}>
              Interested party / group
            </FieldLabel>
            <Input
              id={`${prefix}-partyGroup`}
              name="partyGroup"
              defaultValue={entry?.partyGroup}
              placeholder="Customer, employee, supplier, regulator…"
              maxLength={4000}
              required
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={`${prefix}-partyType`}>
              Internal / external
            </FieldLabel>
            <NativeSelect
              id={`${prefix}-partyType`}
              name="partyType"
              defaultValue={entry?.partyType ?? "Not assessed"}
            >
              {partyTypes.map((value) => (
                <NativeSelectOption key={value} value={value}>
                  {value}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          <Field>
            <FieldLabel htmlFor={`${prefix}-basis`}>
              Requirement basis
            </FieldLabel>
            <NativeSelect
              id={`${prefix}-basis`}
              name="basis"
              defaultValue={entry?.basis ?? "Not assessed"}
            >
              {requirementBases.map((value) => (
                <NativeSelectOption key={value} value={value}>
                  {value}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          <Field>
            <FieldLabel htmlFor={`${prefix}-relevance`}>
              QMS relevance
            </FieldLabel>
            <NativeSelect
              id={`${prefix}-relevance`}
              name="relevance"
              defaultValue={entry?.relevance ?? "Not assessed"}
            >
              {requirementRelevance.map((value) => (
                <NativeSelectOption key={value} value={value}>
                  {value}
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
              defaultValue={entry?.department}
              maxLength={4000}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={`${prefix}-owner`}>
              Responsible staff
            </FieldLabel>
            <NativeSelect
              id={`${prefix}-owner`}
              name="ownerUserId"
              defaultValue={entry?.ownerUserId ?? ""}
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
            <FieldLabel htmlFor={`${prefix}-identified`}>
              Requirement identified on
            </FieldLabel>
            <Input
              id={`${prefix}-identified`}
              type="date"
              name="identifiedOn"
              defaultValue={entry?.identifiedOn ?? ""}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={`${prefix}-next`}>
              Planned next review
            </FieldLabel>
            <Input
              id={`${prefix}-next`}
              type="date"
              name="nextReviewOn"
              defaultValue={entry?.nextReviewOn ?? ""}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={`${prefix}-lifecycle`}>
              Record state
            </FieldLabel>
            <NativeSelect
              id={`${prefix}-lifecycle`}
              name="lifecycle"
              defaultValue={entry?.lifecycle ?? "Draft"}
            >
              {requirementLifecycles.map((value) => (
                <NativeSelectOption key={value} value={value}>
                  {value}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
        </FormGrid>
        {planText.map((field) => (
          <Field key={field.name}>
            <FieldLabel htmlFor={`${prefix}-${field.name}`}>
              {field.label}
            </FieldLabel>
            <Textarea
              id={`${prefix}-${field.name}`}
              name={field.name}
              defaultValue={entry?.[field.name] ?? ""}
              required={"required" in field && field.required}
              maxLength={4000}
              rows={3}
            />
            <p className="text-xs text-muted-foreground">{field.help}</p>
          </Field>
        ))}
        {entry && (
          <Field>
            <FieldLabel htmlFor={`${prefix}-reason`}>
              Reason for plan changes
            </FieldLabel>
            <Textarea
              id={`${prefix}-reason`}
              name="reason"
              required
              maxLength={4000}
              rows={2}
            />
          </Field>
        )}
        {state.error && (
          <StandardState
            variant="error"
            title="Check the requirement"
            description={state.error}
          />
        )}
        <Button disabled={pending} type="submit">
          {pending ? "Saving…" : "Save requirement / plan"}
        </Button>
      </FormSection>
    </form>
  )
}
export function MonitoringForm({
  entry,
}: {
  entry: InterestedPartyRequirement
}) {
  const prefix = useId(),
    router = useRouter(),
    [outcome, setOutcome] = useState<string>("Met")
  const [state, action, pending] = useActionState(
    async (_previous: FormResult, data: FormData): Promise<FormResult> => {
      const result = await submitMonitoringAction(data)
      if (result.success) router.refresh()
      return result
    },
    {}
  )
  return (
    <form action={action}>
      <input type="hidden" name="id" value={entry.id} />
      <input type="hidden" name="version" value={entry.version} />
      <FormSection
        title="Record monitoring"
        description="Record the actual check and evidence against the acceptance criteria. QA verifies this proposed result."
      >
        <FormGrid>
          <Field>
            <FieldLabel htmlFor={`${prefix}-date`}>
              Actual monitoring date
            </FieldLabel>
            <Input
              id={`${prefix}-date`}
              name="observedOn"
              type="date"
              max={monitoringToday()}
              required
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={`${prefix}-outcome`}>
              Proposed result
            </FieldLabel>
            <NativeSelect
              id={`${prefix}-outcome`}
              name="outcome"
              value={outcome}
              onChange={(event) => setOutcome(event.target.value)}
            >
              {monitoringOutcomes.map((value) => (
                <NativeSelectOption key={value} value={value}>
                  {value}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
        </FormGrid>
        <Field>
          <FieldLabel htmlFor={`${prefix}-observations`}>
            Observations / results against acceptance criteria
          </FieldLabel>
          <Textarea
            id={`${prefix}-observations`}
            name="observations"
            required
            maxLength={4000}
            rows={4}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${prefix}-evidence`}>
            Evidence reference / location
          </FieldLabel>
          <Textarea
            id={`${prefix}-evidence`}
            name="evidence"
            required
            maxLength={4000}
            rows={2}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${prefix}-followup`}>
            Follow-up action
          </FieldLabel>
          <Textarea
            id={`${prefix}-followup`}
            name="followUp"
            required={outcome !== "Met"}
            maxLength={4000}
            rows={3}
          />
          <p className="text-xs text-muted-foreground">
            Required for Partly met / Not met. Responsible staff remains
            accountable for follow-up. Recheck and submit evidence when the gap
            is resolved.
          </p>
        </Field>
        <FormGrid>
          <Field>
            <FieldLabel htmlFor={`${prefix}-due`}>
              Follow-up target date
            </FieldLabel>
            <Input
              id={`${prefix}-due`}
              name="followUpDueOn"
              type="date"
              required={outcome !== "Met"}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={`${prefix}-related`}>
              Related action / record reference
            </FieldLabel>
            <Input
              id={`${prefix}-related`}
              name="relatedReference"
              maxLength={4000}
            />
          </Field>
        </FormGrid>
        {state.error && (
          <StandardState
            variant="error"
            title="Check the monitoring result"
            description={state.error}
          />
        )}
        <Button disabled={pending} type="submit">
          {pending ? "Saving…" : "Submit monitoring to QA"}
        </Button>
      </FormSection>
    </form>
  )
}
export function MonitoringDecisionForm({
  entry,
  review,
}: {
  entry: InterestedPartyRequirement
  review: InterestedPartyMonitoring
}) {
  const prefix = useId(),
    router = useRouter(),
    [decision, setDecision] = useState("verify")
  const [state, action, pending] = useActionState(
    async (_previous: FormResult, data: FormData): Promise<FormResult> => {
      const result = await decideMonitoringAction(data)
      if (result.success) router.refresh()
      return result
    },
    {}
  )
  return (
    <form action={action}>
      <input type="hidden" name="id" value={entry.id} />
      <input type="hidden" name="version" value={entry.version} />
      <input type="hidden" name="reviewId" value={review.id} />
      <FormSection
        title="QA verification"
        description="Check the recorded evidence against the retained acceptance criteria. Verify the proposed result or return inconclusive monitoring."
      >
        <Field>
          <FieldLabel htmlFor={`${prefix}-decision`}>QA decision</FieldLabel>
          <NativeSelect
            id={`${prefix}-decision`}
            name="decision"
            value={decision}
            onChange={(event) => setDecision(event.target.value)}
          >
            <NativeSelectOption value="verify">
              Verify proposed result
            </NativeSelectOption>
            <NativeSelectOption value="return">
              Return with reason
            </NativeSelectOption>
          </NativeSelect>
        </Field>
        <Field>
          <FieldLabel htmlFor={`${prefix}-notes`}>
            QA findings / decision reason
          </FieldLabel>
          <Textarea
            id={`${prefix}-notes`}
            name="notes"
            required
            maxLength={4000}
            rows={3}
          />
        </Field>
        {decision === "verify" && (
          <Field>
            <FieldLabel htmlFor={`${prefix}-next`}>Next review date</FieldLabel>
            <Input
              id={`${prefix}-next`}
              name="nextReviewOn"
              type="date"
              required
            />
            <p className="text-xs text-muted-foreground">
              Choose a date appropriate to the frequency, change triggers and
              any pending follow-up.
            </p>
          </Field>
        )}
        {state.error && (
          <StandardState
            variant="error"
            title="Check the QA decision"
            description={state.error}
          />
        )}
        <Button disabled={pending} type="submit">
          {pending ? "Saving…" : "Record QA decision"}
        </Button>
      </FormSection>
    </form>
  )
}
