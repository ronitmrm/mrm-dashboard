"use client"
import { useActionState, useId, useState } from "react"
import { useRouter } from "next/navigation"
import type { SatisfactionReport, AnalysisRecord } from "@workspace/db"
import { satisfactionTextFields } from "@workspace/db/customer-satisfaction-domain"
import { Button } from "@workspace/ui/components/button"
import { Field, FieldGroup, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import { Textarea } from "@workspace/ui/components/textarea"
import {
  NativeSelect,
  NativeSelectOption,
} from "@workspace/ui/components/native-select"
import { FormGrid, StandardState } from "@/components/ui/golden-patterns"
import { PendingRetainedUploadForm } from "@/components/pending-retained-upload-form"
import {
  saveSatisfactionAction,
  decideSatisfactionAction,
  uploadSatisfactionAction,
} from "@/app/iso-document/customer-satisfaction/actions"
import { analysisReference } from "@workspace/db/iso-analysis-domain"
export function SatisfactionForm({
  entry,
  owners,
  customers,
  actions,
  canManage = true,
}: {
  entry?: SatisfactionReport
  owners: Array<{ id: string; name: string }>
  customers: Array<{ id: string; name: string }>
  actions: AnalysisRecord[]
  canManage?: boolean
}) {
  const id = useId(),
    router = useRouter()
  const [state, action, pending] = useActionState<
    Awaited<ReturnType<typeof saveSatisfactionAction>> | null,
    FormData
  >(async (_, data) => {
    const result = await saveSatisfactionAction(data)
    if ("id" in result) {
      router.push(`/iso-document/customer-satisfaction/${result.id}`)
      router.refresh()
    }
    return result
  }, null)
  const [followUp, setFollowUp] = useState(
    entry?.fields.followUpRequired ?? false
  )
  return (
    <form action={action} className="grid gap-4">
      <fieldset disabled={pending} className="contents">
        {entry ? (
          <>
            <input type="hidden" name="id" value={entry.id} />
            <input type="hidden" name="version" value={entry.version} />
          </>
        ) : null}
        <FieldGroup>
          <FormGrid>
            <Field>
              <FieldLabel htmlFor={`${id}-customer`}>Customer</FieldLabel>
              {canManage ? (
                <NativeSelect
                  id={`${id}-customer`}
                  name="customerId"
                  defaultValue={entry?.fields.customerId ?? ""}
                >
                  <NativeSelectOption value="">
                    Customer group / overall report
                  </NativeSelectOption>
                  {customers.map((x) => (
                    <NativeSelectOption key={x.id} value={x.id}>
                      {x.name}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              ) : (
                <>
                  <Input
                    id={`${id}-customer`}
                    readOnly
                    value={entry?.customerName ?? "Customer group"}
                  />
                  <input
                    type="hidden"
                    name="customerId"
                    value={entry?.fields.customerId ?? ""}
                  />
                </>
              )}
            </Field>
            <Field>
              <FieldLabel htmlFor={`${id}-owner`}>Responsible Staff</FieldLabel>
              {canManage ? (
                <NativeSelect
                  id={`${id}-owner`}
                  name="ownerUserId"
                  defaultValue={entry?.fields.ownerUserId ?? ""}
                >
                  <NativeSelectOption value="">Assign later</NativeSelectOption>
                  {owners.map((x) => (
                    <NativeSelectOption key={x.id} value={x.id}>
                      {x.name}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              ) : (
                <>
                  <Input
                    id={`${id}-owner`}
                    value={entry?.ownerName ?? ""}
                    readOnly
                  />
                  <input
                    type="hidden"
                    name="ownerUserId"
                    value={entry?.fields.ownerUserId ?? ""}
                  />
                </>
              )}
            </Field>
            {(
              [
                ["periodFrom", "Period From"],
                ["periodTo", "Period To"],
                ["nextReviewOn", "Next Review Date"],
              ] as const
            ).map(([key, label]) => (
              <Field key={key}>
                <FieldLabel htmlFor={`${id}-${key}`}>{label}</FieldLabel>
                <Input
                  id={`${id}-${key}`}
                  type="date"
                  name={key}
                  defaultValue={entry?.fields[key] ?? ""}
                />
              </Field>
            ))}
          </FormGrid>
          {Object.entries(satisfactionTextFields).map(([key, label]) => (
            <Field key={key}>
              <FieldLabel htmlFor={`${id}-${key}`}>{label}</FieldLabel>
              <Textarea
                id={`${id}-${key}`}
                name={key}
                maxLength={4000}
                required={key === "title"}
                defaultValue={
                  entry?.fields[key as keyof typeof satisfactionTextFields] ??
                  ""
                }
              />
            </Field>
          ))}
          <Field>
            <FieldLabel htmlFor={`${id}-follow`}>Follow-up Needed?</FieldLabel>
            <NativeSelect
              id={`${id}-follow`}
              name="followUpRequired"
              value={followUp ? "yes" : "no"}
              onChange={(e) => setFollowUp(e.target.value === "yes")}
            >
              <NativeSelectOption value="no">
                No · explain the conclusion
              </NativeSelectOption>
              <NativeSelectOption value="yes">
                Yes · link the assigned action
              </NativeSelectOption>
            </NativeSelect>
          </Field>
          <Field>
            <FieldLabel htmlFor={`${id}-analysis`}>
              Linked ISO Follow-up Action
            </FieldLabel>
            <NativeSelect
              id={`${id}-analysis`}
              name="analysisId"
              defaultValue={entry?.fields.analysisId ?? ""}
            >
              <NativeSelectOption value="">Choose an action</NativeSelectOption>
              {entry?.fields.analysisId &&
              !actions.some((x) => x.id === entry.fields.analysisId) ? (
                <NativeSelectOption value={entry.fields.analysisId}>
                  {entry.actionReference} · {entry.actionDescription}
                </NativeSelectOption>
              ) : null}
              {actions.map((x) => (
                <NativeSelectOption key={x.id} value={x.id}>
                  {analysisReference(x.kind, x.number)} · {x.description}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <p className="text-sm text-muted-foreground">
              Create or assign work in PEST, SWOT or Risk-Based Thinking, then
              link it here. Report approval and action closure are separate.
            </p>
          </Field>
          {entry ? (
            <Field>
              <FieldLabel htmlFor={`${id}-reason`}>
                Reason for Changes
              </FieldLabel>
              <Textarea
                id={`${id}-reason`}
                name="reason"
                required
                maxLength={4000}
              />
            </Field>
          ) : null}
        </FieldGroup>
      </fieldset>
      {state?.error ? (
        <StandardState
          variant="error"
          title="Report not saved"
          description={state.error}
        />
      ) : null}
      <Button type="submit" disabled={pending} className="w-fit">
        {pending ? "Saving…" : entry ? "Save Report Details" : "Create Report"}
      </Button>
    </form>
  )
}
export function SatisfactionDecisionForm({
  entry,
  canWork,
  canVerify,
}: {
  entry: SatisfactionReport
  canWork: boolean
  canVerify: boolean
}) {
  const id = useId(),
    router = useRouter()
  const operations =
    entry.status === "Submitted"
      ? canVerify
        ? ["approve", "return"]
        : []
      : entry.status === "Approved"
        ? canVerify
          ? ["reopen"]
          : []
        : canWork
          ? ["submit"]
          : []
  const [state, action, pending] = useActionState<
    Awaited<ReturnType<typeof decideSatisfactionAction>> | null,
    FormData
  >(async (_, data) => {
    const result = await decideSatisfactionAction(data)
    if ("success" in result) router.refresh()
    return result
  }, null)
  const labels: Record<string, string> = {
    submit: "Submit for QA Review",
    approve: "QA Approve Report",
    return: "Return for Corrections",
    reopen: "Reopen Report",
  }
  if (!operations.length) return null
  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="id" value={entry.id} />
      <input type="hidden" name="version" value={entry.version} />
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor={`${id}-notes`}>
            Submission / QA Review Findings
          </FieldLabel>
          <Textarea
            id={`${id}-notes`}
            name="notes"
            required
            maxLength={4000}
            disabled={pending}
          />
        </Field>
      </FieldGroup>
      {state?.error ? (
        <StandardState
          variant="error"
          title="Decision not saved"
          description={state.error}
        />
      ) : null}
      <div className="flex flex-wrap gap-2">
        {operations.map((operation) => (
          <Button
            type="submit"
            key={operation}
            name="operation"
            value={operation}
            variant={operation === "return" ? "outline" : "default"}
            disabled={pending}
          >
            {pending ? "Saving…" : labels[operation]}
          </Button>
        ))}
      </div>
    </form>
  )
}
export function SatisfactionUploadForm({
  entry,
}: {
  entry: SatisfactionReport
}) {
  const id = useId(),
    router = useRouter()
  const [pending, setPending] = useState(false)
  return (
    <PendingRetainedUploadForm
      className="grid gap-4"
      onPendingChange={setPending}
      uploads={[
        {
          field: "report_file",
          intent: { kind: "iso-customer-satisfaction", reportId: entry.id },
        },
      ]}
      action={async (data) => {
        const result = await uploadSatisfactionAction(data)
        if ("success" in result) router.refresh()
        return result
      }}
    >
      <input type="hidden" name="id" value={entry.id} />
      <input type="hidden" name="version" value={entry.version} />
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor={id}>Report File / New File Version</FieldLabel>
          <Input
            id={id}
            type="file"
            name="report_file"
            required
            accept=".pdf,.xlsx,.png,.jpg,.jpeg"
          />
          <p className="text-sm text-muted-foreground">
            PDF, Excel, JPG or PNG up to 10 MB. Every previous file version
            remains available.
          </p>
        </Field>
      </FieldGroup>
      <Button className="w-fit" type="submit" disabled={pending}>
        {pending ? "Uploading…" : "Upload Report"}
      </Button>
    </PendingRetainedUploadForm>
  )
}
