"use client"

import { Button } from "@workspace/ui/components/button"
import { CircleX, Trash2 } from "lucide-react"

import { closeJobAction, deleteJobAction } from "@/app/hr/actions"

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
        <form
          action={closeJobAction}
          onSubmit={(event) => {
            if (
              !window.confirm(
                `Close ${jobTitle}? The job will stop accepting candidates, but all history will remain.`
              )
            ) {
              event.preventDefault()
            }
          }}
        >
          <input name="job_id" type="hidden" value={jobId} />
          <input name="return_job_id" type="hidden" value={jobId} />
          <Button size="sm" type="submit" variant="outline">
            <CircleX data-icon="inline-start" />
            Close Job
          </Button>
        </form>
      ) : null}

      {canDelete ? (
        <form
          action={deleteJobAction}
          onSubmit={(event) => {
            if (
              !window.confirm(
                `Permanently delete ${jobTitle}? This cannot be undone.`
              )
            ) {
              event.preventDefault()
            }
          }}
        >
          <input name="job_id" type="hidden" value={jobId} />
          <input name="panel" type="hidden" value="jobsPanel" />
          <Button
            disabled={deletionBlocked}
            size="sm"
            title={
              deletionBlocked
                ? "Close this job instead. Jobs with candidate history cannot be deleted."
                : "Permanently delete this empty job post."
            }
            type="submit"
            variant="destructive"
          >
            <Trash2 data-icon="inline-start" />
            Delete Job
          </Button>
        </form>
      ) : null}
    </div>
  )
}
