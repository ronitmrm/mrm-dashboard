"use client"
import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Check, FileCheck2, FilePlus2, Send, X } from "lucide-react"
import { Button } from "@workspace/ui/components/button"
import { StandardState } from "@workspace/ui/components/standard-state"
import { reviseBrandingDocument } from "@/app/branding/actions"
import {
  decideDocumentApproval,
  releaseDocumentRevision,
  submitDocumentRevision,
} from "@/app/iso-document/documents/actions"
import type { BrandingType } from "@workspace/db/branding-domain"
import type { DocumentWorkflowState } from "@workspace/db/document-control-domain"
import { Textarea } from "@workspace/ui/components/textarea"
export function BrandingIssueControls({
  type,
  documentId,
  draft,
  canManage = false,
  canApprove = false,
  canRelease = false,
}: {
  type: BrandingType
  documentId: string
  draft?: { id: string; version: number; workflowState: DocumentWorkflowState }
  canManage?: boolean
  canApprove?: boolean
  canRelease?: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState("")
  const [remarks, setRemarks] = useState("")
  if (type === "notice" && !draft) return null
  if (!draft && !canManage) return null
  const run = (operation: () => Promise<{ error?: string }>) => {
    setError("")
    startTransition(async () => {
      try {
        const result = await operation()
        if (result.error) {
          setError(result.error)
          return
        }
        setRemarks("")
        router.refresh()
      } catch {
        setError("The document could not be updated. Please try again.")
      }
    })
  }
  return (
    <div className="grid gap-2">
      {!draft ? (
        <Button
          disabled={pending}
          onClick={() =>
            run(() => reviseBrandingDocument({ type, documentId }))
          }
        >
          <FilePlus2 aria-hidden="true" />
          {pending ? "Working…" : "Create Revision"}
        </Button>
      ) : draft.workflowState === "draft" && canManage ? (
        <Button
          disabled={pending}
          onClick={() =>
            run(() =>
              submitDocumentRevision({
                type,
                documentId,
                revisionId: draft.id,
                version: draft.version,
              })
            )
          }
        >
          <Send aria-hidden="true" />
          {pending ? "Submitting…" : "Submit for Approval"}
        </Button>
      ) : draft.workflowState === "pending-approval" && canApprove ? (
        <>
          <Textarea
            aria-label="Approval or rejection remarks"
            maxLength={2000}
            onChange={(event) => setRemarks(event.target.value)}
            placeholder="Remarks (required for rejection)"
            value={remarks}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={pending}
              onClick={() =>
                run(() =>
                  decideDocumentApproval({
                    type,
                    documentId,
                    revisionId: draft.id,
                    approve: true,
                    remarks,
                  })
                )
              }
            >
              <Check aria-hidden="true" />
              Approve
            </Button>
            <Button
              disabled={pending || !remarks.trim()}
              onClick={() =>
                run(() =>
                  decideDocumentApproval({
                    type,
                    documentId,
                    revisionId: draft.id,
                    approve: false,
                    remarks,
                  })
                )
              }
              variant="outline"
            >
              <X aria-hidden="true" />
              Reject
            </Button>
          </div>
        </>
      ) : draft.workflowState === "approved" && canRelease ? (
        <Button
          disabled={pending}
          onClick={() =>
            run(() =>
              releaseDocumentRevision({
                type,
                documentId,
                revisionId: draft.id,
                version: draft.version,
              })
            )
          }
        >
          <FileCheck2 aria-hidden="true" />
          {pending ? "Releasing…" : "Final Release"}
        </Button>
      ) : null}
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
