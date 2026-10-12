import Link from "next/link"
import { ListChecks } from "lucide-react"
import { Button } from "@workspace/ui/components/button"
import { PageHeader } from "@/components/ui/golden-patterns"
import { PendingActionsRegister } from "@/components/iso-document/pending-actions-register"
import { withIsoWorkflows } from "@/lib/iso-document/workflows-server"
export default async function PendingActionsPage({
  searchParams,
}: {
  searchParams: Promise<{ document?: string }>
}) {
  const { document } = await searchParams
  return withIsoWorkflows(async ({ repository, access }) => {
    const rows = (await repository.list(access)).filter(
      (row) => !document || row.documentId === document
    )
    return (
      <div className="grid min-w-0 gap-5">
        <PageHeader
          title="ISO Pending Actions"
          icon={ListChecks}
          description="Department assignments, target dates, due reviews and QA verification across ISO."
          actions={
            <Button asChild variant="outline">
              <Link href="/iso-document/documents">Master Document List</Link>
            </Button>
          }
        />
        <PendingActionsRegister rows={rows} userId={access.userId} />
      </div>
    )
  })
}
