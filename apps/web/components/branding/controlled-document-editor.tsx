"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import type { BrandingContent } from "@workspace/db/branding-domain"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Textarea } from "@workspace/ui/components/textarea"
import { StandardState } from "@workspace/ui/components/standard-state"
import { FormSection, FormGrid } from "@/components/ui/golden-patterns"
import { saveControlledDocument } from "@/app/branding/actions"

export function ControlledDocumentEditor({
  documentId,
  version,
  initial,
  numberLocked = false,
}: {
  documentId?: string
  version?: number
  initial?: BrandingContent
  numberLocked?: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState("")
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        const form = new FormData(event.currentTarget)
        setError("")
        startTransition(async () => {
          try {
            const result = await saveControlledDocument(form)
            if (result.error) {
              setError(result.error)
              return
            }
            router.push(`/branding/controlled-document/${result.id}`)
            router.refresh()
          } catch {
            setError("Document could not be saved. Please try again.")
          }
        })
      }}
      className="grid gap-4"
    >
      <input type="hidden" name="documentId" value={documentId ?? ""} />
      <input type="hidden" name="version" value={version ?? 0} />
      <FormSection title="Controlled document" width="standard">
        <FormGrid className="xl:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="cd-title">Title</Label>
            <Input
              id="cd-title"
              name="title"
              required
              maxLength={240}
              defaultValue={initial?.title}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="cd-number">Document number</Label>
            <Input
              id="cd-number"
              name="number"
              required
              maxLength={100}
              readOnly={numberLocked}
              defaultValue={initial?.inputs["Document number"]}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="cd-department">Department</Label>
            <Input
              id="cd-department"
              name="department"
              required
              maxLength={160}
              defaultValue={initial?.department}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="cd-date">Effective date</Label>
            <Input
              id="cd-date"
              name="effectiveDate"
              type="date"
              required
              defaultValue={initial?.effectiveDate}
            />
          </div>
        </FormGrid>
        <div className="mt-4 grid gap-2">
          <Label htmlFor="cd-pdf">PDF (maximum 5 MB)</Label>
          <Input
            id="cd-pdf"
            name="pdf"
            type="file"
            accept="application/pdf,.pdf"
          />
          <p className="text-sm text-muted-foreground">
            Upload a prepared PDF. Check its printed number, revision and date
            against these details. Saving without a file keeps this draft’s
            existing upload.
          </p>
        </div>
        <div className="mt-4 grid gap-2">
          <Label htmlFor="cd-reason">
            Change reason{" "}
            {numberLocked ? "(required)" : "(optional for first release)"}
          </Label>
          <Textarea
            id="cd-reason"
            name="changeReason"
            required={numberLocked}
            maxLength={2000}
            defaultValue={initial?.changeReason}
          />
        </div>
      </FormSection>
      {error ? (
        <StandardState
          variant="error"
          title="Document not saved"
          description={error}
        />
      ) : null}
      <Button className="w-fit" disabled={pending} type="submit">
        {pending ? "Saving…" : "Save Draft"}
      </Button>
    </form>
  )
}
