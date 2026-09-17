import Link from "next/link"
import { createStoreRepository } from "@workspace/db"
import {
  OperationalTable,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { StandardState } from "@workspace/ui/components/standard-state"

import { PageHeader, MetricSummary } from "@/components/ui/golden-patterns"
import { readAuthEnvironment } from "@/lib/auth/auth"
import {
  listGrantedCapabilities,
  requireCapability,
} from "@/lib/auth/require-capability"
import {
  isMeasuringInstrumentCategory,
  measuringInstrumentRegister,
} from "@/lib/iso-documents"
import { storeAssetWorkspaceHref } from "@/lib/store-asset-workspace"

export default async function MeasuringInstrumentRegisterPage() {
  const session = await requireCapability(
    "store.stock.read",
    measuringInstrumentRegister.href
  )
  const capabilities = await listGrantedCapabilities(session.user.id, [
    "store.asset_history.read",
  ])
  const canOpen = capabilities.includes("store.asset_history.read")
  const repository = createStoreRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  const items = await (async () => {
    const organizationId = await repository.organizationIdForCode("MRMPL")
    return (await repository.listItemTypes(organizationId)).filter((item) =>
      isMeasuringInstrumentCategory(item.assetCategory)
    )
  })().finally(() => repository.close())

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <div
        className="text-left text-sm font-medium"
        aria-label="Register number"
      >
        Register No.: {measuringInstrumentRegister.number}
      </div>
      <PageHeader
        title={measuringInstrumentRegister.title}
        description="Open a Store item to view its units, history, locations and certificates. Entries and updates are managed in Store."
      />
      <MetricSummary
        scope="Measuring instruments · before table filters"
        items={[
          {
            label: "Registered Items",
            value: items.length,
            tone: "information",
          },
        ]}
      />
      <OperationalTable
        filterStorageKey="iso-measuring-instrument-register"
        containerClassName="rounded-md border"
        toolbarStart={
          <span className="font-medium">Measuring Instruments</span>
        }
      >
        <TableHeader>
          <TableRow>
            <TableHead>Asset Code</TableHead>
            <TableHead>Asset Name</TableHead>
            <TableHead>Subcategory</TableHead>
            <TableHead>Identification</TableHead>
            <TableHead>Store Locations</TableHead>
            <TableHead>Available Stock</TableHead>
            <TableHead>Unit</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.id}>
              <TableCell>
                {canOpen ? (
                  <Link
                    className="font-medium underline underline-offset-4"
                    href={storeAssetWorkspaceHref(item.typeCode)}
                  >
                    {item.typeCode}
                  </Link>
                ) : (
                  item.typeCode
                )}
              </TableCell>
              <TableCell>{item.assetName}</TableCell>
              <TableCell>{item.assetSubcategory}</TableCell>
              <TableCell>{item.identificationName}</TableCell>
              <TableCell>{item.storageLocations}</TableCell>
              <TableCell>{item.availableStock}</TableCell>
              <TableCell>{item.unit}</TableCell>
            </TableRow>
          ))}
          {!items.length ? (
            <TableRow>
              <TableCell colSpan={7}>
                <StandardState
                  title="No measuring instruments"
                  description="Items created in Store under the Measuring Instrument category appear here automatically."
                />
              </TableCell>
            </TableRow>
          ) : null}
        </TableBody>
      </OperationalTable>
    </div>
  )
}
