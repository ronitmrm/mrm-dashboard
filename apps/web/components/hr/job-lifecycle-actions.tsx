"use client"

import { CircleX, Trash2 } from "lucide-react"

import { closeJobAction, deleteJobAction } from "@/app/hr/actions"
import { ConfirmSubmitButton } from "../ui/confirm-submit-button"

export function JobLifecycleActions({
  applicantCount,
  canClose,
  canDelete,
  jobId,
  jobTitle,
  status,
}: {
  applicantCount: number
  canClose: boolean
  canDelete: boolean
  jobId: string
  jobTitle: string
  status: string
}) {
  if (!canClose && !canDelete) return null

  const deletionBlocked = applicantCount > 0

  return (
    <div className="flex flex-wrap gap-2">
      {canClose && status === "Open" ? (
        <form action={closeJobAction}>
          <input name="job_id" type="hidden" value={jobId} />
          <input name="return_job_id" type="hidden" value={jobId} />
          <ConfirmSubmitButton
            confirmTitle={`Close ${jobTitle}?`}
            confirmDescription="The job will stop accepting candidates, but all history will remain."
            confirmLabel="Close Job"
            size="sm"
            variant="outline"
          >
            <CircleX data-icon="inline-start" />
            Close Job
          </ConfirmSubmitButton>
        </form>
      ) : null}

      {canDelete ? (
        <form action={deleteJobAction}>
          <input name="job_id" type="hidden" value={jobId} />
          <input name="panel" type="hidden" value="jobsPanel" />
          <ConfirmSubmitButton
            confirmTitle={`Permanently delete ${jobTitle}?`}
            confirmDescription="This cannot be undone."
            confirmLabel="Delete Job"
            disabled={deletionBlocked}
            size="sm"
            title={
              deletionBlocked
                ? "Close this job instead. Jobs with candidate history cannot be deleted."
                : "Permanently delete this empty job post."
            }
            variant="destructive"
          >
            <Trash2 data-icon="inline-start" />
            Delete Job
          </ConfirmSubmitButton>
        </form>
      ) : null}
    </div>
  )
}
