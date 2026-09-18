"use client"
import { useState, useTransition } from "react"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import {
  NativeSelect,
  NativeSelectOption,
} from "@workspace/ui/components/native-select"
import { StandardState } from "@workspace/ui/components/standard-state"
import { FormGrid, FormSection } from "@/components/ui/golden-patterns"
import { rejectionStages } from "@workspace/db/rejection-domain"
import { productionFloors } from "@workspace/db/production-floors"
import { saveQualityRejection } from "@/app/quality-control/actions"

type Option = { id: string; label: string }
export function QualityControlEntry({
  jobs,
  types,
  defects,
  reasons,
  today,
  requestId: initialRequestId,
}: {
  jobs: { id: string; jobCard: string; partCode: string; unit: string }[]
  types: Option[]
  defects: Option[]
  reasons: Option[]
  today: string
  requestId: string
}) {
  const [pending, startTransition] = useTransition()
  const [requestId, setRequestId] = useState(initialRequestId)
  const [error, setError] = useState("")
  const [saved, setSaved] = useState(false)
  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        const element = event.currentTarget
        const form = new FormData(element)
        setError("")
        setSaved(false)
        startTransition(async () => {
          try {
            const result = await saveQualityRejection(form)
            if (result.error) {
              setError(result.error)
              return
            }
            setSaved(true)
            element.reset()
            setRequestId(crypto.randomUUID())
          } catch {
            setError("Rejection could not be saved. Retry with the same entry.")
          }
        })
      }}
    >
      <input type="hidden" name="requestId" value={requestId} />
      <FormSection title="Rejection entry" width="standard">
        <p className="mb-4 text-sm text-muted-foreground">
          Record additional rejections only. Production rejections already
          appear in the register.
        </p>
        <FormGrid className="xl:grid-cols-2">
          <div className="grid gap-2 sm:col-span-2">
            <Label htmlFor="qc-job">Job Card · Part · Unit</Label>
            <NativeSelect id="qc-job" name="jobId" required defaultValue="">
              <NativeSelectOption value="">Select Job Card</NativeSelectOption>
              {jobs.map((job) => (
                <NativeSelectOption key={job.id} value={job.id}>
                  {job.jobCard} · {job.partCode} ·{" "}
                  {productionFloors.find((floor) => floor.code === job.unit)
                    ?.shortLabel ?? job.unit}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="qc-date">Date</Label>
            <Input
              id="qc-date"
              name="date"
              type="date"
              required
              defaultValue={today}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="qc-stage">Stage of rejection</Label>
            <NativeSelect id="qc-stage" name="stage" required defaultValue="">
              <NativeSelectOption value="">Select stage</NativeSelectOption>
              {rejectionStages.map((stage) => (
                <NativeSelectOption key={stage} value={stage}>
                  {stage}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          {[
            { name: "typeId", label: "Rejection type", options: types },
            { name: "defectId", label: "Defect", options: defects },
            { name: "reasonId", label: "Reason", options: reasons },
          ].map((field) => (
            <div key={field.name} className="grid gap-2">
              <Label htmlFor={`qc-${field.name}`}>{field.label}</Label>
              <NativeSelect
                id={`qc-${field.name}`}
                name={field.name}
                required
                defaultValue=""
              >
                <NativeSelectOption value="">
                  Select {field.label.toLowerCase()}
                </NativeSelectOption>
                {field.options.map((option) => (
                  <NativeSelectOption key={option.id} value={option.id}>
                    {option.label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
          ))}
          <div className="grid gap-2">
            <Label htmlFor="qc-pcs">Rejected pieces</Label>
            <Input
              id="qc-pcs"
              name="pieces"
              type="number"
              min="1"
              max="2147483647"
              step="1"
              required
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="qc-kg">Rejected kg</Label>
            <Input
              id="qc-kg"
              name="kg"
              type="number"
              min="0.001"
              step="0.001"
              required
            />
          </div>
        </FormGrid>
      </FormSection>
      {error ? (
        <StandardState
          variant="error"
          title="Rejection not saved"
          description={error}
        />
      ) : null}
      {saved ? (
        <p role="status" className="text-sm">
          Rejection saved to the Rejection Register.
        </p>
      ) : null}
      <Button
        className="w-fit"
        disabled={pending || !jobs.length}
        type="submit"
      >
        {pending ? "Saving…" : "Save Rejection"}
      </Button>
    </form>
  )
}
