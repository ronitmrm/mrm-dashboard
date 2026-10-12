import Link from "next/link"
import { notFound } from "next/navigation"
import { Button } from "@workspace/ui/components/button"
import { PageHeader, FormSection } from "@/components/ui/golden-patterns"
import { SatisfactionForm } from "@/components/iso-document/customer-satisfaction-forms"
import { withCustomerSatisfaction } from "@/lib/iso-document/customer-satisfaction-server"
import { withIsoAnalysis } from "@/lib/iso-document/analysis-server"
export default async function NewReportPage() {
  return withCustomerSatisfaction(async ({ repository, access }) => {
    if (!access.canManage) notFound()
    const [owners, customers, actions] = await Promise.all([
      repository.owners(access.organizationId),
      repository.customers(access),
      withIsoAnalysis(async (context) =>
        (
          await Promise.all(
            (["PEST", "SWOT", "RISK"] as const).map((kind) =>
              context.repository.list(context.access, kind)
            )
          )
        ).flat()
      ),
    ])
    return (
      <div className="grid gap-6">
        <PageHeader
          title="New Customer Satisfaction Report"
          description="Create the report record, then upload the original file and submit it for QA review."
          actions={
            <Button asChild variant="outline">
              <Link href="/iso-document/customer-satisfaction">
                Back to Reports
              </Link>
            </Button>
          }
        />
        <FormSection title="Report Details">
          <SatisfactionForm
            owners={owners}
            customers={customers}
            actions={actions}
          />
        </FormSection>
      </div>
    )
  })
}
