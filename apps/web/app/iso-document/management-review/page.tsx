import { ManagementReviewRegister } from "@/components/iso-document/management-review-register"
import { withManagementReview } from "@/lib/iso-document/management-review-server"

export default async function ManagementReviewPage() {
  return withManagementReview(async ({ repository, access }) => {
    const [meetings, points] = await Promise.all([
      repository.listMeetings(access),
      repository.listActions(access),
    ])
    return (
      <ManagementReviewRegister
        meetings={meetings}
        points={points}
        canManage={access.canManage}
        allRecords={
          access.canReadAll ||
          access.canManage ||
          access.canApprove ||
          access.canVerify
        }
      />
    )
  })
}
