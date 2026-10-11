import Link from "next/link"
import { notFound } from "next/navigation"
import { Button } from "@workspace/ui/components/button"
import { PageHeader } from "@/components/ui/golden-patterns"
import { RequirementForm } from "@/components/iso-document/interested-parties-forms"
import { withInterestedParties } from "@/lib/iso-document/interested-parties-server"
export default async function NewRequirementPage() {
  return withInterestedParties(async ({ repository, access }) => {
    if (!access.canManage) notFound()
    return (
      <div className="grid gap-6">
        <PageHeader
          title="New interested-party requirement"
          description="Record one requirement and its relevance, responsibility and monitoring plan."
          actions={
            <Button asChild variant="outline">
              <Link href="/iso-document/interested-parties">
                Back to requirements
              </Link>
            </Button>
          }
        />
        <RequirementForm
          staff={await repository.owners(access.organizationId)}
        />
      </div>
    )
  })
}
