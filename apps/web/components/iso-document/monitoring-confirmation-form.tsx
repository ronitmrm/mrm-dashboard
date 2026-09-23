"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import {
  NativeSelect,
  NativeSelectOption,
} from "@workspace/ui/components/native-select"
import { StandardState } from "@workspace/ui/components/standard-state"
import { Textarea } from "@workspace/ui/components/textarea"
import { FormGrid, FormSection } from "@/components/ui/golden-patterns"
import { confirmDocumentMonitoring } from "@/app/iso-document/documents/actions"

export function MonitoringConfirmationForm({
  documentId,
}: {
  documentId: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState("")
  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        const formElement = event.currentTarget
        const form = new FormData(formElement)
        setError("")
        startTransition(async () => {
          const result = await confirmDocumentMonitoring({
            documentId,
            obligationType: form.get("obligationType") as
              | "document-review"
              | "data-record",
            periodLabel: String(form.get("periodLabel") ?? ""),
            evidenceLocation: String(form.get("evidenceLocation") ?? ""),
            remarks: String(form.get("remarks") ?? ""),
          })
          if (result.error) {
            setError(result.error)
            return
          }
          formElement.reset()
          router.refresh()
        })
      }}
    >
      <FormSection title="Confirm completed obligation" width="wide">
        <FormGrid>
          <div className="grid gap-2">
            <Label htmlFor="monitoring-type">Obligation</Label>
            <NativeSelect
              className="w-full"
              id="monitoring-type"
              name="obligationType"
            >
              <NativeSelectOption value="document-review">
                Document review
              </NativeSelectOption>
              <NativeSelectOption value="data-record">
                Data / record activity
              </NativeSelectOption>
            </NativeSelect>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="monitoring-period">Period / event</Label>
            <Input
              id="monitoring-period"
              maxLength={160}
              name="periodLabel"
              placeholder="Example: September 2026 or FPIR-1042"
              required
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="monitoring-evidence">Evidence location</Label>
            <Input
              id="monitoring-evidence"
              maxLength={1000}
              name="evidenceLocation"
              placeholder="MRM link, other system reference or physical location"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="monitoring-remarks">Remarks</Label>
            <Textarea id="monitoring-remarks" maxLength={2000} name="remarks" />
          </div>
        </FormGrid>
      </FormSection>
      {error ? (
        <StandardState
          description={error}
          title="Not confirmed"
          variant="error"
        />
      ) : null}
      <Button className="w-fit" disabled={pending} type="submit">
        {pending ? "Recording…" : "Record Completion"}
      </Button>
    </form>
  )
}
