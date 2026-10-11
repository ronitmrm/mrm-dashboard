import { notFound } from "next/navigation"
import { withSipoc } from "@/lib/iso-document/sipoc-server"
import { PageHeader } from "@/components/ui/golden-patterns"
import { SipocForm } from "@/components/iso-document/sipoc-forms"
export default async function NewSipocPage() {
  return withSipoc(async ({ repository, access }) => {
    if (!access.canManage) notFound()
    return (
      <div className="grid gap-6">
        <PageHeader
          title="New SIPOC process map"
          description="Save incomplete work as Draft; complete requirements before QA submission."
        />
        <SipocForm owners={await repository.owners(access.organizationId)} />
      </div>
    )
  })
}
