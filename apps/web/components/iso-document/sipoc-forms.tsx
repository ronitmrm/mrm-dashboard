"use client"
import { useId, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import type { SipocRecord } from "@workspace/db"
import { sipocLists, sipocTextFields } from "@workspace/db/sipoc-domain"
import { Button } from "@workspace/ui/components/button"
import {
  Field,
  FieldLabel,
  FieldDescription,
} from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import { Textarea } from "@workspace/ui/components/textarea"
import {
  NativeSelect,
  NativeSelectOption,
} from "@workspace/ui/components/native-select"
import { FormGrid, FormSection } from "@/components/ui/golden-patterns"
import { saveSipoc, transitionSipoc } from "@/app/iso-document/sipoc/actions"
export function SipocForm({
  record,
  owners,
}: {
  record?: SipocRecord
  owners: { id: string; name: string }[]
}) {
  const prefix = useId(),
    router = useRouter(),
    [pending, start] = useTransition(),
    [error, setError] = useState("")
  return (
    <form
      className="grid gap-5"
      action={(data) =>
        start(async () => {
          setError("")
          const fields = {
            ...Object.fromEntries(
              sipocTextFields.map(({ key }) => [key, data.get(key)])
            ),
            ...Object.fromEntries(
              sipocLists.map(({ key }) => [
                key,
                String(data.get(key) ?? "").split(/\r?\n/),
              ])
            ),
            ownerUserId: data.get("ownerUserId"),
            nextReviewOn: data.get("nextReviewOn"),
          }
          const result = await saveSipoc({
            id: record?.id,
            version: record?.version,
            fields,
            reason: String(data.get("reason") ?? ""),
          })
          if (result.error) setError(result.error)
          else if (result.id) {
            router.push(`/iso-document/sipoc/${result.id}`)
            router.refresh()
          }
        })
      }
    >
      <fieldset disabled={pending} className="grid min-w-0 gap-5">
        <FormSection
          title="Process definition and accountability"
          description="Define one process. Confirm the owner, boundaries and requirements with the departments involved."
        >
          <FormGrid>
            {sipocTextFields.slice(0, 6).map(({ key, label }) => (
              <Field key={key}>
                <FieldLabel htmlFor={`${prefix}-${key}`}>{label}</FieldLabel>
                <Textarea
                  id={`${prefix}-${key}`}
                  name={key}
                  required={key === "name"}
                  maxLength={4000}
                  defaultValue={record?.fields[key] ?? ""}
                  rows={3}
                />
              </Field>
            ))}
          </FormGrid>
          <FormGrid>
            <Field>
              <FieldLabel htmlFor={`${prefix}-owner`}>Process owner</FieldLabel>
              <NativeSelect
                id={`${prefix}-owner`}
                name="ownerUserId"
                defaultValue={record?.fields.ownerUserId ?? ""}
              >
                <NativeSelectOption value="">
                  Choose active staff
                </NativeSelectOption>
                {owners.map((owner) => (
                  <NativeSelectOption key={owner.id} value={owner.id}>
                    {owner.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              <FieldDescription>
                Accountable for this process and its review.
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor={`${prefix}-review`}>
                Next review date
              </FieldLabel>
              <Input
                id={`${prefix}-review`}
                type="date"
                name="nextReviewOn"
                defaultValue={record?.fields.nextReviewOn ?? ""}
              />
            </Field>
          </FormGrid>
        </FormSection>
        <FormSection
          title="SIPOC flow"
          description="Enter one item per line. Suppliers, inputs, steps, outputs and customers are independent lists; record specific handoffs below."
        >
          <FormGrid>
            {sipocLists.map(({ key, label, help }) => (
              <Field key={key}>
                <FieldLabel htmlFor={`${prefix}-${key}`}>{label}</FieldLabel>
                <Textarea
                  id={`${prefix}-${key}`}
                  name={key}
                  rows={6}
                  defaultValue={record?.fields[key].join("\n") ?? ""}
                />
                <FieldDescription>{help}</FieldDescription>
              </Field>
            ))}
          </FormGrid>
        </FormSection>
        <FormSection
          title="Requirements, controls and performance"
          description="Complete these before submitting. Use actual company requirements and targets."
        >
          <FormGrid>
            {sipocTextFields.slice(6).map(({ key, label }) => (
              <Field key={key}>
                <FieldLabel htmlFor={`${prefix}-${key}`}>{label}</FieldLabel>
                <Textarea
                  id={`${prefix}-${key}`}
                  name={key}
                  maxLength={4000}
                  rows={3}
                  defaultValue={record?.fields[key] ?? ""}
                />
              </Field>
            ))}
          </FormGrid>
        </FormSection>
        {record ? (
          <Field className="max-w-3xl">
            <FieldLabel htmlFor={`${prefix}-reason`}>
              Reason for change
            </FieldLabel>
            <Textarea
              id={`${prefix}-reason`}
              name="reason"
              required
              maxLength={4000}
              rows={2}
            />
            <FieldDescription>
              {record.status === "Approved"
                ? "Saving starts a new draft revision. The approved map remains available."
                : "Explain what changed and why."}
            </FieldDescription>
          </Field>
        ) : null}
        {error ? (
          <p role="alert" className="text-destructive">
            {error}
          </p>
        ) : null}
        <Button className="w-fit" type="submit">
          {pending
            ? "Saving…"
            : record?.status === "Approved"
              ? "Start draft revision"
              : "Save draft"}
        </Button>
      </fieldset>
    </form>
  )
}
export function SipocDecision({
  record,
  canManage,
  canApprove,
}: {
  record: SipocRecord
  canManage: boolean
  canApprove: boolean
}) {
  const prefix = useId(),
    router = useRouter(),
    [pending, start] = useTransition(),
    [error, setError] = useState("")
  const submitted = record.status === "Submitted"
  if (
    !(submitted
      ? canApprove
      : canManage && ["Draft", "Returned"].includes(record.status))
  )
    return null
  return (
    <FormSection
      title={submitted ? "QA review" : "Submit for QA review"}
      description={
        submitted
          ? "Confirm boundaries, owner, interfaces, controls and measures with the process stakeholders. Record findings."
          : "Complete the draft with the process owner before submission."
      }
    >
      <form
        className="grid gap-4"
        action={(data) =>
          start(async () => {
            setError("")
            const action = submitted
              ? data.get("decision") === "return"
                ? "return"
                : "approve"
              : "submit"
            const result = await transitionSipoc({
              id: record.id,
              version: record.version,
              action,
              notes: String(data.get("notes") ?? ""),
            })
            if (result.error) setError(result.error)
            else router.refresh()
          })
        }
      >
        <Field>
          <FieldLabel htmlFor={`${prefix}-notes`}>
            {submitted ? "QA findings / decision reason" : "Submission notes"}
          </FieldLabel>
          <Textarea
            id={`${prefix}-notes`}
            name="notes"
            required={submitted}
            maxLength={4000}
          />
        </Field>
        {error ? (
          <p role="alert" className="text-destructive">
            {error}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-3">
          {submitted ? (
            <>
              <Button disabled={pending} name="decision" value="approve">
                Approve revision
              </Button>
              <Button
                disabled={pending}
                name="decision"
                value="return"
                variant="outline"
              >
                Return for correction
              </Button>
            </>
          ) : (
            <Button disabled={pending}>Submit to QA</Button>
          )}
        </div>
      </form>
    </FormSection>
  )
}
