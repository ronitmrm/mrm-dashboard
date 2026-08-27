"use client"

import { Upload } from "lucide-react"
import { useRef, useState } from "react"

import { Button } from "@workspace/ui/components/button"

type EnquiryLineImportAction = (formData: FormData) => void | Promise<void>

export function EnquiryLineImportButton({
  action,
  enquiryId,
  organizationId,
}: {
  action: EnquiryLineImportAction
  enquiryId: string
  organizationId: string
}) {
  const formRef = useRef<HTMLFormElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [submitting, setSubmitting] = useState(false)

  return (
    <form
      action={action}
      className="contents"
      ref={formRef}
      onSubmit={() => setSubmitting(true)}
    >
      <input name="enquiry_id" type="hidden" value={enquiryId} />
      <input name="organization_id" type="hidden" value={organizationId} />
      <input
        accept=".csv,.xls,.xlsx"
        className="sr-only"
        name="template_file"
        ref={inputRef}
        required
        type="file"
        onChange={(event) => {
          if (event.currentTarget.files?.length) {
            formRef.current?.requestSubmit()
          }
        }}
      />
      <Button
        disabled={submitting}
        size="sm"
        type="button"
        variant="outline"
        onClick={() => inputRef.current?.click()}
      >
        <Upload className="size-4" />
        {submitting ? "Uploading..." : "Upload"}
      </Button>
    </form>
  )
}
