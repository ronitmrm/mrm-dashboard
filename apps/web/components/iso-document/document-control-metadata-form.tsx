"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import type { DocumentControlFields } from "@workspace/db"
import {
  dataFrequencyLabels,
  dataFrequencyTypes,
  documentTypeLabels,
  documentTypes,
  type RecordLocation,
} from "@workspace/db/document-control-domain"
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
import { saveDocumentControlMetadata } from "@/app/iso-document/documents/actions"

function locationLines(locations: RecordLocation[]) {
  return locations
    .map(({ kind, label, href }) =>
      [kind, label, href].filter(Boolean).join(" | ")
    )
    .join("\n")
}

function parseLocationLines(value: string): RecordLocation[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [rawKind, label = "", href = ""] = line
        .split("|")
        .map((part) => part.trim())
      const kind = ["mrm", "other-system", "physical"].includes(rawKind ?? "")
        ? (rawKind as RecordLocation["kind"])
        : "other-system"
      return { kind, label, ...(href ? { href } : {}) }
    })
}

export function DocumentControlMetadataForm({
  documentId,
  initial,
}: {
  documentId: string
  initial: DocumentControlFields
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState("")
  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        const form = new FormData(event.currentTarget)
        setError("")
        startTransition(async () => {
          const result = await saveDocumentControlMetadata({
            documentId,
            version: initial.metadataVersion,
            metadata: {
              documentType: form.get("documentType"),
              responsibleRole: form.get("responsibleRole"),
              useStatus: form.get("useStatus"),
              reviewCycleMonths: form.get("reviewCycleMonths"),
              dataFrequencyType: form.get("dataFrequencyType"),
              dataFrequencyIntervalDays: form.get("dataFrequencyIntervalDays"),
              dataFrequencyDetail: form.get("dataFrequencyDetail"),
              dataRetention: form.get("dataRetention"),
              contentAccess: form.get("contentAccess"),
              recordLocations: parseLocationLines(
                String(form.get("recordLocations") ?? "")
              ),
            },
          })
          if (result.error) {
            setError(result.error)
            return
          }
          router.refresh()
        })
      }}
    >
      <FormSection title="Document control" width="wide">
        <FormGrid>
          <div className="grid gap-2">
            <Label htmlFor="control-document-type">Document type</Label>
            <NativeSelect
              className="w-full"
              defaultValue={initial.documentType}
              id="control-document-type"
              name="documentType"
            >
              {documentTypes.map((type) => (
                <NativeSelectOption key={type} value={type}>
                  {documentTypeLabels[type]}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="control-responsible-role">Responsible role</Label>
            <Input
              defaultValue={initial.responsibleRole}
              id="control-responsible-role"
              maxLength={160}
              name="responsibleRole"
              required
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="control-use-status">Use status</Label>
            <NativeSelect
              className="w-full"
              defaultValue={initial.useStatus}
              id="control-use-status"
              name="useStatus"
            >
              <NativeSelectOption value="in-use">In Use</NativeSelectOption>
              <NativeSelectOption value="not-in-use">
                Not In Use
              </NativeSelectOption>
            </NativeSelect>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="control-review-cycle">
              Document review cycle (months)
            </Label>
            <Input
              defaultValue={initial.reviewCycleMonths ?? ""}
              id="control-review-cycle"
              min={1}
              name="reviewCycleMonths"
              type="number"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="control-frequency">Data / record frequency</Label>
            <NativeSelect
              className="w-full"
              defaultValue={initial.dataFrequencyType}
              id="control-frequency"
              name="dataFrequencyType"
            >
              {dataFrequencyTypes.map((type) => (
                <NativeSelectOption key={type} value={type}>
                  {dataFrequencyLabels[type]}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="control-frequency-detail">Frequency detail</Label>
            <Input
              defaultValue={initial.dataFrequencyDetail}
              id="control-frequency-detail"
              maxLength={240}
              name="dataFrequencyDetail"
              placeholder="Example: Daily, each FPIR, monthly SPC"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="control-frequency-interval">
              Scheduled interval (days)
            </Label>
            <Input
              defaultValue={initial.dataFrequencyIntervalDays ?? ""}
              id="control-frequency-interval"
              min={1}
              name="dataFrequencyIntervalDays"
              type="number"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="control-retention">Generated data retention</Label>
            <Input
              defaultValue={initial.dataRetention}
              id="control-retention"
              maxLength={240}
              name="dataRetention"
              placeholder="Example: 5 years"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="control-access">Document content access</Label>
            <NativeSelect
              className="w-full"
              defaultValue={initial.contentAccess}
              id="control-access"
              name="contentAccess"
            >
              <NativeSelectOption value="restricted">
                Restricted
              </NativeSelectOption>
              <NativeSelectOption value="all-signed-in">
                All signed-in users
              </NativeSelectOption>
            </NativeSelect>
          </div>
        </FormGrid>
        <div className="mt-4 grid gap-2">
          <Label htmlFor="control-record-locations">Record locations</Label>
          <Textarea
            defaultValue={locationLines(initial.recordLocations)}
            id="control-record-locations"
            name="recordLocations"
            placeholder="mrm | FPIR module | /quality/fpir\nother-system | SPC workspace | https://approved.example/...\nphysical | QA archive cupboard"
            rows={4}
          />
          <p className="text-sm text-muted-foreground">
            One per line: mrm, other-system or physical | label | optional link.
          </p>
        </div>
      </FormSection>
      {error ? (
        <StandardState
          description={error}
          title="Control details not saved"
          variant="error"
        />
      ) : null}
      <Button className="w-fit" disabled={pending} type="submit">
        {pending ? "Saving…" : "Save Control Details"}
      </Button>
    </form>
  )
}
