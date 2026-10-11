import Link from "next/link"
import { Button } from "@workspace/ui/components/button"
import { PageHeader, StandardState } from "@/components/ui/golden-patterns"
import { ManagementReviewMeetingForm } from "@/components/iso-document/management-review-forms"
import { withManagementReview } from "@/lib/iso-document/management-review-server"

export default async function NewManagementReviewPage() {
  return withManagementReview(async ({ repository, access }) => {
    if (!access.canManage)
      return (
        <StandardState
          variant="error"
          title="Preparation access required"
          description="Ask for Prepare Management Reviews permission to create meetings."
        />
      )
    const staff = await repository.staff(access.organizationId)
    return (
      <div className="grid min-w-0 gap-6">
        <PageHeader
          title="New Management Review"
          description="Prepare the agenda and people, hold the review, record conclusions and submit the minutes to QA."
          actions={
            <Button asChild variant="outline">
              <Link href="/iso-document/management-review">
                Back to meetings
              </Link>
            </Button>
          }
        />
        <ManagementReviewMeetingForm staff={staff} />
      </div>
    )
  })
}
