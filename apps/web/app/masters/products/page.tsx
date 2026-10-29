import {
  createCommercialWorkflowRepository,
  createProductPortfolioRepository,
} from "@workspace/db"
import {
  requireCapability,
  listGrantedCapabilities,
} from "@/lib/auth/require-capability"
import { masterCapability } from "@/lib/auth/master-capabilities"
import { readAuthEnvironment } from "@/lib/auth/auth"
import { PageHeader, FormSection } from "@/components/ui/golden-patterns"
import { MasterDataViewTabs } from "@/components/master-data-view-tabs"
import { PortfolioEntryForm } from "@/app/commercial/products/new/portfolio-entry-form"
import { ProductPortfolioTable } from "@/app/commercial/products/product-portfolio-table"
import { ProductCsvForm } from "./product-csv-form"

export default async function ProductsMasterPage({
  searchParams,
}: {
  searchParams: Promise<{ masterView?: string }>
}) {
  const session = await requireCapability(
    masterCapability("products", "read"),
    "/masters/products"
  )
  const grants = await listGrantedCapabilities(session.user.id, [
    masterCapability("products", "create"),
    masterCapability("products", "import"),
    masterCapability("products", "rename"),
  ])
  const records = (await searchParams).masterView === "masterTables"
  const connectionString = readAuthEnvironment().connectionString
  const context = "masterUnit=universal&masterMain=products&masterSub=products"
  let content
  if (records) {
    const repository = createProductPortfolioRepository({ connectionString })
    const rows = await repository
      .listForOrganization("MRMPL")
      .finally(() => repository.close())
    content = (
      <FormSection title="Internal Products" width="full">
        <ProductPortfolioTable
          rows={rows}
          canRenamePartCode={grants.includes(
            masterCapability("products", "rename")
          )}
        />
      </FormSection>
    )
  } else {
    const repository = createCommercialWorkflowRepository({ connectionString })
    const options = await repository
      .getDesignWorkspaceOptions("MRMPL")
      .finally(() => repository.close())
    content = (
      <>
        {grants.includes(masterCapability("products", "import")) ? (
          <ProductCsvForm />
        ) : null}
        {grants.includes(masterCapability("products", "create")) ? (
          <PortfolioEntryForm options={options} masterData />
        ) : null}
        {!grants.some(
          (grant) =>
            grant === masterCapability("products", "create") ||
            grant === masterCapability("products", "import")
        ) ? (
          <p>You have view access. Open View Records to see products.</p>
        ) : null}
      </>
    )
  }
  return (
    <div className="grid gap-6">
      <PageHeader
        title="Products"
        description="Internal product portfolio. Register parts without customer links or an RFQ."
      />
      <MasterDataViewTabs
        activeView={records ? "masterTables" : "dataEntry"}
        dataEntryHref={`/masters/products?${context}`}
        masterTablesHref={`/masters/products?masterView=masterTables&${context}`}
      />
      {content}
    </div>
  )
}
