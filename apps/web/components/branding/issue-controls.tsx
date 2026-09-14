"use client"
import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { FileCheck2, FilePlus2 } from "lucide-react"
import { Button } from "@workspace/ui/components/button"
import { StandardState } from "@workspace/ui/components/standard-state"
import {
  issueBrandingDocument,
  reviseBrandingDocument,
} from "@/app/branding/actions"
import type { BrandingType } from "@workspace/db/branding-domain"
export function BrandingIssueControls({
  type,
  documentId,
  draft,
}: {
  type: BrandingType
  documentId: string
  draft?: { id: string; version: number }
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState("")
  return (
    <div className="grid gap-2">
      <Button
        disabled={pending}
        onClick={() => {
          setError("")
          startTransition(async () => {
            try {
              const result = draft
                ? await issueBrandingDocument({
                    type,
                    documentId,
                    revisionId: draft.id,
                    version: draft.version,
                  })
                : await reviseBrandingDocument({ type, documentId })
              if (result.error) {
                setError(result.error)
                return
              }
              router.refresh()
            } catch {
              setError("The document could not be updated. Please try again.")
            }
          })
        }}
      >
        {draft ? (
          <FileCheck2 aria-hidden="true" />
        ) : (
          <FilePlus2 aria-hidden="true" />
        )}
        {pending ? "Working…" : draft ? "Issue PDF" : "Create Revision"}
      </Button>
      {error ? (
        <StandardState
          variant="error"
          title="Document not updated"
          description={error}
        />
      ) : null}
    </div>
  )
}
